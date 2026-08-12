const assert = require('assert');
const {
  rankSectorMomentum,
  backtestRotation,
  basketDailyVolatility,
  buildRegimeGate,
} = require('../rotationBacktest');

function makeDates(days = 50) {
  const out = [];
  const d = new Date('2026-01-05T00:00:00Z');
  while (out.length < days) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function makeRows(dates, dailyReturn, start = 100) {
  let prevClose = start;
  return dates.map((date, i) => {
    const open = prevClose * (1 + (i === 0 ? 0 : dailyReturn * 0.2));
    const close = prevClose * (1 + dailyReturn);
    const row = { date, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 1000 + i };
    prevClose = close;
    return row;
  });
}

function makeRiseFallRows(dates, start = 100) {
  let prevClose = start;
  return dates.map((date, i) => {
    const dailyReturn = i < 18 ? 0.018 : -0.018;
    const open = prevClose;
    const close = prevClose * (1 + dailyReturn);
    const row = { date, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 1000 + i };
    prevClose = close;
    return row;
  });
}

function main() {
  const dates = makeDates(60);
  const histories = new Map([
    ['A1', makeRows(dates, 0.025)], ['A2', makeRows(dates, 0.024)], ['A3', makeRows(dates, 0.026)],
    ['B1', makeRows(dates, 0.001)], ['B2', makeRows(dates, 0.0005)], ['B3', makeRows(dates, 0.0015)],
  ]);
  const sectors = { Strong: ['A1', 'A2', 'A3'], Weak: ['B1', 'B2', 'B3'] };
  const stockMaps = new Map([...histories].map(([symbol, rows]) => [symbol, new Map(rows.map(r => [r.date, r]))]));
  const ranked = rankSectorMomentum({ sectors, stockMaps, dates, dateIndex: 15, lookback: 10 });
  assert.strictEqual(ranked[0].sector, 'Strong');
  assert(ranked[0].momentum > ranked[1].momentum);

  const taiexRows = dates.map((date, i) => ({ date, index: 10000 + i * 5 }));
  const result = backtestRotation({
    stockHistoryBySymbol: histories,
    taiexRows,
    sectors,
    startDate: dates[10],
    endDate: dates.at(-1),
    lookback: 10,
    takeProfit: 0.20,
    stopLoss: -0.20,
    minMomentum: 0,
  });
  assert(result.trades.length >= 1, 'should create at least one trade');
  assert.strictEqual(result.trades[0].sector, 'Strong');
  assert.strictEqual(result.trades[0].entryDate, dates[11], 'signal at close must execute next open');
  assert(result.metrics.totalReturn > 0, 'strong synthetic trend should make money');
  assert(result.metrics.takeProfitCount >= 1, 'fast trend should hit take profit');

  const noCost = backtestRotation({
    stockHistoryBySymbol: histories,
    taiexRows,
    sectors,
    startDate: dates[10], endDate: dates.at(-1), lookback: 10,
    takeProfit: 0.20, stopLoss: -0.20, minMomentum: 0,
    costs: { buyCommission: 0, sellCommission: 0, sellTax: 0 },
  });
  assert(noCost.metrics.totalReturn > result.metrics.totalReturn, 'costs should reduce return');

  const falling = new Map([
    ['A1', makeRows(dates, -0.005)], ['A2', makeRows(dates, -0.004)], ['A3', makeRows(dates, -0.006)],
    ['B1', makeRows(dates, -0.010)], ['B2', makeRows(dates, -0.009)], ['B3', makeRows(dates, -0.011)],
  ]);
  const gated = backtestRotation({
    stockHistoryBySymbol: falling, taiexRows, sectors,
    startDate: dates[10], endDate: dates.at(-1), lookback: 10,
    takeProfit: 0.20, stopLoss: -0.20, minMomentum: 0,
  });
  assert.strictEqual(gated.trades.length, 0, 'positive momentum gate should stay in cash when every sector is falling');

  const riseFall = new Map([
    ['A1', makeRiseFallRows(dates, 100)], ['A2', makeRiseFallRows(dates, 101)], ['A3', makeRiseFallRows(dates, 102)],
    ['B1', makeRows(dates, 0.0002)], ['B2', makeRows(dates, 0.0002)], ['B3', makeRows(dates, 0.0002)],
  ]);
  const trailed = backtestRotation({
    stockHistoryBySymbol: riseFall, taiexRows, sectors,
    startDate: dates[10], endDate: dates.at(-1), lookback: 10,
    takeProfit: 0.50, stopLoss: -0.50, trailingStop: 0.05, minMomentum: 0,
  });
  assert(trailed.metrics.trailingStopCount >= 1, 'rise-then-fall path should trigger the trailing stop');

  console.log('rotationBacktest tests passed');
}

function seeded(seed) {
  return function next() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoisyRows(dates, drift, vol, seed, start = 100) {
  const rnd = seeded(seed);
  let prevClose = start;
  return dates.map(date => {
    const open = prevClose;
    const close = prevClose * (1 + drift + (rnd() - 0.5) * vol);
    prevClose = close;
    return { date, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 1000 };
  });
}

function testRegimeGate() {
  const dates = makeDates(60);
  const risingGate = buildRegimeGate(dates.map((date, i) => ({ date, index: 10000 + i * 20 })), 20);
  assert.strictEqual(risingGate.get(dates[10]), null, 'gate is undecidable before enough history');
  assert.strictEqual(risingGate.get(dates[40]), true, 'uptrending index sits above its own MA');

  const fallingGate = buildRegimeGate(dates.map((date, i) => ({ date, index: 10000 - i * 20 })), 20);
  assert.strictEqual(fallingGate.get(dates[40]), false, 'downtrending index sits below its own MA');
}

function testRegimeFilter() {
  const dates = makeDates(70);
  const histories = new Map([
    ['A1', makeRows(dates, 0.02)], ['A2', makeRows(dates, 0.02)], ['A3', makeRows(dates, 0.02)],
    ['B1', makeRows(dates, 0.001)], ['B2', makeRows(dates, 0.001)], ['B3', makeRows(dates, 0.001)],
  ]);
  const sectors = { Strong: ['A1', 'A2', 'A3'], Weak: ['B1', 'B2', 'B3'] };
  const bearTaiex = dates.map((date, i) => ({ date, index: 12000 - i * 30 }));
  const base = {
    stockHistoryBySymbol: histories, sectors,
    startDate: dates[25], endDate: dates.at(-1), lookback: 10,
    takeProfit: 5, stopLoss: -5, minMomentum: 0,
  };

  const unfiltered = backtestRotation({ ...base, taiexRows: bearTaiex });
  assert(unfiltered.trades.length >= 1, 'without a regime gate the strategy buys into a falling market');

  const filtered = backtestRotation({
    ...base, taiexRows: bearTaiex, regimeFilter: { lookback: 20, mode: 'block-entry' },
  });
  assert.strictEqual(filtered.trades.length, 0, 'regime gate should block entries while TAIEX is below its MA');
  assert.strictEqual(filtered.metrics.exposure, 0, 'blocked regime should stay fully in cash');

  // Index rises, then rolls over while the position is still open.
  const flipTaiex = dates.map((date, i) => ({ date, index: i < 40 ? 10000 + i * 40 : 11600 - (i - 40) * 220 }));
  const forcedExit = backtestRotation({
    ...base, taiexRows: flipTaiex, regimeFilter: { lookback: 20, mode: 'exit-and-block' },
  });
  assert(forcedExit.metrics.regimeOffCount >= 1, 'exit-and-block should liquidate when the regime turns off');
  const regimeTrade = forcedExit.trades.find(t => t.exitReason === 'regime_off');
  assert(regimeTrade.exitDate > regimeTrade.entryDate, 'regime exit must settle after entry');
}

function testVolatilityScaledTrailingStop() {
  const dates = makeDates(120);
  const calm = new Map([
    ['C1', makeNoisyRows(dates, 0.004, 0.010, 11)],
    ['C2', makeNoisyRows(dates, 0.004, 0.010, 12)],
    ['C3', makeNoisyRows(dates, 0.004, 0.010, 13)],
  ]);
  const wild = new Map([
    ['W1', makeNoisyRows(dates, 0.004, 0.070, 21)],
    ['W2', makeNoisyRows(dates, 0.004, 0.070, 22)],
    ['W3', makeNoisyRows(dates, 0.004, 0.070, 23)],
  ]);
  const taiexRows = dates.map((date, i) => ({ date, index: 10000 + i * 5 }));

  const calmMaps = new Map([...calm].map(([s, rows]) => [s, new Map(rows.map(r => [r.date, r]))]));
  const wildMaps = new Map([...wild].map(([s, rows]) => [s, new Map(rows.map(r => [r.date, r]))]));
  const calmVol = basketDailyVolatility(['C1', 'C2', 'C3'], calmMaps, dates, 60, 20);
  const wildVol = basketDailyVolatility(['W1', 'W2', 'W3'], wildMaps, dates, 60, 20);
  assert(wildVol > calmVol * 2, 'volatile basket should measure a materially higher realized vol');

  const run = (histories, sectorName, symbols) => backtestRotation({
    stockHistoryBySymbol: histories,
    taiexRows,
    sectors: { [sectorName]: symbols },
    startDate: dates[30], endDate: dates.at(-1), lookback: 10,
    takeProfit: 5, stopLoss: -5, minMomentum: -Infinity,
    trailingStopVolMultiple: 4, trailingStopVolWindow: 20,
  });

  const calmRun = run(calm, 'Calm', ['C1', 'C2', 'C3']);
  const wildRun = run(wild, 'Wild', ['W1', 'W2', 'W3']);
  const calmDistance = calmRun.trades.map(t => t.trailingDistance).find(Number.isFinite);
  const wildDistance = wildRun.trades.map(t => t.trailingDistance).find(Number.isFinite);
  assert(Number.isFinite(calmDistance) && Number.isFinite(wildDistance), 'vol-scaled stops should record a distance');
  assert(wildDistance > calmDistance, 'a volatile basket must earn a wider trailing stop than a calm one');
  for (const d of [calmDistance, wildDistance]) {
    assert(d >= 0.03 && d <= 0.30, `trailing distance ${d} must respect the configured bounds`);
  }
  assert.strictEqual(calmRun.assumptions.trailingStop, null, 'vol-scaled mode should not report a fixed stop');
  assert.strictEqual(calmRun.assumptions.trailingStopVolMultiple, 4);
}

function testTopKAllocation() {
  const dates = makeDates(90);
  const histories = new Map([
    ['A1', makeNoisyRows(dates, 0.010, 0.02, 31)], ['A2', makeNoisyRows(dates, 0.010, 0.02, 32)], ['A3', makeNoisyRows(dates, 0.010, 0.02, 33)],
    ['B1', makeNoisyRows(dates, 0.008, 0.02, 41)], ['B2', makeNoisyRows(dates, 0.008, 0.02, 42)], ['B3', makeNoisyRows(dates, 0.008, 0.02, 43)],
    ['C1', makeNoisyRows(dates, -0.004, 0.02, 51)], ['C2', makeNoisyRows(dates, -0.004, 0.02, 52)], ['C3', makeNoisyRows(dates, -0.004, 0.02, 53)],
  ]);
  const sectors = { Fast: ['A1', 'A2', 'A3'], Mid: ['B1', 'B2', 'B3'], Down: ['C1', 'C2', 'C3'] };
  const taiexRows = dates.map((date, i) => ({ date, index: 10000 + i * 5 }));
  const base = {
    stockHistoryBySymbol: histories, taiexRows, sectors,
    startDate: dates[25], endDate: dates.at(-1), lookback: 10,
    takeProfit: 0.20, stopLoss: -0.20, minMomentum: 0,
  };

  const single = backtestRotation({ ...base, topK: 1 });
  const pair = backtestRotation({ ...base, topK: 2 });

  assert(single.equityCurve.every(row => row.sectors.length <= 1), 'topK=1 must never hold two sleeves');
  const concurrent = pair.equityCurve.filter(row => row.sectors.length === 2);
  assert(concurrent.length >= 5, 'topK=2 should hold two sleeves concurrently');
  assert(concurrent.some(row => new Set(row.sectors).size === 2), 'concurrent sleeves must be distinct sectors');
  assert(pair.trades.every(t => t.sector !== 'Down'), 'the negative-momentum sector must stay outside the top-2 gate');
  assert(pair.metrics.exposure <= 1 + 1e-9 && pair.metrics.exposure > 0, 'topK exposure is a filled-slot fraction');

  const deployed = pair.trades.reduce((sum, t) => sum + t.startCapital, 0);
  assert(deployed > 0, 'topK run should deploy capital');

  // Only one sector clears the momentum gate, so a topK=2 book must hold the
  // second slot in cash rather than doubling up on the single candidate.
  const thin = new Map([
    ['A1', makeNoisyRows(dates, 0.010, 0.02, 61)], ['A2', makeNoisyRows(dates, 0.010, 0.02, 62)], ['A3', makeNoisyRows(dates, 0.010, 0.02, 63)],
    ['C1', makeNoisyRows(dates, -0.010, 0.02, 71)], ['C2', makeNoisyRows(dates, -0.010, 0.02, 72)], ['C3', makeNoisyRows(dates, -0.010, 0.02, 73)],
  ]);
  const thinSectors = { Fast: ['A1', 'A2', 'A3'], Down: ['C1', 'C2', 'C3'] };
  const thinRun = backtestRotation({
    ...base, stockHistoryBySymbol: thin, sectors: thinSectors, topK: 2,
  });
  assert(thinRun.trades.length >= 1, 'the single qualifying sector should still be bought');
  assert(thinRun.trades.every(t => t.sector === 'Fast'), 'only the positive-momentum sector qualifies');
  const firstThinTrade = thinRun.trades[0];
  assert(firstThinTrade.startCapital <= 0.55 && firstThinTrade.startCapital >= 0.45,
    `a lone candidate in a topK=2 book should take about half the capital, got ${firstThinTrade.startCapital}`);
  assert(thinRun.metrics.exposure < 0.75, 'the unfilled slot should show up as reduced exposure');
  assert(Number.isFinite(pair.metrics.calmarRatio) || pair.metrics.maxDrawdown === 0, 'calmar should be reported');
  assert(Number.isFinite(pair.metrics.annualizedVolatility), 'annualized volatility should be reported');
}

main();
testRegimeGate();
testRegimeFilter();
testVolatilityScaledTrailingStop();
testTopKAllocation();
console.log('rotationBacktest v0.5 tests passed');

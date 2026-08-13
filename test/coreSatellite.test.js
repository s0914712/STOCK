const assert = require('assert');
const { backtestCoreSatellite, benchmarkCurve } = require('../coreSatellite');
const { DEFAULT_COSTS } = require('../rotationBacktest');

function seeded(seed) {
  return function next() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeDates(n, from = '2022-01-03') {
  const out = [];
  const d = new Date(`${from}T00:00:00Z`);
  while (out.length < n) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function makeSeries(dates, drift, vol, seed, start = 100) {
  const rnd = seeded(seed);
  let close = start;
  return dates.map(date => {
    const open = close * (1 + (rnd() - 0.5) * vol * 0.3);
    close = Math.max(1, close * (1 + drift + (rnd() - 0.5) * vol));
    return { date, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 1000 };
  });
}

function makeRiseThenFall(dates, seed, turn = 40, start = 100) {
  const rnd = seeded(seed);
  let close = start;
  return dates.map((date, i) => {
    const drift = i < turn ? 0.02 : -0.02;
    const open = close;
    close = Math.max(1, close * (1 + drift + (rnd() - 0.5) * 0.004));
    return { date, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 1000 };
  });
}

const DATES = makeDates(400);
const TAIEX = DATES.map((date, i) => ({ date, index: 15000 + i * 4 }));

function baseArgs(overrides = {}) {
  return {
    taiexRows: TAIEX,
    benchmarkSymbol: '0050',
    startDate: DATES[25],
    endDate: DATES.at(-1),
    lookback: 10,
    minMomentum: 0,
    takeProfit: 0.20,
    stopLoss: -0.20,
    topK: 2,
    ...overrides,
  };
}

/**
 * The defining property of the design: when nothing qualifies, the book is the
 * benchmark. Any drift here means the core leg is silently leaking money.
 */
function testTracksBenchmarkWhenNoSignal() {
  const histories = new Map([
    ['0050', makeSeries(DATES, 0.0008, 0.012, 1)],
    ['D1', makeSeries(DATES, -0.004, 0.02, 2)], ['D2', makeSeries(DATES, -0.004, 0.02, 3)], ['D3', makeSeries(DATES, -0.004, 0.02, 4)],
  ]);
  const result = backtestCoreSatellite(baseArgs({
    stockHistoryBySymbol: histories,
    sectors: { Down: ['D1', 'D2', 'D3'] },
  }));

  assert.strictEqual(result.trades.length, 0, 'a permanently negative sector should never be bought');
  assert.strictEqual(result.metrics.satelliteExposure, 0, 'the book should stay entirely in the core');
  const diff = Math.abs(result.metrics.totalReturn - result.benchmark.benchmarkTotalReturn);
  assert(diff < 1e-9, `pure-core book must equal buy-and-hold benchmark, differed by ${diff}`);
  assert(Math.abs(result.benchmark.trackingError) < 1e-9, 'pure-core tracking error must be zero');
  assert(Math.abs(result.benchmark.beta - 1) < 1e-9, 'pure-core beta must be one');
  assert.strictEqual(result.benchmark.beatsBenchmark, false, 'matching is not beating');
}

function testDividendsAccrueToBothSides() {
  const histories = new Map([
    ['0050', makeSeries(DATES, 0.0008, 0.012, 1)],
    ['D1', makeSeries(DATES, -0.004, 0.02, 2)], ['D2', makeSeries(DATES, -0.004, 0.02, 3)], ['D3', makeSeries(DATES, -0.004, 0.02, 4)],
  ]);
  const args = baseArgs({ stockHistoryBySymbol: histories, sectors: { Down: ['D1', 'D2', 'D3'] } });

  const dry = backtestCoreSatellite({ ...args, benchmarkDividendYield: 0 });
  const wet = backtestCoreSatellite({ ...args, benchmarkDividendYield: 0.04 });

  assert(wet.benchmark.benchmarkTotalReturn > dry.benchmark.benchmarkTotalReturn,
    'a dividend assumption must raise the benchmark');
  assert(wet.metrics.totalReturn > dry.metrics.totalReturn,
    'the core leg must earn the same dividend, otherwise the comparison is rigged');
  const dryGap = dry.metrics.totalReturn - dry.benchmark.benchmarkTotalReturn;
  const wetGap = wet.metrics.totalReturn - wet.benchmark.benchmarkTotalReturn;
  assert(Math.abs(wetGap - dryGap) < 1e-9,
    'dividends must not change the strategy-versus-benchmark gap for a pure-core book');
}

function testSatelliteEngagesOnSignal() {
  const histories = new Map([
    ['0050', makeSeries(DATES, 0.0004, 0.010, 11)],
    ['S1', makeSeries(DATES, 0.0030, 0.02, 12)], ['S2', makeSeries(DATES, 0.0030, 0.02, 13)], ['S3', makeSeries(DATES, 0.0030, 0.02, 14)],
    ['D1', makeSeries(DATES, -0.003, 0.02, 15)], ['D2', makeSeries(DATES, -0.003, 0.02, 16)], ['D3', makeSeries(DATES, -0.003, 0.02, 17)],
  ]);
  const sectors = { Strong: ['S1', 'S2', 'S3'], Down: ['D1', 'D2', 'D3'] };
  const result = backtestCoreSatellite(baseArgs({ stockHistoryBySymbol: histories, sectors }));

  assert(result.trades.length >= 1, 'a strongly trending sector should be bought');
  assert(result.trades.every(t => t.sector === 'Strong'), 'only the qualifying sector should trade');
  assert(result.metrics.satelliteExposure > 0, 'satellite exposure should be recorded');
  assert(result.metrics.satelliteExposure <= 0.5 + 1e-9,
    'one qualifying sector out of topK=2 caps satellite exposure at half the book');
  assert(result.benchmark.beatsBenchmark, 'a persistent winning satellite should beat the benchmark here');
  assert(Number.isFinite(result.benchmark.informationRatio), 'information ratio should be computed');
  assert(result.benchmark.trackingError > 0, 'deviating from the core must show tracking error');
  assert(Number.isFinite(result.benchmark.rollingOneYearWinRate), 'rolling win rate should be computed');
}

function testMaxSatelliteSlotsCapsDeviation() {
  const histories = new Map([
    ['0050', makeSeries(DATES, 0.0004, 0.010, 21)],
    ['A1', makeSeries(DATES, 0.0030, 0.02, 22)], ['A2', makeSeries(DATES, 0.0030, 0.02, 23)], ['A3', makeSeries(DATES, 0.0030, 0.02, 24)],
    ['B1', makeSeries(DATES, 0.0025, 0.02, 25)], ['B2', makeSeries(DATES, 0.0025, 0.02, 26)], ['B3', makeSeries(DATES, 0.0025, 0.02, 27)],
  ]);
  const sectors = { A: ['A1', 'A2', 'A3'], B: ['B1', 'B2', 'B3'] };

  const uncapped = backtestCoreSatellite(baseArgs({ stockHistoryBySymbol: histories, sectors, topK: 2 }));
  const capped = backtestCoreSatellite(baseArgs({
    stockHistoryBySymbol: histories, sectors, topK: 2, maxSatelliteSlots: 1,
  }));

  assert(uncapped.equityCurve.some(row => row.sectors.length === 2), 'uncapped book should use both slots');
  assert(capped.equityCurve.every(row => row.sectors.length <= 1), 'the cap must hold at one satellite slot');
  assert(capped.metrics.satelliteExposure <= 0.5 + 1e-9, 'capped satellite exposure cannot exceed half the book');
  assert(capped.benchmark.trackingError < uncapped.benchmark.trackingError,
    'capping deviation should reduce tracking error');
}

function testCooldownBlocksImmediateReentry() {
  const histories = new Map([
    ['0050', makeSeries(DATES, 0.0004, 0.010, 31)],
    ['R1', makeRiseThenFall(DATES, 32)], ['R2', makeRiseThenFall(DATES, 33)], ['R3', makeRiseThenFall(DATES, 34)],
  ]);
  const sectors = { Whip: ['R1', 'R2', 'R3'] };
  const args = baseArgs({
    stockHistoryBySymbol: histories, sectors, topK: 1,
    takeProfit: 0.15, stopLoss: -0.10,
  });

  const hot = backtestCoreSatellite({ ...args, cooldownDays: 0 });
  const cooled = backtestCoreSatellite({ ...args, cooldownDays: 20 });

  assert(hot.trades.length > 0, 'the whipsaw sector should trade at least once');
  assert(cooled.trades.length <= hot.trades.length, 'cooldown must not increase churn');

  const dateIndex = new Map(cooled.equityCurve.map((row, i) => [row.date, i]));
  const stops = cooled.trades.filter(t => t.exitReason === 'take_profit' || t.exitReason === 'stop_loss' || t.exitReason === 'trailing_stop');
  for (const stop of stops) {
    const exitAt = dateIndex.get(stop.exitDate);
    const reentry = cooled.trades.find(t => t.sector === stop.sector && dateIndex.get(t.entryDate) > exitAt);
    if (reentry) {
      const gap = dateIndex.get(reentry.entryDate) - exitAt;
      assert(gap > 20, `re-entry after a stop must respect the cooldown, got ${gap} days`);
    }
  }
}

function testBenchmarkCurveChargesCosts() {
  const rows = makeSeries(DATES, 0, 0, 41);
  const flat = rows.map(r => ({ ...r, open: 100, close: 100, high: 100, low: 100 }));
  const curve = benchmarkCurve({ rows: flat, dates: DATES, costs: DEFAULT_COSTS, initialCapital: 1 });
  assert(curve.finalEquity < 1, 'a flat benchmark must still pay round-trip costs');
  const expected = (1 / (1 + DEFAULT_COSTS.buyCommission)) * (1 - DEFAULT_COSTS.sellCommission - DEFAULT_COSTS.sellTax);
  assert(Math.abs(curve.finalEquity - expected) < 1e-12, 'benchmark cost model should be exact');
}

/**
 * Regression test for the failure that made the first version of this design
 * lose to 0050 outright: the top-K momentum set reshuffles almost daily, so
 * without hysteresis the book round-tripped to the core nearly every session
 * and paid 0.585% each time.
 */
function testHysteresisControlsChurn() {
  const rnd = seeded(77);
  const histories = new Map([['0050', makeSeries(DATES, 0.0004, 0.010, 51)]]);
  const sectors = {};
  // Four sectors with near-identical drift: the ranking is pure noise, which is
  // exactly the condition that generates churn.
  for (const [i, name] of ['P', 'Q', 'R', 'S'].entries()) {
    const symbols = [`${name}1`, `${name}2`, `${name}3`];
    symbols.forEach((s, j) => histories.set(s, makeSeries(DATES, 0.0009, 0.025, 100 + i * 10 + j)));
    sectors[name] = symbols;
  }
  const args = baseArgs({ stockHistoryBySymbol: histories, sectors, topK: 2, maxSatelliteSlots: 2 });

  const twitchy = backtestCoreSatellite({ ...args, exitRankBuffer: 0, minHoldingDays: 0, rebalanceEvery: 1 });
  const damped = backtestCoreSatellite({ ...args, exitRankBuffer: 2, minHoldingDays: 20, rebalanceEvery: 20 });

  assert(twitchy.trades.length > damped.trades.length * 2,
    `hysteresis must cut churn substantially (${twitchy.trades.length} vs ${damped.trades.length})`);
  assert(damped.metrics.costsPaidPctOfInitial < twitchy.metrics.costsPaidPctOfInitial,
    'less churn must mean less paid to the broker');

  const oneDayHolds = r => r.trades.filter(t => t.holdingTradingDays <= 1).length;
  assert(oneDayHolds(damped) === 0, 'a minimum holding period must eliminate one-day round trips');
  assert(oneDayHolds(twitchy) > 0, 'the unfiltered version should show the pathology this guards against');
}

function testRebalanceCadenceThrottlesRankMoves() {
  const rnd = seeded(88);
  const histories = new Map([['0050', makeSeries(DATES, 0.0004, 0.010, 61)]]);
  const sectors = {};
  for (const [i, name] of ['X', 'Y', 'Z'].entries()) {
    const symbols = [`${name}1`, `${name}2`, `${name}3`];
    symbols.forEach((s, j) => histories.set(s, makeSeries(DATES, 0.0010, 0.028, 200 + i * 10 + j)));
    sectors[name] = symbols;
  }
  const args = baseArgs({
    stockHistoryBySymbol: histories, sectors, topK: 2, maxSatelliteSlots: 1,
    exitRankBuffer: 0, minHoldingDays: 0,
  });

  const daily = backtestCoreSatellite({ ...args, rebalanceEvery: 1 });
  const monthly = backtestCoreSatellite({ ...args, rebalanceEvery: 20 });
  assert(monthly.trades.length < daily.trades.length, 'a slower cadence must trade less');
  assert(monthly.metrics.tradesPerYear < daily.metrics.tradesPerYear, 'trades-per-year should reflect the cadence');
}

function testCostAccountingIsExact() {
  const histories = new Map([
    ['0050', makeSeries(DATES, 0.0008, 0.012, 1)],
    ['D1', makeSeries(DATES, -0.004, 0.02, 2)], ['D2', makeSeries(DATES, -0.004, 0.02, 3)], ['D3', makeSeries(DATES, -0.004, 0.02, 4)],
  ]);
  const result = backtestCoreSatellite(baseArgs({
    stockHistoryBySymbol: histories,
    sectors: { Down: ['D1', 'D2', 'D3'] },
  }));
  // A book that only ever buys the core once should have paid exactly one
  // commission on the full initial capital.
  const expected = 1 - 1 / (1 + DEFAULT_COSTS.buyCommission);
  assert(Math.abs(result.metrics.costsPaid - expected) < 1e-12,
    `pure-core costs should be a single buy commission, got ${result.metrics.costsPaid} vs ${expected}`);
}

testTracksBenchmarkWhenNoSignal();
testHysteresisControlsChurn();
testRebalanceCadenceThrottlesRankMoves();
testCostAccountingIsExact();
testDividendsAccrueToBothSides();
testSatelliteEngagesOnSignal();
testMaxSatelliteSlotsCapsDeviation();
testCooldownBlocksImmediateReentry();
testBenchmarkCurveChargesCosts();
console.log('coreSatellite tests passed');

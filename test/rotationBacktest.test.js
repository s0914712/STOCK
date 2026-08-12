const assert = require('assert');
const { rankSectorMomentum, backtestRotation } = require('../rotationBacktest');

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
    takeProfit: 0.20, stopLoss: -0.20,
    costs: { buyCommission: 0, sellCommission: 0, sellTax: 0 },
  });
  assert(noCost.metrics.totalReturn > result.metrics.totalReturn, 'costs should reduce return');

  console.log('rotationBacktest tests passed');
}

main();

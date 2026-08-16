const assert = require('assert');
const { buildSectorRepresentatives } = require('../scripts/runDashboardMarketSnapshot');

const snapshot = {
  generatedAt: '2026-08-16T00:00:00.000Z',
  datasets: {
    stockDay: {
      asOf: '2026-08-14',
      stale: false,
      data: [
        { date: '2026-08-14', symbol: '1101', name: '甲', close: 10, tradeValue: 100 },
        { date: '2026-08-14', symbol: '1102', name: '乙', close: 20, tradeValue: 300 },
        { date: '2026-08-14', symbol: '2201', name: '丙', close: 30, tradeValue: 200 },
        { date: '2026-08-14', symbol: '2202', name: '丁', close: 40, tradeValue: 200 },
      ],
    },
  },
};

const report = buildSectorRepresentatives(snapshot, {
  水泥: ['1101', '1102'],
  汽車: ['2202', '2201'],
});
assert.strictEqual(report.asOf, '2026-08-14');
assert.deepStrictEqual(report.sectors.map(row => row.symbol), ['1102', '2201']);
assert.strictEqual(report.sectors[0].tradeValue, 300);
assert.throws(
  () => buildSectorRepresentatives({ datasets: { stockDay: { ...snapshot.datasets.stockDay, stale: true } } }),
  /fresh STOCK_DAY_ALL/,
);
assert.throws(
  () => buildSectorRepresentatives(snapshot, { 水泥: ['1101', '9999'] }),
  /missing for 水泥: 9999/,
);

console.log('sector representative tests passed');

'use strict';

const assert = require('assert');
const {
  SIGNAL_DEFINITIONS,
  SIGNAL_KEYS,
  classifyScore,
  scoreSignals,
  scoreValue,
} = require('../fearGreedIndex');
const {
  deriveBreadth,
  deriveMarginSignals,
  deriveMomentum,
  parseActiveAccounts,
  parseForeignFuturesHtml,
  parseFxHtml,
  parseMarginSummary,
  parsePutCallHtml,
  parseVixDailyText,
} = require('../scripts/fearGreedSources');

for (const definition of Object.values(SIGNAL_DEFINITIONS)) {
  assert.strictEqual(scoreValue(definition.fearAnchor, definition), 0);
  assert.strictEqual(scoreValue(definition.greedAnchor, definition), 100);
}

const complete = scoreSignals(SIGNAL_KEYS.map(key => ({
  key,
  status: 'ok',
  value: (SIGNAL_DEFINITIONS[key].fearAnchor + SIGNAL_DEFINITIONS[key].greedAnchor) / 2,
  asOf: '2026-09-04',
})));
assert.strictEqual(complete.status, 'complete');
assert.strictEqual(complete.coverage.available, 9);
assert.strictEqual(complete.score, 50);
assert.strictEqual(classifyScore(50), '中性');

const partial = scoreSignals(complete.signals.slice(0, 8));
assert.strictEqual(partial.status, 'partial');
assert.strictEqual(partial.score, null, 'partial inputs must never publish a composite score');
assert.strictEqual(partial.coverage.available, 8);

const optionRows = parseVixDailyText([
  'Date Closing Time Daily Index Last 1 min AVG',
  '20260904 13450000 24.00 23.75',
].join('\n'));
assert.deepStrictEqual(optionRows[0], {
  date: '2026-09-04', close: 24, lastMinuteAverage: 23.75,
});

const putCallRows = parsePutCallHtml(`
  <table><tr><td>2026/09/04</td><td>100</td><td>200</td><td>50%</td>
  <td>130,000</td><td>100,000</td><td>130%</td></tr></table>`);
assert.strictEqual(putCallRows[0].openInterestRatioPercent, 130);

const fxRows = parseFxHtml('<table><tr><td>2026/09/04</td><td>30.512</td><td>1</td></tr></table>');
assert.strictEqual(fxRows[0].usdTwd, 30.512);

const futures = parseForeignFuturesHtml(`
  <p>Date: 2026/09/04</p><table>
  <tr><td>x</td><td>TX</td>${'<td>0</td>'.repeat(13)}</tr>
  <tr><td>FINI</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td>
  <td>70,000</td><td>8</td><td>90,000</td><td>10</td><td>-20,000</td><td>12</td></tr>
  </table>`);
assert.strictEqual(futures.date, '2026-09-04');
assert.strictEqual(futures.netOpenInterest, -20000);

const summary = parseMarginSummary({
  date: '20260904',
  tables: [{ data: [
    ['融資(交易單位)', '', '', '', '', '8,000'],
    ['融券(交易單位)', '', '', '', '', '200'],
    ['融資金額(仟元)', '', '', '', '', '100,000'],
  ] }],
});
assert.deepStrictEqual(summary, {
  date: '2026-09-04', marginBalanceUnits: 8000, shortBalanceUnits: 200, marginAmountThousand: 100000,
});

const margin = deriveMarginSignals(
  [{ symbol: '2330', close: 100 }],
  [{ symbol: '2330', marginBalanceUnits: 2000 }],
  summary,
);
assert.strictEqual(margin.maintenanceProxyPercent, 200);
assert.strictEqual(margin.shortToMarginPercent, 2.5);

const breadth = deriveBreadth([
  { symbol: '1101', change: 1 },
  { symbol: '1102', change: -1 },
  { symbol: '1103', change: 2 },
  { symbol: '0050', change: 1 },
]);
assert.strictEqual(breadth.universe, 3, 'ETF-like codes must not enter common-stock breadth');
assert(Math.abs(breadth.advanceSharePercent - (2 / 3 * 100)) < 1e-8);

const momentum = deriveMomentum(Array.from({ length: 21 }, (_, index) => ({
  date: `2026-08-${String(index + 1).padStart(2, '0')}`,
  close: 100 + index,
})), 20);
assert.strictEqual(momentum.baseClose, 100);
assert(Math.abs(momentum.returnPercent - 20) < 1e-8);

const accounts = parseActiveAccounts({ data: [
  { 年月: '202607', 公告日期: '2026-08-10', 交易人數: '100,000' },
  { 年月: '202608', 公告日期: '2026-09-10', 交易人數: '110,000' },
] });
assert(Math.abs(accounts.monthOverMonthPercent - 10) < 1e-8);

console.log('fear/greed model and parser tests passed');

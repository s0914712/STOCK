const assert = require('assert');
const {
  buildSnapshot,
  detectTradingDateLag,
} = require('../scripts/runDashboardMarketSnapshot');
const { DATASET_KEYS } = require('../scripts/twseOpenApi');

function envelope(dataset, asOf = '2026-08-20') {
  return { dataset, asOf, stale: false, data: [], count: 0, contentHash: `sha256:${dataset}` };
}

function run() {
  const datasets = Object.fromEntries(DATASET_KEYS.map(key => [key, envelope(key)]));
  const lateFriday = buildSnapshot(datasets, '2026-08-21T09:02:00.000Z'); // 17:02 Asia/Taipei
  assert.strictEqual(lateFriday.freshness.tradingDateLag, true);
  assert.strictEqual(lateFriday.freshness.complete, false);
  assert.strictEqual(lateFriday.freshness.expectedTradingDate, '2026-08-21');
  assert.strictEqual(lateFriday.freshness.stockDayAsOf, '2026-08-20');

  const beforeCutoff = buildSnapshot(datasets, '2026-08-21T08:00:00.000Z'); // 16:00 Asia/Taipei
  assert.strictEqual(beforeCutoff.freshness.tradingDateLag, false);

  const weekend = buildSnapshot(datasets, '2026-08-22T09:02:00.000Z');
  assert.strictEqual(weekend.freshness.tradingDateLag, false);

  const explicitHolidayOverride = detectTradingDateLag(lateFriday, { expectedTradingDate: '2026-08-20' });
  assert.strictEqual(explicitHolidayOverride.lagged, false);

  console.log('market freshness v0.5.1 tests passed');
}

run();

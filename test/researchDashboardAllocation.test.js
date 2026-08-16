const assert = require('assert');
const { buildAllocationLeaders } = require('../public/research-dashboard');

const challenger = {
  latestPrediction: {
    asOf: '2026-08-14',
    sectors: [
      { sector: '半導體', baseline: 0.6, lightgbm: 0.3, xgboost: 0.2 },
      { sector: '航運', baseline: 0.4, lightgbm: 0.7, xgboost: 0.8 },
    ],
  },
};
const baseline = {
  latestPrediction: {
    asOf: '2026-08-14',
    sectors: [
      { sector: '半導體', anchors: [{ symbol: '2330' }, { symbol: '2454' }, { symbol: '2303' }] },
      { sector: '航運', anchors: [{ symbol: '2603' }, { symbol: '2609' }, { symbol: '2615' }] },
    ],
  },
};

const leaders = buildAllocationLeaders(challenger, baseline);
assert.deepStrictEqual(leaders.baseline.map(row => row.symbol), ['2303', '2330']);
assert(Math.abs(leaders.baseline[0].weight - 0.2) < 1e-12);
assert.deepStrictEqual(leaders.lightgbm.map(row => row.symbol), ['2603', '2609']);
assert(Math.abs(leaders.lightgbm[0].weight - (0.7 / 3)) < 1e-12);
assert.deepStrictEqual(leaders.xgboost.map(row => row.symbol), ['2603', '2609']);
assert.strictEqual(buildAllocationLeaders(challenger, null).baseline.length, 0);
assert.strictEqual(buildAllocationLeaders(challenger, {
  latestPrediction: { asOf: '2026-08-13', sectors: baseline.latestPrediction.sectors },
}).baseline.length, 0);

console.log('researchDashboard allocation tests passed');

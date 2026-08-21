const assert = require('assert');
const {
  buildRecommendationReport,
  chooseChampion,
  dateAlignment,
  inferSector,
} = require('../recommendationV051');

function challenger(asOf = '2026-08-21') {
  return {
    latestPrediction: {
      asOf,
      sectors: [
        { sector: '半導體', baseline: 0.45, lightgbm: 0.48, xgboost: 0.43 },
        { sector: 'AI伺服器', baseline: 0.45, lightgbm: 0.50, xgboost: 0.46 },
        { sector: 'PCB', baseline: 0.49, lightgbm: 0.67, xgboost: 0.69 },
        { sector: '金融', baseline: 0.48, lightgbm: 0.59, xgboost: 0.53 },
        { sector: '航運', baseline: 0.54, lightgbm: 0.31, xgboost: 0.33 },
        { sector: '電子零組件', baseline: 0.47, lightgbm: 0.55, xgboost: 0.53 },
      ],
    },
    performance: {
      scoredSnapshots: 4,
      models: {
        baseline: { meanBrier: 0.247 },
        lightgbm: { meanBrier: 0.196 },
        xgboost: { meanBrier: 0.217 },
      },
    },
    training: {
      validation: {
        baseline: { brier: 0.248 },
        lightgbm: { brier: 0.276 },
        xgboost: { brier: 0.264 },
      },
    },
  };
}

function factor(asOf = '2026-08-21') {
  return {
    asOf,
    rankings: {
      composite: [
        { rank: 1, symbol: '5522', name: '遠雄', industry: '建材營造', close: 64.1, score: 0.858, riskFlags: [] },
        { rank: 2, symbol: '3037', name: '欣興', industry: '電子零組件業', close: 1140, score: 0.76, riskFlags: [] },
        { rank: 3, symbol: '2603', name: '長榮', industry: '航運業', close: 246, score: 0.789, riskFlags: [] },
        { rank: 4, symbol: '5534', name: '長虹', industry: '建材營造', close: 80.9, score: 0.791, riskFlags: ['30日內除權息：2026-08-25'] },
      ],
    },
  };
}

function run() {
  assert.strictEqual(chooseChampion(challenger()).model, 'lightgbm');
  assert.strictEqual(chooseChampion(challenger()).evidence, 'forward-oos');
  assert.strictEqual(dateAlignment('2026-08-20', '2026-08-21'), 'factor-lagged');
  assert.deepStrictEqual(inferSector({ symbol: '3037', industry: '電子零組件業' }), { sector: 'PCB', source: 'anchor-membership' });
  assert.deepStrictEqual(inferSector({ symbol: '2603', industry: '航運業' }), { sector: '航運', source: 'anchor-membership' });

  const report = buildRecommendationReport(factor(), challenger());
  const bySymbol = new Map(report.recommendations.map(row => [row.symbol, row]));
  assert.strictEqual(report.status, 'aligned');
  assert.strictEqual(report.champion.model, 'lightgbm');
  assert.strictEqual(bySymbol.get('2603').action, '暫避', 'negative sector ML must override a strong factor rank');
  assert(bySymbol.get('3037').recommendationScore > bySymbol.get('2603').recommendationScore, 'PCB ML confirmation should rank ahead of contradicted shipping');
  assert.strictEqual(bySymbol.get('5522').confidence, 'factor-only', 'uncovered stocks must not pretend to have sector ML confirmation');
  assert(bySymbol.get('5534').riskPenalty > 0, 'corporate action warning must reduce score');

  const lagged = buildRecommendationReport(factor('2026-08-20'), challenger('2026-08-21'));
  assert.strictEqual(lagged.status, 'data-lagged');
  assert(lagged.recommendations.every(row => row.action !== '優先觀察'), 'lagged data must block highest-confidence label');

  console.log('recommendation v0.5.1 tests passed');
}

run();

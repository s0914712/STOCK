const assert = require('assert');
const {
  makePredictionSnapshot,
  getTargetDate,
  scorePredictionSnapshot,
  summarizeScores,
} = require('../shadowPrediction');

function history(symbol, anchor, target, anchorClose, targetClose) {
  return [
    { date: anchor, close: anchorClose },
    { date: target, close: targetClose },
  ];
}

function main() {
  const radar = {
    model: 'sector-radar-baseline-v0.1',
    modelType: 'cross-sectional heuristic baseline',
    asOf: '2026-08-03',
    data: [
      { sector: 'A', rank: 1, score: 75, signal: '強勢', coverage: 1, members: [{ symbol: '1000', asOf: '2026-08-03', close: 100 }] },
      { sector: 'B', rank: 2, score: 60, signal: '強勢', coverage: 1, members: [{ symbol: '2000', asOf: '2026-08-03', close: 100 }] },
      { sector: 'C', rank: 3, score: 52, signal: '中性', coverage: 1, members: [{ symbol: '3000', asOf: '2026-08-03', close: 100 }] },
      { sector: 'D', rank: 4, score: 48, signal: '中性', coverage: 1, members: [{ symbol: '4000', asOf: '2026-08-03', close: 100 }] },
      { sector: 'E', rank: 5, score: 35, signal: '弱勢', coverage: 1, members: [{ symbol: '5000', asOf: '2026-08-03', close: 100 }] },
      { sector: 'F', rank: 6, score: 25, signal: '弱勢', coverage: 1, members: [{ symbol: '6000', asOf: '2026-08-03', close: 100 }] },
    ],
  };

  const snapshot = makePredictionSnapshot(radar, '2026-08-03T08:00:00Z');
  assert.strictEqual(snapshot.id, '2026-08-03:sector-radar-baseline-v0.1');
  assert.strictEqual(snapshot.sectors[0].anchors[0].close, 100);

  const dates = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-10'];
  assert.strictEqual(getTargetDate('2026-08-03', dates, 5), '2026-08-10');
  assert.strictEqual(getTargetDate('2026-08-03', dates.slice(0, -1), 5), null);

  const taiexRows = dates.map((date, i) => ({ date, index: 10000 + i * 20 }));
  const stockHistoryBySymbol = new Map([
    ['1000', history('1000', '2026-08-03', '2026-08-10', 100, 112)],
    ['2000', history('2000', '2026-08-03', '2026-08-10', 100, 108)],
    ['3000', history('3000', '2026-08-03', '2026-08-10', 100, 105)],
    ['4000', history('4000', '2026-08-03', '2026-08-10', 100, 101)],
    ['5000', history('5000', '2026-08-03', '2026-08-10', 100, 98)],
    ['6000', history('6000', '2026-08-03', '2026-08-10', 100, 95)],
  ]);

  const scored = scorePredictionSnapshot(snapshot, { taiexRows, stockHistoryBySymbol });
  assert(scored, 'mature snapshot should score');
  assert.strictEqual(scored.targetDate, '2026-08-10');
  assert.deepStrictEqual(scored.predictedTop3, ['A', 'B', 'C']);
  assert.deepStrictEqual(scored.actualTop3, ['A', 'B', 'C']);
  assert.strictEqual(scored.metrics.top3HitRate, 1);
  assert(scored.metrics.directionAccuracy >= 0.8);

  const immature = scorePredictionSnapshot(snapshot, {
    taiexRows: taiexRows.slice(0, -1),
    stockHistoryBySymbol,
  });
  assert.strictEqual(immature, null, 'snapshot must wait for the fifth future trading day');

  const summary = summarizeScores([scored]);
  assert.strictEqual(summary.scoredSnapshots, 1);
  assert.strictEqual(summary.meanTop3HitRate, 1);

  console.log('shadowPrediction tests passed');
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}

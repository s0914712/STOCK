const assert = require('assert');
const {
  buildSweepGrid,
  evaluateConfig,
  summarizeFamilies,
  recommend,
} = require('../rotationRobustness');

function seeded(seed) {
  return function next() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeDates(n, from = '2023-01-02') {
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
    const open = close;
    close = close * (1 + drift + (rnd() - 0.5) * vol);
    return { date, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 1000 };
  });
}

function testGrid() {
  const grid = buildSweepGrid();
  assert.strictEqual(grid.length, 4 * 2 * 7, 'default grid should be regimes x topK x trailings');
  assert.strictEqual(new Set(grid.map(c => c.id)).size, grid.length, 'config ids must be unique');

  const families = new Set(grid.map(c => c.familyId));
  assert.strictEqual(families.size, 4 * 2 * 2, 'families split fixed-percentage from vol-scaled stops');

  const volConfig = grid.find(c => c.trailingId === 'vol-4' && c.regimeId === 'ma60-exit' && c.topK === 2);
  assert.strictEqual(volConfig.params.trailingStopVolMultiple, 4);
  assert.strictEqual(volConfig.params.topK, 2);
  assert.deepStrictEqual(volConfig.params.regimeFilter, { lookback: 60, mode: 'exit-and-block' });
  assert.strictEqual(volConfig.params.trailingStop, undefined, 'vol-scaled configs must not also set a fixed stop');

  const custom = buildSweepGrid({ topKs: [1], trailings: [{ id: 'fixed-10', trailingStop: 0.10 }] });
  assert.strictEqual(custom.length, 4, 'grid overrides should narrow the sweep');
}

function testEvaluateConfig() {
  const dates = makeDates(520);
  const histories = new Map([
    ['A1', makeSeries(dates, 0.0016, 0.03, 1)], ['A2', makeSeries(dates, 0.0015, 0.03, 2)], ['A3', makeSeries(dates, 0.0017, 0.03, 3)],
    ['B1', makeSeries(dates, 0.0006, 0.02, 4)], ['B2', makeSeries(dates, 0.0005, 0.02, 5)], ['B3', makeSeries(dates, 0.0007, 0.02, 6)],
    ['C1', makeSeries(dates, -0.0008, 0.04, 7)], ['C2', makeSeries(dates, -0.0009, 0.04, 8)], ['C3', makeSeries(dates, -0.0007, 0.04, 9)],
  ]);
  const sectors = { Fast: ['A1', 'A2', 'A3'], Slow: ['B1', 'B2', 'B3'], Weak: ['C1', 'C2', 'C3'] };
  let index = 9000;
  const rnd = seeded(99);
  const taiexRows = dates.map(date => {
    index *= 1 + 0.0006 + (rnd() - 0.5) * 0.012;
    return { date, index };
  });

  const configs = buildSweepGrid({
    regimes: [{ id: 'none', regimeFilter: null }, { id: 'ma60-exit', regimeFilter: { lookback: 60, mode: 'exit-and-block' } }],
    trailings: [
      { id: 'fixed-08', trailingStop: 0.08 },
      { id: 'fixed-10', trailingStop: 0.10 },
      { id: 'fixed-12', trailingStop: 0.12 },
      { id: 'vol-4', trailingStopVolMultiple: 4 },
      { id: 'vol-5', trailingStopVolMultiple: 5 },
      { id: 'vol-6', trailingStopVolMultiple: 6 },
    ],
    topKs: [1, 2],
  });

  const evaluations = configs.map(config => evaluateConfig({
    config, stockHistoryBySymbol: histories, taiexRows, sectors,
    startDate: dates[30], endDate: dates.at(-1),
  })).filter(Boolean);

  assert.strictEqual(evaluations.length, configs.length, 'every configuration should evaluate');
  for (const evaluation of evaluations) {
    assert(Number.isFinite(evaluation.full.totalReturn), `${evaluation.id} needs a total return`);
    assert(evaluation.firstHalf && evaluation.secondHalf, `${evaluation.id} needs both half-samples`);
    assert(evaluation.splitMidpoint > dates[30] && evaluation.splitMidpoint < dates.at(-1), 'split must fall inside the window');
    assert(evaluation.yearly.length >= 2, 'multi-year window should produce per-year rows');
    assert(evaluation.yearsBeatingTaiex <= evaluation.yearsEvaluated);
  }

  const families = summarizeFamilies(evaluations);
  assert.strictEqual(families.length, 2 * 2 * 2, 'families should collapse the trailing parameter');
  for (const family of families) {
    assert.strictEqual(family.memberCount, 3, 'each family holds its three trailing variants');
    assert(family.minCagr <= family.medianCagr && family.medianCagr <= family.maxCagr, 'family CAGR order');
    assert(Math.abs(family.cagrSpread - (family.maxCagr - family.minCagr)) < 1e-12, 'spread is max minus min');
  }
  const sorted = families.map(f => f.medianCalmar ?? -Infinity);
  assert.deepStrictEqual(sorted, sorted.slice().sort((a, b) => b - a), 'families sort by median Calmar');
}

function fakeEvaluation(id, familyId, { cagr, calmar, secondHalf = 1, total = 1 }) {
  return {
    id,
    familyId,
    regimeId: familyId.split('/')[0],
    topK: 1,
    trailingFamily: familyId.split('/')[2],
    full: { annualizedReturn: cagr, calmarRatio: calmar, maxDrawdown: -0.2, totalReturn: total },
    firstHalf: { totalReturn: 0.3 },
    secondHalf: { totalReturn: secondHalf },
    yearly: [],
    yearsEvaluated: 4,
    yearsBeatingTaiex: 3,
  };
}

function testRecommendRejectsFragileFamily() {
  // Mirrors the v0.4 fixed-percentage result: neighbouring parameters disagree
  // violently, so the family must not be promoted no matter how good its best
  // member looks.
  const evaluations = [
    fakeEvaluation('none/top1/fixed-08', 'none/top1/fixed-pct', { cagr: 0.53, calmar: 1.1 }),
    fakeEvaluation('none/top1/fixed-10', 'none/top1/fixed-pct', { cagr: 0.36, calmar: 1.2 }),
    fakeEvaluation('none/top1/fixed-12', 'none/top1/fixed-pct', { cagr: -0.07, calmar: -0.2, secondHalf: -0.3, total: -0.28 }),
  ];
  const families = summarizeFamilies(evaluations);
  const outcome = recommend(families, evaluations);
  assert.strictEqual(outcome.verdict, 'no-promotion', 'a fragile family must not be promoted');
  assert.strictEqual(outcome.promoted, null);
  assert(outcome.rejections.length >= 1, 'rejection reasons should be recorded');
  const failures = outcome.rejections[0].failures.join(' ');
  assert(failures.includes('CAGR spread'), 'spread should be cited');
}

function testRecommendPicksMedianOfStableFamily() {
  const evaluations = [
    fakeEvaluation('ma60-exit/top2/vol-4', 'ma60-exit/top2/vol-scaled', { cagr: 0.20, calmar: 1.0 }),
    fakeEvaluation('ma60-exit/top2/vol-5', 'ma60-exit/top2/vol-scaled', { cagr: 0.26, calmar: 1.3 }),
    fakeEvaluation('ma60-exit/top2/vol-6', 'ma60-exit/top2/vol-scaled', { cagr: 0.31, calmar: 1.5 }),
    fakeEvaluation('none/top1/fixed-08', 'none/top1/fixed-pct', { cagr: 0.53, calmar: 1.9 }),
    fakeEvaluation('none/top1/fixed-10', 'none/top1/fixed-pct', { cagr: 0.36, calmar: 1.2 }),
    fakeEvaluation('none/top1/fixed-12', 'none/top1/fixed-pct', { cagr: -0.07, calmar: -0.2, secondHalf: -0.3, total: -0.28 }),
  ];
  const families = summarizeFamilies(evaluations);
  const outcome = recommend(families, evaluations);

  assert.strictEqual(outcome.verdict, 'shadow-candidate');
  assert.strictEqual(outcome.familyId, 'ma60-exit/top2/vol-scaled', 'the stable family wins despite a lower peak CAGR');
  assert.strictEqual(outcome.promoted, 'ma60-exit/top2/vol-5', 'the median parameter is picked, not the best one');
  assert(outcome.note.includes('not an approved champion'), 'the verdict must stay a shadow candidate');
}

testGrid();
testEvaluateConfig();
testRecommendRejectsFragileFamily();
testRecommendPicksMedianOfStableFamily();
console.log('rotationRobustness tests passed');

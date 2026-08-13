/**
 * Rotation robustness harness (v0.5)
 *
 * The v0.4 report compared four hand-picked configurations and the headline
 * numbers ranged from +683% to -28% across neighbouring trailing-stop values.
 * A spread that large means the ranking was reading parameter luck, not signal.
 *
 * This module therefore evaluates a whole grid, groups configurations into
 * families that differ only by one parameter, and scores a family by how its
 * *neighbourhood* behaves — median Calmar, worst-case Calmar, and the spread of
 * CAGR across the family. A configuration is only recommendable when the
 * parameters around it also work.
 */

const { backtestRotation } = require('./rotationBacktest');

const DEFAULT_GRID = {
  regimes: [
    { id: 'none', regimeFilter: null },
    { id: 'ma60-block', regimeFilter: { lookback: 60, mode: 'block-entry' } },
    { id: 'ma60-exit', regimeFilter: { lookback: 60, mode: 'exit-and-block' } },
    { id: 'ma120-exit', regimeFilter: { lookback: 120, mode: 'exit-and-block' } },
  ],
  trailings: [
    { id: 'fixed-08', trailingStop: 0.08 },
    { id: 'fixed-10', trailingStop: 0.10 },
    { id: 'fixed-12', trailingStop: 0.12 },
    { id: 'vol-3', trailingStopVolMultiple: 3 },
    { id: 'vol-4', trailingStopVolMultiple: 4 },
    { id: 'vol-5', trailingStopVolMultiple: 5 },
    { id: 'vol-6', trailingStopVolMultiple: 6 },
  ],
  topKs: [1, 2],
};

function mean(values) {
  const xs = values.filter(Number.isFinite);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function median(values) {
  const xs = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!xs.length) return null;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}

function minOf(values) {
  const xs = values.filter(Number.isFinite);
  return xs.length ? Math.min(...xs) : null;
}

function maxOf(values) {
  const xs = values.filter(Number.isFinite);
  return xs.length ? Math.max(...xs) : null;
}

function trailingFamily(trailing) {
  return trailing.id.startsWith('vol-') ? 'vol-scaled' : 'fixed-pct';
}

function buildSweepGrid(grid = {}) {
  const { regimes, trailings, topKs } = { ...DEFAULT_GRID, ...grid };
  const configs = [];
  for (const regime of regimes) {
    for (const topK of topKs) {
      for (const trailing of trailings) {
        const { id: trailingId, ...trailingParams } = trailing;
        configs.push({
          // "/" rather than "|" so ids stay safe inside markdown tables.
          id: `${regime.id}/top${topK}/${trailingId}`,
          familyId: `${regime.id}/top${topK}/${trailingFamily(trailing)}`,
          regimeId: regime.id,
          trailingId,
          trailingFamily: trailingFamily(trailing),
          topK,
          params: { regimeFilter: regime.regimeFilter, topK, ...trailingParams },
        });
      }
    }
  }
  return configs;
}

function splitWindow(dates) {
  const usable = dates.filter(Boolean);
  if (usable.length < 4) return null;
  const midpoint = usable[Math.floor(usable.length / 2)];
  return { midpoint };
}

function slice(result) {
  if (!result) return null;
  const m = result.metrics;
  return {
    totalReturn: m.totalReturn,
    annualizedReturn: m.annualizedReturn,
    taiexReturn: m.taiexReturn,
    excessVsTaiex: m.excessVsTaiex,
    maxDrawdown: m.maxDrawdown,
    calmarRatio: m.calmarRatio,
    sharpeRatio: m.sharpeRatio,
    annualizedVolatility: m.annualizedVolatility,
    tradeCount: m.tradeCount,
    winRate: m.winRate,
    exposure: m.exposure,
  };
}

/**
 * Run one configuration over the full window, both halves, and each calendar
 * year. Half-sample and per-year figures are what expose a result that rests
 * on a single strong stretch.
 */
function evaluateConfig({
  config,
  stockHistoryBySymbol,
  taiexRows,
  sectors,
  startDate,
  endDate,
  baseParams = {},
}) {
  const shared = {
    stockHistoryBySymbol, taiexRows, sectors,
    lookback: 10, takeProfit: 0.20, stopLoss: -0.20, minMomentum: 0,
    ...baseParams, ...config.params,
  };
  const run = (from, to) => {
    try {
      return backtestRotation({ ...shared, startDate: from, endDate: to });
    } catch (error) {
      return null;
    }
  };

  const full = run(startDate, endDate);
  if (!full) return null;

  const windowDates = full.equityCurve.map(row => row.date);
  const split = splitWindow(windowDates);
  const firstHalf = split ? run(startDate, split.midpoint) : null;
  const secondHalf = split ? run(split.midpoint, endDate) : null;

  const yearly = [];
  for (let year = Number(startDate.slice(0, 4)); year <= Number(endDate.slice(0, 4)); year += 1) {
    const from = `${year}-01-01` < startDate ? startDate : `${year}-01-01`;
    const to = `${year}-12-31` > endDate ? endDate : `${year}-12-31`;
    if (from > to) continue;
    const result = run(from, to);
    if (result) yearly.push({ year, ...slice(result) });
  }

  const excesses = yearly.map(y => y.excessVsTaiex).filter(Number.isFinite);
  return {
    id: config.id,
    familyId: config.familyId,
    regimeId: config.regimeId,
    trailingId: config.trailingId,
    trailingFamily: config.trailingFamily,
    topK: config.topK,
    strategy: full.strategy,
    assumptions: full.assumptions,
    full: slice(full),
    firstHalf: slice(firstHalf),
    secondHalf: slice(secondHalf),
    splitMidpoint: split ? split.midpoint : null,
    yearly,
    yearsEvaluated: excesses.length,
    yearsBeatingTaiex: excesses.filter(v => v > 0).length,
    worstYearExcess: minOf(excesses),
    medianYearExcess: median(excesses),
    tradeCount: full.metrics.tradeCount,
  };
}

/**
 * Group evaluations that differ only by the trailing-stop parameter and judge
 * the group as a whole. `cagrSpread` is the headline fragility number: v0.4's
 * fixed-percentage family spans roughly 60 CAGR points across 8/10/12%.
 */
function summarizeFamilies(evaluations) {
  const groups = new Map();
  for (const evaluation of evaluations) {
    if (!groups.has(evaluation.familyId)) groups.set(evaluation.familyId, []);
    groups.get(evaluation.familyId).push(evaluation);
  }

  const families = [];
  for (const [familyId, members] of groups.entries()) {
    const cagrs = members.map(m => m.full.annualizedReturn);
    const calmars = members.map(m => m.full.calmarRatio);
    const drawdowns = members.map(m => m.full.maxDrawdown);
    const spread = Number.isFinite(maxOf(cagrs)) && Number.isFinite(minOf(cagrs))
      ? maxOf(cagrs) - minOf(cagrs)
      : null;
    families.push({
      familyId,
      regimeId: members[0].regimeId,
      topK: members[0].topK,
      trailingFamily: members[0].trailingFamily,
      memberCount: members.length,
      medianCagr: median(cagrs),
      minCagr: minOf(cagrs),
      maxCagr: maxOf(cagrs),
      cagrSpread: spread,
      medianCalmar: median(calmars),
      worstCalmar: minOf(calmars),
      worstMaxDrawdown: minOf(drawdowns),
      medianYearsBeatingTaiex: median(members.map(m => m.yearsBeatingTaiex)),
      allSecondHalfPositive: members.every(m => m.secondHalf && m.secondHalf.totalReturn > 0),
      allHalvesPositive: members.every(m => m.firstHalf && m.secondHalf
        && m.firstHalf.totalReturn > 0 && m.secondHalf.totalReturn > 0),
      members: members.map(m => m.id),
    });
  }
  families.sort((a, b) => (b.medianCalmar ?? -Infinity) - (a.medianCalmar ?? -Infinity));
  return families;
}

/**
 * Selection rule, deliberately conservative:
 *   1. every member of the family must survive (no member wiped out),
 *   2. the family's CAGR spread must stay under `maxCagrSpread`,
 *   3. the family's worst member must still clear `minWorstCalmar`,
 *   4. the pick inside a qualifying family is the *median* parameter, never
 *      the best-performing one.
 * If nothing qualifies, the honest answer is "no promotion", not "take the
 * least bad row".
 */
function recommend(families, evaluations, {
  maxCagrSpread = 0.35,
  minWorstCalmar = 0.5,
  minMedianCalmar = 0.8,
} = {}) {
  const byId = new Map(evaluations.map(e => [e.id, e]));
  const reasons = [];

  const qualifying = families.filter(family => {
    const members = family.members.map(id => byId.get(id));
    const failures = [];
    if (members.some(m => !Number.isFinite(m.full.annualizedReturn))) failures.push('incomplete metrics');
    if (members.some(m => m.full.totalReturn <= -0.5)) failures.push('a member lost more than half of capital');
    if (!Number.isFinite(family.cagrSpread) || family.cagrSpread > maxCagrSpread) {
      failures.push(`CAGR spread ${family.cagrSpread === null ? 'N/A' : (family.cagrSpread * 100).toFixed(1)}pp exceeds ${(maxCagrSpread * 100).toFixed(0)}pp`);
    }
    if (!Number.isFinite(family.worstCalmar) || family.worstCalmar < minWorstCalmar) {
      failures.push(`worst-member Calmar below ${minWorstCalmar}`);
    }
    if (!Number.isFinite(family.medianCalmar) || family.medianCalmar < minMedianCalmar) {
      failures.push(`median Calmar below ${minMedianCalmar}`);
    }
    if (!family.allSecondHalfPositive) failures.push('a member is negative in the second half');
    if (failures.length) reasons.push({ familyId: family.familyId, failures });
    return failures.length === 0;
  });

  if (!qualifying.length) {
    return {
      promoted: null,
      verdict: 'no-promotion',
      note: 'No parameter family cleared the robustness gate. The incumbent configuration stays champion and every alternative stays in shadow.',
      rejections: reasons,
    };
  }

  const best = qualifying[0];
  const members = best.members
    .map(id => byId.get(id))
    .sort((a, b) => (a.full.annualizedReturn ?? 0) - (b.full.annualizedReturn ?? 0));
  // Lower median on an even-sized family, so the tie never breaks toward the
  // better-performing half.
  const pick = members[Math.floor((members.length - 1) / 2)];

  return {
    promoted: pick.id,
    verdict: 'shadow-candidate',
    familyId: best.familyId,
    note: 'Selected as the median parameter of the most robust family. This is a forward-shadow candidate, not an approved champion; promotion still requires matured out-of-sample evidence.',
    family: best,
    candidate: pick,
    rejections: reasons,
  };
}

module.exports = {
  DEFAULT_GRID,
  buildSweepGrid,
  evaluateConfig,
  summarizeFamilies,
  recommend,
};

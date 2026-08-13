#!/usr/bin/env node

/**
 * Sector Rotation v0.5 — robustness sweep
 *
 * v0.4 answered "which of these four configurations printed the best number?".
 * v0.5 answers "which configurations still work when the parameters move?" —
 * the only version of the question that survives contact with live trading.
 *
 * Usage:
 *   node scripts/runRotationV05.js            # use cached TWSE data if present
 *   node scripts/runRotationV05.js --refresh  # force a fresh TWSE download
 *   node scripts/runRotationV05.js --offline  # fail rather than hit the network
 */

const fs = require('fs');
const path = require('path');
const { DEFAULT_SECTORS } = require('../sectorRadar');
const { DEFAULT_COSTS } = require('../rotationBacktest');
const { buildSweepGrid, evaluateConfig, summarizeFamilies, recommend } = require('../rotationRobustness');
const { loadMarketData, monthKeys } = require('./twseData');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'backtests');
const JSON_PATH = path.join(OUT_DIR, 'rotation_v0.5.json');
const MD_PATH = path.join(OUT_DIR, 'rotation_v0.5.md');

const INCUMBENTS = [
  { id: 'v0.4 fixed 20/20', familyId: 'incumbent', regimeId: 'none', trailingId: 'none', trailingFamily: 'incumbent', topK: 1, params: {} },
  { id: 'v0.4 TP20 + trail 8%', familyId: 'incumbent', regimeId: 'none', trailingId: 'fixed-08', trailingFamily: 'incumbent', topK: 1, params: { trailingStop: 0.08 } },
  { id: 'v0.4 TP20 + trail 10%', familyId: 'incumbent', regimeId: 'none', trailingId: 'fixed-10', trailingFamily: 'incumbent', topK: 1, params: { trailingStop: 0.10 } },
];

function pct(v) { return Number.isFinite(v) ? `${(v * 100).toFixed(2)}%` : 'N/A'; }
function num(v, digits = 2) { return Number.isFinite(v) ? v.toFixed(digits) : 'N/A'; }

function subtractYears(isoDate, years) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function buildMarkdown(report) {
  const familyRows = report.families.map(f => `| ${f.familyId} | ${f.memberCount} | ${pct(f.medianCagr)} | ${pct(f.minCagr)} | ${pct(f.maxCagr)} | ${pct(f.cagrSpread)} | ${num(f.medianCalmar)} | ${num(f.worstCalmar)} | ${pct(f.worstMaxDrawdown)} | ${f.allHalvesPositive ? 'yes' : 'no'} |`).join('\n');

  const topRows = report.evaluations
    .slice()
    .sort((a, b) => (b.full.calmarRatio ?? -Infinity) - (a.full.calmarRatio ?? -Infinity))
    .slice(0, 15)
    .map(e => `| ${e.id} | ${pct(e.full.totalReturn)} | ${pct(e.full.annualizedReturn)} | ${pct(e.full.maxDrawdown)} | ${num(e.full.calmarRatio)} | ${num(e.full.sharpeRatio)} | ${e.full.tradeCount} | ${pct(e.full.exposure)} | ${e.yearsBeatingTaiex}/${e.yearsEvaluated} |`)
    .join('\n');

  const halfRows = report.evaluations
    .slice()
    .sort((a, b) => (b.full.calmarRatio ?? -Infinity) - (a.full.calmarRatio ?? -Infinity))
    .slice(0, 15)
    .map(e => `| ${e.id} | ${pct(e.firstHalf && e.firstHalf.totalReturn)} | ${pct(e.firstHalf && e.firstHalf.excessVsTaiex)} | ${pct(e.secondHalf && e.secondHalf.totalReturn)} | ${pct(e.secondHalf && e.secondHalf.excessVsTaiex)} |`)
    .join('\n');

  const incumbentRows = report.incumbents
    .map(e => `| ${e.id} | ${pct(e.full.totalReturn)} | ${pct(e.full.annualizedReturn)} | ${pct(e.full.maxDrawdown)} | ${num(e.full.calmarRatio)} | ${e.yearsBeatingTaiex}/${e.yearsEvaluated} |`)
    .join('\n');

  const rejectionRows = report.recommendation.rejections
    .map(r => `| ${r.familyId} | ${r.failures.join('; ')} |`)
    .join('\n');

  const verdict = report.recommendation.promoted
    ? `**Shadow candidate:** \`${report.recommendation.promoted}\` (family \`${report.recommendation.familyId}\`).\n\n${report.recommendation.note}`
    : `**No promotion.** ${report.recommendation.note}`;

  return `# Sector Rotation v0.5 — parameter robustness sweep

Generated: ${report.generatedAt}
Data snapshot: ${report.dataFetchedAt} (${report.dataSource})

## Why this report exists

v0.4 compared four configurations and reported the best one. Its own numbers show
why that is not enough: holding the trailing stop family fixed and moving the
parameter from 8% to 12% swung the five-year result from +683.64% to -27.96%. A
result that sensitive to one parameter is a statement about the parameter, not
about the market.

v0.5 evaluates ${report.evaluations.length} configurations across three axes and scores each
*family* of neighbouring parameters together:

- **Market regime gate** — TAIEX versus its own trailing moving average, either
  blocking new entries or also forcing an exit. v0.4 gated only entry momentum,
  so a position could be held all the way down; the first v0.4 trade sat in
  半導體 for 210 trading days from +14.7% to -24.0%.
- **Volatility-scaled trailing stop** — the stop distance is a multiple of the
  basket's own 20-day realized volatility instead of a flat percentage, so 航運
  and 金融 are not forced to share one threshold.
- **Concentration** — top-1 versus top-2 sector sleeves.

## Robustness by parameter family

Ranked by median Calmar across the family. \`CAGR spread\` is the fragility
measure: how far the annualized return moves when only the trailing parameter
changes.

| Family | Members | Median CAGR | Min CAGR | Max CAGR | CAGR spread | Median Calmar | Worst Calmar | Worst DD | Both halves positive |
|---|---:|---:|---:|---:|---:|---:|---:|---:|:--:|
${familyRows}

## Best fifteen configurations by Calmar

| Config | Net return | CAGR | Max DD | Calmar | Sharpe | Trades | Exposure | Years > TAIEX |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${topRows}

## Half-sample stability

A configuration that only works in one half of the window is not a strategy.

Split at ${report.splitMidpoint}.

| Config | H1 return | H1 excess | H2 return | H2 excess |
|---|---:|---:|---:|---:|
${halfRows}

## v0.4 incumbents, same measurement

| Config | Net return | CAGR | Max DD | Calmar | Years > TAIEX |
|---|---:|---:|---:|---:|---:|
${incumbentRows}

## Promotion decision

${verdict}

### Families rejected by the gate

| Family | Reasons |
|---|---|
${rejectionRows}

## Gate thresholds

| Criterion | Threshold |
|---|---|
| Max CAGR spread within a family | ${pct(report.gate.maxCagrSpread)} |
| Min Calmar of the worst family member | ${num(report.gate.minWorstCalmar)} |
| Min median Calmar of the family | ${num(report.gate.minMedianCalmar)} |
| Member losing more than half of capital | disqualifies the family |
| Any member negative in the second half | disqualifies the family |

Inside a qualifying family the *median* parameter is selected, never the best
performing one, because the best member is the one most likely to be fitted to
this particular window.

## Limitations

- Same curated six-sector / eighteen-stock proxy universe as v0.3 and v0.4, so
  the curated-universe and hindsight-selection risks are unchanged.
- One five-year window is still one sample. The half-sample and per-year columns
  bound the overfitting risk; they do not remove it.
- The regime gate is fitted on the same window it is measured on. Its
  out-of-sample value is unproven until forward shadow snapshots mature.
- Backtest results are not live trading results, and nothing here is investment
  advice.
`;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const symbols = [...new Set(Object.values(DEFAULT_SECTORS).flat())];
  const { taiexRows, histories, fetchedAt, source } = await loadMarketData({
    symbols,
    months: monthKeys(64),
    refresh: args.has('--refresh'),
    offline: args.has('--offline'),
  });

  if (taiexRows.length < 1000) throw new Error(`insufficient TAIEX history: ${taiexRows.length}`);
  const endDate = taiexRows.at(-1).date;
  const startDate = subtractYears(endDate, 5);
  const insufficient = [...histories].filter(([, rows]) => rows.filter(r => r.date >= startDate).length < 900);
  if (insufficient.length) throw new Error(`insufficient stock history: ${insufficient.map(([s, r]) => `${s}:${r.length}`).join(', ')}`);

  const shared = { stockHistoryBySymbol: histories, taiexRows, sectors: DEFAULT_SECTORS, startDate, endDate };

  const configs = buildSweepGrid();
  const evaluations = [];
  for (const config of configs) {
    const evaluation = evaluateConfig({ config, ...shared });
    if (evaluation) evaluations.push(evaluation);
    else console.warn(`[skip] ${config.id} produced no result`);
  }
  const incumbents = INCUMBENTS.map(config => evaluateConfig({ config, ...shared })).filter(Boolean);

  const families = summarizeFamilies(evaluations);
  const gate = { maxCagrSpread: 0.35, minWorstCalmar: 0.5, minMedianCalmar: 0.8 };
  const recommendation = recommend(families, evaluations, gate);

  const report = {
    version: 'v0.5',
    generatedAt: new Date().toISOString(),
    dataSource: source === 'cache' ? 'cached TWSE snapshot' : 'TWSE STOCK_DAY + FMTQIK',
    dataFetchedAt: fetchedAt,
    period: { start: startDate, end: endDate },
    splitMidpoint: evaluations.length ? evaluations[0].splitMidpoint : null,
    transactionCosts: DEFAULT_COSTS,
    gate,
    families,
    evaluations,
    incumbents,
    recommendation,
  };

  fs.writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(MD_PATH, buildMarkdown(report));

  console.log(`\nEvaluated ${evaluations.length} configurations across ${families.length} families.`);
  for (const family of families.slice(0, 5)) {
    console.log(`  ${family.familyId}: medianCalmar=${num(family.medianCalmar)} spread=${pct(family.cagrSpread)} worstDD=${pct(family.worstMaxDrawdown)}`);
  }
  console.log(`\nVerdict: ${recommendation.verdict}${recommendation.promoted ? ` -> ${recommendation.promoted}` : ''}`);
}

main().catch(error => { console.error(error); process.exit(1); });

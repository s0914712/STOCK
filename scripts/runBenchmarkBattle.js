#!/usr/bin/env node

/**
 * 0050 battle — does anything here actually beat the ETF?
 *
 * Every previous report in this repo benchmarked against TAIEX, a price index
 * nobody can buy. 0050 is the honest bar: it is investable, it pays dividends,
 * and it is what a Taiwanese retail investor holds instead of running any of
 * this. This script puts the v0.4 incumbent, the v0.5 robust rotation and the
 * core-satellite design on the same measuring stick.
 *
 * Two rules keep the comparison fair:
 *   1. The benchmark pays commission and tax on entry and exit, so it is not
 *      handed free execution.
 *   2. A dividend assumption is applied to the benchmark *and* to any core
 *      holding of the same ETF, and the whole verdict is re-run at several
 *      yields. A strategy that only wins at 0% dividends has not won.
 *
 * Usage:
 *   node scripts/runBenchmarkBattle.js            # cached data if present
 *   node scripts/runBenchmarkBattle.js --refresh  # force a fresh download
 *   node scripts/runBenchmarkBattle.js --offline  # fail rather than hit network
 */

const fs = require('fs');
const path = require('path');
const { DEFAULT_SECTORS } = require('../sectorRadar');
const { DEFAULT_COSTS, backtestRotation } = require('../rotationBacktest');
const { backtestCoreSatellite, benchmarkComparison } = require('../coreSatellite');
const { summarizeFamilies, recommend } = require('../rotationRobustness');
const { loadMarketData, monthKeys } = require('./twseData');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'backtests');
const JSON_PATH = path.join(OUT_DIR, 'benchmark_battle_0050.json');
const MD_PATH = path.join(OUT_DIR, 'benchmark_battle_0050.md');

const BENCHMARK = '0050';
const DIVIDEND_SCENARIOS = [0, 0.03, 0.035, 0.04];

function pct(v) { return Number.isFinite(v) ? `${(v * 100).toFixed(2)}%` : 'N/A'; }
function num(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : 'N/A'; }

function subtractYears(isoDate, years) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

/**
 * The grid is built around turnover, because turnover is what decides this
 * contest. A 0.585% Taiwan round trip compounds: 150 trades burn roughly 60% of
 * deployed capital before any alpha is counted, so lookback and rebalance
 * cadence matter far more here than stop-loss tuning.
 */
function buildCoreSatelliteGrid() {
  const shapes = [
    { topK: 2, maxSatelliteSlots: 1 },
    { topK: 2, maxSatelliteSlots: 2 },
    { topK: 3, maxSatelliteSlots: 1 },
  ];
  const regimes = [
    { id: 'none', regimeFilter: null },
    { id: 'ma60-exit', regimeFilter: { lookback: 60, mode: 'exit-and-block' } },
  ];
  const lookbacks = [10, 60];
  const cadences = [20, 60];
  const trailings = [
    { id: 'vol-4', trailingStopVolMultiple: 4 },
    { id: 'vol-5', trailingStopVolMultiple: 5 },
    { id: 'vol-6', trailingStopVolMultiple: 6 },
  ];

  const configs = [];
  for (const shape of shapes) {
    for (const regime of regimes) {
      for (const lookback of lookbacks) {
        for (const rebalanceEvery of cadences) {
          for (const trailing of trailings) {
            const { id: trailingId, ...trailingParams } = trailing;
            const stem = `k${shape.topK}s${shape.maxSatelliteSlots}/${regime.id}/lb${lookback}/rb${rebalanceEvery}`;
            configs.push({
              id: `${stem}/${trailingId}`,
              familyId: `${stem}/vol-scaled`,
              regimeId: regime.id,
              trailingId,
              topK: shape.topK,
              params: {
                ...shape,
                regimeFilter: regime.regimeFilter,
                lookback,
                rebalanceEvery,
                exitRankBuffer: 2,
                minHoldingDays: 20,
                cooldownDays: 10,
                ...trailingParams,
              },
            });
          }
        }
      }
    }
  }
  return configs;
}

function sliceMetrics(result, comparison) {
  return {
    totalReturn: result.metrics.totalReturn,
    annualizedReturn: result.metrics.annualizedReturn,
    maxDrawdown: result.metrics.maxDrawdown,
    calmarRatio: comparison ? comparison.strategyCalmar : null,
    tradeCount: result.metrics.tradeCount,
    tradesPerYear: result.metrics.tradesPerYear,
    costsPaidPctOfInitial: result.metrics.costsPaidPctOfInitial,
    excessVsBenchmark: comparison ? comparison.excessTotalReturn : null,
    benchmarkTotalReturn: comparison ? comparison.benchmarkTotalReturn : null,
  };
}

function evaluateCoreSatellite({ config, shared, dividendYield }) {
  const run = (from, to) => {
    try {
      return backtestCoreSatellite({
        ...shared, ...config.params,
        benchmarkDividendYield: dividendYield,
        startDate: from, endDate: to,
      });
    } catch (error) {
      return null;
    }
  };

  const full = run(shared.startDate, shared.endDate);
  if (!full || !full.benchmark) return null;

  const windowDates = full.equityCurve.map(row => row.date);
  const midpoint = windowDates[Math.floor(windowDates.length / 2)];
  const firstHalf = run(shared.startDate, midpoint);
  const secondHalf = run(midpoint, shared.endDate);

  const yearly = [];
  for (let year = Number(shared.startDate.slice(0, 4)); year <= Number(shared.endDate.slice(0, 4)); year += 1) {
    const from = `${year}-01-01` < shared.startDate ? shared.startDate : `${year}-01-01`;
    const to = `${year}-12-31` > shared.endDate ? shared.endDate : `${year}-12-31`;
    if (from > to) continue;
    const r = run(from, to);
    if (r && r.benchmark) {
      yearly.push({
        year,
        totalReturn: r.metrics.totalReturn,
        benchmarkTotalReturn: r.benchmark.benchmarkTotalReturn,
        excessVsBenchmark: r.benchmark.excessTotalReturn,
        maxDrawdown: r.metrics.maxDrawdown,
      });
    }
  }
  const excesses = yearly.map(y => y.excessVsBenchmark).filter(Number.isFinite);

  return {
    id: config.id,
    familyId: config.familyId,
    regimeId: config.regimeId,
    trailingId: config.trailingId,
    trailingFamily: 'vol-scaled',
    topK: config.topK,
    strategy: full.strategy,
    full: sliceMetrics(full, full.benchmark),
    firstHalf: firstHalf && firstHalf.benchmark ? sliceMetrics(firstHalf, firstHalf.benchmark) : null,
    secondHalf: secondHalf && secondHalf.benchmark ? sliceMetrics(secondHalf, secondHalf.benchmark) : null,
    splitMidpoint: midpoint,
    benchmark: full.benchmark,
    metrics: full.metrics,
    yearly,
    yearsEvaluated: excesses.length,
    // Reused by summarizeFamilies/recommend, which are written against a
    // "years beating the benchmark" field.
    yearsBeatingTaiex: excesses.filter(v => v > 0).length,
    yearsBeatingBenchmark: excesses.filter(v => v > 0).length,
    tradeCount: full.metrics.tradeCount,
  };
}

function buildMarkdown(report) {
  const headline = report.scenarios.map(s => {
    const w = s.winner;
    return `| ${pct(s.dividendYield)} | ${pct(s.benchmark.totalReturn)} | ${pct(s.benchmark.annualizedReturn)} | ${pct(s.benchmark.maxDrawdown)} | ${num(s.benchmark.calmar)} | ${w ? w.id : 'none'} | ${w ? pct(w.full.totalReturn) : 'N/A'} | ${w ? pct(w.full.excessVsBenchmark) : 'N/A'} | ${w ? num(w.full.calmarRatio) : 'N/A'} | ${s.verdict} |`;
  }).join('\n');

  const base = report.scenarios[0];
  const incumbentRows = base.incumbents.map(i => `| ${i.name} | ${pct(i.totalReturn)} | ${pct(i.annualizedReturn)} | ${pct(i.maxDrawdown)} | ${num(i.calmar)} | ${pct(i.excessVsBenchmark)} | ${num(i.informationRatio)} | ${pct(i.rollingOneYearWinRate)} | ${i.beatsBenchmark ? 'yes' : '**no**'} |`).join('\n');

  const scenario = report.scenarios.find(s => s.dividendYield === 0.035) || base;
  const topRows = scenario.evaluations
    .slice()
    .sort((a, b) => (b.full.excessVsBenchmark ?? -Infinity) - (a.full.excessVsBenchmark ?? -Infinity))
    .slice(0, 12)
    .map(e => `| ${e.id} | ${pct(e.full.totalReturn)} | ${pct(e.full.excessVsBenchmark)} | ${pct(e.full.maxDrawdown)} | ${num(e.full.calmarRatio)} | ${num(e.benchmark.informationRatio)} | ${num(e.benchmark.beta)} | ${num(e.full.tradesPerYear, 1)} | ${pct(e.full.costsPaidPctOfInitial)} | ${pct(e.benchmark.rollingOneYearWinRate)} | ${e.yearsBeatingBenchmark}/${e.yearsEvaluated} |`)
    .join('\n');

  const familyRows = scenario.families.slice(0, 10)
    .map(f => `| ${f.familyId} | ${pct(f.medianCagr)} | ${pct(f.cagrSpread)} | ${num(f.medianCalmar)} | ${num(f.worstCalmar)} | ${f.allHalvesPositive ? 'yes' : 'no'} |`)
    .join('\n');

  const yearRows = scenario.winner
    ? scenario.winner.yearly.map(y => `| ${y.year} | ${pct(y.totalReturn)} | ${pct(y.benchmarkTotalReturn)} | ${pct(y.excessVsBenchmark)} | ${pct(y.maxDrawdown)} |`).join('\n')
    : '| — | — | — | — | — |';

  return `# 0050 Battle — 策略 vs 元大台灣50

Generated: ${report.generatedAt}
Data snapshot: ${report.dataFetchedAt}
Window: ${report.period.start} → ${report.period.end} (${report.tradingDays} trading days)

${report.corporateActions.length
  ? `已還原 ${report.corporateActions.length} 筆公司行為（TWSE STOCK_DAY 提供的是未還原價）：\n\n| 代號 | 日期 | 還原前 | 還原後 | 推定分割 |\n|---|---|---:|---:|---|\n${report.corporateActions.map(e => `| ${e.symbol} | ${e.date} | ${e.previousClose} | ${e.close} | ${e.impliedSplit} |`).join('\n')}`
  : '未偵測到需要還原的公司行為。'}

## 結論

${report.conclusion}

## 依股息假設的總結

0050 的股息殖利率會直接決定勝負，所以整份比較在四種假設下各跑一次。股息同時計入 benchmark 與策略的 core 部位。

| 股息假設 | 0050 總報酬 | 0050 CAGR | 0050 MaxDD | 0050 Calmar | 最佳策略 | 策略總報酬 | 超額 | 策略 Calmar | 判定 |
|---:|---:|---:|---:|---:|---|---:|---:|---:|---|
${headline}

## 既有策略對上 0050（股息 0%，對策略最有利的假設）

| 策略 | 總報酬 | CAGR | MaxDD | Calmar | 超額 | Information ratio | 滾動一年勝率 | 贏過 0050 |
|---|---:|---:|---:|---:|---:|---:|---:|:--:|
${incumbentRows}

## Core-satellite 前 12 名（股息 ${pct(scenario.dividendYield)}）

依超額報酬排序。\`beta\` 接近 1 代表大部分時間就是 0050，超額來自少數真的有訊號的時段。

| 設定 | 總報酬 | 超額 | MaxDD | Calmar | IR | Beta | 每年交易數 | 手續費+稅 | 滾動一年勝率 | 贏過 0050 年數 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${topRows}

設定代號：\`k{slot 數}s{最多偏離 slot}/{regime}/lb{動能回看天數}/rb{再平衡間隔}/{停損}\`。

**「手續費+稅」欄位是這場比賽的核心。** 台股買賣一次成本 0.1425% + 0.1425% + 0.3% = **0.585%**。交易 150 次就吃掉約 60% 的投入資金，遠大於這個訊號可能有的 edge。因此 \`lb\` 與 \`rb\` 對勝負的影響遠大於停損參數。

## 參數穩健度（股息 ${pct(scenario.dividendYield)}）

| Family | 中位 CAGR | CAGR 極差 | 中位 Calmar | 最差 Calmar | 前後半段皆正 |
|---|---:|---:|---:|---:|:--:|
${familyRows}

Robustness gate 判定：**${scenario.recommendation.verdict}**${scenario.recommendation.promoted ? ` → \`${scenario.recommendation.promoted}\`` : ''}

## 最佳設定的逐年表現（股息 ${pct(scenario.dividendYield)}）

| 年 | 策略 | 0050 | 超額 | 策略 MaxDD |
|---:|---:|---:|---:|---:|
${yearRows}

## 為什麼 core-satellite 是這樣設計的

v0.4 的逐年表現說明問題不在參數：2022、2023、2024、2025 連續四年輸給 TAIEX，全靠 2026 的 +180% 把總報酬拉贏。一個「有訊號才進場、否則空手」的架構，對上一個「永遠在市場裡」的 ETF，長期缺口就是那些空手的日子。

Core-satellite 把預設持倉改成 0050 本身：

- 帳戶分成 K 個 slot，有合格類股時該 slot 持有類股籃子，否則持有 0050。
- \`maxSatelliteSlots\` 限制最多幾個 slot 可以偏離 0050，直接控制 tracking error。
- \`cooldownDays\` 阻止停損後立刻買回同一個類股，消除 v0.4 出場隔天原地重進的來回手續費。
- 完全沒有訊號時，這個策略在數學上等於 0050 買進持有（測試以 1e-9 精度驗證，beta = 1、tracking error = 0）。

因此它的下檔風險相對 0050 有界，超額只能來自真的有訊號的時段。

## 限制

- Universe 仍是 curated 的六類股 / 十八檔，hindsight-selection 風險不變。
- 0050 使用未還原股息的收盤價，股息以年化率近似累積，不是逐筆除息還原；四種假設的敏感度分析就是為了界定這個近似的影響。
- 類股籃子同樣未計股息。若籃子的殖利率明顯高於 0050，這裡會低估策略。
- 一段五年視窗仍是一個樣本，逐年與前後半段欄位只能界定過度擬合風險。
- 研究用途，不構成投資建議。
`;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const sectorSymbols = [...new Set(Object.values(DEFAULT_SECTORS).flat())];
  const symbols = [...new Set([...sectorSymbols, BENCHMARK])];
  const { taiexRows, histories, fetchedAt, corporateActions } = await loadMarketData({
    symbols,
    months: monthKeys(64),
    refresh: args.has('--refresh'),
    offline: args.has('--offline'),
  });

  if (!histories.has(BENCHMARK) || histories.get(BENCHMARK).length < 900) {
    throw new Error(`insufficient ${BENCHMARK} history; delete data/cache and rerun with --refresh`);
  }
  if (taiexRows.length < 1000) throw new Error(`insufficient TAIEX history: ${taiexRows.length}`);

  const endDate = taiexRows.at(-1).date;
  const startDate = subtractYears(endDate, 5);

  // Independent sanity gate. 0050 tracks the Taiwan 50, so over five years it
  // cannot diverge wildly from TAIEX. An unadjusted 1:4 split once made this
  // benchmark print -23.77% against a +161.92% index, and the whole report was
  // wrong but looked plausible. Fail loudly instead of publishing that again.
  const benchmarkWindow = histories.get(BENCHMARK).filter(r => r.date >= startDate && r.date <= endDate);
  const taiexWindow = taiexRows.filter(r => r.date >= startDate && r.date <= endDate);
  const benchmarkReturn = benchmarkWindow.at(-1).close / benchmarkWindow[0].close - 1;
  const taiexReturn = taiexWindow.at(-1).index / taiexWindow[0].index - 1;
  const divergence = Math.abs(benchmarkReturn - taiexReturn);
  console.log(`[sanity] ${BENCHMARK} ${(benchmarkReturn * 100).toFixed(2)}% vs TAIEX ${(taiexReturn * 100).toFixed(2)}% over the window`);
  if (divergence > 0.80) {
    throw new Error(
      `${BENCHMARK} returned ${(benchmarkReturn * 100).toFixed(2)}% while TAIEX returned ${(taiexReturn * 100).toFixed(2)}% `
      + `(${(divergence * 100).toFixed(0)}pp apart). A Taiwan-50 tracker cannot diverge that far from the index; `
      + 'the price series is almost certainly still carrying an unadjusted corporate action.',
    );
  }
  const shared = {
    stockHistoryBySymbol: histories,
    benchmarkSymbol: BENCHMARK,
    taiexRows,
    sectors: DEFAULT_SECTORS,
    startDate,
    endDate,
    lookback: 10,
    minMomentum: 0,
    takeProfit: 0.20,
    stopLoss: -0.20,
  };

  const benchmarkDates = taiexRows.map(r => r.date)
    .filter(d => d >= startDate && d <= endDate)
    .filter(d => new Map(histories.get(BENCHMARK).map(r => [r.date, r])).has(d));

  const configs = buildCoreSatelliteGrid();
  const scenarios = [];

  for (const dividendYield of DIVIDEND_SCENARIOS) {
    // v0.4 / v0.5 incumbents, measured against 0050 rather than TAIEX.
    const incumbentSpecs = [
      { name: 'v0.4 fixed 20/20 (all-in, no core)', params: { topK: 1 } },
      { name: 'v0.4 TP20 + trail 10%', params: { topK: 1, trailingStop: 0.10 } },
      { name: 'v0.5 regime + vol stop, top2', params: { topK: 2, trailingStopVolMultiple: 5, regimeFilter: { lookback: 60, mode: 'exit-and-block' } } },
    ];
    const incumbents = incumbentSpecs.map(spec => {
      const result = backtestRotation({
        stockHistoryBySymbol: histories, taiexRows, sectors: DEFAULT_SECTORS,
        startDate, endDate, lookback: 10, takeProfit: 0.20, stopLoss: -0.20,
        minMomentum: 0, ...spec.params,
      });
      const comparison = benchmarkComparison({
        strategyCurve: result.equityCurve,
        benchmarkRows: histories.get(BENCHMARK),
        dates: result.equityCurve.map(r => r.date),
        costs: DEFAULT_COSTS,
        dividendYield,
        initialCapital: 1,
      });
      return {
        name: spec.name,
        totalReturn: result.metrics.totalReturn,
        annualizedReturn: result.metrics.annualizedReturn,
        maxDrawdown: result.metrics.maxDrawdown,
        calmar: comparison ? comparison.strategyCalmar : null,
        excessVsBenchmark: comparison ? comparison.excessTotalReturn : null,
        informationRatio: comparison ? comparison.informationRatio : null,
        rollingOneYearWinRate: comparison ? comparison.rollingOneYearWinRate : null,
        beatsBenchmark: comparison ? comparison.beatsBenchmark : null,
      };
    });

    const evaluations = configs
      .map(config => evaluateCoreSatellite({ config, shared, dividendYield }))
      .filter(Boolean);
    const families = summarizeFamilies(evaluations);
    const recommendation = recommend(families, evaluations, {
      maxCagrSpread: 0.35, minWorstCalmar: 0.5, minMedianCalmar: 0.8,
    });

    const beating = evaluations.filter(e => e.full.excessVsBenchmark > 0);
    const winner = beating.slice().sort((a, b) => (b.full.excessVsBenchmark ?? -Infinity) - (a.full.excessVsBenchmark ?? -Infinity))[0] || null;
    const bench = evaluations[0] ? evaluations[0].benchmark : null;

    let verdict;
    if (!winner) verdict = '0050 勝';
    else if (winner.full.calmarRatio > (bench ? bench.benchmarkCalmar : Infinity)) verdict = '策略勝（含風險調整）';
    else verdict = '策略報酬勝但風險調整輸';

    scenarios.push({
      dividendYield,
      benchmark: bench ? {
        totalReturn: bench.benchmarkTotalReturn,
        annualizedReturn: bench.benchmarkAnnualizedReturn,
        maxDrawdown: bench.benchmarkMaxDrawdown,
        calmar: bench.benchmarkCalmar,
      } : null,
      incumbents,
      evaluations,
      families,
      recommendation,
      winner,
      beatingCount: beating.length,
      evaluatedCount: evaluations.length,
      verdict,
    });
  }

  const base = scenarios.find(s => s.dividendYield === 0.035) || scenarios[0];
  const anyIncumbentWins = scenarios[0].incumbents.some(i => i.beatsBenchmark);
  const conclusion = [
    `在 ${pct(base.dividendYield)} 股息假設下，${base.evaluatedCount} 個 core-satellite 設定中有 ${base.beatingCount} 個總報酬贏過 0050，判定為「${base.verdict}」。`,
    anyIncumbentWins
      ? '既有 v0.4 / v0.5 rotation 至少有一個在 0% 股息假設下贏過 0050。'
      : '既有 v0.4 / v0.5 rotation 在 0% 股息假設下全數輸給 0050 —— 而 0% 是對策略最有利的假設。',
    base.recommendation.promoted
      ? `Robustness gate 通過，中位參數為 \`${base.recommendation.promoted}\`，仍屬 forward-shadow 候選而非已升級 champion。`
      : 'Robustness gate 未通過，因此沒有任何設定可以進入升級流程。',
  ].join('\n\n');

  const report = {
    version: 'benchmark-battle-0050',
    generatedAt: new Date().toISOString(),
    dataFetchedAt: fetchedAt,
    benchmarkSymbol: BENCHMARK,
    corporateActions,
    period: { start: startDate, end: endDate },
    tradingDays: benchmarkDates.length,
    transactionCosts: DEFAULT_COSTS,
    dividendScenarios: DIVIDEND_SCENARIOS,
    conclusion,
    scenarios,
  };

  fs.writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(MD_PATH, buildMarkdown(report));

  console.log(`\nWindow ${startDate} -> ${endDate}`);
  for (const s of scenarios) {
    const b = s.benchmark;
    console.log(`\ndividend ${pct(s.dividendYield)}: 0050 total=${pct(b && b.totalReturn)} DD=${pct(b && b.maxDrawdown)} calmar=${num(b && b.calmar)}`);
    console.log(`  beating 0050: ${s.beatingCount}/${s.evaluatedCount}  verdict=${s.verdict}`);
    if (s.winner) {
      console.log(`  best: ${s.winner.id} total=${pct(s.winner.full.totalReturn)} excess=${pct(s.winner.full.excessVsBenchmark)} DD=${pct(s.winner.full.maxDrawdown)} IR=${num(s.winner.benchmark.informationRatio)}`);
    }
  }
  console.log('\nIncumbents at 0% dividend:');
  for (const i of scenarios[0].incumbents) {
    console.log(`  ${i.name}: total=${pct(i.totalReturn)} excess=${pct(i.excessVsBenchmark)} beats0050=${i.beatsBenchmark}`);
  }
}

main().catch(error => { console.error(error); process.exit(1); });

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { DEFAULT_SECTORS } = require('../sectorRadar');
const { DEFAULT_COSTS, backtestRotation } = require('../rotationBacktest');
const { loadMarketData, monthKeys } = require('./twseData');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'backtests');
const JSON_PATH = path.join(OUT_DIR, 'rotation_v0.4.json');
const MD_PATH = path.join(OUT_DIR, 'rotation_v0.4.md');

function subtractYears(isoDate, years) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function pct(v) { return Number.isFinite(v) ? `${(v * 100).toFixed(2)}%` : 'N/A'; }
function mean(xs) { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
function change(a, b) { return Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b - 1 : null; }

function pearson(xs, ys) {
  const pairs = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 20) return null;
  const mx = mean(pairs.map(p => p[0]));
  const my = mean(pairs.map(p => p[1]));
  const num = pairs.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
  const dx = Math.sqrt(pairs.reduce((s, [x]) => s + (x - mx) ** 2, 0));
  const dy = Math.sqrt(pairs.reduce((s, [, y]) => s + (y - my) ** 2, 0));
  return dx > 0 && dy > 0 ? num / (dx * dy) : null;
}

function proxyOfficialCorrelation(sector, histories, officialMap, startDate, endDate) {
  const symbols = DEFAULT_SECTORS[sector];
  const maps = symbols.map(s => new Map(histories.get(s).map(r => [r.date, r.close])));
  const dates = [...officialMap.keys()].filter(d => d >= startDate && d <= endDate).sort();
  const proxy = [];
  const official = [];
  for (let i = 1; i < dates.length; i++) {
    const d0 = dates[i - 1];
    const d1 = dates[i];
    const stockReturns = maps.map(m => change(m.get(d1), m.get(d0))).filter(Number.isFinite);
    if (stockReturns.length < 2) continue;
    const off = change(officialMap.get(d1), officialMap.get(d0));
    if (!Number.isFinite(off)) continue;
    proxy.push(mean(stockReturns));
    official.push(off);
  }
  return { observations: proxy.length, dailyReturnCorrelation: pearson(proxy, official) };
}

function compact(result) {
  return { strategy: result.strategy, assumptions: result.assumptions, period: result.period, metrics: result.metrics, trades: result.trades };
}

function buildMarkdown(report) {
  const rows = report.strategies.map(s => `| ${s.name} | ${pct(s.metrics.totalReturn)} | ${pct(s.metrics.annualizedReturn)} | ${pct(s.metrics.excessVsTaiex)} | ${pct(s.metrics.maxDrawdown)} | ${s.metrics.tradeCount} | ${pct(s.metrics.winRate)} |`).join('\n');
  const years = report.yearly.map(y => `| ${y.year} | ${pct(y.totalReturn)} | ${pct(y.taiexReturn)} | ${pct(y.excessVsTaiex)} | ${pct(y.maxDrawdown)} | ${y.tradeCount} |`).join('\n');
  const correlations = Object.entries(report.officialProxyChecks).map(([s, v]) => `| ${s} | ${v.observations} | ${Number.isFinite(v.dailyReturnCorrelation) ? v.dailyReturnCorrelation.toFixed(3) : 'N/A'} |`).join('\n');
  return `# Sector Rotation v0.4 — 5Y + trailing-stop validation\n\nGenerated: ${report.generatedAt}\n\n## Scope\n\n- Five-year window: ${report.period.start} to ${report.period.end}\n- Same six-sector / eighteen-stock proxy universe for comparability with v0.3\n- Positive momentum gate, next-session-open execution, commissions and stock tax retained\n- Trailing stop is measured from the highest observed basket close since entry; exit executes next session open\n- Official TWSE proxy checks use EFTRI_HIST where a one-to-one official index exists\n\n## Strategy comparison\n\n| Strategy | Net return | CAGR | Excess vs TAIEX | Max DD | Trades | Win rate |\n|---|---:|---:|---:|---:|---:|---:|\n${rows}\n\n## Calendar-year primary results\n\n| Year | Net return | TAIEX | Excess | Max DD | Trades |\n|---:|---:|---:|---:|---:|---:|\n${years}\n\n## Proxy vs official TWSE industry index\n\n| Proxy sector | Daily observations | Return correlation |\n|---|---:|---:|\n${correlations}\n\nAI伺服器 and PCB remain thematic proxies because there is no one-to-one TWSE industry sub-index with those labels in this validation path.\n\n## Guardrails\n\nThe official-index correlation check reduces, but does not eliminate, the curated-universe / hindsight-selection concern. It validates whether selected proxies track three official sector indices; it does not reconstruct historical point-in-time constituents for thematic groups.\n`;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const symbols = [...new Set(Object.values(DEFAULT_SECTORS).flat())];
  const { taiexRows, histories, official } = await loadMarketData({
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

  const configs = [
    { name: 'fixed 20/20', trailingStop: null },
    { name: 'TP20 + trail 8%', trailingStop: 0.08 },
    { name: 'TP20 + trail 10%', trailingStop: 0.10 },
    { name: 'TP20 + trail 12%', trailingStop: 0.12 },
  ];
  const strategies = configs.map(c => ({
    name: c.name,
    ...compact(backtestRotation({
      stockHistoryBySymbol: histories, taiexRows, startDate, endDate,
      lookback: 10, takeProfit: 0.20, stopLoss: -0.20,
      trailingStop: c.trailingStop, minMomentum: 0,
    })),
  }));

  const yearly = [];
  for (let year = Number(startDate.slice(0, 4)); year <= Number(endDate.slice(0, 4)); year++) {
    const ys = `${year}-01-01` < startDate ? startDate : `${year}-01-01`;
    const ye = `${year}-12-31` > endDate ? endDate : `${year}-12-31`;
    if (ys > ye) continue;
    const r = backtestRotation({
      stockHistoryBySymbol: histories, taiexRows, startDate: ys, endDate: ye,
      lookback: 10, takeProfit: 0.20, stopLoss: -0.20, minMomentum: 0,
    });
    yearly.push({ year, ...r.metrics });
  }

  const officialProxyChecks = {};
  for (const sector of ['半導體', '電子零組件', '金融']) {
    officialProxyChecks[sector] = proxyOfficialCorrelation(sector, histories, official[sector], startDate, endDate);
  }

  const report = {
    version: 'v0.4',
    generatedAt: new Date().toISOString(),
    dataSource: 'TWSE STOCK_DAY + FMTQIK + EFTRI_HIST',
    period: { start: startDate, end: endDate },
    transactionCosts: DEFAULT_COSTS,
    strategies,
    yearly,
    officialProxyChecks,
    officialValidationCoverage: ['半導體', '電子零組件', '金融'],
    thematicOnly: ['AI伺服器', 'PCB'],
  };
  fs.writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(MD_PATH, buildMarkdown(report));
  for (const s of strategies) console.log(`${s.name}: total=${pct(s.metrics.totalReturn)} DD=${pct(s.metrics.maxDrawdown)}`);
  console.log('Official proxy checks:', officialProxyChecks);
}

main().catch(error => { console.error(error); process.exit(1); });

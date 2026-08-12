#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const { DEFAULT_SECTORS } = require('../sectorRadar');
const { DEFAULT_COSTS, backtestRotation } = require('../rotationBacktest');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'backtests');
const JSON_PATH = path.join(OUT_DIR, 'rotation_v0.3.json');
const MD_PATH = path.join(OUT_DIR, 'rotation_v0.3.md');

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function fetchJSON(url, attempts = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 STOCK-v0.3-backtest', Accept: 'application/json' },
    }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', async () => {
        try {
          if (res.statusCode < 200 || res.statusCode >= 300) throw new Error(`HTTP ${res.statusCode}`);
          resolve(JSON.parse(body));
        } catch (error) {
          if (attempts > 1) {
            await sleep(800);
            try { resolve(await fetchJSON(url, attempts - 1)); } catch (retry) { reject(retry); }
          } else reject(error);
        }
      });
    });
    req.on('error', async error => {
      if (attempts > 1) {
        await sleep(800);
        try { resolve(await fetchJSON(url, attempts - 1)); } catch (retry) { reject(retry); }
      } else reject(error);
    });
    req.setTimeout(20000, () => req.destroy(new Error('request timeout')));
  });
}

function parseRocDate(value) {
  const [y, m, d] = String(value).split('/');
  return y && m && d ? `${Number(y) + 1911}-${m}-${d}` : null;
}

function monthKeys(count = 28) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}01`;
  }).reverse();
}

async function fetchStockHistory(symbol, months) {
  const rows = [];
  for (const dateKey of months) {
    try {
      const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateKey}&stockNo=${symbol}`;
      const data = await fetchJSON(url);
      if (data.stat === 'OK' && Array.isArray(data.data)) {
        for (const row of data.data) {
          const date = parseRocDate(row[0]);
          if (!date) continue;
          rows.push({
            date,
            volume: Number(String(row[1]).replace(/,/g, '')),
            open: Number(String(row[3]).replace(/,/g, '')),
            high: Number(String(row[4]).replace(/,/g, '')),
            low: Number(String(row[5]).replace(/,/g, '')),
            close: Number(String(row[6]).replace(/,/g, '')),
          });
        }
      }
    } catch (error) {
      console.warn(`[${symbol}] ${dateKey}: ${error.message}`);
    }
    await sleep(90);
  }
  const unique = new Map(rows.filter(r => Number.isFinite(r.open) && Number.isFinite(r.close)).map(r => [r.date, r]));
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchTaiexHistory(months) {
  const rows = [];
  for (const dateKey of months) {
    try {
      const url = `https://www.twse.com.tw/exchangeReport/FMTQIK?response=json&date=${dateKey}`;
      const data = await fetchJSON(url);
      if (data.stat === 'OK' && Array.isArray(data.data)) {
        for (const row of data.data) {
          const date = parseRocDate(row[0]);
          const index = Number(String(row[4]).replace(/,/g, ''));
          if (date && Number.isFinite(index)) rows.push({ date, index });
        }
      }
    } catch (error) {
      console.warn(`[TAIEX] ${dateKey}: ${error.message}`);
    }
    await sleep(90);
  }
  const unique = new Map(rows.map(r => [r.date, r]));
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function subtractYears(isoDate, years) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function pct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : 'N/A';
}

function finite(value) { return Number.isFinite(value) ? value : null; }

function compact(result) {
  return {
    strategy: result.strategy,
    assumptions: result.assumptions,
    period: result.period,
    metrics: Object.fromEntries(Object.entries(result.metrics).map(([k, v]) => [k, finite(v)])),
    trades: result.trades,
  };
}

function buildMarkdown(report) {
  const p = report.primary.metrics;
  const r = report.activeRotation.metrics;
  const rows = report.sensitivity.map(s => `| ${s.lookback} | ${(s.threshold * 100).toFixed(0)}% | ${pct(s.totalReturn)} | ${pct(s.excessVsTaiex)} | ${pct(s.maxDrawdown)} | ${s.tradeCount} |`).join('\n');
  const trades = report.primary.trades.map(t => `| ${t.entryDate} | ${t.sector} | ${pct(t.signalMomentum10d)} | ${t.exitDate} | ${t.exitReason} | ${pct(t.netReturn)} | ${t.holdingTradingDays} |`).join('\n');
  return `# Sector Rotation Challenger v0.3\n\nGenerated: ${report.generatedAt}\n\n## Test definition\n\n- Period: ${report.period.start} to ${report.period.end} (${report.period.tradingDays} TAIEX trading days)\n- Universe: ${Object.keys(DEFAULT_SECTORS).join(', ')}\n- Signal: trailing 10-trading-day equal-weight return of the three representative stocks in each sector\n- Exact strategy: when flat, select the strongest sector after the close; enter at the next session open; hold until +20% take-profit or -20% stop-loss is observed at a close; exit/reselect at the next session open\n- Costs: buy commission ${(DEFAULT_COSTS.buyCommission * 100).toFixed(4)}%, sell commission ${(DEFAULT_COSTS.sellCommission * 100).toFixed(4)}%, stock transaction tax ${(DEFAULT_COSTS.sellTax * 100).toFixed(3)}%\n- Price-return test only; dividends are not included\n\n## Primary: 10d leader, hold to +20% / -20%\n\n| Metric | Result |\n|---|---:|\n| Net total return | ${pct(p.totalReturn)} |\n| Annualized return | ${pct(p.annualizedReturn)} |\n| TAIEX price return | ${pct(p.taiexReturn)} |\n| Excess vs TAIEX | ${pct(p.excessVsTaiex)} |\n| Max drawdown | ${pct(p.maxDrawdown)} |\n| Trades | ${p.tradeCount} |\n| Win rate | ${pct(p.winRate)} |\n| Avg trade | ${pct(p.avgTradeReturn)} |\n| Median holding days | ${p.medianHoldingTradingDays ?? 'N/A'} |\n| Exposure | ${pct(p.exposure)} |\n| Take-profit exits | ${p.takeProfitCount} |\n| Stop-loss exits | ${p.stopLossCount} |\n\n## Active comparison: switch whenever the 10d leader changes\n\n| Metric | Hold-to-20/20 | Active leader rotation |\n|---|---:|---:|\n| Net total return | ${pct(p.totalReturn)} | ${pct(r.totalReturn)} |\n| Excess vs TAIEX | ${pct(p.excessVsTaiex)} | ${pct(r.excessVsTaiex)} |\n| Max drawdown | ${pct(p.maxDrawdown)} | ${pct(r.maxDrawdown)} |\n| Trades | ${p.tradeCount} | ${r.tradeCount} |\n| Win rate | ${pct(p.winRate)} | ${pct(r.winRate)} |\n\n## Robustness grid\n\n| Lookback | TP/SL | Net return | Excess vs TAIEX | Max DD | Trades |\n|---:|---:|---:|---:|---:|---:|\n${rows}\n\nRobustness: ${report.robustness.beatTaiexCount}/${report.robustness.total} parameter combinations beat TAIEX; ${report.robustness.positiveCount}/${report.robustness.total} were net positive.\n\n## Primary trades\n\n| Entry | Sector | 10d momentum | Exit | Reason | Net return | Hold days |\n|---|---|---:|---|---|---:|---:|\n${trades || '| - | - | - | - | - | - | - |'}\n\n## Interpretation guardrails\n\nThis is a historical simulation over a small six-sector proxy universe. It is not a calibrated forecast and does not include dividends, market impact, slippage beyond next-open execution, constituent changes, or TPEx names. A strategy that works only at one parameter choice should be treated as fragile rather than validated.\n`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const months = monthKeys(28);
  console.log(`Fetching TAIEX across ${months.length} months...`);
  const taiexRows = await fetchTaiexHistory(months);
  if (taiexRows.length < 400) throw new Error(`insufficient TAIEX history: ${taiexRows.length}`);
  const endDate = taiexRows.at(-1).date;
  const startDate = subtractYears(endDate, 2);

  const symbols = [...new Set(Object.values(DEFAULT_SECTORS).flat())];
  console.log(`Fetching ${symbols.length} stocks...`);
  const histories = await mapLimit(symbols, 4, async symbol => {
    const rows = await fetchStockHistory(symbol, months);
    console.log(`${symbol}: ${rows.length} rows`);
    return [symbol, rows];
  });
  const stockHistoryBySymbol = new Map(histories);
  const insufficient = histories.filter(([, rows]) => rows.length < 400).map(([symbol, rows]) => `${symbol}:${rows.length}`);
  if (insufficient.length) throw new Error(`insufficient stock history: ${insufficient.join(', ')}`);

  const primary = backtestRotation({ stockHistoryBySymbol, taiexRows, startDate, endDate, lookback: 10, takeProfit: 0.20, stopLoss: -0.20 });
  const activeRotation = backtestRotation({ stockHistoryBySymbol, taiexRows, startDate, endDate, lookback: 10, takeProfit: 0.20, stopLoss: -0.20, switchOnLeaderChange: true });

  const sensitivity = [];
  for (const lookback of [5, 10, 20]) {
    for (const threshold of [0.15, 0.20, 0.25]) {
      const result = backtestRotation({ stockHistoryBySymbol, taiexRows, startDate, endDate, lookback, takeProfit: threshold, stopLoss: -threshold });
      sensitivity.push({ lookback, threshold, ...result.metrics });
    }
  }
  const robustness = {
    total: sensitivity.length,
    positiveCount: sensitivity.filter(x => x.totalReturn > 0).length,
    beatTaiexCount: sensitivity.filter(x => x.excessVsTaiex > 0).length,
  };

  const report = {
    version: 'v0.3',
    generatedAt: new Date().toISOString(),
    dataSource: 'TWSE STOCK_DAY + FMTQIK',
    universe: DEFAULT_SECTORS,
    period: primary.period,
    transactionCosts: DEFAULT_COSTS,
    primary: compact(primary),
    activeRotation: compact(activeRotation),
    sensitivity: sensitivity.map(x => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === 'number' ? finite(v) : v]))),
    robustness,
  };

  fs.writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(MD_PATH, buildMarkdown(report));
  console.log(`Primary total=${pct(primary.metrics.totalReturn)} TAIEX=${pct(primary.metrics.taiexReturn)} excess=${pct(primary.metrics.excessVsTaiex)} maxDD=${pct(primary.metrics.maxDrawdown)} trades=${primary.metrics.tradeCount}`);
  console.log(`Active total=${pct(activeRotation.metrics.totalReturn)} trades=${activeRotation.metrics.tradeCount}`);
  console.log(`Robustness beat TAIEX ${robustness.beatTaiexCount}/${robustness.total}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

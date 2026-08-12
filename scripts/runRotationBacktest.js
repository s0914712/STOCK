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

function maxDrawdown(values) {
  let peak = -Infinity;
  let out = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    peak = Math.max(peak, value);
    if (peak > 0) out = Math.min(out, value / peak - 1);
  }
  return out;
}

function annualizedReturn(totalReturn, tradingDays) {
  if (!Number.isFinite(totalReturn) || tradingDays <= 0 || 1 + totalReturn <= 0) return null;
  return (1 + totalReturn) ** (252 / tradingDays) - 1;
}

function buyHoldUniverse({ symbols, stockHistoryBySymbol, taiexRows, startDate, endDate, costs = DEFAULT_COSTS }) {
  const dates = taiexRows.map(r => r.date).filter(d => d >= startDate && d <= endDate);
  const entryDate = dates[1] || dates[0];
  const exitDate = dates.at(-1);
  const maps = new Map([...stockHistoryBySymbol].map(([symbol, rows]) => [symbol, new Map(rows.map(r => [r.date, r]))]));
  const entry = {};
  for (const symbol of symbols) {
    const row = maps.get(symbol) && maps.get(symbol).get(entryDate);
    if (!row || !Number.isFinite(row.open)) throw new Error(`missing buy-hold entry ${symbol} ${entryDate}`);
    entry[symbol] = row.open;
  }
  const buyRate = costs.buyCommission || 0;
  const sellRate = (costs.sellCommission || 0) + (costs.sellTax || 0);
  const curve = [];
  for (const date of dates.filter(d => d >= entryDate)) {
    const relatives = symbols.map(symbol => {
      const row = maps.get(symbol) && maps.get(symbol).get(date);
      return row && Number.isFinite(row.close) ? row.close / entry[symbol] : null;
    }).filter(Number.isFinite);
    if (relatives.length !== symbols.length) continue;
    const gross = relatives.reduce((a, b) => a + b, 0) / relatives.length;
    curve.push({ date, equity: gross * (1 - sellRate) / (1 + buyRate) });
  }
  const totalReturn = curve.at(-1).equity - 1;
  return {
    name: 'equal-weight-18-stock-buy-hold',
    entryDate,
    exitDate,
    metrics: {
      totalReturn,
      annualizedReturn: annualizedReturn(totalReturn, curve.length),
      maxDrawdown: maxDrawdown(curve.map(r => r.equity)),
    },
  };
}

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
  const u = report.ungated.metrics;
  const r = report.activeRotation.metrics;
  const bh = report.universeBuyHold.metrics;
  const rows = report.sensitivity.map(s => `| ${s.lookback} | ${(s.threshold * 100).toFixed(0)}% | ${pct(s.totalReturn)} | ${pct(s.excessVsTaiex)} | ${pct(s.maxDrawdown)} | ${s.tradeCount} |`).join('\n');
  const trades = report.primary.trades.map(t => `| ${t.entryDate} | ${t.sector} | ${pct(t.signalMomentum10d)} | ${t.exitDate} | ${t.exitReason} | ${pct(t.netReturn)} | ${t.holdingTradingDays} |`).join('\n');
  return `# Sector Rotation Challenger v0.3\n\nGenerated: ${report.generatedAt}\n\n## Test definition\n\n- Period: ${report.period.start} to ${report.period.end} (${report.period.tradingDays} TAIEX trading days)\n- Universe: ${Object.keys(DEFAULT_SECTORS).join(', ')}\n- Signal: trailing 10-trading-day equal-weight return of the three representative stocks in each sector\n- Primary strategy: only enter when the strongest sector has a **positive** 10-day return; signal after close, enter next session open; hold until +20% take-profit or -20% stop-loss is observed at a close; exit/reselect at the next session open\n- Costs: buy commission ${(DEFAULT_COSTS.buyCommission * 100).toFixed(4)}%, sell commission ${(DEFAULT_COSTS.sellCommission * 100).toFixed(4)}%, stock transaction tax ${(DEFAULT_COSTS.sellTax * 100).toFixed(3)}%\n- Price-return test only; dividends are not included\n\n## Primary: positive 10d leader, hold to +20% / -20%\n\n| Metric | Result |\n|---|---:|\n| Net total return | ${pct(p.totalReturn)} |\n| Annualized return | ${pct(p.annualizedReturn)} |\n| TAIEX price return | ${pct(p.taiexReturn)} |\n| Excess vs TAIEX | ${pct(p.excessVsTaiex)} |\n| Max drawdown | ${pct(p.maxDrawdown)} |\n| Trades | ${p.tradeCount} |\n| Win rate | ${pct(p.winRate)} |\n| Avg trade | ${pct(p.avgTradeReturn)} |\n| Median holding days | ${p.medianHoldingTradingDays ?? 'N/A'} |\n| Exposure | ${pct(p.exposure)} |\n| Take-profit exits | ${p.takeProfitCount} |\n| Stop-loss exits | ${p.stopLossCount} |\n\n## Critical baselines\n\n| Strategy | Net return | Excess vs TAIEX | Max DD | Trades |\n|---|---:|---:|---:|---:|\n| Primary positive-gate 10d / 20-20 | ${pct(p.totalReturn)} | ${pct(p.excessVsTaiex)} | ${pct(p.maxDrawdown)} | ${p.tradeCount} |\n| Ungated (buy least-bad even if all negative) | ${pct(u.totalReturn)} | ${pct(u.excessVsTaiex)} | ${pct(u.maxDrawdown)} | ${u.tradeCount} |\n| Active 10d leader switching | ${pct(r.totalReturn)} | ${pct(r.excessVsTaiex)} | ${pct(r.maxDrawdown)} | ${r.tradeCount} |\n| Same 18 stocks equal-weight buy & hold | ${pct(bh.totalReturn)} | N/A | ${pct(bh.maxDrawdown)} | 1 |\n| TAIEX price index | ${pct(p.taiexReturn)} | 0.00% | N/A | 1 |\n\nRotation alpha vs the curated 18-stock buy-and-hold proxy: **${pct(report.rotationAlphaVsUniverse)}**.\n\n## Robustness grid (positive-momentum gate)\n\n| Lookback | TP/SL | Net return | Excess vs TAIEX | Max DD | Trades |\n|---:|---:|---:|---:|---:|---:|\n${rows}\n\nRobustness: ${report.robustness.beatTaiexCount}/${report.robustness.total} parameter combinations beat TAIEX; ${report.robustness.positiveCount}/${report.robustness.total} were net positive.\n\n## Primary trades\n\n| Entry | Sector | Signal momentum | Exit | Reason | Net return | Hold days |\n|---|---|---:|---|---|---:|---:|\n${trades || '| - | - | - | - | - | - | - |'}\n\n## Interpretation guardrails\n\nThis is still a **curated proxy-universe** backtest: today's six sector definitions and representative stocks are applied backward for two years. That can create survivorship / hindsight selection bias, especially for thematic groups such as AI servers and PCB. The equal-weight 18-stock buy-and-hold comparison helps reveal whether returns come from rotation or simply from having selected strong stocks, but it does not eliminate the bias. Before treating this as investable evidence, v0.4 should repeat the test on point-in-time industry membership or official investable sector/index series.\n`;
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

  const baseArgs = { stockHistoryBySymbol, taiexRows, startDate, endDate, lookback: 10, takeProfit: 0.20, stopLoss: -0.20 };
  const primary = backtestRotation({ ...baseArgs, minMomentum: 0 });
  const ungated = backtestRotation(baseArgs);
  const activeRotation = backtestRotation({ ...baseArgs, minMomentum: 0, switchOnLeaderChange: true });
  const universeBuyHold = buyHoldUniverse({ symbols, stockHistoryBySymbol, taiexRows, startDate, endDate });

  const sensitivity = [];
  for (const lookback of [5, 10, 20]) {
    for (const threshold of [0.15, 0.20, 0.25]) {
      const result = backtestRotation({
        stockHistoryBySymbol, taiexRows, startDate, endDate,
        lookback, takeProfit: threshold, stopLoss: -threshold, minMomentum: 0,
      });
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
    revision: 'positive-momentum-gate-and-universe-baseline',
    generatedAt: new Date().toISOString(),
    dataSource: 'TWSE STOCK_DAY + FMTQIK',
    universe: DEFAULT_SECTORS,
    period: primary.period,
    transactionCosts: DEFAULT_COSTS,
    primary: compact(primary),
    ungated: compact(ungated),
    activeRotation: compact(activeRotation),
    universeBuyHold,
    rotationAlphaVsUniverse: primary.metrics.totalReturn - universeBuyHold.metrics.totalReturn,
    sensitivity: sensitivity.map(x => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === 'number' ? finite(v) : v]))),
    robustness,
  };

  fs.writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(MD_PATH, buildMarkdown(report));
  console.log(`Primary positive-gate total=${pct(primary.metrics.totalReturn)} TAIEX=${pct(primary.metrics.taiexReturn)} excess=${pct(primary.metrics.excessVsTaiex)} maxDD=${pct(primary.metrics.maxDrawdown)} trades=${primary.metrics.tradeCount}`);
  console.log(`Ungated total=${pct(ungated.metrics.totalReturn)}; active=${pct(activeRotation.metrics.totalReturn)}; universe buy-hold=${pct(universeBuyHold.metrics.totalReturn)}`);
  console.log(`Rotation alpha vs universe=${pct(report.rotationAlphaVsUniverse)}; robustness beat TAIEX ${robustness.beatTaiexCount}/${robustness.total}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

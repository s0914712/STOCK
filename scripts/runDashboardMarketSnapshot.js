#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const { buildSectorRadar } = require('../sectorRadar');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'dashboard');
const OUT_PATH = path.join(OUT_DIR, 'market_latest.json');

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function fetchJSON(url, attempts = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 STOCK-dashboard-market/1.0',
        Accept: 'application/json',
      },
    }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', async () => {
        try {
          if (res.statusCode < 200 || res.statusCode >= 300) throw new Error(`HTTP ${res.statusCode}`);
          resolve(JSON.parse(body));
        } catch (error) {
          if (attempts > 1) {
            await sleep(700);
            try { resolve(await fetchJSON(url, attempts - 1)); } catch (retry) { reject(retry); }
          } else reject(error);
        }
      });
    });
    req.on('error', async error => {
      if (attempts > 1) {
        await sleep(700);
        try { resolve(await fetchJSON(url, attempts - 1)); } catch (retry) { reject(retry); }
      } else reject(error);
    });
    req.setTimeout(20000, () => req.destroy(new Error('request timeout')));
  });
}

function parseRocDate(value) {
  const [y, m, d] = String(value).split('/');
  if (!y || !m || !d) return null;
  return `${Number(y) + 1911}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function number(value) {
  const n = Number(String(value ?? '').replace(/,/g, '').replace(/--/g, ''));
  return Number.isFinite(n) ? n : null;
}

function monthKeys(count = 4) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}01`;
  }).reverse();
}

async function fetchTaiexHistory(keys) {
  const rows = [];
  for (const key of keys) {
    const data = await fetchJSON(`https://www.twse.com.tw/exchangeReport/FMTQIK?response=json&date=${key}`);
    if (data.stat === 'OK' && Array.isArray(data.data)) {
      for (const r of data.data) {
        const date = parseRocDate(r[0]);
        const close = number(r[4]);
        if (!date || !Number.isFinite(close)) continue;
        rows.push({
          date,
          close,
          volume: number(r[1]),
          amount: number(r[2]),
          transactions: number(r[3]),
        });
      }
    }
    await sleep(80);
  }
  const unique = new Map(rows.map(row => [row.date, row]));
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchStockHistory(symbol, keys) {
  const rows = [];
  for (const key of keys) {
    try {
      const data = await fetchJSON(`https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${key}&stockNo=${symbol}`);
      if (data.stat === 'OK' && Array.isArray(data.data)) {
        for (const r of data.data) {
          const date = parseRocDate(r[0]);
          const close = number(r[6]);
          const volume = number(r[1]);
          if (!date || !Number.isFinite(close) || !Number.isFinite(volume)) continue;
          rows.push({ date, close, volume });
        }
      }
    } catch (error) {
      console.warn(`[${symbol}] ${key}: ${error.message}`);
    }
    await sleep(55);
  }
  const unique = new Map(rows.map(row => [row.date, row]));
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const keys = monthKeys(4);
  const taiex = await fetchTaiexHistory(keys);
  if (taiex.length < 2) throw new Error(`insufficient TAIEX rows: ${taiex.length}`);

  const latest = taiex.at(-1);
  const previous = taiex.at(-2);
  const change = latest.close - previous.close;
  const changePct = previous.close ? latest.close / previous.close - 1 : null;

  const cache = new Map();
  const radar = await buildSectorRadar({
    months: 4,
    concurrency: 4,
    fetchHistory: async symbol => {
      if (!cache.has(symbol)) cache.set(symbol, fetchStockHistory(symbol, keys));
      return cache.get(symbol);
    },
  });

  const sectorRows = radar.data.map(row => ({
    sector: row.sector,
    rank: row.rank,
    score: row.score,
    signal: row.signal,
    momentum5: row.momentum5,
    momentum20: row.momentum20,
    volumeRatio: row.volumeRatio,
    breadthAboveMA20: row.breadthAboveMA20,
    volatility20: row.volatility20,
    coverage: row.coverage,
  }));

  const report = {
    version: 'dashboard-market-v1',
    generatedAt: new Date().toISOString(),
    dataSource: 'TWSE FMTQIK + STOCK_DAY; sector score from sector-radar-baseline-v0.1',
    market: {
      asOf: latest.date,
      close: latest.close,
      previousClose: previous.close,
      change,
      changePct,
      volume: latest.volume,
      amount: latest.amount,
      transactions: latest.transactions,
    },
    sectors: {
      asOf: radar.asOf,
      model: radar.model,
      failures: radar.failures,
      rows: sectorRows,
    },
  };

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`TAIEX ${latest.date}: ${latest.close} (${changePct >= 0 ? '+' : ''}${(changePct * 100).toFixed(2)}%)`);
  console.log('Sector Top 3:', sectorRows.slice(0, 3).map(r => `${r.rank}.${r.sector} ${r.score}`).join(' | '));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

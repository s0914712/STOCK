/**
 * Shared TWSE fetch layer with an on-disk cache.
 *
 * v0.4 re-downloaded five years of history on every run, so a report could not
 * be reproduced later and every parameter sweep meant thousands of requests.
 * The cache makes a sweep re-runnable offline and keeps TWSE load to one pass.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'data', 'cache');
const CACHE_PATH = path.join(CACHE_DIR, 'twse_prices.json');
const CACHE_VERSION = 1;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function fetchJSON(url, attempts = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 STOCK-research', Accept: 'application/json' } }, res => {
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
  return y && m && d ? `${Number(y) + 1911}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
}

function monthKeys(count = 64) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}01`;
  }).reverse();
}

async function fetchStockHistory(symbol, months) {
  const rows = [];
  for (const key of months) {
    try {
      const data = await fetchJSON(`https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${key}&stockNo=${symbol}`);
      if (data.stat === 'OK' && Array.isArray(data.data)) {
        for (const r of data.data) {
          const date = parseRocDate(r[0]);
          if (!date) continue;
          rows.push({
            date,
            volume: Number(String(r[1]).replace(/,/g, '')),
            open: Number(String(r[3]).replace(/,/g, '')),
            high: Number(String(r[4]).replace(/,/g, '')),
            low: Number(String(r[5]).replace(/,/g, '')),
            close: Number(String(r[6]).replace(/,/g, '')),
          });
        }
      }
    } catch (error) { console.warn(`[${symbol}] ${key}: ${error.message}`); }
    await sleep(65);
  }
  const unique = new Map(rows.filter(r => Number.isFinite(r.open) && Number.isFinite(r.close)).map(r => [r.date, r]));
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchTaiexHistory(months) {
  const rows = [];
  for (const key of months) {
    try {
      const data = await fetchJSON(`https://www.twse.com.tw/exchangeReport/FMTQIK?response=json&date=${key}`);
      if (data.stat === 'OK' && Array.isArray(data.data)) {
        for (const r of data.data) {
          const date = parseRocDate(r[0]);
          const index = Number(String(r[4]).replace(/,/g, ''));
          if (date && Number.isFinite(index)) rows.push({ date, index });
        }
      }
    } catch (error) { console.warn(`[TAIEX] ${key}: ${error.message}`); }
    await sleep(65);
  }
  const unique = new Map(rows.map(r => [r.date, r]));
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchOfficialElectronicFinance(months) {
  const wanted = {
    '半導體': '半導體類指數',
    '電子零組件': '電子零組件類指數',
    '金融': '金融保險類指數',
  };
  const series = Object.fromEntries(Object.keys(wanted).map(k => [k, new Map()]));
  for (const key of months) {
    try {
      const data = await fetchJSON(`https://www.twse.com.tw/indicesReport/EFTRI_HIST?response=json&date=${key}`);
      const fields = data.fields || data.fields1 || [];
      const rows = data.data || data.data1 || [];
      const indexes = {};
      for (const [sector, label] of Object.entries(wanted)) {
        indexes[sector] = fields.findIndex(f => String(f).includes(label.replace('類指數', '')));
      }
      for (const r of rows) {
        const date = parseRocDate(r[0]);
        if (!date) continue;
        for (const sector of Object.keys(wanted)) {
          const idx = indexes[sector];
          if (idx <= 0) continue;
          const value = Number(String(r[idx]).replace(/,/g, ''));
          if (Number.isFinite(value)) series[sector].set(date, value);
        }
      }
    } catch (error) { console.warn(`[EFTRI_HIST] ${key}: ${error.message}`); }
    await sleep(65);
  }
  return series;
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

function readCache() {
  if (!fs.existsSync(CACHE_PATH)) return null;
  try {
    const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    return cache && cache.version === CACHE_VERSION ? cache : null;
  } catch (error) {
    console.warn(`[cache] unreadable, ignoring: ${error.message}`);
    return null;
  }
}

function writeCache(payload) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(payload));
}

function hydrate(cache) {
  return {
    source: 'cache',
    fetchedAt: cache.fetchedAt,
    taiexRows: cache.taiex,
    histories: new Map(Object.entries(cache.stocks)),
    official: Object.fromEntries(Object.entries(cache.official).map(([k, v]) => [k, new Map(v)])),
  };
}

function cacheCovers(cache, symbols) {
  if (!cache || !cache.stocks || !cache.taiex) return false;
  return symbols.every(symbol => Array.isArray(cache.stocks[symbol]) && cache.stocks[symbol].length > 0);
}

/**
 * @param {object} options
 * @param {string[]} options.symbols  stock ids to load
 * @param {string[]} options.months   TWSE month keys to request on a cold fetch
 * @param {boolean}  options.refresh  ignore any existing cache and refetch
 * @param {boolean}  options.offline  fail instead of hitting the network
 */
async function loadMarketData({ symbols, months = monthKeys(64), refresh = false, offline = false }) {
  const cache = refresh ? null : readCache();
  if (cacheCovers(cache, symbols)) {
    console.log(`[cache] reusing TWSE snapshot fetched at ${cache.fetchedAt}`);
    return hydrate(cache);
  }
  if (offline) {
    throw new Error(`no usable cache at ${CACHE_PATH}; run once with network access to populate it`);
  }

  console.log(`[fetch] downloading ${symbols.length} symbols across ${months.length} months from TWSE`);
  const taiexRows = await fetchTaiexHistory(months);
  const fetched = await mapLimit(symbols, 5, async symbol => [symbol, await fetchStockHistory(symbol, months)]);
  const histories = new Map(fetched);
  const official = await fetchOfficialElectronicFinance(months);

  writeCache({
    version: CACHE_VERSION,
    fetchedAt: new Date().toISOString(),
    months,
    taiex: taiexRows,
    stocks: Object.fromEntries(histories),
    official: Object.fromEntries(Object.entries(official).map(([k, v]) => [k, [...v]])),
  });

  return { source: 'network', fetchedAt: new Date().toISOString(), taiexRows, histories, official };
}

module.exports = {
  CACHE_PATH,
  fetchJSON,
  parseRocDate,
  monthKeys,
  mapLimit,
  fetchStockHistory,
  fetchTaiexHistory,
  fetchOfficialElectronicFinance,
  loadMarketData,
};

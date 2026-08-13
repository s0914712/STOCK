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

// Taiwan enforces a +/-10% daily price limit, so any close-to-close move beyond
// it is arithmetically impossible from trading alone and must be a corporate
// action. That makes split detection unusually reliable in this market.
const TW_DAILY_LIMIT = 0.10;
const CORPORATE_ACTION_TOLERANCE = 0.11;

/**
 * STOCK_DAY serves raw, unadjusted prices. 0050 split 1:4 in 2025, which shows
 * up as a -75% single-day "loss" and silently destroyed a whole benchmark
 * comparison before this was added. Back-adjust every price prior to an event
 * so the series is continuous in latest-price terms.
 *
 * @returns {{rows: object[], events: object[]}}
 */
/**
 * A detected gap mixes the corporate action with that session's real price
 * move. Splits use clean ratios, so snapping to the nearest one — and only
 * when the leftover move is a legal trading day — keeps that day's genuine
 * return instead of swallowing it into the adjustment factor.
 *
 * Capital reductions can use arbitrary ratios; those will not snap, and the
 * raw ratio is used, which costs one session's return at that event.
 */
function snapToSplitRatio(ratio, tolerance = CORPORATE_ACTION_TOLERANCE) {
  let best = null;
  for (let n = 2; n <= 20; n += 1) {
    for (const candidate of [1 / n, n]) {
      const residual = Math.abs(ratio / candidate - 1);
      if (residual <= tolerance && (best === null || residual < best.residual)) {
        best = { value: candidate, residual };
      }
    }
  }
  return best ? best.value : ratio;
}

function adjustForCorporateActions(rows, { symbol = '?', tolerance = CORPORATE_ACTION_TOLERANCE } = {}) {
  const sorted = (rows || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const eventByIndex = new Map();
  const events = [];

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1].close;
    const current = sorted[i].close;
    if (!(prev > 0) || !(current > 0)) continue;
    const observedRatio = current / prev;
    if (Math.abs(observedRatio - 1) > tolerance) {
      const ratio = snapToSplitRatio(observedRatio, tolerance);
      eventByIndex.set(i, ratio);
      events.push({
        symbol,
        date: sorted[i].date,
        previousClose: prev,
        close: current,
        observedRatio,
        ratio,
        snapped: ratio !== observedRatio,
        // 0.25 reads as "1 share became 4"; 4 reads as a 4:1 reverse split.
        impliedSplit: ratio < 1 ? `1:${(1 / ratio).toFixed(2)}` : `${ratio.toFixed(2)}:1`,
      });
    }
  }

  if (!events.length) return { rows: sorted, events };

  const factors = new Array(sorted.length).fill(1);
  let cumulative = 1;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    factors[i] = cumulative;
    if (eventByIndex.has(i)) cumulative *= eventByIndex.get(i);
  }

  const adjusted = sorted.map((row, i) => {
    const f = factors[i];
    if (f === 1) return row;
    return {
      ...row,
      open: Number.isFinite(row.open) ? row.open * f : row.open,
      high: Number.isFinite(row.high) ? row.high * f : row.high,
      low: Number.isFinite(row.low) ? row.low * f : row.low,
      close: Number.isFinite(row.close) ? row.close * f : row.close,
      volume: Number.isFinite(row.volume) && f > 0 ? row.volume / f : row.volume,
    };
  });

  return { rows: adjusted, events };
}

/**
 * Tripwire for anything the adjuster missed. A surviving move past the daily
 * limit means the series is still wrong, and a wrong series must stop the run
 * rather than quietly produce a report.
 */
function assertNoUnadjustedGaps(rows, { symbol = '?', tolerance = CORPORATE_ACTION_TOLERANCE } = {}) {
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1].close;
    const current = rows[i].close;
    if (!(prev > 0) || !(current > 0)) continue;
    const move = current / prev - 1;
    if (Math.abs(move) > tolerance) {
      throw new Error(
        `${symbol}: ${rows[i].date} moved ${(move * 100).toFixed(2)}% close-to-close, `
        + `beyond Taiwan's +/-${TW_DAILY_LIMIT * 100}% limit. The series still holds an unadjusted corporate action.`,
      );
    }
  }
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
    return finalize(hydrate(cache));
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

  return finalize({ source: 'network', fetchedAt: new Date().toISOString(), taiexRows, histories, official });
}

/**
 * The cache deliberately stores raw TWSE prices — raw is the source of truth —
 * so adjustment happens on every read instead, keeping it deterministic and
 * making a re-fetch unnecessary when the adjustment logic changes.
 */
function finalize(loaded) {
  const adjustedHistories = new Map();
  const corporateActions = [];

  for (const [symbol, rows] of loaded.histories.entries()) {
    const { rows: adjusted, events } = adjustForCorporateActions(rows, { symbol });
    corporateActions.push(...events);
    assertNoUnadjustedGaps(adjusted, { symbol });
    adjustedHistories.set(symbol, adjusted);
  }

  if (corporateActions.length) {
    console.log(`[adjust] back-adjusted ${corporateActions.length} corporate action(s):`);
    for (const e of corporateActions) {
      console.log(`  ${e.symbol} ${e.date}: ${e.previousClose} -> ${e.close} (${e.impliedSplit})`);
    }
  } else {
    console.log('[adjust] no corporate actions detected');
  }

  return { ...loaded, histories: adjustedHistories, corporateActions };
}

module.exports = {
  CACHE_PATH,
  TW_DAILY_LIMIT,
  CORPORATE_ACTION_TOLERANCE,
  adjustForCorporateActions,
  assertNoUnadjustedGaps,
  fetchJSON,
  parseRocDate,
  monthKeys,
  mapLimit,
  fetchStockHistory,
  fetchTaiexHistory,
  fetchOfficialElectronicFinance,
  loadMarketData,
};

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
const http = require('http');

const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'data', 'cache');
const CACHE_PATH = path.join(CACHE_DIR, 'twse_prices.json');
const CACHE_VERSION = 1;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
// TWSE throttles aggressively and has been migrating its endpoints under
// /rwd/, answering the old paths with a 307. node's https.get does not follow
// redirects, so every request failed until this was handled.
const REQUEST_SPACING_MS = Number(process.env.TWSE_REQUEST_SPACING_MS || 400);
// Spacing alone does not bound the request rate: the symbol fetch runs several
// workers in parallel, so the effective rate is CONCURRENCY / spacing. At the
// previous 65ms x 5 workers that was ~77 req/s, far past what TWSE tolerates.
// 1 worker at 400ms is ~2.5 req/s, under the ~3 req/s it starts refusing at.
const FETCH_CONCURRENCY = Number(process.env.TWSE_CONCURRENCY || 1);

// Once TWSE tells us where a deprecated path now lives, reuse that mapping for
// every later request. Otherwise each of the ~1200 calls pays a redirect hop
// against a server that is already rate limiting us.
//
// KNOWN BUG -- do not route new callers through this client until it is fixed
// and proven against live TWSE. This memo is process-global and never cleared,
// so a single redirect (TWSE appears to 307 as a throttling signal, not only
// for moved paths) rewrites every later request in the process onto the
// memoized path, which then loops until the redirect budget is spent. Observed
// live on 2026-08-27: the first few months of a symbol succeed, then every
// subsequent request fails with "too many redirects" at ~8s each. A v0.3
// backtest blew its 20-minute timeout after two symbols.
//
// scripts/shadowRunner.js was moved onto this client and moved back off for
// exactly this reason; its own client has fetched a complete snapshot every
// trading day. runRotationV04/V05 and runBenchmarkBattle still depend on this
// path and are expected to be affected too.
const redirectMemo = new Map();

function applyRedirectMemo(url) {
  try {
    const parsed = new URL(url);
    const mapped = redirectMemo.get(`${parsed.origin}${parsed.pathname}`);
    if (!mapped) return url;
    parsed.pathname = mapped;
    return parsed.toString();
  } catch {
    return url;
  }
}

function rememberRedirect(from, to) {
  // Only memoize a pure same-origin path swap. If the target carries its own
  // query the rewrite would not be equivalent for other dates, so skip it.
  if (from.origin !== to.origin) return;
  if (to.search && to.search !== from.search) return;
  redirectMemo.set(`${from.origin}${from.pathname}`, to.pathname);
}

function fetchJSON(rawUrl, attempts = 4, redirectsLeft = 5) {
  const url = applyRedirectMemo(rawUrl);
  return new Promise((resolve, reject) => {
    const transport = url.startsWith('http://') ? http : https;
    const retry = async (error) => {
      if (attempts > 1) {
        // Back off harder each time; a 429/307 storm means we are going too fast.
        await sleep(700 * (5 - attempts));
        try { resolve(await fetchJSON(url, attempts - 1, redirectsLeft)); } catch (e) { reject(e); }
      } else reject(error);
    };

    const req = transport.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 STOCK-research', Accept: 'application/json' } }, res => {
      const status = res.statusCode;

      if (REDIRECT_CODES.has(status) && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) {
          retry(new Error(`too many redirects from ${url}`));
          return;
        }
        const from = new URL(url);
        const to = new URL(res.headers.location, url);
        // A redirect that drops the query would silently fetch the wrong month,
        // so carry the original parameters across.
        if (!to.search && from.search) to.search = from.search;
        rememberRedirect(from, to);
        fetchJSON(to.toString(), attempts, redirectsLeft - 1).then(resolve, reject);
        return;
      }

      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
          resolve(JSON.parse(body));
        } catch (error) {
          retry(error);
        }
      });
    });
    req.on('error', retry);
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
    await sleep(REQUEST_SPACING_MS);
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
    await sleep(REQUEST_SPACING_MS);
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
    await sleep(REQUEST_SPACING_MS);
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
async function loadMarketData({ symbols, months = monthKeys(64), refresh = false, offline = false, minRowsPerSymbol = null }) {
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
  const estimateSeconds = Math.round(((symbols.length * months.length) / FETCH_CONCURRENCY) * (REQUEST_SPACING_MS / 1000));
  console.log(`[fetch] ${FETCH_CONCURRENCY} worker(s), ${REQUEST_SPACING_MS}ms spacing (~${(FETCH_CONCURRENCY / (REQUEST_SPACING_MS / 1000)).toFixed(1)} req/s, roughly ${Math.ceil(estimateSeconds / 60)} min)`);
  const fetched = await mapLimit(symbols, FETCH_CONCURRENCY, async symbol => [symbol, await fetchStockHistory(symbol, months)]);
  const histories = new Map(fetched);
  const official = await fetchOfficialElectronicFinance(months);

  // A partially downloaded snapshot must never reach disk. The previous run
  // cached a truncated fetch, and the follow-up --offline step would happily
  // have built a report on top of it.
  const minRows = minRowsPerSymbol ?? Math.floor(months.length * 20 * 0.5);
  const short = fetched
    .filter(([, rows]) => rows.length < minRows)
    .map(([symbol, rows]) => `${symbol}:${rows.length}`);
  if (short.length || taiexRows.length < minRows) {
    throw new Error(
      `TWSE download incomplete, refusing to cache it. Expected at least ${minRows} rows per series; `
      + `TAIEX got ${taiexRows.length}${short.length ? `, short symbols: ${short.join(', ')}` : ''}. `
      + 'This is usually rate limiting or an endpoint change — retry, or raise TWSE_REQUEST_SPACING_MS '
      + `(currently ${REQUEST_SPACING_MS}ms between requests).`,
    );
  }

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

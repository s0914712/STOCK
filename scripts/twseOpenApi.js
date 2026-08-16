/**
 * Official TWSE OpenAPI data layer.
 *
 * The v1 API mixes English and Chinese field names and most endpoints expose a
 * current snapshot rather than an arbitrary historical query. This module
 * normalizes all seven datasets, keeps a short in-process cache, records source
 * hashes for reproducibility, and can fall back to the last committed snapshot
 * without pretending stale data is live.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SNAPSHOT_PATH = path.join(ROOT, 'data', 'dashboard', 'market_latest.json');
const BASE_URL = process.env.TWSE_OPENAPI_BASE_URL || 'https://openapi.twse.com.tw/v1';
const DEFAULT_TTL_MS = Number(process.env.TWSE_OPENAPI_TTL_MS || 15 * 60 * 1000);
const DEFAULT_TIMEOUT_MS = Number(process.env.TWSE_OPENAPI_TIMEOUT_MS || 20000);
const DEFAULT_MAX_ATTEMPTS = Number(process.env.TWSE_OPENAPI_MAX_ATTEMPTS || 3);
const DEFAULT_RETRY_DELAY_MS = Number(process.env.TWSE_OPENAPI_RETRY_DELAY_MS || 750);

const ENDPOINTS = Object.freeze({
  stockDay: '/exchangeReport/STOCK_DAY_ALL',
  marketIndex: '/exchangeReport/MI_INDEX',
  taiexTotalReturn: '/indicesReport/MFI94U',
  valuation: '/exchangeReport/BWIBBU_ALL',
  revenue: '/opendata/t187ap05_L',
  materialEvents: '/opendata/t187ap04_L',
  exRights: '/exchangeReport/TWT48U_ALL',
});

const DATASET_KEYS = Object.freeze(Object.keys(ENDPOINTS));
const memoryCache = new Map();

function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toNumber(value) {
  const text = cleanText(value).replaceAll(',', '').replace('%', '');
  if (!text || text === '-' || text === '--' || text === 'N/A') return null;
  const parenthesized = /^\((.+)\)$/.exec(text);
  const number = Number(parenthesized ? `-${parenthesized[1]}` : text);
  return Number.isFinite(number) ? number : null;
}

function rocCompactToIso(value) {
  const digits = cleanText(value).replace(/\D/g, '');
  const match = /^(\d{3})(\d{2})(\d{2})$/.exec(digits);
  if (!match) return null;
  const year = Number(match[1]) + 1911;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${match[2]}-${match[3]}`;
}

function rocMonthToIso(value) {
  const digits = cleanText(value).replace(/\D/g, '');
  const match = /^(\d{3})(\d{2})$/.exec(digits);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return null;
  return `${Number(match[1]) + 1911}-${match[2]}`;
}

function normalizeClock(value) {
  const rawDigits = cleanText(value).replace(/\D/g, '');
  if (!rawDigits) return null;
  const digits = rawDigits.padStart(6, '0').slice(-6);
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4, 6)}`;
}

function maxDate(rows, fields = ['date']) {
  const values = [];
  for (const row of rows) {
    for (const field of fields) {
      if (row[field]) values.push(row[field]);
    }
  }
  return values.sort().at(-1) || null;
}

function normalizeStockDay(rows) {
  return rows.map(row => ({
    date: rocCompactToIso(row.Date),
    symbol: cleanText(row.Code),
    name: cleanText(row.Name),
    volume: toNumber(row.TradeVolume),
    tradeValue: toNumber(row.TradeValue),
    open: toNumber(row.OpeningPrice),
    high: toNumber(row.HighestPrice),
    low: toNumber(row.LowestPrice),
    close: toNumber(row.ClosingPrice),
    change: toNumber(row.Change),
    transactions: toNumber(row.Transaction),
  })).filter(row => row.symbol && row.date);
}

function normalizeMarketIndex(rows) {
  return rows.map(row => ({
    date: rocCompactToIso(row['日期']),
    indexName: cleanText(row['指數']),
    close: toNumber(row['收盤指數']),
    direction: cleanText(row['漲跌']),
    change: toNumber(row['漲跌點數']),
    changePercent: toNumber(row['漲跌百分比']),
    note: cleanText(row['特殊處理註記']),
  })).filter(row => row.indexName && row.date);
}

function normalizeTaiexTotalReturn(rows) {
  return rows.map(row => ({
    date: rocCompactToIso(row.Date),
    index: toNumber(row.TAIEXTotalReturnIndex),
  })).filter(row => row.date && Number.isFinite(row.index));
}

function normalizeValuation(rows) {
  return rows.map(row => ({
    date: rocCompactToIso(row.Date),
    symbol: cleanText(row.Code),
    name: cleanText(row.Name),
    pe: toNumber(row.PEratio),
    dividendYield: toNumber(row.DividendYield),
    pb: toNumber(row.PBratio),
  })).filter(row => row.symbol && row.date);
}

function normalizeRevenue(rows) {
  return rows.map(row => ({
    publishedAt: rocCompactToIso(row['出表日期']),
    dataMonth: rocMonthToIso(row['資料年月']),
    symbol: cleanText(row['公司代號']),
    name: cleanText(row['公司名稱']),
    industry: cleanText(row['產業別']),
    currentMonthRevenue: toNumber(row['營業收入-當月營收']),
    previousMonthRevenue: toNumber(row['營業收入-上月營收']),
    priorYearMonthRevenue: toNumber(row['營業收入-去年當月營收']),
    momPercent: toNumber(row['營業收入-上月比較增減(%)']),
    yoyPercent: toNumber(row['營業收入-去年同月增減(%)']),
    ytdRevenue: toNumber(row['累計營業收入-當月累計營收']),
    priorYearYtdRevenue: toNumber(row['累計營業收入-去年累計營收']),
    ytdPercent: toNumber(row['累計營業收入-前期比較增減(%)']),
    note: cleanText(row['備註']),
  })).filter(row => row.symbol && row.publishedAt);
}

const HIGH_RISK_EVENT = /停止交易|終止上市|下市|違約|重大損失|重大災害|掏空|訴訟|搜索|裁罰|破產|重整|退票/;
const MEDIUM_RISK_EVENT = /減資|增資|可轉換|私募|庫藏股|董事辭任|經理人異動|財務預測|自結|虧損|背書保證|資金貸與|處分資產/;

function eventRisk(subject, description) {
  const text = `${subject}\n${description}`;
  if (HIGH_RISK_EVENT.test(text)) return { severity: 'high', tags: ['risk-event'] };
  if (MEDIUM_RISK_EVENT.test(text)) return { severity: 'medium', tags: ['corporate-event'] };
  return { severity: 'info', tags: ['material-information'] };
}

function normalizeMaterialEvents(rows) {
  return rows.map((row, index) => {
    const subject = cleanText(row['主旨 '] ?? row['主旨']);
    const description = cleanText(row['說明']);
    const risk = eventRisk(subject, description);
    const disclosureDate = rocCompactToIso(row['發言日期']);
    const time = normalizeClock(row['發言時間']);
    return {
      id: `${disclosureDate || 'unknown'}:${cleanText(row['公司代號'])}:${cleanText(row['發言時間']) || index}`,
      publishedAt: rocCompactToIso(row['出表日期']),
      disclosureDate,
      time,
      symbol: cleanText(row['公司代號']),
      name: cleanText(row['公司名稱']),
      subject,
      clause: cleanText(row['符合條款']),
      eventDate: rocCompactToIso(row['事實發生日']),
      description,
      severity: risk.severity,
      tags: risk.tags,
    };
  }).filter(row => row.symbol && row.disclosureDate)
    .sort((a, b) => `${b.disclosureDate}T${b.time || ''}`.localeCompare(`${a.disclosureDate}T${a.time || ''}`));
}

function normalizeExRights(rows) {
  return rows.map(row => ({
    date: rocCompactToIso(row.Date),
    symbol: cleanText(row.Code),
    name: cleanText(row.Name),
    type: cleanText(row.Exdividend),
    stockDividendRatio: toNumber(row.StockDividendRatio),
    subscriptionRatio: toNumber(row.SubscriptionRatio),
    subscriptionPricePerShare: toNumber(row.SubscriptionPricePerShare),
    cashDividend: toNumber(row.CashDividend),
    sharesOffered: toNumber(row.SharesOffered),
    employeeShares: toNumber(row.SharesEmpOwner),
    shareholderShares: toNumber(row.SharesholderOwner),
    stockHoldingRatio: toNumber(row.StockHoldingRatio),
  })).filter(row => row.symbol && row.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

const NORMALIZERS = Object.freeze({
  stockDay: normalizeStockDay,
  marketIndex: normalizeMarketIndex,
  taiexTotalReturn: normalizeTaiexTotalReturn,
  valuation: normalizeValuation,
  revenue: normalizeRevenue,
  materialEvents: normalizeMaterialEvents,
  exRights: normalizeExRights,
});

const DATE_FIELDS = Object.freeze({
  stockDay: ['date'],
  marketIndex: ['date'],
  taiexTotalReturn: ['date'],
  valuation: ['date'],
  revenue: ['publishedAt', 'dataMonth'],
  materialEvents: ['publishedAt', 'disclosureDate'],
  exRights: ['date'],
});

function hashPayload(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function assertDatasetKey(dataset) {
  if (!ENDPOINTS[dataset]) throw new Error(`unknown TWSE OpenAPI dataset: ${dataset}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function responseSnippet(body) {
  const compact = String(body || '').replace(/\s+/g, ' ').trim();
  return compact.slice(0, 160) || '(empty body)';
}

function isJsonContentType(contentType) {
  return /application\/(?:[\w.+-]+\+)?json\b/i.test(String(contentType || ''));
}

async function fetchRaw(dataset, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  sleepImpl = sleep,
} = {}) {
  assertDatasetKey(dataset);
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const sourceUrl = `${BASE_URL}${ENDPOINTS[dataset]}`;
  const attempts = Math.max(1, Number.parseInt(maxAttempts, 10) || DEFAULT_MAX_ATTEMPTS);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(sourceUrl, {
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
          'User-Agent': 'Mozilla/5.0 (compatible; STOCK-dashboard/1.2; +https://github.com/s0914712/STOCK)',
        },
        signal: controller.signal,
      });
      const contentType = response.headers?.get?.('content-type') || '';
      const body = await response.text();
      const context = `HTTP ${response.status}; content-type=${contentType || 'missing'}; body=${responseSnippet(body)}`;

      if (!response.ok) throw new Error(`${dataset}: request failed (${context})`);
      if (!isJsonContentType(contentType)) {
        throw new Error(`${dataset}: expected application/json (${context})`);
      }

      let raw;
      try {
        raw = JSON.parse(body);
      } catch (error) {
        throw new Error(`${dataset}: invalid JSON (${context})`);
      }
      if (!Array.isArray(raw)) throw new Error(`${dataset}: expected a JSON array (${context})`);
      return { raw, sourceUrl, attempts: attempt };
    } catch (error) {
      lastError = error && error.name === 'AbortError'
        ? new Error(`${dataset}: request timed out after ${timeoutMs}ms`)
        : error;
    } finally {
      clearTimeout(timer);
    }

    if (attempt < attempts) {
      const delayMs = Math.max(0, retryDelayMs) * (2 ** (attempt - 1));
      await sleepImpl(delayMs);
    }
  }

  throw new Error(`${dataset}: failed after ${attempts} attempt(s): ${lastError?.message || 'unknown error'}`);
}

async function fetchDataset(dataset, {
  force = false,
  fetchImpl = globalThis.fetch,
  ttlMs = DEFAULT_TTL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  sleepImpl = sleep,
} = {}) {
  assertDatasetKey(dataset);
  const cached = memoryCache.get(dataset);
  if (!force && cached && Date.now() - cached.cachedAt < ttlMs) return cached.envelope;

  const { raw, sourceUrl } = await fetchRaw(dataset, {
    fetchImpl,
    timeoutMs,
    maxAttempts,
    retryDelayMs,
    sleepImpl,
  });
  const data = NORMALIZERS[dataset](raw);
  const fetchedAt = new Date().toISOString();
  const envelope = {
    dataset,
    source: 'TWSE OpenAPI v1',
    sourceUrl,
    fetchedAt,
    asOf: maxDate(data, DATE_FIELDS[dataset]),
    count: data.length,
    contentHash: hashPayload(raw),
    stale: false,
    data,
  };
  memoryCache.set(dataset, { cachedAt: Date.now(), envelope });
  return envelope;
}

function readLatestSnapshot(snapshotPath = SNAPSHOT_PATH) {
  if (!fs.existsSync(snapshotPath)) return null;
  try {
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    return snapshot && snapshot.schemaVersion === 1 ? snapshot : null;
  } catch {
    return null;
  }
}

async function getDataset(dataset, options = {}) {
  try {
    return await fetchDataset(dataset, options);
  } catch (error) {
    const snapshot = readLatestSnapshot(options.snapshotPath || SNAPSHOT_PATH);
    const saved = snapshot?.datasets?.[dataset];
    if (!saved) throw error;
    const source = String(saved.source || 'TWSE OpenAPI v1').replace(/ \(snapshot fallback\).*$/, '');
    return {
      ...saved,
      source: `${source} (snapshot fallback)`,
      stale: true,
      fallbackReason: error.message,
    };
  }
}

async function fetchAllDatasets({
  concurrency = 1,
  allowSnapshotFallback = false,
  ...options
} = {}) {
  const limit = Math.min(DATASET_KEYS.length, Math.max(1, Number.parseInt(concurrency, 10) || 1));
  const entries = new Array(DATASET_KEYS.length);
  let cursor = 0;

  async function worker() {
    while (cursor < DATASET_KEYS.length) {
      const index = cursor;
      cursor += 1;
      const dataset = DATASET_KEYS[index];
      const envelope = allowSnapshotFallback
        ? await getDataset(dataset, options)
        : await fetchDataset(dataset, options);
      entries[index] = [dataset, envelope];
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return Object.fromEntries(entries);
}

function filterBySymbols(rows, symbols) {
  if (!symbols || !symbols.length) return rows;
  const wanted = new Set(symbols.map(symbol => String(symbol).toUpperCase()));
  return rows.filter(row => wanted.has(String(row.symbol || '').toUpperCase()));
}

function briefMaterialEvent(row) {
  const { description, ...brief } = row;
  return brief;
}

function buildAlerts({ materialEvents = [], exRights = [] }, { symbols = [], fromDate = null } = {}) {
  const filteredEvents = filterBySymbols(materialEvents, symbols)
    .filter(row => !fromDate || row.disclosureDate >= fromDate)
    .map(row => ({
      id: row.id,
      type: 'material-information',
      date: row.disclosureDate,
      symbol: row.symbol,
      name: row.name,
      title: row.subject,
      severity: row.severity,
      tags: row.tags,
    }));
  const filteredActions = filterBySymbols(exRights, symbols)
    .filter(row => !fromDate || row.date >= fromDate)
    .map(row => ({
      id: `${row.date}:${row.symbol}:ex-rights`,
      type: 'corporate-action',
      date: row.date,
      symbol: row.symbol,
      name: row.name,
      title: `${row.type || '除權息'}${Number.isFinite(row.cashDividend) ? `，現金股利 ${row.cashDividend}` : ''}`,
      severity: 'info',
      tags: ['ex-rights'],
    }));
  return [...filteredEvents, ...filteredActions]
    .sort((a, b) => b.date.localeCompare(a.date));
}

function clearMemoryCache() {
  memoryCache.clear();
}

module.exports = {
  BASE_URL,
  DATASET_KEYS,
  ENDPOINTS,
  SNAPSHOT_PATH,
  briefMaterialEvent,
  buildAlerts,
  clearMemoryCache,
  fetchAllDatasets,
  fetchDataset,
  filterBySymbols,
  getDataset,
  normalizeExRights,
  normalizeMarketIndex,
  normalizeMaterialEvents,
  normalizeClock,
  normalizeRevenue,
  normalizeStockDay,
  normalizeTaiexTotalReturn,
  normalizeValuation,
  readLatestSnapshot,
  rocCompactToIso,
  rocMonthToIso,
  toNumber,
};

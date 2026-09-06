'use strict';

const { scoreSignals } = require('../fearGreedIndex');

const TWSE_OPENAPI_BASE_URL = process.env.TWSE_OPENAPI_BASE_URL || 'https://openapi.twse.com.tw/v1';
const TWSE_BASE_URL = process.env.TWSE_BASE_URL || 'https://www.twse.com.tw';
const TAIFEX_BASE_URL = process.env.TAIFEX_BASE_URL || 'https://www.taifex.com.tw';
const FSC_BASE_URL = process.env.FSC_BASE_URL || 'https://stat.fsc.gov.tw';
const DEFAULT_TIMEOUT_MS = Number(process.env.FEAR_GREED_TIMEOUT_MS || 25000);
const DEFAULT_ATTEMPTS = Number(process.env.FEAR_GREED_MAX_ATTEMPTS || 3);

const SOURCE_URLS = Object.freeze({
  stockDay: `${TWSE_OPENAPI_BASE_URL}/exchangeReport/STOCK_DAY_ALL`,
  marginDetail: `${TWSE_OPENAPI_BASE_URL}/exchangeReport/MI_MARGN`,
  marginSummary: `${TWSE_BASE_URL}/exchangeReport/MI_MARGN`,
  taiexHistory: `${TWSE_BASE_URL}/exchangeReport/FMTQIK`,
  putCall: `${TAIFEX_BASE_URL}/enl/eng3/pcRatio`,
  fx: `${TAIFEX_BASE_URL}/enl/eng3/dailyFXRate`,
  foreignFutures: `${TAIFEX_BASE_URL}/enl/eng3/futContractsDate`,
  vixDaily: `${TAIFEX_BASE_URL}/file/taifex/Dailydownload/vix/log2data_eng`,
  activeAccounts: `${FSC_BASE_URL}/api/v1/public/datasets/103545/data`,
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchResponse(url, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  attempts = DEFAULT_ATTEMPTS,
  sleepImpl = sleep,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  let lastError;
  const maxAttempts = Math.max(1, Number.parseInt(attempts, 10) || 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/json,text/html,text/plain,*/*',
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
          'User-Agent': 'Mozilla/5.0 (compatible; STOCK-dashboard-fear-greed/0.1; +https://github.com/s0914712/STOCK)',
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error?.name === 'AbortError'
        ? new Error(`request timed out after ${timeoutMs}ms`)
        : error;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < maxAttempts) await sleepImpl(500 * (2 ** (attempt - 1)));
  }
  throw new Error(`${url}: ${lastError?.message || 'request failed'}`);
}

async function fetchJson(url, options) {
  const response = await fetchResponse(url, options);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${url}: invalid JSON (${text.replace(/\s+/g, ' ').slice(0, 120) || 'empty body'})`);
  }
}

async function fetchText(url, options) {
  const response = await fetchResponse(url, options);
  return response.text();
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHtmlRows(html) {
  const rows = [];
  for (const rowMatch of String(html || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(match => decodeHtml(match[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function toNumber(value) {
  const cleaned = String(value ?? '').replaceAll(',', '').replace('%', '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '--') return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function isoDate(value) {
  const text = String(value || '').trim();
  let match = /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/.exec(text);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  match = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = /^(\d{3})[\/-]?(\d{2})[\/-]?(\d{2})$/.exec(text.replace(/\s/g, ''));
  if (match) return `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
  return null;
}

function latestOnOrBefore(rows, tradingDate) {
  return (rows || [])
    .filter(row => row.date && (!tradingDate || row.date <= tradingDate))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1) || null;
}

function parsePutCallHtml(html) {
  return extractHtmlRows(html).map(cells => ({
    date: isoDate(cells[0]),
    putVolume: toNumber(cells[1]),
    callVolume: toNumber(cells[2]),
    volumeRatioPercent: toNumber(cells[3]),
    putOpenInterest: toNumber(cells[4]),
    callOpenInterest: toNumber(cells[5]),
    openInterestRatioPercent: toNumber(cells[6]),
  })).filter(row => row.date && Number.isFinite(row.openInterestRatioPercent));
}

function parseFxHtml(html) {
  return extractHtmlRows(html).map(cells => ({
    date: isoDate(cells[0]),
    usdTwd: toNumber(cells[1]),
  })).filter(row => row.date && Number.isFinite(row.usdTwd));
}

function parseVixDailyText(text) {
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = /^\s*(\d{8})\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s*$/.exec(line);
    if (!match) continue;
    rows.push({
      date: isoDate(match[1]),
      close: toNumber(match[3]),
      lastMinuteAverage: toNumber(match[4]),
    });
  }
  return rows;
}

function parseForeignFuturesHtml(html) {
  const dateMatch = /Date\s*:\s*(\d{4}\/\d{1,2}\/\d{1,2})/i.exec(decodeHtml(html));
  const rows = extractHtmlRows(html);
  let inTaiexFutures = false;

  for (const cells of rows) {
    if (cells.length >= 15 && cells[1] === 'TX') inTaiexFutures = true;
    if (inTaiexFutures && cells[0] === 'FINI' && cells.length >= 13) {
      return {
        date: isoDate(dateMatch?.[1]),
        longOpenInterest: toNumber(cells[7]),
        shortOpenInterest: toNumber(cells[9]),
        netOpenInterest: toNumber(cells[11]),
      };
    }
    if (inTaiexFutures && cells.length >= 15 && cells[1] && cells[1] !== 'TX') break;
  }
  return null;
}

function parseMarginSummary(payload) {
  const table = payload?.tables?.find(item => Array.isArray(item?.data) && item.data.some(row => row[0] === '融資金額(仟元)'));
  if (!table) return null;
  const financing = table.data.find(row => row[0] === '融資(交易單位)');
  const short = table.data.find(row => row[0] === '融券(交易單位)');
  const amount = table.data.find(row => row[0] === '融資金額(仟元)');
  return {
    date: isoDate(payload.date),
    marginBalanceUnits: toNumber(financing?.[5]),
    shortBalanceUnits: toNumber(short?.[5]),
    marginAmountThousand: toNumber(amount?.[5]),
  };
}

function parseActiveAccounts(payload) {
  const rows = (payload?.data || []).map(row => ({
    month: String(row['年月'] || ''),
    publishedAt: isoDate(row['公告日期']),
    traders: toNumber(row['交易人數']),
  })).filter(row => /^\d{6}$/.test(row.month) && Number.isFinite(row.traders))
    .sort((a, b) => a.month.localeCompare(b.month));
  if (rows.length < 2) return null;
  const latest = rows.at(-1);
  const previous = rows.at(-2);
  return {
    date: `${latest.month.slice(0, 4)}-${latest.month.slice(4)}-01`,
    publishedAt: latest.publishedAt,
    traders: latest.traders,
    previousTraders: previous.traders,
    monthOverMonthPercent: ((latest.traders / previous.traders) - 1) * 100,
  };
}

function normalizeStockRows(rows) {
  return (rows || []).map(row => ({
    date: isoDate(row.Date),
    symbol: String(row.Code || '').trim(),
    close: toNumber(row.ClosingPrice),
    change: toNumber(row.Change),
  })).filter(row => row.date && row.symbol);
}

function normalizeMarginRows(rows) {
  return (rows || []).map(row => ({
    symbol: String(row['股票代號'] || '').trim(),
    marginBalanceUnits: toNumber(row['融資今日餘額']),
    shortBalanceUnits: toNumber(row['融券今日餘額']),
  })).filter(row => row.symbol);
}

function deriveBreadth(stockRows) {
  const commonStocks = (stockRows || []).filter(row => /^[1-9]\d{3}$/.test(row.symbol) && Number.isFinite(row.change));
  const advancing = commonStocks.filter(row => row.change > 0).length;
  const declining = commonStocks.filter(row => row.change < 0).length;
  const unchanged = commonStocks.filter(row => row.change === 0).length;
  const compared = advancing + declining;
  return {
    advancing,
    declining,
    unchanged,
    universe: commonStocks.length,
    advanceSharePercent: compared ? (advancing / compared) * 100 : null,
  };
}

function deriveMarginSignals(stockRows, marginRows, summary) {
  const closeBySymbol = new Map((stockRows || []).map(row => [row.symbol, row.close]));
  let financedMarketValueThousand = 0;
  let pricedPositions = 0;
  for (const row of marginRows || []) {
    const close = closeBySymbol.get(row.symbol);
    if (!Number.isFinite(close) || !Number.isFinite(row.marginBalanceUnits)) continue;
    // MI_MARGN balance is reported in trading units; close × units is NT$ thousand.
    financedMarketValueThousand += close * row.marginBalanceUnits;
    pricedPositions += 1;
  }
  const maintenanceProxyPercent = Number.isFinite(summary?.marginAmountThousand) && summary.marginAmountThousand > 0
    ? (financedMarketValueThousand / summary.marginAmountThousand) * 100
    : null;
  const shortToMarginPercent = Number.isFinite(summary?.marginBalanceUnits) && summary.marginBalanceUnits > 0
    ? (summary.shortBalanceUnits / summary.marginBalanceUnits) * 100
    : null;
  return { financedMarketValueThousand, pricedPositions, maintenanceProxyPercent, shortToMarginPercent };
}

function parseTaiexHistory(payload) {
  const table = Array.isArray(payload?.tables)
    ? payload.tables.find(item => Array.isArray(item?.data) && item.data.some(row => isoDate(row[0])))
    : null;
  const data = payload?.data || table?.data || [];
  return data.map(row => ({
    date: isoDate(row[0]),
    close: toNumber(row[4]),
  })).filter(row => row.date && Number.isFinite(row.close));
}

function deriveMomentum(rows, periods = 20) {
  const unique = new Map((rows || []).map(row => [row.date, row]));
  const sorted = [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length <= periods) return null;
  const latest = sorted.at(-1);
  const base = sorted.at(-(periods + 1));
  return {
    date: latest.date,
    close: latest.close,
    baseDate: base.date,
    baseClose: base.close,
    returnPercent: ((latest.close / base.close) - 1) * 100,
  };
}

function monthKeysAround(iso, count = 2) {
  const [year, month] = iso.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}01`;
  }).reverse();
}

function signalOk(key, value, asOf, source, extra = {}) {
  return { key, status: Number.isFinite(value) ? 'ok' : 'unavailable', value, asOf, source, ...extra };
}

function signalUnavailable(key, source, reason) {
  return { key, status: 'unavailable', value: null, asOf: null, source, error: String(reason || 'source unavailable').slice(0, 300) };
}

function settledValue(result) {
  if (result?.status === 'fulfilled') return result.value;
  throw result?.reason || new Error('source unavailable');
}

async function collectDailySignals({ fetchImpl = globalThis.fetch, generatedAt = new Date().toISOString() } = {}) {
  const requestOptions = { fetchImpl };
  const stockRaw = await fetchJson(SOURCE_URLS.stockDay, requestOptions);
  const stockRows = normalizeStockRows(stockRaw);
  const tradingDate = stockRows.map(row => row.date).sort().at(-1);
  if (!tradingDate) throw new Error('TWSE STOCK_DAY_ALL did not provide a trading date');

  const monthKeys = monthKeysAround(tradingDate, 2);
  const vixMonths = monthKeysAround(tradingDate, 2).map(key => key.slice(0, 6));
  const dateCompact = tradingDate.replaceAll('-', '');

  const [marginDetailResult, marginSummaryResult, putCallResult, fxResult, futuresResult, accountsResult, taiexResult, vixResult] = await Promise.allSettled([
    fetchJson(SOURCE_URLS.marginDetail, requestOptions),
    fetchJson(`${SOURCE_URLS.marginSummary}?response=json&date=${dateCompact}&selectType=MS`, requestOptions),
    fetchText(SOURCE_URLS.putCall, requestOptions),
    fetchText(SOURCE_URLS.fx, requestOptions),
    fetchText(SOURCE_URLS.foreignFutures, requestOptions),
    fetchJson(SOURCE_URLS.activeAccounts, requestOptions),
    Promise.all(monthKeys.map(key => fetchJson(`${SOURCE_URLS.taiexHistory}?response=json&date=${key}`, requestOptions))),
    Promise.all(vixMonths.map(month => fetchText(`${SOURCE_URLS.vixDaily}/${month}new.txt`, requestOptions))),
  ]);

  const signals = [];

  try {
    const rows = settledValue(vixResult).flatMap(parseVixDailyText);
    const latest = latestOnOrBefore(rows, tradingDate);
    signals.push(signalOk('optionVolatility', latest?.lastMinuteAverage, latest?.date, 'TAIFEX', {
      frequency: 'daily', sourceUrl: `${SOURCE_URLS.vixDaily}/${tradingDate.slice(0, 7).replace('-', '')}new.txt`,
      components: latest,
    }));
  } catch (error) { signals.push(signalUnavailable('optionVolatility', 'TAIFEX', error.message)); }

  try {
    const latest = latestOnOrBefore(parsePutCallHtml(settledValue(putCallResult)), tradingDate);
    signals.push(signalOk('putCallRatio', latest?.openInterestRatioPercent, latest?.date, 'TAIFEX', {
      frequency: 'daily', sourceUrl: SOURCE_URLS.putCall, components: latest,
    }));
  } catch (error) { signals.push(signalUnavailable('putCallRatio', 'TAIFEX', error.message)); }

  try {
    const rows = parseFxHtml(settledValue(fxResult)).filter(row => row.date <= tradingDate).sort((a, b) => a.date.localeCompare(b.date));
    const latest = rows.at(-1);
    const base = rows.length >= 21 ? rows.at(-21) : null;
    const change = latest && base ? ((latest.usdTwd / base.usdTwd) - 1) * 100 : null;
    signals.push(signalOk('usdTwd', change, latest?.date, 'TAIFEX', {
      frequency: 'daily', sourceUrl: SOURCE_URLS.fx,
      components: latest && base ? { usdTwd: latest.usdTwd, baseDate: base.date, baseUsdTwd: base.usdTwd } : { observations: rows.length },
    }));
  } catch (error) { signals.push(signalUnavailable('usdTwd', 'TAIFEX', error.message)); }

  let marginSummary = null;
  let marginDerived = null;
  try {
    const marginRows = normalizeMarginRows(settledValue(marginDetailResult));
    marginSummary = parseMarginSummary(settledValue(marginSummaryResult));
    marginDerived = deriveMarginSignals(stockRows, marginRows, marginSummary);
    signals.push(signalOk('marginMaintenance', marginDerived.maintenanceProxyPercent, marginSummary?.date, 'TWSE (derived)', {
      frequency: 'daily', sourceUrl: SOURCE_URLS.marginSummary,
      method: 'sum(margin balance trading units × close) / total margin financing amount × 100',
      components: {
        financedMarketValueThousand: Number(marginDerived.financedMarketValueThousand.toFixed(2)),
        marginAmountThousand: marginSummary?.marginAmountThousand,
        pricedPositions: marginDerived.pricedPositions,
      },
    }));
  } catch (error) { signals.push(signalUnavailable('marginMaintenance', 'TWSE (derived)', error.message)); }

  try {
    const position = parseForeignFuturesHtml(settledValue(futuresResult));
    signals.push(signalOk('foreignFutures', position?.netOpenInterest, position?.date, 'TAIFEX', {
      frequency: 'daily', sourceUrl: SOURCE_URLS.foreignFutures, components: position,
    }));
  } catch (error) { signals.push(signalUnavailable('foreignFutures', 'TAIFEX', error.message)); }

  const breadth = deriveBreadth(stockRows.filter(row => row.date === tradingDate));
  signals.push(signalOk('marketBreadth', breadth.advanceSharePercent, tradingDate, 'TWSE OpenAPI', {
    frequency: 'daily', sourceUrl: SOURCE_URLS.stockDay, components: breadth,
  }));

  if (marginDerived && marginSummary) {
    signals.push(signalOk('marginShortRatio', marginDerived.shortToMarginPercent, marginSummary.date, 'TWSE', {
      frequency: 'daily', sourceUrl: SOURCE_URLS.marginSummary,
      method: 'short balance trading units / margin balance trading units × 100',
      components: {
        shortBalanceUnits: marginSummary.shortBalanceUnits,
        marginBalanceUnits: marginSummary.marginBalanceUnits,
      },
    }));
  } else {
    signals.push(signalUnavailable('marginShortRatio', 'TWSE', 'margin summary unavailable'));
  }

  try {
    const history = settledValue(taiexResult).flatMap(parseTaiexHistory);
    const momentum = deriveMomentum(history, 20);
    signals.push(signalOk('indexMomentum', momentum?.returnPercent, momentum?.date, 'TWSE', {
      frequency: 'daily', sourceUrl: SOURCE_URLS.taiexHistory, components: momentum,
    }));
  } catch (error) { signals.push(signalUnavailable('indexMomentum', 'TWSE', error.message)); }

  try {
    const accounts = parseActiveAccounts(settledValue(accountsResult));
    signals.push(signalOk('activeAccounts', accounts?.monthOverMonthPercent, accounts?.date, 'FSC', {
      frequency: 'monthly', publishedAt: accounts?.publishedAt, sourceUrl: SOURCE_URLS.activeAccounts, components: accounts,
    }));
  } catch (error) { signals.push(signalUnavailable('activeAccounts', 'FSC', error.message)); }

  const scored = scoreSignals(signals);
  return {
    schemaVersion: 1,
    generatedAt,
    tradingDate,
    ...scored,
    methodology: {
      weighting: 'equal weight across all nine signals',
      missingData: 'no composite score is published unless all nine signals are available',
      normalization: 'fixed transparent v0.1 fear/greed anchors; each component is clipped to 0-100',
      purpose: 'descriptive market sentiment indicator; not a forecast or investment advice',
    },
  };
}

module.exports = {
  SOURCE_URLS,
  collectDailySignals,
  decodeHtml,
  deriveBreadth,
  deriveMarginSignals,
  deriveMomentum,
  extractHtmlRows,
  fetchJson,
  fetchResponse,
  fetchText,
  isoDate,
  monthKeysAround,
  normalizeMarginRows,
  normalizeStockRows,
  parseActiveAccounts,
  parseForeignFuturesHtml,
  parseFxHtml,
  parseMarginSummary,
  parsePutCallHtml,
  parseTaiexHistory,
  parseVixDailyText,
  toNumber,
};

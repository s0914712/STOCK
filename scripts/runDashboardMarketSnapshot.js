#!/usr/bin/env node

/**
 * Fetch all seven official TWSE OpenAPI datasets in one daily pass.
 *
 * Outputs:
 *   data/dashboard/market_latest.json       complete normalized latest snapshot
 *   data/dashboard/openapi_forward.jsonl    compact append-only point-in-time ledger
 *   data/dashboard/sector_representatives_latest.json  one liquid representative per sector
 */

const fs = require('fs');
const path = require('path');
const { DEFAULT_SECTORS } = require('../sectorRadar');
const { DATASET_KEYS, fetchAllDatasets } = require('./twseOpenApi');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'dashboard');
const LATEST_PATH = path.join(OUT_DIR, 'market_latest.json');
const FORWARD_PATH = path.join(OUT_DIR, 'openapi_forward.jsonl');
const REPRESENTATIVES_PATH = path.join(OUT_DIR, 'sector_representatives_latest.json');
const UNIVERSE = [...new Set([...Object.values(DEFAULT_SECTORS).flat(), '0050'])];

function bySymbol(rows) {
  return new Map((rows || []).map(row => [row.symbol, row]));
}

function latestOnOrBefore(rows, date, field = 'date') {
  return (rows || [])
    .filter(row => row[field] && (!date || row[field] <= date))
    .slice()
    .sort((a, b) => a[field].localeCompare(b[field]))
    .at(-1) || null;
}

function taipeiParts(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: get('weekday'),
  };
}

function detectTradingDateLag(snapshot, {
  generatedAt = snapshot?.generatedAt,
  expectedTradingDate = process.env.TWSE_EXPECTED_TRADING_DATE || null,
  skipGuard = process.env.TWSE_SKIP_TRADING_DATE_GUARD === '1',
  guardHour = Number(process.env.TWSE_TRADING_DATE_GUARD_HOUR || 16),
  guardMinute = Number(process.env.TWSE_TRADING_DATE_GUARD_MINUTE || 30),
} = {}) {
  const stockDayAsOf = snapshot?.datasets?.stockDay?.asOf || null;
  if (skipGuard || !stockDayAsOf) {
    return { lagged: false, expectedTradingDate: expectedTradingDate || null, stockDayAsOf, reason: skipGuard ? 'guard-bypassed' : 'no-stock-date' };
  }

  let expected = expectedTradingDate;
  let reason = expected ? 'explicit-expected-date' : 'automatic-weekday-cutoff';
  if (!expected) {
    const local = taipeiParts(generatedAt);
    if (!local) return { lagged: false, expectedTradingDate: null, stockDayAsOf, reason: 'invalid-generated-at' };
    const weekday = !['Sat', 'Sun'].includes(local.weekday);
    const afterCutoff = local.hour > guardHour || (local.hour === guardHour && local.minute >= guardMinute);
    if (!weekday || !afterCutoff) {
      return { lagged: false, expectedTradingDate: null, stockDayAsOf, reason: weekday ? 'before-cutoff' : 'weekend' };
    }
    expected = local.date;
  }

  const lagged = stockDayAsOf < expected;
  return {
    lagged,
    expectedTradingDate: expected,
    stockDayAsOf,
    reason: lagged ? `${reason}: stockDay ${stockDayAsOf} < expected ${expected}` : `${reason}: date satisfied`,
  };
}

function buildForwardRecord(snapshot, universe = UNIVERSE) {
  const datasets = snapshot.datasets;
  const staleKeys = DATASET_KEYS.filter(key => datasets[key]?.stale);
  if (staleKeys.length) {
    throw new Error(`refusing to build forward OOS record from stale datasets: ${staleKeys.join(', ')}`);
  }
  if (snapshot.freshness?.tradingDateLag) {
    throw new Error(`refusing to build forward OOS record from lagged trading date: ${snapshot.freshness.stockDayAsOf} < ${snapshot.freshness.expectedTradingDate}`);
  }
  const tradingDate = datasets.stockDay?.asOf;
  if (!tradingDate) throw new Error('STOCK_DAY_ALL did not provide a trading date');

  const prices = bySymbol(datasets.stockDay.data);
  const valuations = bySymbol(datasets.valuation.data);
  const revenues = bySymbol(datasets.revenue.data);
  const events = datasets.materialEvents.data || [];
  const actions = datasets.exRights.data || [];
  const missing = universe.filter(symbol => !prices.has(symbol));
  if (missing.length) throw new Error(`daily forward snapshot missing universe symbols: ${missing.join(', ')}`);

  const stocks = {};
  for (const symbol of universe) {
    const price = prices.get(symbol);
    const valuation = valuations.get(symbol) || null;
    const revenue = revenues.get(symbol) || null;
    const symbolEvents = events
      .filter(row => row.symbol === symbol && row.disclosureDate <= tradingDate)
      .slice(0, 3)
      .map(row => ({
        id: row.id,
        date: row.disclosureDate,
        subject: row.subject,
        severity: row.severity,
      }));
    const nextAction = actions.find(row => row.symbol === symbol && row.date >= tradingDate) || null;

    stocks[symbol] = {
      name: price.name,
      close: price.close,
      change: price.change,
      volume: price.volume,
      tradeValue: price.tradeValue,
      valuation: valuation ? {
        pe: valuation.pe,
        pb: valuation.pb,
        dividendYield: valuation.dividendYield,
        asOf: valuation.date,
      } : null,
      revenue: revenue ? {
        dataMonth: revenue.dataMonth,
        momPercent: revenue.momPercent,
        yoyPercent: revenue.yoyPercent,
        ytdPercent: revenue.ytdPercent,
        publishedAt: revenue.publishedAt,
      } : null,
      recentMaterialEvents: symbolEvents,
      nextCorporateAction: nextAction ? {
        date: nextAction.date,
        type: nextAction.type,
        cashDividend: nextAction.cashDividend,
        stockDividendRatio: nextAction.stockDividendRatio,
      } : null,
    };
  }

  const taiex = datasets.marketIndex.data.find(row => row.indexName === '發行量加權股價指數') || null;
  const totalReturn = latestOnOrBefore(datasets.taiexTotalReturn.data, tradingDate);

  return {
    id: `${tradingDate}:twse-openapi-v1`,
    tradingDate,
    recordedAt: snapshot.generatedAt,
    modelInputStatus: 'point-in-time-official-snapshot',
    market: {
      taiexClose: taiex?.close ?? null,
      taiexChangePercent: taiex?.changePercent ?? null,
      taiexTotalReturnIndex: totalReturn?.index ?? null,
      taiexTotalReturnDate: totalReturn?.date ?? null,
    },
    stocks,
    provenance: Object.fromEntries(DATASET_KEYS.map(key => [key, {
      asOf: datasets[key].asOf,
      contentHash: datasets[key].contentHash,
    }])),
  };
}

function buildSectorRepresentatives(snapshot, sectors = DEFAULT_SECTORS) {
  const stockDay = snapshot?.datasets?.stockDay;
  if (!stockDay?.asOf || stockDay.stale) {
    throw new Error('refusing to select sector representatives without a fresh STOCK_DAY_ALL snapshot');
  }
  if (snapshot.freshness?.tradingDateLag) {
    throw new Error('refusing to select sector representatives from lagged STOCK_DAY_ALL data');
  }
  const prices = bySymbol((stockDay.data || []).filter(row => row.date === stockDay.asOf));
  const rows = Object.entries(sectors).map(([sector, symbols]) => {
    const candidates = symbols
      .map(symbol => prices.get(symbol))
      .filter(row => row && Number.isFinite(row.tradeValue))
      .sort((a, b) => b.tradeValue - a.tradeValue || a.symbol.localeCompare(b.symbol));
    if (candidates.length !== symbols.length) {
      const found = new Set(candidates.map(row => row.symbol));
      const missing = symbols.filter(symbol => !found.has(symbol));
      throw new Error(`sector representative inputs missing for ${sector}: ${missing.join(', ')}`);
    }
    const selected = candidates[0];
    return {
      sector,
      symbol: selected.symbol,
      name: selected.name || selected.symbol,
      close: selected.close,
      tradeValue: selected.tradeValue,
      anchorCount: symbols.length,
    };
  });
  return {
    schemaVersion: 1,
    generatedAt: snapshot.generatedAt,
    asOf: stockDay.asOf,
    source: 'TWSE OpenAPI v1 STOCK_DAY_ALL',
    method: 'highest same-day trade value among curated sector anchors; ties resolved by stock symbol ascending',
    sectors: rows,
  };
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function appendForwardRecord(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath)) {
    const exists = fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .some(line => {
        try { return JSON.parse(line).id === record.id; } catch { return false; }
      });
    if (exists) return false;
  }
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  return true;
}

function buildSnapshot(datasets, generatedAt = new Date().toISOString(), freshnessOptions = {}) {
  const staleDatasets = DATASET_KEYS.filter(key => datasets[key]?.stale);
  const snapshot = {
    schemaVersion: 1,
    generatedAt,
    source: 'TWSE OpenAPI v1',
    baseUrl: 'https://openapi.twse.com.tw/v1',
    freshness: {
      complete: staleDatasets.length === 0,
      liveDatasets: DATASET_KEYS.filter(key => !staleDatasets.includes(key)),
      staleDatasets,
      tradingDateLag: false,
      expectedTradingDate: null,
      stockDayAsOf: datasets.stockDay?.asOf ?? null,
      tradingDateGuardReason: null,
    },
    datasets,
  };
  const guard = detectTradingDateLag(snapshot, { generatedAt, ...freshnessOptions });
  snapshot.freshness.tradingDateLag = guard.lagged;
  snapshot.freshness.expectedTradingDate = guard.expectedTradingDate;
  snapshot.freshness.stockDayAsOf = guard.stockDayAsOf;
  snapshot.freshness.tradingDateGuardReason = guard.reason;
  if (guard.lagged) snapshot.freshness.complete = false;
  return snapshot;
}

function persistDailySnapshot(snapshot, {
  latestPath = LATEST_PATH,
  forwardPath = FORWARD_PATH,
  representativesPath = REPRESENTATIVES_PATH,
} = {}) {
  const staleDatasets = DATASET_KEYS.filter(key => snapshot.datasets[key]?.stale);
  if (staleDatasets.length === DATASET_KEYS.length) {
    return {
      wroteLatest: false,
      wroteRepresentatives: false,
      appendedForward: false,
      staleDatasets,
      reason: 'all-datasets-stale',
    };
  }

  const tradingDateLag = Boolean(snapshot.freshness?.tradingDateLag);
  const wroteRepresentatives = Boolean(snapshot.datasets.stockDay && !snapshot.datasets.stockDay.stale && !tradingDateLag);
  const representativeReport = wroteRepresentatives ? buildSectorRepresentatives(snapshot) : null;
  writeJsonAtomic(latestPath, snapshot);
  if (wroteRepresentatives) {
    writeJsonAtomic(representativesPath, representativeReport);
  }
  if (tradingDateLag) {
    return {
      wroteLatest: true,
      wroteRepresentatives: false,
      appendedForward: false,
      staleDatasets,
      expectedTradingDate: snapshot.freshness.expectedTradingDate,
      stockDayAsOf: snapshot.freshness.stockDayAsOf,
      reason: 'trading-date-lag',
    };
  }
  if (staleDatasets.length) {
    return {
      wroteLatest: true,
      wroteRepresentatives,
      appendedForward: false,
      staleDatasets,
      reason: 'partial-stale-snapshot',
    };
  }

  const forward = buildForwardRecord(snapshot);
  const appendedForward = appendForwardRecord(forwardPath, forward);
  return {
    wroteLatest: true,
    wroteRepresentatives,
    appendedForward,
    forwardId: forward.id,
    staleDatasets: [],
    reason: appendedForward ? 'fresh-forward-appended' : 'forward-already-recorded',
  };
}

async function main() {
  console.log('Fetching seven TWSE OpenAPI datasets...');
  const datasets = await fetchAllDatasets({
    force: true,
    concurrency: 1,
    allowSnapshotFallback: true,
  });
  const snapshot = buildSnapshot(datasets);
  const result = persistDailySnapshot(snapshot);

  if (result.wroteLatest) {
    console.log(`Wrote ${path.relative(ROOT, LATEST_PATH)} (${DATASET_KEYS.map(key => `${key}=${datasets[key].count}`).join(', ')})`);
  } else {
    console.warn(`All live requests failed; kept ${path.relative(ROOT, LATEST_PATH)} unchanged.`);
  }
  if (result.wroteRepresentatives) {
    console.log(`Wrote ${path.relative(ROOT, REPRESENTATIVES_PATH)} using same-day trade value.`);
  }

  if (result.reason === 'trading-date-lag') {
    console.warn(`Skipped forward OOS append: STOCK_DAY_ALL asOf=${result.stockDayAsOf}, expected=${result.expectedTradingDate}. Snapshot retained but marked incomplete.`);
  } else if (result.reason === 'partial-stale-snapshot') {
    console.warn(`Skipped forward OOS append because these datasets are stale: ${result.staleDatasets.join(', ')}`);
  } else if (result.reason === 'all-datasets-stale') {
    console.warn('Skipped forward OOS append because every dataset came from the stale snapshot fallback.');
  } else {
    console.log(`${result.appendedForward ? 'Appended' : 'Already had'} forward snapshot ${result.forwardId}`);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}

module.exports = {
  FORWARD_PATH,
  LATEST_PATH,
  REPRESENTATIVES_PATH,
  UNIVERSE,
  appendForwardRecord,
  buildSnapshot,
  buildForwardRecord,
  buildSectorRepresentatives,
  detectTradingDateLag,
  persistDailySnapshot,
  taipeiParts,
  writeJsonAtomic,
};

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MARKET_PATH = path.join(ROOT, 'data', 'dashboard', 'market_latest.json');
const OUT_PATH = path.join(ROOT, 'data', 'dashboard', 'real_estate_balance_sheet_latest.json');
const SOURCE_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap07_L_ci';

function text(v) { return String(v ?? '').trim(); }
function number(v) {
  const s = text(v).replaceAll(',', '').replace('%', '');
  if (!s || s === '-' || s === '--') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function pick(row, keys) {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null && text(row[key]) !== '') return row[key];
  return null;
}
function ratio(a, b) { return Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b : null; }
function round(v, d = 4) { if (!Number.isFinite(v)) return null; const p = 10 ** d; return Math.round(v * p) / p; }
function percentile(values, value, reverse = false) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!Number.isFinite(value) || xs.length < 2) return null;
  const below = xs.filter(x => x < value).length;
  const equal = xs.filter(x => x === value).length;
  const p = (below + 0.5 * equal) / xs.length;
  return reverse ? 1 - p : p;
}

async function fetchJson(url, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'STOCK-real-estate-balance-sheet/1.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (!Array.isArray(body)) throw new Error('expected JSON array');
      return body;
    } catch (error) {
      last = error;
      await new Promise(resolve => setTimeout(resolve, 750 * (i + 1)));
    }
  }
  throw last;
}

function normalizeBalance(row) {
  return {
    publishedAt: text(pick(row, ['出表日期'])),
    fiscalYear: text(pick(row, ['年度'])),
    quarter: text(pick(row, ['季別'])),
    symbol: text(pick(row, ['公司代號'])),
    name: text(pick(row, ['公司名稱'])),
    currentAssets: number(pick(row, ['流動資產'])),
    nonCurrentAssets: number(pick(row, ['非流動資產'])),
    totalAssets: number(pick(row, ['資產總計', '資產總額'])),
    currentLiabilities: number(pick(row, ['流動負債'])),
    nonCurrentLiabilities: number(pick(row, ['非流動負債'])),
    totalLiabilities: number(pick(row, ['負債總計', '負債總額'])),
    capitalStock: number(pick(row, ['股本'])),
    capitalSurplus: number(pick(row, ['資本公積'])),
    retainedEarnings: number(pick(row, ['保留盈餘'])),
    parentEquity: number(pick(row, ['歸屬於母公司業主之權益合計'])),
    totalEquity: number(pick(row, ['權益總計', '權益總額'])),
    bvps: number(pick(row, ['每股參考淨值'])),
  };
}

function interpretation(m) {
  const notes = [];
  if (Number.isFinite(m.currentRatio)) {
    if (m.currentRatio >= 1.5) notes.push('短期償債緩衝較厚');
    else if (m.currentRatio < 1) notes.push('流動負債高於流動資產，需追蹤資金調度');
    else notes.push('短期償債空間中性');
  }
  if (Number.isFinite(m.debtRatio)) {
    if (m.debtRatio >= 0.7) notes.push('整體槓桿偏高');
    else if (m.debtRatio <= 0.5) notes.push('負債比相對保守');
    else notes.push('負債比居中');
  }
  if (Number.isFinite(m.retainedToEquity)) {
    if (m.retainedToEquity >= 0.5) notes.push('權益中累積保留盈餘占比高');
    else if (m.retainedToEquity < 0.2) notes.push('權益較依賴股本/資本公積');
  }
  if (Number.isFinite(m.priceToBook)) {
    if (m.priceToBook < 1) notes.push('市價低於每股淨值，但不代表土地已按市價重估');
    else if (m.priceToBook > 2) notes.push('市價明顯高於帳面淨值，需用獲利/資產品質支持溢價');
  }
  return notes;
}

async function main() {
  if (!fs.existsSync(MARKET_PATH)) throw new Error('missing data/dashboard/market_latest.json');
  const market = JSON.parse(fs.readFileSync(MARKET_PATH, 'utf8'));
  const revenue = market?.datasets?.revenue?.data || [];
  const prices = new Map((market?.datasets?.stockDay?.data || []).map(r => [String(r.symbol), r]));
  const valuations = new Map((market?.datasets?.valuation?.data || []).map(r => [String(r.symbol), r]));
  const realEstateUniverse = new Map(
    revenue.filter(r => r.industry === '建材營造').map(r => [String(r.symbol), { name: r.name, industry: r.industry, revenue: r }])
  );

  const raw = await fetchJson(SOURCE_URL);
  const balanceRows = raw.map(normalizeBalance).filter(r => r.symbol && realEstateUniverse.has(r.symbol));
  const latestBySymbol = new Map();
  for (const row of balanceRows) {
    const key = `${String(row.fiscalYear).padStart(3, '0')}-${String(row.quarter).padStart(2, '0')}`;
    const old = latestBySymbol.get(row.symbol);
    if (!old || key > old._periodKey) latestBySymbol.set(row.symbol, { ...row, _periodKey: key });
  }

  const rows = [];
  for (const [symbol, meta] of realEstateUniverse.entries()) {
    const b = latestBySymbol.get(symbol);
    if (!b) continue;
    const p = prices.get(symbol) || null;
    const v = valuations.get(symbol) || null;
    const workingCapital = Number.isFinite(b.currentAssets) && Number.isFinite(b.currentLiabilities) ? b.currentAssets - b.currentLiabilities : null;
    const metrics = {
      currentRatio: ratio(b.currentAssets, b.currentLiabilities),
      debtRatio: ratio(b.totalLiabilities, b.totalAssets),
      equityRatio: ratio(b.totalEquity, b.totalAssets),
      workingCapitalToAssets: ratio(workingCapital, b.totalAssets),
      retainedToEquity: ratio(b.retainedEarnings, b.totalEquity),
      nonCurrentLiabilityShare: ratio(b.nonCurrentLiabilities, b.totalLiabilities),
      priceToBook: Number.isFinite(p?.close) && Number.isFinite(b.bvps) && b.bvps !== 0 ? p.close / b.bvps : null,
    };
    rows.push({
      symbol,
      name: b.name || meta.name,
      industry: '建材營造',
      fiscalYear: b.fiscalYear,
      quarter: b.quarter,
      publishedAt: b.publishedAt,
      priceAsOf: market?.datasets?.stockDay?.asOf || null,
      close: p?.close ?? null,
      valuation: { pe: v?.pe ?? null, pb: v?.pb ?? null, dividendYield: v?.dividendYield ?? null },
      revenue: { dataMonth: meta.revenue?.dataMonth ?? null, yoyPercent: meta.revenue?.yoyPercent ?? null, momPercent: meta.revenue?.momPercent ?? null },
      balanceSheet: {
        currentAssets: b.currentAssets, nonCurrentAssets: b.nonCurrentAssets, totalAssets: b.totalAssets,
        currentLiabilities: b.currentLiabilities, nonCurrentLiabilities: b.nonCurrentLiabilities, totalLiabilities: b.totalLiabilities,
        capitalStock: b.capitalStock, capitalSurplus: b.capitalSurplus, retainedEarnings: b.retainedEarnings,
        parentEquity: b.parentEquity, totalEquity: b.totalEquity, bvps: b.bvps, workingCapital,
      },
      metrics: Object.fromEntries(Object.entries(metrics).map(([k, val]) => [k, round(val)])),
    });
  }

  const currentRatios = rows.map(r => r.metrics.currentRatio);
  const debtRatios = rows.map(r => r.metrics.debtRatio);
  const equityRatios = rows.map(r => r.metrics.equityRatio);
  const working = rows.map(r => r.metrics.workingCapitalToAssets);
  const retained = rows.map(r => r.metrics.retainedToEquity);

  for (const row of rows) {
    const parts = [
      percentile(currentRatios, row.metrics.currentRatio),
      percentile(debtRatios, row.metrics.debtRatio, true),
      percentile(equityRatios, row.metrics.equityRatio),
      percentile(working, row.metrics.workingCapitalToAssets),
      percentile(retained, row.metrics.retainedToEquity),
    ];
    const weights = [0.30, 0.25, 0.20, 0.15, 0.10];
    let w = 0; let score = 0;
    parts.forEach((x, i) => { if (Number.isFinite(x)) { score += x * weights[i]; w += weights[i]; } });
    row.balanceSheetSafetyScore = w ? round(score / w * 100, 1) : null;
    row.interpretation = interpretation(row.metrics);
  }
  rows.sort((a, b) => (b.balanceSheetSafetyScore ?? -1) - (a.balanceSheetSafetyScore ?? -1) || a.symbol.localeCompare(b.symbol));
  rows.forEach((r, i) => { r.rank = i + 1; });

  const report = {
    schemaVersion: 1,
    version: 'real-estate-balance-sheet-v1',
    generatedAt: new Date().toISOString(),
    source: 'TWSE OpenAPI v1 t187ap07_L_ci + repository market snapshot',
    balanceSheetSourceUrl: SOURCE_URL,
    marketAsOf: market?.datasets?.stockDay?.asOf || null,
    universe: { industry: '建材營造', companies: rows.length },
    methodology: {
      safetyScore: '30% current ratio percentile + 25% inverse debt ratio + 20% equity ratio + 15% working-capital/assets + 10% retained-earnings/equity. P/B is shown separately and is not part of safety score.',
      caution: '流動資產不等於可立即變現現金。營建業通常含房地/在建存貨；本版不把流動資產誤標為存貨。',
      missingDetail: ['現金及約當現金', '房地/土地存貨', '在建工程', '合約負債/預收款', '有息短長期借款'],
      nextLayer: '上述細項需由 MOPS/XBRL 財報科目深化後再做去化、預售覆蓋與淨負債判讀。',
    },
    rows,
  };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${path.relative(ROOT, OUT_PATH)} (${rows.length} 建材營造 companies)`);
}

main().catch(error => { console.error(error.stack || error); process.exit(1); });

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MARKET_PATH = path.join(ROOT, 'data', 'dashboard', 'market_latest.json');
const PAGES_PATH = path.join(ROOT, 'data', 'shadow', 'latest.json');
const LEVERAGE_SHADOW_PATH = path.join(ROOT, 'data', 'shadow', 'leverage_5050_latest.json');
const LEVERAGE_REPORT_PATH = path.join(ROOT, 'data', 'backtests', 'leverage_5050_v5.json');

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (_) { return null; }
}

function compactStrategy() {
  const shadow = readJson(LEVERAGE_SHADOW_PATH);
  const report = readJson(LEVERAGE_REPORT_PATH);
  const factor = report?.factors?.['0.50'];
  const primary = factor?.ranking?.find(item => item.name === report?.primaryCandidate);
  const benchmark = factor?.windows?.full?.benchmarks?.taiwan50TotalReturn;
  return {
    name: report?.primaryCandidate ?? 'asym35_77_5_t50',
    label: '00631L 35 / 77.5 → 50',
    period: report?.period ?? null,
    metrics: primary?.full?.metrics ?? null,
    benchmark: benchmark ?? null,
    live: shadow ? {
      asOf: shadow.asOf,
      leveragedEtfWeight: shadow.leveragedEtfWeight,
      cashWeight: shadow.cashWeight,
      action: shadow.action,
      lowerBand: shadow.lowerBand,
      upperBand: shadow.upperBand,
    } : null,
  };
}

function main() {
  const market = readJson(MARKET_PATH);
  if (!market) throw new Error('missing data/dashboard/market_latest.json');
  const legacy = readJson(PAGES_PATH) ?? { shadowVersion: 'v0.2', performance: {} };

  const rows = market?.sectors?.rows ?? [];
  const refreshedPrediction = {
    id: `${market?.sectors?.asOf ?? market?.market?.asOf}:sector-radar-baseline-v0.1`,
    generatedAt: market.generatedAt,
    asOf: market?.sectors?.asOf ?? market?.market?.asOf,
    model: 'sector-radar-baseline-v0.1',
    modelType: 'cross-sectional heuristic baseline',
    horizonTradingDays: 5,
    benchmark: 'TAIEX',
    scoreSemantics: 'relative-strength score; not a calibrated probability',
    sectors: rows.map(row => ({
      sector: row.sector,
      rank: row.rank,
      score: row.score,
      signal: row.signal,
      coverage: row.coverage,
    })),
  };

  const output = {
    ...legacy,
    latestPrediction: refreshedPrediction,
    dashboardMarket: market,
    dashboardStrategy: compactStrategy(),
  };
  fs.writeFileSync(PAGES_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Published overview for ${market?.market?.asOf ?? 'unknown date'}`);
}

try { main(); } catch (error) { console.error(error); process.exit(1); }

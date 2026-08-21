#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { buildRecommendationReport } = require('../recommendationV051');

const ROOT = path.join(__dirname, '..');
const FACTOR_PATH = path.join(ROOT, 'data', 'dashboard', 'factor_research_latest.json');
const CHALLENGER_PATH = path.join(ROOT, 'data', 'shadow', 'challenger_latest.json');
const OUT_PATH = path.join(ROOT, 'data', 'dashboard', 'recommendation_v0.5.1_latest.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function main() {
  if (!fs.existsSync(FACTOR_PATH) || !fs.existsSync(CHALLENGER_PATH)) {
    console.warn('v0.5.1 recommendation skipped: factor or challenger latest file is missing.');
    return { skipped: true };
  }
  const factor = readJson(FACTOR_PATH);
  const challenger = readJson(CHALLENGER_PATH);
  const report = buildRecommendationReport(factor, challenger);
  writeJsonAtomic(OUT_PATH, report);
  console.log(`Wrote ${path.relative(ROOT, OUT_PATH)} (${report.status}; ${report.recommendations.length} ranked stocks).`);
  return { skipped: false, report };
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(error.stack || error.message || error);
    process.exit(1);
  }
}

module.exports = { CHALLENGER_PATH, FACTOR_PATH, OUT_PATH, main, readJson, writeJsonAtomic };

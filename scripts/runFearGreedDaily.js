#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { collectDailySignals } = require('./fearGreedSources');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'dashboard');
const LATEST_PATH = path.join(OUT_DIR, 'fear_greed_latest.json');
const HISTORY_PATH = path.join(OUT_DIR, 'fear_greed_history.jsonl');

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function upsertHistory(filePath, report) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const byDate = new Map(readJsonLines(filePath).map(row => [row.tradingDate, row]));
  const action = byDate.has(report.tradingDate) ? 'updated' : 'appended';
  byDate.set(report.tradingDate, report);
  const rows = [...byDate.values()].sort((a, b) => a.tradingDate.localeCompare(b.tradingDate));
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
  return { action, rows: rows.length };
}

async function main() {
  console.log('Collecting Taiwan Fear & Greed inputs from TWSE, TAIFEX and FSC...');
  const report = await collectDailySignals();
  writeJsonAtomic(LATEST_PATH, report);
  const history = upsertHistory(HISTORY_PATH, report);

  console.log(`Wrote ${path.relative(ROOT, LATEST_PATH)}`);
  console.log(`${history.action} ${report.tradingDate} in ${path.relative(ROOT, HISTORY_PATH)} (${history.rows} row(s))`);
  if (report.status === 'complete') {
    console.log(`Taiwan Fear & Greed: ${report.score} (${report.label}), coverage 9/9`);
  } else {
    console.warn(`Partial snapshot: ${report.coverage.available}/9; missing ${report.coverage.missing.join(', ')}`);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}

module.exports = {
  HISTORY_PATH,
  LATEST_PATH,
  main,
  readJsonLines,
  upsertHistory,
  writeJsonAtomic,
};

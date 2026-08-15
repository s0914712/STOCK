#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { persistFactorResearch } = require('../factorResearch');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'dashboard');
const MARKET_PATH = path.join(DATA_DIR, 'market_latest.json');
const OBSERVATION_PATH = path.join(DATA_DIR, 'factor_forward.jsonl');
const OUTCOME_PATH = path.join(DATA_DIR, 'factor_outcomes.jsonl');
const LATEST_PATH = path.join(DATA_DIR, 'factor_research_latest.json');

function main() {
  if (!fs.existsSync(MARKET_PATH)) throw new Error(`market snapshot not found: ${MARKET_PATH}`);
  const snapshot = JSON.parse(fs.readFileSync(MARKET_PATH, 'utf8'));
  const result = persistFactorResearch(snapshot, {
    observationPath: OBSERVATION_PATH,
    outcomePath: OUTCOME_PATH,
    latestPath: LATEST_PATH,
  });
  if (result.skipped) {
    console.warn(`Factor research skipped: ${result.message}`);
    return;
  }
  console.log(`${result.appendedObservation ? 'Appended' : 'Already had'} factor observation ${result.observationId}`);
  console.log(`Appended ${result.appendedOutcomes} matured factor outcome(s)`);
  console.log(`${result.wroteLatest ? 'Wrote' : 'Kept'} ${path.relative(ROOT, LATEST_PATH)}`);
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(error.stack || error.message || error);
    process.exit(1);
  }
}

module.exports = {
  DATA_DIR,
  LATEST_PATH,
  MARKET_PATH,
  OBSERVATION_PATH,
  OUTCOME_PATH,
  main,
};

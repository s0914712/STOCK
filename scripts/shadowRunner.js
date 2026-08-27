#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { buildSectorRadar } = require('../sectorRadar');
const {
  makePredictionSnapshot,
  getTargetDate,
  scorePredictionSnapshot,
  summarizeScores,
} = require('../shadowPrediction');
// This runner used to carry its own https client. That copy could not follow
// the 307s TWSE returns while it migrates endpoints under /rwd/, so the one
// job that runs every trading day was on the most fragile fetch path in the
// repo while the hardened one sat in twseData.js. Use that one.
const {
  monthKeys,
  mapLimit,
  parseRocDate,
  fetchStockHistory: fetchStockHistoryForMonths,
  fetchTaiexHistory: fetchTaiexHistoryForMonths,
} = require('./twseData');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'shadow');
const PREDICTIONS_PATH = path.join(DATA_DIR, 'predictions.jsonl');
const SCORES_PATH = path.join(DATA_DIR, 'scores.jsonl');
const LATEST_PATH = path.join(DATA_DIR, 'latest.json');

// twseData spaces requests to stay under the ~3 req/s TWSE starts refusing at,
// but that budget is per process: fetching N symbols in parallel multiplies it.
// The previous 3 workers put this job at ~7.5 req/s. One worker over 18 symbols
// x 3 months is roughly 20 seconds, which is nothing for a daily schedule.
const FETCH_CONCURRENCY = 1;

// twseData's fetchers take an explicit list of TWSE month keys; this runner
// thinks in "the last N months", so adapt here instead of at every call site.
function recentMonths(count) {
  return monthKeys(Math.min(Math.max(count, 2), 6));
}

function fetchStockHistory(symbol, months = 3) {
  return fetchStockHistoryForMonths(symbol, recentMonths(months));
}

function fetchTaiexHistory(months = 3) {
  return fetchTaiexHistoryForMonths(recentMonths(months));
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function appendJsonl(filePath, value) {
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function writeLatest(predictions, scores) {
  const payload = {
    shadowVersion: 'v0.2',
    latestPrediction: predictions.at(-1) || null,
    latestScore: scores.at(-1) || null,
    performance: summarizeScores(scores),
  };
  const next = `${JSON.stringify(payload, null, 2)}\n`;
  const previous = fs.existsSync(LATEST_PATH) ? fs.readFileSync(LATEST_PATH, 'utf8') : null;
  if (previous !== next) fs.writeFileSync(LATEST_PATH, next);
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const predictions = readJsonl(PREDICTIONS_PATH);
  const scores = readJsonl(SCORES_PATH);
  const predictionIds = new Set(predictions.map(row => row.id));
  const scoredIds = new Set(scores.map(row => row.id));

  console.log('Building sector radar snapshot...');
  const radar = await buildSectorRadar({ fetchHistory: fetchStockHistory, months: 3, concurrency: FETCH_CONCURRENCY });
  if (!radar.asOf || radar.sectorCount < 3) {
    throw new Error(`insufficient radar coverage: asOf=${radar.asOf}, sectors=${radar.sectorCount}`);
  }

  const snapshot = makePredictionSnapshot(radar);
  if (!predictionIds.has(snapshot.id)) {
    appendJsonl(PREDICTIONS_PATH, snapshot);
    predictions.push(snapshot);
    predictionIds.add(snapshot.id);
    console.log(`Appended prediction ${snapshot.id}`);
  } else {
    console.log(`Prediction ${snapshot.id} already exists; no duplicate appended.`);
  }

  const pending = predictions.filter(row => !scoredIds.has(row.id));
  if (pending.length) {
    console.log(`Checking ${pending.length} unscored snapshot(s)...`);
    const taiexRows = await fetchTaiexHistory(4);
    const tradingDates = taiexRows.map(row => row.date);
    const mature = pending.filter(row => getTargetDate(
      row.asOf,
      tradingDates,
      row.horizonTradingDays || 5,
    ));

    for (const prediction of pending.filter(row => !mature.includes(row))) {
      console.log(`Not mature yet: ${prediction.id}`);
    }

    if (mature.length) {
      const symbols = [...new Set(mature.flatMap(row => row.sectors.flatMap(sector =>
        (sector.anchors || []).map(anchor => anchor.symbol))))];
      const histories = await mapLimit(symbols, FETCH_CONCURRENCY, async symbol => [symbol, await fetchStockHistory(symbol, 4)]);
      const stockHistoryBySymbol = new Map(histories);

      for (const prediction of mature) {
        const result = scorePredictionSnapshot(prediction, { taiexRows, stockHistoryBySymbol });
        if (!result) {
          console.log(`Mature calendar but insufficient price coverage: ${prediction.id}`);
          continue;
        }
        appendJsonl(SCORES_PATH, result);
        scores.push(result);
        scoredIds.add(result.id);
        console.log(`Scored ${result.id} -> target ${result.targetDate}, top3 hit ${(100 * result.metrics.top3HitRate).toFixed(1)}%`);
      }
    }
  }

  writeLatest(predictions, scores);
  const summary = summarizeScores(scores);
  console.log('Shadow summary:', JSON.stringify(summary));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  parseRocDate,
  readJsonl,
  writeLatest,
  fetchStockHistory,
  fetchTaiexHistory,
};

#!/usr/bin/env node

/**
 * Daily shadow prediction runner.
 *
 * This deliberately keeps its own small TWSE client rather than sharing
 * scripts/twseData.js. The shared client follows and memoizes TWSE's 307s, and
 * its redirectMemo is a process-global map that is never cleared: once any one
 * request is redirected, every later request in that process is rewritten onto
 * the memoized path and loops until it exhausts its redirect budget. A live run
 * on 2026-08-27 failed that way on nearly every request, ~8s each, and blew a
 * 20-minute timeout after two symbols.
 *
 * The client below does not follow redirects at all, and has produced a
 * complete six-sector snapshot every trading day. This job appends to an
 * append-only OOS ledger that cannot be backfilled, so it stays on the path
 * with the track record until the shared client is fixed and proven against
 * live TWSE.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { buildSectorRadar } = require('../sectorRadar');
const {
  makePredictionSnapshot,
  getTargetDate,
  scorePredictionSnapshot,
  summarizeScores,
} = require('../shadowPrediction');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'shadow');
const PREDICTIONS_PATH = path.join(DATA_DIR, 'predictions.jsonl');
const SCORES_PATH = path.join(DATA_DIR, 'scores.jsonl');
const LATEST_PATH = path.join(DATA_DIR, 'latest.json');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJSON(url, attempts = 2) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 sector-shadow-runner/0.2',
        Accept: 'application/json',
      },
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', async () => {
        try {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            throw new Error(`HTTP ${res.statusCode}`);
          }
          resolve(JSON.parse(data));
        } catch (error) {
          if (attempts > 1) {
            await sleep(750);
            try { resolve(await fetchJSON(url, attempts - 1)); } catch (retryError) { reject(retryError); }
          } else {
            reject(error);
          }
        }
      });
    });
    req.on('error', async error => {
      if (attempts > 1) {
        await sleep(750);
        try { resolve(await fetchJSON(url, attempts - 1)); } catch (retryError) { reject(retryError); }
      } else {
        reject(error);
      }
    });
    req.setTimeout(15000, () => req.destroy(new Error('request timeout')));
  });
}

function monthStarts(months) {
  const now = new Date();
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}01`;
  });
}

function parseRocDate(value) {
  const [rocYear, month, day] = String(value).split('/');
  if (!rocYear || !month || !day) return null;
  return `${Number(rocYear) + 1911}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function fetchStockHistory(stock, months = 3) {
  const rows = [];
  for (const dateStr of monthStarts(Math.min(Math.max(months, 2), 6))) {
    const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${stock}`;
    try {
      const data = await fetchJSON(url);
      if (data.stat === 'OK' && Array.isArray(data.data)) {
        for (const row of data.data) {
          const date = parseRocDate(row[0]);
          if (!date) continue;
          rows.push({
            date,
            volume: Number(String(row[1]).replace(/,/g, '')),
            open: Number(String(row[3]).replace(/,/g, '')),
            high: Number(String(row[4]).replace(/,/g, '')),
            low: Number(String(row[5]).replace(/,/g, '')),
            close: Number(String(row[6]).replace(/,/g, '')),
          });
        }
      }
    } catch (error) {
      console.warn(`[stock ${stock}] ${dateStr}: ${error.message}`);
    }
    await sleep(180);
  }
  const unique = new Map(rows.map(row => [row.date, row]));
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchTaiexHistory(months = 3) {
  const rows = [];
  for (const dateStr of monthStarts(Math.min(Math.max(months, 2), 6))) {
    const url = `https://www.twse.com.tw/exchangeReport/FMTQIK?response=json&date=${dateStr}`;
    try {
      const data = await fetchJSON(url);
      if (data.stat === 'OK' && Array.isArray(data.data)) {
        for (const row of data.data) {
          const date = parseRocDate(row[0]);
          const index = Number(String(row[4]).replace(/,/g, ''));
          if (date && Number.isFinite(index)) rows.push({ date, index });
        }
      }
    } catch (error) {
      console.warn(`[TAIEX] ${dateStr}: ${error.message}`);
    }
    await sleep(180);
  }
  const unique = new Map(rows.map(row => [row.date, row]));
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
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
  const radar = await buildSectorRadar({ fetchHistory: fetchStockHistory, months: 3, concurrency: 3 });
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
      const histories = await mapLimit(symbols, 3, async symbol => [symbol, await fetchStockHistory(symbol, 4)]);
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

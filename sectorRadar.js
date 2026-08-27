/**
 * Sector Radar baseline v0.1
 *
 * Goal: rank Taiwan equity sectors by cross-sectional relative strength using
 * only observable price/volume features. This is intentionally a transparent
 * baseline, not a calibrated probability model.
 */

const DEFAULT_SECTORS = {
  '半導體': ['2330', '2454', '2303'],
  'AI伺服器': ['2317', '2382', '3231'],
  'PCB': ['3037', '2368', '3044'],
  '金融': ['2881', '2882', '2891'],
  '航運': ['2603', '2609', '2615'],
  '電子零組件': ['2308', '2327', '3008'],
};

function mean(values) {
  const xs = values.filter(Number.isFinite);
  if (!xs.length) return null;
  return xs.reduce((sum, value) => sum + value, 0) / xs.length;
}

function std(values) {
  const xs = values.filter(Number.isFinite);
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((sum, value) => sum + ((value - m) ** 2), 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return current / previous - 1;
}

function computeStockFeatures(rows) {
  const clean = (rows || [])
    .filter(row => row && Number.isFinite(row.close) && Number.isFinite(row.volume))
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (clean.length < 21) return null;

  const closes = clean.map(row => row.close);
  const volumes = clean.map(row => row.volume);
  const last = closes.length - 1;
  const returns = [];

  for (let i = Math.max(1, closes.length - 20); i < closes.length; i += 1) {
    const r = pctChange(closes[i], closes[i - 1]);
    if (Number.isFinite(r)) returns.push(r);
  }

  const ma20 = mean(closes.slice(-20));
  const volume5 = mean(volumes.slice(-5));
  const volume20 = mean(volumes.slice(-20));

  return {
    asOf: clean[last].date,
    close: closes[last],
    momentum5: pctChange(closes[last], closes[last - 5]),
    momentum20: pctChange(closes[last], closes[last - 20]),
    volumeRatio: volume20 > 0 ? volume5 / volume20 : null,
    aboveMA20: closes[last] > ma20 ? 1 : 0,
    volatility20: std(returns) * Math.sqrt(252),
  };
}

function aggregateSector(sector, symbols, featureMap) {
  const available = symbols
    .map(symbol => ({ symbol, features: featureMap.get(symbol) }))
    .filter(item => item.features);

  if (!available.length) return null;

  return {
    sector,
    symbols,
    availableSymbols: available.map(item => item.symbol),
    members: available.map(item => ({
      symbol: item.symbol,
      asOf: item.features.asOf,
      close: item.features.close,
    })),
    coverage: available.length / symbols.length,
    asOf: available.map(item => item.features.asOf).sort().at(-1),
    momentum5: mean(available.map(item => item.features.momentum5)),
    momentum20: mean(available.map(item => item.features.momentum20)),
    volumeRatio: mean(available.map(item => item.features.volumeRatio)),
    breadthAboveMA20: mean(available.map(item => item.features.aboveMA20)),
    volatility20: mean(available.map(item => item.features.volatility20)),
  };
}

function zScore(value, values) {
  if (!Number.isFinite(value)) return 0;
  const xs = values.filter(Number.isFinite);
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const s = std(xs);
  if (!Number.isFinite(s) || s < 1e-12) return 0;
  return (value - m) / s;
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Champion baseline scoring formula — JavaScript side.
 *
 * The identical formula also exists in Python (`baselineScore.py`), because the
 * live radar ranks sectors in Node while the ML challenger consumes the same
 * score as its `baseline_linear` feature. Two independent implementations of
 * the champion is a drift hazard: if the weights diverge, the challenger is
 * silently compared against a baseline that is no longer the one being served,
 * and nothing raises an error.
 *
 * `test/fixtures/baseline_golden.json` pins the contract, and both
 * `test/baselineParity.test.js` and `test/baselineParity.test.py` assert
 * against it, so a change made on one side and not the other fails CI.
 *
 * Feature keys here are the canonical ML feature names (the ones persisted into
 * the model artifacts), not the radar's display names, so the two languages
 * read the same key set.
 */
const BASELINE_WEIGHTS = {
  momentum5: 0.40,
  momentum20: 0.30,
  volume_ratio: 0.15,
  breadth_ma20: 0.15,
  volatility20: -0.10,
};

// Slope applied before the logistic squash. Not a fitted parameter: it only
// sets how quickly the 0-100 display score saturates.
const BASELINE_SIGMOID_SLOPE = 1.15;

const BASELINE_FEATURES = Object.keys(BASELINE_WEIGHTS);

/** Cross-sectional z-score of each weighted feature, for one row. */
function baselineComponents(row, columns) {
  const out = {};
  for (const key of BASELINE_FEATURES) {
    out[key] = zScore(row ? row[key] : undefined, columns[key] || []);
  }
  return out;
}

function baselineLinear(row, columns) {
  const components = baselineComponents(row, columns);
  return BASELINE_FEATURES.reduce((sum, key) => sum + (BASELINE_WEIGHTS[key] * components[key]), 0);
}

/** Calibration input for the ML challenger: the raw 0-1 logistic output. */
function baselineScore01(linear) {
  return sigmoid(BASELINE_SIGMOID_SLOPE * linear);
}

/** Build the cross-sectional column vectors the z-scores are taken against. */
function baselineColumns(rows) {
  return Object.fromEntries(BASELINE_FEATURES.map(key => [key, rows.map(row => (row ? row[key] : undefined))]));
}

function toBaselineFeatureRow(sector) {
  return {
    momentum5: sector.momentum5,
    momentum20: sector.momentum20,
    volume_ratio: sector.volumeRatio,
    breadth_ma20: sector.breadthAboveMA20,
    volatility20: sector.volatility20,
  };
}

function rankSectors(rawSectors) {
  const sectors = (rawSectors || []).filter(Boolean);
  if (!sectors.length) return [];

  // Radar sector objects carry display names; the baseline formula is keyed by
  // the canonical ML feature names so both languages agree on one key set.
  const featureRows = sectors.map(toBaselineFeatureRow);
  const columns = baselineColumns(featureRows);

  const scored = sectors.map((sector, index) => {
    const raw = baselineComponents(featureRows[index], columns);
    const linearScore = BASELINE_FEATURES.reduce((sum, key) => sum + (BASELINE_WEIGHTS[key] * raw[key]), 0);

    // Emitted under the radar's original component names: these are already
    // persisted in the shadow ledgers, so the shape must not change.
    const components = {
      momentum5: raw.momentum5,
      momentum20: raw.momentum20,
      volumeRatio: raw.volume_ratio,
      breadth: raw.breadth_ma20,
      volatility: raw.volatility20,
    };

    const score = 100 * baselineScore01(linearScore);
    let signal = '中性';
    if (score >= 60) signal = '強勢';
    else if (score <= 40) signal = '弱勢';

    return {
      ...sector,
      score: Number(score.toFixed(1)),
      signal,
      components,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((sector, index) => ({ ...sector, rank: index + 1 }));
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

async function buildSectorRadar({
  fetchHistory,
  sectors = DEFAULT_SECTORS,
  months = 2,
  concurrency = 3,
}) {
  if (typeof fetchHistory !== 'function') {
    throw new TypeError('fetchHistory must be a function');
  }

  const symbols = [...new Set(Object.values(sectors).flat())];
  const failures = [];

  const featureRows = await mapLimit(symbols, concurrency, async symbol => {
    try {
      const rows = await fetchHistory(symbol, months);
      const features = computeStockFeatures(rows);
      if (!features) {
        failures.push({ symbol, error: 'insufficient_history' });
        return [symbol, null];
      }
      return [symbol, features];
    } catch (error) {
      failures.push({ symbol, error: error.message });
      return [symbol, null];
    }
  });

  const featureMap = new Map(featureRows);
  const rawSectors = Object.entries(sectors)
    .map(([sector, sectorSymbols]) => aggregateSector(sector, sectorSymbols, featureMap))
    .filter(Boolean);

  const ranked = rankSectors(rawSectors);
  const asOfDates = ranked.map(row => row.asOf).filter(Boolean).sort();

  return {
    model: 'sector-radar-baseline-v0.1',
    modelType: 'cross-sectional heuristic baseline',
    target: 'future: P(5d sector return > TAIEX); current v0.1 output is NOT calibrated probability',
    asOf: asOfDates.at(-1) || null,
    months,
    sectorCount: ranked.length,
    failures,
    data: ranked,
  };
}

module.exports = {
  DEFAULT_SECTORS,
  BASELINE_WEIGHTS,
  BASELINE_SIGMOID_SLOPE,
  baselineColumns,
  baselineComponents,
  baselineLinear,
  baselineScore01,
  computeStockFeatures,
  aggregateSector,
  rankSectors,
  buildSectorRadar,
};

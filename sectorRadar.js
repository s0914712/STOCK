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

function rankSectors(rawSectors) {
  const sectors = (rawSectors || []).filter(Boolean);
  if (!sectors.length) return [];

  const columns = {
    momentum5: sectors.map(s => s.momentum5),
    momentum20: sectors.map(s => s.momentum20),
    volumeRatio: sectors.map(s => s.volumeRatio),
    breadthAboveMA20: sectors.map(s => s.breadthAboveMA20),
    volatility20: sectors.map(s => s.volatility20),
  };

  const scored = sectors.map(sector => {
    const components = {
      momentum5: zScore(sector.momentum5, columns.momentum5),
      momentum20: zScore(sector.momentum20, columns.momentum20),
      volumeRatio: zScore(sector.volumeRatio, columns.volumeRatio),
      breadth: zScore(sector.breadthAboveMA20, columns.breadthAboveMA20),
      volatility: zScore(sector.volatility20, columns.volatility20),
    };

    const linearScore = (
      0.40 * components.momentum5
      + 0.30 * components.momentum20
      + 0.15 * components.volumeRatio
      + 0.15 * components.breadth
      - 0.10 * components.volatility
    );

    const score = 100 * sigmoid(1.15 * linearScore);
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
  computeStockFeatures,
  aggregateSector,
  rankSectors,
  buildSectorRadar,
};

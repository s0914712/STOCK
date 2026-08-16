const fs = require('fs');
const path = require('path');

const MODEL_VERSION = 'twse-cross-sectional-factor-v1';
const FACTOR_KEYS = ['value', 'growth', 'momentum', 'liquidity', 'composite'];
const SIGNAL_COLUMNS = [
  'symbol', 'name', 'industry', 'close', 'tradeValue',
  'pe', 'pb', 'dividendYield',
  'revenueYoy', 'revenueMom', 'revenueYtd', 'momentum1d',
  'value', 'growth', 'momentum', 'liquidity', 'composite',
  'coverage', 'riskFlags',
];
const DEFAULT_CONFIG = Object.freeze({
  minTradeValue: 20_000_000,
  rankingLimit: 10,
  quantileFraction: 0.2,
  horizons: [5, 20],
  minimumMaturedSnapshots: 20,
  estimatedRoundTripCost: 0.00585,
});

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function round(value, digits = 6) {
  if (!isFiniteNumber(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function mean(values) {
  const finite = values.filter(isFiniteNumber);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function bySymbol(rows) {
  return new Map((rows || []).map(row => [row.symbol, row]));
}

function rankPercentiles(rows, accessor, { lowerIsBetter = false } = {}) {
  const values = rows
    .map((row, index) => ({ index, value: accessor(row) }))
    .filter(item => isFiniteNumber(item.value))
    .sort((a, b) => a.value - b.value);
  const result = new Array(rows.length).fill(null);
  if (!values.length) return result;
  if (values.length === 1) {
    result[values[0].index] = 0.5;
    return result;
  }

  let start = 0;
  while (start < values.length) {
    let end = start;
    while (end + 1 < values.length && values[end + 1].value === values[start].value) end += 1;
    const averageRank = (start + end) / 2;
    const percentile = averageRank / (values.length - 1);
    for (let i = start; i <= end; i += 1) {
      result[values[i].index] = lowerIsBetter ? 1 - percentile : percentile;
    }
    start = end + 1;
  }
  return result;
}

function weightedAvailable(parts) {
  const available = parts.filter(part => isFiniteNumber(part.value));
  if (!available.length) return null;
  const weight = available.reduce((sum, part) => sum + part.weight, 0);
  return available.reduce((sum, part) => sum + part.value * part.weight, 0) / weight;
}

function assertFreshPointInTimeSnapshot(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== 1 || !snapshot.datasets) {
    throw new Error('factor research requires a normalized market snapshot with schemaVersion=1');
  }
  const stale = Object.entries(snapshot.datasets)
    .filter(([, dataset]) => dataset?.stale)
    .map(([key]) => key);
  if (snapshot.freshness?.complete === false || stale.length) {
    throw new Error(`refusing factor observation from stale datasets: ${stale.join(', ') || 'snapshot incomplete'}`);
  }
  const tradingDate = snapshot.datasets.stockDay?.asOf;
  if (!tradingDate) throw new Error('factor research requires STOCK_DAY_ALL trading date');
  return tradingDate;
}

function eventRiskBySymbol(snapshot, tradingDate) {
  const result = new Map();
  for (const event of snapshot.datasets.materialEvents?.data || []) {
    if (!event.symbol || !event.disclosureDate || event.disclosureDate > tradingDate) continue;
    if (!result.has(event.symbol)) result.set(event.symbol, new Set());
    if (event.severity === 'high') result.get(event.symbol).add('重大事件：高風險');
    else if (event.severity === 'medium') result.get(event.symbol).add('重大事件：需留意');
  }

  const cutoff = new Date(`${tradingDate}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() + 30);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  for (const action of snapshot.datasets.exRights?.data || []) {
    if (!action.symbol || !action.date || action.date < tradingDate || action.date > cutoffDate) continue;
    if (!result.has(action.symbol)) result.set(action.symbol, new Set());
    result.get(action.symbol).add(`30日內除權息：${action.date}`);
  }
  return result;
}

function buildFactorRows(snapshot, config = {}) {
  const options = { ...DEFAULT_CONFIG, ...config };
  const tradingDate = assertFreshPointInTimeSnapshot(snapshot);
  const recordedDate = String(snapshot.generatedAt || '').slice(0, 10) || tradingDate;
  const valuationMap = bySymbol((snapshot.datasets.valuation?.data || [])
    .filter(row => !row.date || row.date <= tradingDate));
  const revenueMap = bySymbol((snapshot.datasets.revenue?.data || [])
    .filter(row => !row.publishedAt || row.publishedAt <= recordedDate));
  const riskMap = eventRiskBySymbol(snapshot, tradingDate);

  const prices = (snapshot.datasets.stockDay?.data || [])
    .filter(row => /^[1-9]\d{3}$/.test(row.symbol || '') && isFiniteNumber(row.close) && row.close > 0)
    .slice()
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
  const candidates = prices
    .filter(row => isFiniteNumber(row.tradeValue) && row.tradeValue >= options.minTradeValue)
    .map(price => {
      const valuation = valuationMap.get(price.symbol) || {};
      const revenue = revenueMap.get(price.symbol) || {};
      const previousClose = isFiniteNumber(price.change) ? price.close - price.change : null;
      return {
        symbol: price.symbol,
        name: price.name || valuation.name || revenue.name || price.symbol,
        industry: revenue.industry || null,
        close: price.close,
        tradeValue: price.tradeValue,
        pe: isFiniteNumber(valuation.pe) && valuation.pe > 0 ? valuation.pe : null,
        pb: isFiniteNumber(valuation.pb) && valuation.pb > 0 ? valuation.pb : null,
        dividendYield: isFiniteNumber(valuation.dividendYield) ? valuation.dividendYield : null,
        revenueYoy: isFiniteNumber(revenue.yoyPercent) ? revenue.yoyPercent : null,
        revenueMom: isFiniteNumber(revenue.momPercent) ? revenue.momPercent : null,
        revenueYtd: isFiniteNumber(revenue.ytdPercent) ? revenue.ytdPercent : null,
        momentum1d: isFiniteNumber(previousClose) && previousClose > 0 ? price.close / previousClose - 1 : null,
        riskFlags: [...(riskMap.get(price.symbol) || [])],
      };
    });

  const peScore = rankPercentiles(candidates, row => row.pe, { lowerIsBetter: true });
  const pbScore = rankPercentiles(candidates, row => row.pb, { lowerIsBetter: true });
  const yieldScore = rankPercentiles(candidates, row => row.dividendYield);
  const yoyScore = rankPercentiles(candidates, row => row.revenueYoy);
  const momRevenueScore = rankPercentiles(candidates, row => row.revenueMom);
  const ytdScore = rankPercentiles(candidates, row => row.revenueYtd);
  const momentumScore = rankPercentiles(candidates, row => row.momentum1d);
  const liquidityScore = rankPercentiles(candidates, row => Math.log1p(row.tradeValue));

  const rows = candidates.map((row, index) => {
    const value = mean([peScore[index], pbScore[index], yieldScore[index]]);
    const growth = mean([yoyScore[index], momRevenueScore[index], ytdScore[index]]);
    const momentum = momentumScore[index];
    const liquidity = liquidityScore[index];
    const coverage = [value, growth, momentum, liquidity].filter(isFiniteNumber).length;
    const composite = coverage >= 3 && isFiniteNumber(value) && isFiniteNumber(growth)
      ? weightedAvailable([
        { value, weight: 0.35 },
        { value: growth, weight: 0.35 },
        { value: momentum, weight: 0.20 },
        { value: liquidity, weight: 0.10 },
      ])
      : null;
    return { ...row, value, growth, momentum, liquidity, composite, coverage };
  });

  return {
    tradingDate,
    recordedAt: snapshot.generatedAt,
    prices,
    rows,
    universe: {
      listedCommonStocks: prices.length,
      liquidCandidates: candidates.length,
      compositeEligible: rows.filter(row => isFiniteNumber(row.composite)).length,
      minimumDailyTradeValue: options.minTradeValue,
    },
  };
}

function compactSignal(row) {
  return SIGNAL_COLUMNS.map(column => {
    const value = row[column];
    return isFiniteNumber(value) ? round(value) : value ?? null;
  });
}

function expandSignal(signal) {
  return Object.fromEntries(SIGNAL_COLUMNS.map((column, index) => [column, signal[index]]));
}

function buildFactorObservation(snapshot, config = {}) {
  const built = buildFactorRows(snapshot, config);
  const provenanceKeys = ['stockDay', 'valuation', 'revenue', 'materialEvents', 'exRights'];
  return {
    id: `${built.tradingDate}:${MODEL_VERSION}`,
    schemaVersion: 1,
    modelVersion: MODEL_VERSION,
    tradingDate: built.tradingDate,
    recordedAt: built.recordedAt,
    signalTiming: 'recorded after official snapshot; evaluated from next observed trading close',
    universe: built.universe,
    columns: SIGNAL_COLUMNS,
    prices: built.prices.map(row => [row.symbol, row.close]),
    signals: built.rows.map(compactSignal),
    provenance: Object.fromEntries(provenanceKeys.map(key => [key, {
      asOf: snapshot.datasets[key]?.asOf ?? null,
      contentHash: snapshot.datasets[key]?.contentHash ?? null,
    }])),
  };
}

function pearson(x, y) {
  if (x.length !== y.length || x.length < 3) return null;
  const mx = mean(x);
  const my = mean(y);
  let numerator = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < x.length; i += 1) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    numerator += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  return dx2 > 0 && dy2 > 0 ? numerator / Math.sqrt(dx2 * dy2) : null;
}

function numericRanks(values) {
  const rows = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array(values.length);
  let start = 0;
  while (start < rows.length) {
    let end = start;
    while (end + 1 < rows.length && rows[end + 1].value === rows[start].value) end += 1;
    const rank = (start + end) / 2;
    for (let i = start; i <= end; i += 1) ranks[rows[i].index] = rank;
    start = end + 1;
  }
  return ranks;
}

function spearman(x, y) {
  if (x.length !== y.length || x.length < 3) return null;
  return pearson(numericRanks(x), numericRanks(y));
}

function topSymbols(observation, factor, fraction) {
  const rows = observation.signals
    .map(expandSignal)
    .filter(row => isFiniteNumber(row[factor]))
    .sort((a, b) => b[factor] - a[factor]);
  const count = Math.max(1, Math.floor(rows.length * fraction));
  return new Set(rows.slice(0, count).map(row => row.symbol));
}

function portfolioTurnover(currentObservation, previousObservation, factor, fraction) {
  if (!previousObservation) return 1;
  const current = topSymbols(currentObservation, factor, fraction);
  const previous = topSymbols(previousObservation, factor, fraction);
  if (!current.size || !previous.size) return null;
  let overlap = 0;
  for (const symbol of current) if (previous.has(symbol)) overlap += 1;
  return 1 - (2 * overlap) / (current.size + previous.size);
}

function scoreObservation(signalObservation, entryObservation, exitObservation, {
  horizon,
  previousObservation = null,
  quantileFraction = DEFAULT_CONFIG.quantileFraction,
  estimatedRoundTripCost = DEFAULT_CONFIG.estimatedRoundTripCost,
} = {}) {
  if (!Number.isInteger(horizon) || horizon <= 0) throw new Error('horizon must be a positive integer');
  const entryPrices = new Map(entryObservation.prices || []);
  const exitPrices = new Map(exitObservation.prices || []);
  const signalRows = signalObservation.signals.map(expandSignal);
  const factorMetrics = {};

  for (const factor of FACTOR_KEYS) {
    const pairs = signalRows
      .filter(row => isFiniteNumber(row[factor]))
      .map(row => {
        const entry = entryPrices.get(row.symbol);
        const exit = exitPrices.get(row.symbol);
        return isFiniteNumber(entry) && entry > 0 && isFiniteNumber(exit) && exit > 0
          ? { symbol: row.symbol, score: row[factor], forwardReturn: exit / entry - 1 }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score);
    const count = Math.max(1, Math.floor(pairs.length * quantileFraction));
    const bottom = pairs.slice(0, count);
    const top = pairs.slice(-count);
    const turnover = portfolioTurnover(signalObservation, previousObservation, factor, quantileFraction);
    const topReturn = mean(top.map(row => row.forwardReturn));
    const bottomReturn = mean(bottom.map(row => row.forwardReturn));
    factorMetrics[factor] = {
      observations: pairs.length,
      rankIc: round(spearman(pairs.map(row => row.score), pairs.map(row => row.forwardReturn))),
      topQuantileReturn: round(topReturn),
      bottomQuantileReturn: round(bottomReturn),
      quantileSpread: round(isFiniteNumber(topReturn) && isFiniteNumber(bottomReturn) ? topReturn - bottomReturn : null),
      topQuantileHitRate: round(mean(top.map(row => row.forwardReturn > 0 ? 1 : 0))),
      turnover: round(turnover),
      estimatedTopQuantileNetReturn: round(isFiniteNumber(topReturn) && isFiniteNumber(turnover)
        ? topReturn - turnover * estimatedRoundTripCost
        : null),
    };
  }

  return {
    id: `${signalObservation.id}:h${horizon}`,
    schemaVersion: 1,
    modelVersion: MODEL_VERSION,
    horizonTradingDays: horizon,
    signalTradingDate: signalObservation.tradingDate,
    signalRecordedAt: signalObservation.recordedAt,
    entryTradingDate: entryObservation.tradingDate,
    exitTradingDate: exitObservation.tradingDate,
    executionProxy: 'next-observed-close to future close',
    estimatedRoundTripCost,
    factors: factorMetrics,
  };
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try { return JSON.parse(line); } catch (error) {
        throw new Error(`${path.basename(filePath)} line ${index + 1} is invalid JSON: ${error.message}`);
      }
    });
}

function appendJsonl(filePath, rows) {
  if (!rows.length) return 0;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, rows.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  return rows.length;
}

function appendUniqueJsonl(filePath, rows) {
  const existing = new Set(readJsonl(filePath).map(row => row.id));
  return appendJsonl(filePath, rows.filter(row => !existing.has(row.id)));
}

function buildMaturedOutcomes(observations, existingOutcomes = [], config = {}) {
  const options = { ...DEFAULT_CONFIG, ...config };
  const existing = new Set(existingOutcomes.map(row => row.id));
  const byTradingDate = new Map();
  for (const observation of observations
    .filter(row => row.modelVersion === MODEL_VERSION)
    .sort((a, b) => a.tradingDate.localeCompare(b.tradingDate))) {
    if (!byTradingDate.has(observation.tradingDate)) byTradingDate.set(observation.tradingDate, observation);
  }
  const sorted = [...byTradingDate.values()];
  const outcomes = [];
  for (let index = 0; index < sorted.length; index += 1) {
    for (const horizon of options.horizons) {
      const entryIndex = index + 1;
      const exitIndex = entryIndex + horizon;
      if (exitIndex >= sorted.length) continue;
      const id = `${sorted[index].id}:h${horizon}`;
      if (existing.has(id)) continue;
      outcomes.push(scoreObservation(sorted[index], sorted[entryIndex], sorted[exitIndex], {
        horizon,
        previousObservation: index > 0 ? sorted[index - 1] : null,
        quantileFraction: options.quantileFraction,
        estimatedRoundTripCost: options.estimatedRoundTripCost,
      }));
      existing.add(id);
    }
  }
  return outcomes;
}

function maxDrawdownFromNonOverlapping(outcomes, factor) {
  const sorted = outcomes.slice().sort((a, b) => a.entryTradingDate.localeCompare(b.entryTradingDate));
  const selected = [];
  let lastExit = '';
  for (const outcome of sorted) {
    const value = outcome.factors?.[factor]?.estimatedTopQuantileNetReturn;
    if (!isFiniteNumber(value) || outcome.entryTradingDate <= lastExit) continue;
    selected.push(value);
    lastExit = outcome.exitTradingDate;
  }
  if (!selected.length) return { maxDrawdown: null, periods: 0 };
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const value of selected) {
    equity *= 1 + value;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity / peak - 1);
  }
  return { maxDrawdown: round(maxDrawdown), periods: selected.length };
}

function summarizeEvidence(outcomes, config = {}) {
  const options = { ...DEFAULT_CONFIG, ...config };
  const currentModelOutcomes = outcomes.filter(row => row.modelVersion === MODEL_VERSION);
  const summaries = [];
  for (const horizon of options.horizons) {
    const horizonRows = currentModelOutcomes.filter(row => row.horizonTradingDays === horizon);
    for (const factor of FACTOR_KEYS) {
      const metrics = horizonRows.map(row => row.factors?.[factor]).filter(Boolean);
      const drawdown = maxDrawdownFromNonOverlapping(horizonRows, factor);
      summaries.push({
        horizonTradingDays: horizon,
        factor,
        maturedSnapshots: metrics.length,
        meanRankIc: round(mean(metrics.map(row => row.rankIc))),
        rankIcPositiveRate: round(mean(metrics.filter(row => isFiniteNumber(row.rankIc)).map(row => row.rankIc > 0 ? 1 : 0))),
        meanQuantileSpread: round(mean(metrics.map(row => row.quantileSpread))),
        meanTopQuantileReturn: round(mean(metrics.map(row => row.topQuantileReturn))),
        meanEstimatedNetReturn: round(mean(metrics.map(row => row.estimatedTopQuantileNetReturn))),
        meanTurnover: round(mean(metrics.map(row => row.turnover))),
        nonOverlappingMaxDrawdown: drawdown.maxDrawdown,
        nonOverlappingPeriods: drawdown.periods,
      });
    }
  }
  const matured5d = currentModelOutcomes.filter(row => row.horizonTradingDays === 5).length;
  return {
    minimumMaturedSnapshots: options.minimumMaturedSnapshots,
    status: matured5d >= options.minimumMaturedSnapshots ? 'eligible-for-research-review' : 'collecting-forward-oos',
    reason: matured5d >= options.minimumMaturedSnapshots
      ? '最低樣本門檻已達成；仍需檢查不同市場狀態與交易可行性。'
      : `5D 已成熟 ${matured5d}/${options.minimumMaturedSnapshots} 個 snapshots，不宣稱因子有效。`,
    summaries,
  };
}

function rankingRows(observation, factor, limit) {
  return observation.signals
    .map(expandSignal)
    .filter(row => isFiniteNumber(row[factor]))
    .sort((a, b) => b[factor] - a[factor] || a.symbol.localeCompare(b.symbol))
    .slice(0, limit)
    .map((row, index) => ({
      rank: index + 1,
      symbol: row.symbol,
      name: row.name,
      industry: row.industry,
      close: row.close,
      score: row[factor],
      value: row.value,
      growth: row.growth,
      momentum: row.momentum,
      liquidity: row.liquidity,
      pe: row.pe,
      pb: row.pb,
      dividendYield: row.dividendYield,
      revenueYoy: row.revenueYoy,
      revenueMom: row.revenueMom,
      revenueYtd: row.revenueYtd,
      momentum1d: row.momentum1d,
      coverage: row.coverage,
      riskFlags: row.riskFlags || [],
    }));
}

function buildLatestReport(observation, outcomes, config = {}) {
  const options = { ...DEFAULT_CONFIG, ...config };
  return {
    schemaVersion: 1,
    modelVersion: MODEL_VERSION,
    generatedAt: new Date().toISOString(),
    asOf: observation.tradingDate,
    recordedAt: observation.recordedAt,
    source: 'TWSE OpenAPI v1 point-in-time snapshots',
    universe: observation.universe,
    methodology: {
      signalTiming: observation.signalTiming,
      executionProxy: '訊號日後第一個已觀察收盤價進場，持有 5／20 個交易日後以收盤價評估。',
      percentileScoring: '每個因子採當日橫斷面百分位排名；缺值不以 AI 或平均值填補。',
      compositeWeights: { value: 0.35, growth: 0.35, momentum: 0.20, liquidity: 0.10 },
      compositeCoverage: '價值與成長必須有值，且四大類至少三類有值；可用權重重新正規化。',
      estimatedRoundTripCost: options.estimatedRoundTripCost,
      factors: {
        value: '低本益比、低股價淨值比、高殖利率的等權百分位。',
        growth: '月營收 YoY、MoM、YTD 成長率的等權百分位。',
        momentum: '由當日收盤價與漲跌價差推導的一日動能百分位。',
        liquidity: '成交金額 log(1+x) 的橫斷面百分位，主要作為可交易性控制。',
        composite: 'Value 35% + Growth 35% + Momentum 20% + Liquidity 10%。',
      },
    },
    rankings: Object.fromEntries(FACTOR_KEYS.map(factor => [factor, rankingRows(observation, factor, options.rankingLimit)])),
    forwardEvidence: summarizeEvidence(outcomes, options),
    guardrails: [
      '只使用該次官方快照當時可取得的資料；任一資料集 stale 時不新增因子日期。',
      'Forward OOS 不回填：需等待後續交易日實際收盤資料成熟。',
      '五分位差含理論空方，不能直接視為可交易策略報酬。',
      '樣本門檻僅允許進一步研究，不等同投資建議或自動下單訊號。',
    ],
  };
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function persistFactorResearch(snapshot, {
  observationPath,
  outcomePath,
  latestPath,
  ...config
}) {
  try {
    assertFreshPointInTimeSnapshot(snapshot);
  } catch (error) {
    if (/stale datasets/.test(error.message)) {
      return { skipped: true, reason: 'stale-snapshot', message: error.message, appendedObservation: false, appendedOutcomes: 0 };
    }
    throw error;
  }

  const candidate = buildFactorObservation(snapshot, config);
  const observations = readJsonl(observationPath);
  const existing = observations.find(row => row.id === candidate.id);
  const observation = existing || candidate;
  const appendedObservation = !existing;
  if (appendedObservation) appendJsonl(observationPath, [observation]);
  const allObservations = appendedObservation ? [...observations, observation] : observations;

  const existingOutcomes = readJsonl(outcomePath);
  const matured = buildMaturedOutcomes(allObservations, existingOutcomes, config);
  const appendedOutcomes = appendUniqueJsonl(outcomePath, matured);
  const allOutcomes = [...existingOutcomes, ...matured];
  const shouldWriteLatest = appendedObservation || appendedOutcomes > 0 || !fs.existsSync(latestPath);
  const report = shouldWriteLatest
    ? buildLatestReport(observation, allOutcomes, config)
    : JSON.parse(fs.readFileSync(latestPath, 'utf8'));
  if (shouldWriteLatest) writeJsonAtomic(latestPath, report);
  return {
    skipped: false,
    appendedObservation,
    appendedOutcomes,
    wroteLatest: shouldWriteLatest,
    observationId: observation.id,
    report,
  };
}

module.exports = {
  DEFAULT_CONFIG,
  FACTOR_KEYS,
  MODEL_VERSION,
  SIGNAL_COLUMNS,
  appendUniqueJsonl,
  assertFreshPointInTimeSnapshot,
  buildFactorObservation,
  buildFactorRows,
  buildLatestReport,
  buildMaturedOutcomes,
  expandSignal,
  persistFactorResearch,
  rankPercentiles,
  readJsonl,
  scoreObservation,
  spearman,
  summarizeEvidence,
};

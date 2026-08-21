const { DEFAULT_SECTORS } = require('./sectorRadar');

const VERSION = 'v0.5.1';
const DEFAULT_CONFIG = Object.freeze({
  factorWeightWithSector: 0.65,
  factorWeightWithoutSector: 0.85,
  neutralSectorProbability: 0.50,
  minimumOosSnapshotsForChampion: 3,
  highRiskPenalty: 0.15,
  eventRiskPenalty: 0.08,
  corporateActionPenalty: 0.04,
  negativeSectorPenalty: 0.08,
  strongThreshold: 0.78,
  watchThreshold: 0.65,
  negativeSectorThreshold: 0.40,
});

const INDUSTRY_TO_SECTOR = Object.freeze({
  '半導體業': '半導體',
  '金融保險業': '金融',
  '航運業': '航運',
  '電子零組件業': '電子零組件',
});

function finite(value) {
  return Number.isFinite(value) ? value : null;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function round(value, digits = 6) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function mean(values) {
  const xs = values.filter(Number.isFinite);
  return xs.length ? xs.reduce((sum, value) => sum + value, 0) / xs.length : null;
}

function chooseChampion(challenger, config = {}) {
  const options = { ...DEFAULT_CONFIG, ...config };
  const scored = Number(challenger?.performance?.scoredSnapshots || 0);
  const oos = challenger?.performance?.models || {};
  const validation = challenger?.training?.validation || {};
  const metricKey = scored >= options.minimumOosSnapshotsForChampion ? 'meanBrier' : 'brier';
  const source = scored >= options.minimumOosSnapshotsForChampion ? oos : validation;
  const candidates = ['baseline', 'lightgbm', 'xgboost']
    .map(model => ({ model, brier: finite(source?.[model]?.[metricKey]) }))
    .filter(row => row.brier !== null)
    .sort((a, b) => a.brier - b.brier || a.model.localeCompare(b.model));
  return {
    model: candidates[0]?.model || 'baseline',
    evidence: scored >= options.minimumOosSnapshotsForChampion ? 'forward-oos' : 'holdout',
    scoredSnapshots: scored,
  };
}

function buildExactSectorMap(sectors = DEFAULT_SECTORS) {
  const map = new Map();
  for (const [sector, symbols] of Object.entries(sectors || {})) {
    for (const symbol of symbols || []) map.set(String(symbol), sector);
  }
  return map;
}

function inferSector(row, exactSectorMap = buildExactSectorMap()) {
  const symbol = String(row?.symbol || '');
  if (exactSectorMap.has(symbol)) return { sector: exactSectorMap.get(symbol), source: 'anchor-membership' };
  const sector = INDUSTRY_TO_SECTOR[row?.industry];
  return sector ? { sector, source: 'industry-map' } : { sector: null, source: 'uncovered' };
}

function buildSectorSignals(challenger, championInfo = chooseChampion(challenger)) {
  const rows = challenger?.latestPrediction?.sectors || [];
  return new Map(rows.map(row => {
    const champion = finite(row?.[championInfo.model]);
    const otherModels = ['baseline', 'lightgbm', 'xgboost']
      .filter(model => model !== championInfo.model)
      .map(model => finite(row?.[model]));
    const otherMean = mean(otherModels);
    const probability = champion === null
      ? otherMean
      : (otherMean === null ? champion : 0.70 * champion + 0.30 * otherMean);
    const agreementValues = ['baseline', 'lightgbm', 'xgboost'].map(model => finite(row?.[model])).filter(Number.isFinite);
    const spread = agreementValues.length >= 2 ? Math.max(...agreementValues) - Math.min(...agreementValues) : null;
    return [row.sector, {
      sector: row.sector,
      probability: clamp01(probability),
      championProbability: champion,
      agreementSpread: round(spread),
      ranks: {
        baseline: row.baselineRank ?? null,
        lightgbm: row.lightgbmRank ?? null,
        xgboost: row.xgboostRank ?? null,
      },
    }];
  }));
}

function riskPenalty(row, config = {}) {
  const options = { ...DEFAULT_CONFIG, ...config };
  const flags = row?.riskFlags || [];
  if (flags.some(flag => /高風險|停止交易|下市|重大損失|訴訟|搜索|裁罰|破產|重整|退票/.test(flag))) {
    return { penalty: options.highRiskPenalty, level: 'high' };
  }
  if (flags.some(flag => /重大事件/.test(flag))) {
    return { penalty: options.eventRiskPenalty, level: 'medium' };
  }
  if (flags.some(flag => /除權息/.test(flag))) {
    return { penalty: options.corporateActionPenalty, level: 'event' };
  }
  return { penalty: 0, level: 'none' };
}

function dateAlignment(factorDate, challengerDate) {
  if (!factorDate || !challengerDate) return 'unknown';
  if (factorDate === challengerDate) return 'aligned';
  if (factorDate < challengerDate) return 'factor-lagged';
  return 'challenger-lagged';
}

function classifyRecommendation(score, {
  sectorProbability = null,
  riskLevel = 'none',
  alignment = 'unknown',
  sectorCovered = false,
} = {}, config = {}) {
  const options = { ...DEFAULT_CONFIG, ...config };
  if (riskLevel === 'high' || (sectorCovered && Number.isFinite(sectorProbability) && sectorProbability < options.negativeSectorThreshold)) {
    return '暫避';
  }
  if (score >= options.strongThreshold && riskLevel === 'none' && alignment === 'aligned' && sectorCovered && sectorProbability >= 0.55) {
    return '優先觀察';
  }
  if (score >= options.watchThreshold) return '觀察';
  return '暫避';
}

function buildRecommendationReport(factor, challenger, config = {}) {
  if (!factor?.rankings?.composite?.length) throw new Error('v0.5.1 requires factor composite rankings');
  if (!challenger?.latestPrediction?.sectors?.length) throw new Error('v0.5.1 requires latest sector challenger predictions');

  const options = { ...DEFAULT_CONFIG, ...config };
  const champion = chooseChampion(challenger, options);
  const sectorSignals = buildSectorSignals(challenger, champion);
  const exactSectorMap = buildExactSectorMap();
  const alignment = dateAlignment(factor.asOf, challenger.latestPrediction.asOf);

  const recommendations = factor.rankings.composite.map(row => {
    const factorScore = finite(row.score);
    const sectorInfo = inferSector(row, exactSectorMap);
    const sectorSignal = sectorInfo.sector ? sectorSignals.get(sectorInfo.sector) : null;
    const sectorProbability = finite(sectorSignal?.probability);
    const sectorCovered = sectorProbability !== null;
    const factorWeight = sectorCovered ? options.factorWeightWithSector : options.factorWeightWithoutSector;
    const mlWeight = 1 - factorWeight;
    const effectiveSectorProbability = sectorCovered ? sectorProbability : options.neutralSectorProbability;
    const risk = riskPenalty(row, options);
    const negativeSectorPenalty = sectorCovered && sectorProbability < options.negativeSectorThreshold
      ? options.negativeSectorPenalty
      : 0;
    const rawScore = factorScore === null
      ? null
      : factorScore * factorWeight + effectiveSectorProbability * mlWeight;
    const recommendationScore = clamp01((rawScore ?? 0) - risk.penalty - negativeSectorPenalty);
    const action = classifyRecommendation(recommendationScore, {
      sectorProbability,
      riskLevel: risk.level,
      alignment,
      sectorCovered,
    }, options);
    const confidence = alignment !== 'aligned'
      ? 'low'
      : (sectorCovered ? (sectorSignal.agreementSpread !== null && sectorSignal.agreementSpread <= 0.12 ? 'high' : 'medium') : 'factor-only');

    return {
      rank: null,
      factorRank: row.rank,
      symbol: row.symbol,
      name: row.name,
      industry: row.industry,
      close: row.close,
      recommendationScore: round(recommendationScore),
      action,
      confidence,
      factorScore: round(factorScore),
      factorWeight: round(factorWeight),
      sector: sectorInfo.sector,
      sectorSource: sectorInfo.source,
      sectorProbability: round(sectorProbability),
      sectorChampion: champion.model,
      modelAgreementSpread: sectorSignal?.agreementSpread ?? null,
      riskPenalty: round(risk.penalty + negativeSectorPenalty),
      riskFlags: row.riskFlags || [],
      rationale: [
        `Composite ${factorScore === null ? '—' : (factorScore * 100).toFixed(1)}`,
        sectorCovered ? `${sectorInfo.sector} ML ${(sectorProbability * 100).toFixed(1)}%` : 'Sector ML 未覆蓋',
        risk.level === 'none' ? '無額外事件扣分' : `風險層級 ${risk.level}`,
        alignment === 'aligned' ? '同交易日訊號' : `日期未對齊：${alignment}`,
      ],
    };
  }).sort((a, b) => b.recommendationScore - a.recommendationScore || a.symbol.localeCompare(b.symbol));

  recommendations.forEach((row, index) => { row.rank = index + 1; });

  return {
    schemaVersion: 1,
    version: VERSION,
    generatedAt: new Date().toISOString(),
    factorAsOf: factor.asOf,
    challengerAsOf: challenger.latestPrediction.asOf,
    alignment,
    status: alignment === 'aligned' ? 'aligned' : 'data-lagged',
    champion,
    methodology: {
      coveredStockWeights: { factor: options.factorWeightWithSector, sectorMl: 1 - options.factorWeightWithSector },
      uncoveredStockWeights: { factor: options.factorWeightWithoutSector, neutralSectorPrior: 1 - options.factorWeightWithoutSector },
      sectorProbability: '70% current champion + 30% mean of the other calibrated models.',
      riskPenalty: '重大事件、除權息與明顯負向 sector ML 只做扣分，不產生自動交易。',
      classification: '優先觀察需同日資料、ML 覆蓋、sector probability >= 55%、無事件扣分；其餘依 score 分為觀察/暫避。',
    },
    recommendations,
    guardrails: [
      'Research ranking only; not an order, target price or personalized investment recommendation.',
      'Factor and challenger dates must align before any row can be labeled 優先觀察.',
      'Stocks outside the six-sector ML universe use a neutral sector prior and confidence=factor-only.',
      'Forward OOS evidence remains the promotion gate; this version does not auto-trade.',
    ],
  };
}

module.exports = {
  DEFAULT_CONFIG,
  INDUSTRY_TO_SECTOR,
  VERSION,
  buildExactSectorMap,
  buildRecommendationReport,
  buildSectorSignals,
  chooseChampion,
  classifyRecommendation,
  dateAlignment,
  inferSector,
  riskPenalty,
};

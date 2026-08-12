const DEFAULT_HORIZON = 5;

function mean(values) {
  const xs = values.filter(Number.isFinite);
  return xs.length ? xs.reduce((sum, value) => sum + value, 0) / xs.length : null;
}

function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return current / previous - 1;
}

function makePredictionSnapshot(radar, generatedAt = new Date().toISOString()) {
  if (!radar || !radar.asOf || !Array.isArray(radar.data)) {
    throw new TypeError('valid sector radar result is required');
  }

  return {
    id: `${radar.asOf}:${radar.model}`,
    generatedAt,
    asOf: radar.asOf,
    model: radar.model,
    modelType: radar.modelType,
    horizonTradingDays: DEFAULT_HORIZON,
    benchmark: 'TAIEX',
    scoreSemantics: 'relative-strength score; not a calibrated probability',
    sectors: radar.data.map(row => ({
      sector: row.sector,
      rank: row.rank,
      score: row.score,
      signal: row.signal,
      coverage: row.coverage,
      anchors: (row.members || []).map(member => ({
        symbol: member.symbol,
        asOf: member.asOf,
        close: member.close,
      })).filter(member => member.asOf === radar.asOf && Number.isFinite(member.close)),
    })),
  };
}

function getTargetDate(asOf, tradingDates, horizon = DEFAULT_HORIZON) {
  const dates = [...new Set((tradingDates || []).filter(Boolean))].sort();
  const future = dates.filter(date => date > asOf);
  return future.length >= horizon ? future[horizon - 1] : null;
}

function toDateValueMap(rows, valueKey) {
  return new Map((rows || [])
    .filter(row => row && row.date && Number.isFinite(Number(row[valueKey])))
    .map(row => [row.date, Number(row[valueKey])]));
}

function scorePredictionSnapshot(snapshot, { taiexRows, stockHistoryBySymbol }) {
  if (!snapshot || !snapshot.asOf || !Array.isArray(snapshot.sectors)) {
    throw new TypeError('valid prediction snapshot is required');
  }

  const horizon = snapshot.horizonTradingDays || DEFAULT_HORIZON;
  const taiexMap = toDateValueMap(taiexRows, 'index');
  const tradingDates = [...taiexMap.keys()].sort();
  const targetDate = getTargetDate(snapshot.asOf, tradingDates, horizon);
  if (!targetDate) return null;

  const benchmarkStart = taiexMap.get(snapshot.asOf);
  const benchmarkEnd = taiexMap.get(targetDate);
  const benchmarkReturn = pctChange(benchmarkEnd, benchmarkStart);
  if (!Number.isFinite(benchmarkReturn)) return null;

  const rows = snapshot.sectors.map(sector => {
    const memberReturns = [];
    const members = [];

    for (const anchor of sector.anchors || []) {
      const history = stockHistoryBySymbol.get(anchor.symbol) || [];
      const closeMap = toDateValueMap(history, 'close');
      const targetClose = closeMap.get(targetDate);
      const return5d = pctChange(targetClose, anchor.close);
      if (Number.isFinite(return5d)) memberReturns.push(return5d);
      members.push({
        symbol: anchor.symbol,
        anchorClose: anchor.close,
        targetClose: Number.isFinite(targetClose) ? targetClose : null,
        return: Number.isFinite(return5d) ? return5d : null,
      });
    }

    const sectorReturn = mean(memberReturns);
    const relativeReturn = Number.isFinite(sectorReturn) ? sectorReturn - benchmarkReturn : null;
    return {
      sector: sector.sector,
      predictedRank: sector.rank,
      predictedScore: sector.score,
      predictedOutperform: sector.score >= 50,
      sectorReturn,
      benchmarkReturn,
      relativeReturn,
      actualOutperform: Number.isFinite(relativeReturn) ? relativeReturn > 0 : null,
      coverage: (sector.anchors || []).length ? memberReturns.length / sector.anchors.length : 0,
      members,
    };
  }).filter(row => Number.isFinite(row.relativeReturn));

  if (!rows.length) return null;

  const actualOrder = rows.slice().sort((a, b) => b.relativeReturn - a.relativeReturn);
  const actualRank = new Map(actualOrder.map((row, index) => [row.sector, index + 1]));
  for (const row of rows) {
    row.actualRank = actualRank.get(row.sector);
    row.hit = row.actualOutperform === row.predictedOutperform;
  }

  const predictedTop3 = rows.slice().sort((a, b) => a.predictedRank - b.predictedRank).slice(0, 3).map(row => row.sector);
  const actualTop3 = actualOrder.slice(0, 3).map(row => row.sector);
  const actualTop3Set = new Set(actualTop3);
  const top3HitRate = predictedTop3.length
    ? predictedTop3.filter(sector => actualTop3Set.has(sector)).length / predictedTop3.length
    : null;

  const directionRows = rows.filter(row => typeof row.hit === 'boolean');
  const directionAccuracy = directionRows.length
    ? directionRows.filter(row => row.hit).length / directionRows.length
    : null;

  return {
    id: snapshot.id,
    scoredAt: new Date().toISOString(),
    asOf: snapshot.asOf,
    targetDate,
    horizonTradingDays: horizon,
    model: snapshot.model,
    benchmark: snapshot.benchmark,
    benchmarkReturn,
    metrics: {
      directionAccuracy,
      top3HitRate,
      evaluatedSectors: rows.length,
    },
    predictedTop3,
    actualTop3,
    sectors: rows,
  };
}

function summarizeScores(scores) {
  const xs = (scores || []).filter(Boolean);
  if (!xs.length) {
    return { scoredSnapshots: 0, meanDirectionAccuracy: null, meanTop3HitRate: null };
  }
  return {
    scoredSnapshots: xs.length,
    meanDirectionAccuracy: mean(xs.map(x => x.metrics && x.metrics.directionAccuracy)),
    meanTop3HitRate: mean(xs.map(x => x.metrics && x.metrics.top3HitRate)),
    latestAsOf: xs.map(x => x.asOf).sort().at(-1),
  };
}

module.exports = {
  DEFAULT_HORIZON,
  makePredictionSnapshot,
  getTargetDate,
  scorePredictionSnapshot,
  summarizeScores,
};

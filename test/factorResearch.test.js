const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  MODEL_VERSION,
  SIGNAL_COLUMNS,
  buildFactorObservation,
  buildFactorRows,
  buildMaturedOutcomes,
  persistFactorResearch,
  scoreObservation,
  summarizeEvidence,
} = require('../factorResearch');

function envelope(dataset, data, asOf) {
  return {
    dataset,
    source: 'TWSE OpenAPI v1',
    sourceUrl: `https://example.test/${dataset}`,
    fetchedAt: `${asOf}T08:20:00.000Z`,
    asOf,
    count: data.length,
    contentHash: `sha256:${dataset}:${asOf}`,
    stale: false,
    data,
  };
}

function marketSnapshot(date, closes = {}) {
  const symbols = Object.keys(closes).length ? Object.keys(closes) : ['1101', '1102', '1103', '1104', '1105'];
  const prices = symbols.map((symbol, index) => ({
    date,
    symbol,
    name: `股票${symbol}`,
    close: closes[symbol] ?? 100 + index,
    change: index - 2,
    volume: 1_000_000 + index,
    tradeValue: 100_000_000 + index * 10_000_000,
  }));
  const valuations = symbols.map((symbol, index) => ({
    date,
    symbol,
    name: `股票${symbol}`,
    pe: 8 + index * 5,
    pb: 0.8 + index,
    dividendYield: 6 - index,
  }));
  const revenue = symbols.map((symbol, index) => ({
    publishedAt: date,
    dataMonth: date.slice(0, 7),
    symbol,
    name: `股票${symbol}`,
    yoyPercent: 50 - index * 10,
    momPercent: 20 - index * 5,
    ytdPercent: 40 - index * 8,
  }));
  const datasets = {
    stockDay: envelope('stockDay', prices, date),
    marketIndex: envelope('marketIndex', [], date),
    taiexTotalReturn: envelope('taiexTotalReturn', [], date),
    valuation: envelope('valuation', valuations, date),
    revenue: envelope('revenue', revenue, date),
    materialEvents: envelope('materialEvents', [], date),
    exRights: envelope('exRights', [], date),
  };
  return {
    schemaVersion: 1,
    generatedAt: `${date}T08:20:00.000Z`,
    freshness: { complete: true, liveDatasets: Object.keys(datasets), staleDatasets: [] },
    datasets,
  };
}

function compactSignal(values) {
  return SIGNAL_COLUMNS.map(column => values[column] ?? null);
}

function observation(date, prices, scores) {
  return {
    id: `${date}:${MODEL_VERSION}`,
    schemaVersion: 1,
    modelVersion: MODEL_VERSION,
    tradingDate: date,
    recordedAt: `${date}T08:20:00.000Z`,
    signalTiming: 'test',
    universe: {},
    columns: SIGNAL_COLUMNS,
    prices: Object.entries(prices),
    signals: Object.keys(scores).map(symbol => compactSignal({
      symbol,
      name: symbol,
      industry: '測試產業',
      close: prices[symbol],
      tradeValue: 100_000_000,
      value: scores[symbol],
      growth: scores[symbol],
      momentum: scores[symbol],
      liquidity: scores[symbol],
      composite: scores[symbol],
      coverage: 4,
      riskFlags: [],
    })),
  };
}

function testFactorDirectionAndPointInTimeFilter() {
  const snapshot = marketSnapshot('2026-08-14');
  snapshot.datasets.revenue.data.push({
    publishedAt: '2026-08-16',
    dataMonth: '2026-08',
    symbol: '1101',
    yoyPercent: -999,
    momPercent: -999,
    ytdPercent: -999,
  });
  const built = buildFactorRows(snapshot, { minTradeValue: 0 });
  const best = built.rows.slice().sort((a, b) => b.composite - a.composite)[0];
  assert.strictEqual(best.symbol, '1101', 'cheap, high-yield and high-growth stock should rank first');
  assert(built.rows.find(row => row.symbol === '1101').growth > 0.9, 'future-published revenue row must be ignored');

  const factorObservation = buildFactorObservation(snapshot, { minTradeValue: 0 });
  assert.strictEqual(factorObservation.tradingDate, '2026-08-14');
  assert.strictEqual(factorObservation.prices.length, 5);
  assert.strictEqual(factorObservation.signals.length, 5);
}

function testNextCloseScoringAndRankIc() {
  const scores = { '1101': 1, '1102': 0.75, '1103': 0.5, '1104': 0.25, '1105': 0 };
  const signal = observation('2026-08-01', { '1101': 10, '1102': 10, '1103': 10, '1104': 10, '1105': 10 }, scores);
  const entry = observation('2026-08-02', { '1101': 20, '1102': 20, '1103': 20, '1104': 20, '1105': 20 }, scores);
  const exit = observation('2026-08-09', { '1101': 30, '1102': 28, '1103': 24, '1104': 20, '1105': 16 }, scores);
  const scored = scoreObservation(signal, entry, exit, { horizon: 5 });
  assert.strictEqual(scored.entryTradingDate, '2026-08-02');
  assert.strictEqual(scored.factors.composite.topQuantileReturn, 0.5, 'return must start at next close, not signal close');
  assert(scored.factors.composite.rankIc > 0.99);
  assert(scored.factors.composite.quantileSpread > 0.69);
}

function testMaturationNeedsEntryPlusFullHorizon() {
  const scores = { '1101': 1, '1102': 0.75, '1103': 0.5, '1104': 0.25, '1105': 0 };
  const observations = [];
  for (let day = 1; day <= 7; day += 1) {
    const date = `2026-08-${String(day).padStart(2, '0')}`;
    observations.push(observation(date, {
      '1101': 100 + day * 5,
      '1102': 100 + day * 4,
      '1103': 100 + day * 3,
      '1104': 100 + day * 2,
      '1105': 100 + day,
    }, scores));
  }
  assert.strictEqual(buildMaturedOutcomes(observations.slice(0, 6), [], { horizons: [5] }).length, 0);
  const outcomes = buildMaturedOutcomes(observations, [], { horizons: [5] });
  assert.strictEqual(outcomes.length, 1);
  assert.strictEqual(outcomes[0].signalTradingDate, '2026-08-01');
  assert.strictEqual(outcomes[0].entryTradingDate, '2026-08-02');
  assert.strictEqual(outcomes[0].exitTradingDate, '2026-08-07');
  const evidence = summarizeEvidence(outcomes, { horizons: [5], minimumMaturedSnapshots: 20 });
  assert.strictEqual(evidence.status, 'collecting-forward-oos');
  assert.match(evidence.reason, /1\/20/);
}

function testStaleSnapshotCannotWriteNewDate() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'factor-research-test-'));
  const observationPath = path.join(tempDir, 'factor_forward.jsonl');
  const outcomePath = path.join(tempDir, 'factor_outcomes.jsonl');
  const latestPath = path.join(tempDir, 'factor_latest.json');
  fs.writeFileSync(latestPath, '{"trusted":true}\n', 'utf8');
  const before = fs.readFileSync(latestPath, 'utf8');

  const stale = marketSnapshot('2026-08-14');
  stale.datasets.revenue.stale = true;
  stale.freshness.complete = false;
  stale.freshness.staleDatasets = ['revenue'];
  const result = persistFactorResearch(stale, { observationPath, outcomePath, latestPath, minTradeValue: 0 });
  assert.strictEqual(result.skipped, true);
  assert.strictEqual(fs.existsSync(observationPath), false);
  assert.strictEqual(fs.existsSync(outcomePath), false);
  assert.strictEqual(fs.readFileSync(latestPath, 'utf8'), before);

  fs.unlinkSync(latestPath);
  fs.rmdirSync(tempDir);
}

function testPersistenceIsIdempotent() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'factor-idempotent-test-'));
  const observationPath = path.join(tempDir, 'factor_forward.jsonl');
  const outcomePath = path.join(tempDir, 'factor_outcomes.jsonl');
  const latestPath = path.join(tempDir, 'factor_latest.json');
  const snapshot = marketSnapshot('2026-08-14');
  const first = persistFactorResearch(snapshot, { observationPath, outcomePath, latestPath, minTradeValue: 0 });
  const latestBeforeRerun = fs.readFileSync(latestPath, 'utf8');
  const second = persistFactorResearch(snapshot, { observationPath, outcomePath, latestPath, minTradeValue: 0 });
  assert.strictEqual(first.appendedObservation, true);
  assert.strictEqual(second.appendedObservation, false);
  assert.strictEqual(second.wroteLatest, false);
  assert.strictEqual(fs.readFileSync(observationPath, 'utf8').trim().split(/\r?\n/).length, 1);
  assert.strictEqual(fs.readFileSync(latestPath, 'utf8'), latestBeforeRerun, 'duplicate date must not rewrite latest report');
  assert.strictEqual(JSON.parse(fs.readFileSync(latestPath, 'utf8')).forwardEvidence.status, 'collecting-forward-oos');

  fs.unlinkSync(observationPath);
  fs.unlinkSync(latestPath);
  fs.rmdirSync(tempDir);
}

testFactorDirectionAndPointInTimeFilter();
testNextCloseScoringAndRankIc();
testMaturationNeedsEntryPlusFullHorizon();
testStaleSnapshotCannotWriteNewDate();
testPersistenceIsIdempotent();
console.log('factorResearch tests passed');

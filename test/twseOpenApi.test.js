const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildAlerts,
  clearMemoryCache,
  DATASET_KEYS,
  fetchAllDatasets,
  fetchDataset,
  getDataset,
  normalizeExRights,
  normalizeMarketIndex,
  normalizeMaterialEvents,
  normalizeClock,
  normalizeRevenue,
  normalizeStockDay,
  normalizeTaiexTotalReturn,
  normalizeValuation,
  rocCompactToIso,
  rocMonthToIso,
  toNumber,
} = require('../scripts/twseOpenApi');
const {
  appendForwardRecord,
  buildForwardRecord,
  buildSnapshot,
  persistDailySnapshot,
} = require('../scripts/runDashboardMarketSnapshot');

function fakeResponse(contentType, body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => name.toLowerCase() === 'content-type' ? contentType : null },
    text: async () => body,
  };
}

function envelope(dataset, data, asOf = '2026-08-14') {
  return {
    dataset,
    source: 'TWSE OpenAPI v1',
    sourceUrl: `https://example.test/${dataset}`,
    fetchedAt: '2026-08-15T00:00:00.000Z',
    asOf,
    count: data.length,
    contentHash: `sha256:${dataset}`,
    stale: false,
    data,
  };
}

function testDatesAndNumbers() {
  assert.strictEqual(rocCompactToIso('1150814'), '2026-08-14');
  assert.strictEqual(rocCompactToIso('115/08/14'), '2026-08-14');
  assert.strictEqual(rocCompactToIso('bad'), null);
  assert.strictEqual(rocMonthToIso('11507'), '2026-07');
  assert.strictEqual(toNumber('1,234.50'), 1234.5);
  assert.strictEqual(toNumber('(19.2)'), -19.2);
  assert.strictEqual(toNumber(''), null);
  assert.strictEqual(normalizeClock(''), null);
}

function testNormalizers() {
  assert.deepStrictEqual(normalizeStockDay([{
    Date: '1150814', Code: '2330', Name: '台積電', TradeVolume: '21,162,682', TradeValue: '51159731253',
    OpeningPrice: '2435.00', HighestPrice: '2440.00', LowestPrice: '2395.00', ClosingPrice: '2395.00',
    Change: '-40.0000', Transaction: '105889',
  }])[0], {
    date: '2026-08-14', symbol: '2330', name: '台積電', volume: 21162682, tradeValue: 51159731253,
    open: 2435, high: 2440, low: 2395, close: 2395, change: -40, transactions: 105889,
  });

  assert.strictEqual(normalizeMarketIndex([{
    日期: '1150814', 指數: '發行量加權股價指數', 收盤指數: '45,811.01', 漲跌: '-',
    漲跌點數: '210.47', 漲跌百分比: '-0.46', 特殊處理註記: '',
  }])[0].close, 45811.01);

  assert.deepStrictEqual(normalizeTaiexTotalReturn([{ Date: '1150814', TAIEXTotalReturnIndex: '101,234.5' }])[0], {
    date: '2026-08-14', index: 101234.5,
  });

  assert.deepStrictEqual(normalizeValuation([{
    Date: '1150814', Code: '2330', Name: '台積電', PEratio: '27.76', DividendYield: '0.92', PBratio: '9.66',
  }])[0], {
    date: '2026-08-14', symbol: '2330', name: '台積電', pe: 27.76, dividendYield: 0.92, pb: 9.66,
  });

  const revenue = normalizeRevenue([{
    出表日期: '1150814', 資料年月: '11507', 公司代號: '2330', 公司名稱: '台積電', 產業別: '半導體業',
    '營業收入-當月營收': '467580548', '營業收入-上月營收': '442679969', '營業收入-去年當月營收': '323165707',
    '營業收入-上月比較增減(%)': '5.62', '營業收入-去年同月增減(%)': '44.69',
    '累計營業收入-當月累計營收': '2872064238', '累計營業收入-去年累計營收': '2096211240',
    '累計營業收入-前期比較增減(%)': '37.01', 備註: '-',
  }])[0];
  assert.strictEqual(revenue.dataMonth, '2026-07');
  assert.strictEqual(revenue.yoyPercent, 44.69);

  const event = normalizeMaterialEvents([{
    出表日期: '1150815', 發言日期: '1150814', 發言時間: '65917', 公司代號: '2330', 公司名稱: '台積電',
    '主旨 ': '公告重大訴訟', 符合條款: '第2款', 事實發生日: '1150814', 說明: '案件說明',
  }])[0];
  assert.strictEqual(event.subject, '公告重大訴訟');
  assert.strictEqual(event.time, '06:59:17');
  assert.strictEqual(event.severity, 'high');

  const action = normalizeExRights([{
    Date: '1150818', Code: '2330', Name: '台積電', Exdividend: '息', CashDividend: '5.000000',
    StockDividendRatio: '', SubscriptionRatio: '', SubscriptionPricePerShare: '', SharesOffered: '',
    SharesEmpOwner: '', SharesholderOwner: '', StockHoldingRatio: '',
  }])[0];
  assert.strictEqual(action.cashDividend, 5);
}

async function testFetchCacheAndFallback() {
  clearMemoryCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return fakeResponse('application/json; charset=utf-8', JSON.stringify([{
        Date: '1150814', Code: '2330', Name: '台積電', TradeVolume: '1', TradeValue: '2', OpeningPrice: '3',
        HighestPrice: '4', LowestPrice: '2', ClosingPrice: '3', Change: '0', Transaction: '1',
      }]));
  };
  const first = await fetchDataset('stockDay', { fetchImpl, ttlMs: 60000 });
  const second = await fetchDataset('stockDay', { fetchImpl, ttlMs: 60000 });
  assert.strictEqual(first, second, 'fresh memory cache should return the stable envelope reference');
  assert.strictEqual(calls, 1);
  assert.strictEqual(first.asOf, '2026-08-14');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twse-openapi-test-'));
  const snapshotPath = path.join(tempDir, 'latest.json');
  const saved = envelope('valuation', [{ date: '2026-08-14', symbol: '2330', pe: 20 }]);
  fs.writeFileSync(snapshotPath, JSON.stringify({ schemaVersion: 1, datasets: { valuation: saved } }), 'utf8');
  clearMemoryCache();
  const fallback = await getDataset('valuation', {
    snapshotPath,
    maxAttempts: 1,
    fetchImpl: async () => { throw new Error('offline'); },
  });
  assert.strictEqual(fallback.stale, true);
  assert.match(fallback.fallbackReason, /offline/);
  fs.unlinkSync(snapshotPath);
  fs.rmdirSync(tempDir);
}

async function testHtmlRetryAndSequentialFetch() {
  clearMemoryCache();
  let calls = 0;
  const delays = [];
  const stockRow = {
    Date: '1150814', Code: '2330', Name: '台積電', TradeVolume: '1', TradeValue: '2', OpeningPrice: '3',
    HighestPrice: '4', LowestPrice: '2', ClosingPrice: '3', Change: '0', Transaction: '1',
  };
  const recovered = await fetchDataset('stockDay', {
    force: true,
    maxAttempts: 2,
    retryDelayMs: 25,
    sleepImpl: async ms => { delays.push(ms); },
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? fakeResponse('text/html; charset=utf-8', '<html><head><title>temporary block</title></head></html>')
        : fakeResponse('application/json', JSON.stringify([stockRow]));
    },
  });
  assert.strictEqual(calls, 2);
  assert.deepStrictEqual(delays, [25]);
  assert.strictEqual(recovered.data[0].symbol, '2330');

  clearMemoryCache();
  await assert.rejects(
    fetchDataset('valuation', {
      force: true,
      maxAttempts: 1,
      fetchImpl: async () => fakeResponse('text/html', '<html>access denied</html>'),
    }),
    error => /failed after 1 attempt/.test(error.message)
      && /expected application\/json/.test(error.message)
      && /content-type=text\/html/.test(error.message)
      && /access denied/.test(error.message),
  );

  clearMemoryCache();
  let active = 0;
  let maxActive = 0;
  const requested = [];
  const datasets = await fetchAllDatasets({
    force: true,
    maxAttempts: 1,
    fetchImpl: async url => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      requested.push(url);
      await new Promise(resolve => setTimeout(resolve, 2));
      active -= 1;
      return fakeResponse('application/json', '[]');
    },
  });
  assert.strictEqual(maxActive, 1, 'seven OpenAPI requests must default to sequential execution');
  assert.strictEqual(requested.length, DATASET_KEYS.length);
  assert.deepStrictEqual(Object.keys(datasets), DATASET_KEYS);
}

async function testAllFailureUsesStaleSnapshotWithoutForwardWrite() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twse-stale-snapshot-test-'));
  const latestPath = path.join(tempDir, 'market_latest.json');
  const forwardPath = path.join(tempDir, 'forward.jsonl');
  const representativesPath = path.join(tempDir, 'sector_representatives_latest.json');
  const savedDatasets = Object.fromEntries(DATASET_KEYS.map(key => [key, envelope(key, [])]));
  const savedSnapshot = buildSnapshot(savedDatasets, '2026-08-15T00:00:00.000Z');
  fs.writeFileSync(latestPath, `${JSON.stringify(savedSnapshot, null, 2)}\n`, 'utf8');
  fs.writeFileSync(representativesPath, '{"asOf":"2026-08-14","trusted":true}\n', 'utf8');
  const originalLatest = fs.readFileSync(latestPath, 'utf8');
  const originalRepresentatives = fs.readFileSync(representativesPath, 'utf8');

  clearMemoryCache();
  const staleDatasets = await fetchAllDatasets({
    force: true,
    concurrency: 1,
    allowSnapshotFallback: true,
    snapshotPath: latestPath,
    maxAttempts: 1,
    fetchImpl: async () => fakeResponse('text/html', '<html>runner blocked</html>'),
  });
  assert(DATASET_KEYS.every(key => staleDatasets[key].stale));

  const result = persistDailySnapshot(
    buildSnapshot(staleDatasets, '2026-08-16T00:00:00.000Z'),
    { latestPath, forwardPath, representativesPath },
  );
  assert.strictEqual(result.reason, 'all-datasets-stale');
  assert.strictEqual(result.wroteLatest, false);
  assert.strictEqual(result.wroteRepresentatives, false);
  assert.strictEqual(result.appendedForward, false);
  assert.strictEqual(fs.readFileSync(latestPath, 'utf8'), originalLatest, 'trusted snapshot must remain byte-for-byte unchanged');
  assert.strictEqual(fs.existsSync(forwardPath), false, 'stale inputs must never create a forward OOS row');
  assert.strictEqual(fs.readFileSync(representativesPath, 'utf8'), originalRepresentatives, 'stale inputs must preserve trusted representatives');

  assert.throws(
    () => buildForwardRecord(buildSnapshot(staleDatasets, '2026-08-16T00:00:00.000Z')),
    /refusing to build forward OOS record from stale datasets/,
  );
  fs.unlinkSync(latestPath);
  fs.unlinkSync(representativesPath);
  fs.rmdirSync(tempDir);
}

function testForwardRecordAndAlerts() {
  const price = { date: '2026-08-14', symbol: '2330', name: '台積電', close: 2395, change: -40, volume: 10, tradeValue: 20 };
  const valuation = { date: '2026-08-14', symbol: '2330', name: '台積電', pe: 27.76, pb: 9.66, dividendYield: 0.92 };
  const revenue = { publishedAt: '2026-08-14', dataMonth: '2026-07', symbol: '2330', name: '台積電', momPercent: 5, yoyPercent: 44, ytdPercent: 37 };
  const event = { id: 'e1', disclosureDate: '2026-08-14', symbol: '2330', name: '台積電', subject: '公告重大訴訟', severity: 'high', tags: ['risk-event'] };
  const action = { date: '2026-08-18', symbol: '2330', name: '台積電', type: '息', cashDividend: 5, stockDividendRatio: null };
  const datasets = {
    stockDay: envelope('stockDay', [price]),
    marketIndex: envelope('marketIndex', [{ date: '2026-08-14', indexName: '發行量加權股價指數', close: 45811, changePercent: -0.46 }]),
    taiexTotalReturn: envelope('taiexTotalReturn', [{ date: '2026-08-14', index: 100000 }]),
    valuation: envelope('valuation', [valuation]),
    revenue: envelope('revenue', [revenue]),
    materialEvents: envelope('materialEvents', [event]),
    exRights: envelope('exRights', [action]),
  };
  const record = buildForwardRecord({ generatedAt: '2026-08-15T00:00:00Z', datasets }, ['2330']);
  assert.strictEqual(record.id, '2026-08-14:twse-openapi-v1');
  assert.strictEqual(record.stocks['2330'].valuation.pe, 27.76);
  assert.strictEqual(record.stocks['2330'].recentMaterialEvents[0].severity, 'high');

  const alerts = buildAlerts({ materialEvents: [event], exRights: [action] }, { symbols: ['2330'] });
  assert.strictEqual(alerts.length, 2);
  assert(alerts.some(alert => alert.type === 'corporate-action'));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twse-forward-test-'));
  const ledger = path.join(tempDir, 'forward.jsonl');
  assert.strictEqual(appendForwardRecord(ledger, record), true);
  assert.strictEqual(appendForwardRecord(ledger, record), false, 'same trading-day id must stay idempotent');
  assert.strictEqual(fs.readFileSync(ledger, 'utf8').trim().split(/\r?\n/).length, 1);
  fs.unlinkSync(ledger);
  fs.rmdirSync(tempDir);
}

(async () => {
  testDatesAndNumbers();
  testNormalizers();
  await testFetchCacheAndFallback();
  await testHtmlRetryAndSequentialFetch();
  await testAllFailureUsesStaleSnapshotWithoutForwardWrite();
  testForwardRecordAndAlerts();
  console.log('twseOpenApi tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});

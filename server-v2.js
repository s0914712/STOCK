require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { runMultiAgentAnalysis } = require('./agents');
const { buildSectorRadar } = require('./sectorRadar');
const { fetchJSON } = require('./scripts/twseData');
const {
  DATASET_KEYS,
  briefMaterialEvent,
  buildAlerts,
  filterBySymbols,
  getDataset,
} = require('./scripts/twseOpenApi');

const app = express();
const PORT = process.env.PORT || 3000;
const FACTOR_REPORT_PATH = path.join(__dirname, 'data', 'dashboard', 'factor_research_latest.json');
const SECTOR_CACHE_TTL_MS = 15 * 60 * 1000;
let sectorRadarCache = null;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchStockHistory(stock, months = 2) {
  const safeMonths = Math.min(Math.max(parseInt(months, 10) || 2, 1), 6);
  const allData = [];
  const now = new Date();

  for (let i = 0; i < safeMonths; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`;
    const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${stock}`;

    try {
      const data = await fetchJSON(url);
      if (data.stat === 'OK' && data.data) {
        for (const row of data.data) {
          const dateParts = row[0].split('/');
          const year = parseInt(dateParts[0], 10) + 1911;
          allData.push({
            date: `${year}-${dateParts[1]}-${dateParts[2]}`,
            volume: parseInt(row[1].replace(/,/g, ''), 10),
            open: parseFloat(row[3].replace(/,/g, '')),
            high: parseFloat(row[4].replace(/,/g, '')),
            low: parseFloat(row[5].replace(/,/g, '')),
            close: parseFloat(row[6].replace(/,/g, '')),
            change: row[7],
          });
        }
      }
    } catch {
      // One missing month should not discard the whole stock history.
    }

    if (i < safeMonths - 1) await sleep(250);
  }

  allData.sort((a, b) => a.date.localeCompare(b.date));
  return allData;
}

function parseSymbols(value, max = 50) {
  if (!value) return [];
  const symbols = [...new Set(String(value).split(',').map(s => s.trim().toUpperCase()).filter(Boolean))];
  if (symbols.length > max) throw new Error(`最多一次查詢 ${max} 檔證券`);
  const invalid = symbols.filter(symbol => !/^[0-9A-Z]{4,8}$/.test(symbol));
  if (invalid.length) throw new Error(`無效證券代碼: ${invalid.join(', ')}`);
  return symbols;
}

function boundedLimit(value, fallback = 100, max = 2000) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function filterOfficialRows(dataset, rows, query) {
  const symbols = parseSymbols(query.symbols || query.symbol || query.stock);
  let filtered = filterBySymbols(rows, symbols);

  if (dataset === 'marketIndex' && query.index) {
    const needle = String(query.index).trim().toLowerCase();
    filtered = filtered.filter(row => row.indexName.toLowerCase().includes(needle));
  }
  const dateField = dataset === 'materialEvents' ? 'disclosureDate'
    : dataset === 'revenue' ? 'publishedAt'
      : 'date';
  if (query.from) filtered = filtered.filter(row => !row[dateField] || row[dateField] >= query.from);
  if (query.to) filtered = filtered.filter(row => !row[dateField] || row[dateField] <= query.to);
  if (dataset === 'materialEvents' && query.details !== '1') filtered = filtered.map(briefMaterialEvent);

  const totalCount = filtered.length;
  const limit = query.all === '1' ? 2000 : boundedLimit(query.limit);
  return { symbols, totalCount, rows: filtered.slice(0, limit) };
}

function officialPayload(envelope, filtered) {
  return {
    success: true,
    dataset: envelope.dataset,
    source: envelope.source,
    sourceUrl: envelope.sourceUrl,
    fetchedAt: envelope.fetchedAt,
    asOf: envelope.asOf,
    stale: envelope.stale,
    fallbackReason: envelope.fallbackReason,
    count: filtered.rows.length,
    totalCount: filtered.totalCount,
    data: filtered.rows,
  };
}

function officialDatasetHandler(dataset) {
  return async (req, res) => {
    try {
      const envelope = await getDataset(dataset, { force: req.query.refresh === '1' });
      res.json(officialPayload(envelope, filterOfficialRows(dataset, envelope.data, req.query)));
    } catch (error) {
      res.status(502).json({ success: false, dataset, error: error.message });
    }
  };
}

app.get('/api/quote', async (req, res) => {
  try {
    const stocks = (req.query.stocks || '2330').split(',').map(s => s.trim());
    const exCh = stocks.map(s => `tse_${s}.tw`).join('|');
    const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${exCh}&json=1&delay=0&_=${Date.now()}`;
    const data = await fetchJSON(url);

    if (!data.msgArray || data.msgArray.length === 0) {
      return res.json({ success: false, error: '無法取得股票資料，可能非交易時間' });
    }

    const results = data.msgArray.map(item => ({
      symbol: item.c,
      name: item.n,
      price: item.z !== '-' ? parseFloat(item.z) : null,
      open: item.o !== '-' ? parseFloat(item.o) : null,
      high: item.h !== '-' ? parseFloat(item.h) : null,
      low: item.l !== '-' ? parseFloat(item.l) : null,
      yesterday: item.y !== '-' ? parseFloat(item.y) : null,
      volume: item.v ? parseInt(item.v, 10) : null,
      time: item.t,
      date: item.d,
      change: item.z !== '-' && item.y !== '-' ? (parseFloat(item.z) - parseFloat(item.y)).toFixed(2) : null,
      changePercent: item.z !== '-' && item.y !== '-'
        ? ((parseFloat(item.z) - parseFloat(item.y)) / parseFloat(item.y) * 100).toFixed(2)
        : null,
    }));

    res.json({ success: true, data: results });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/history', async (req, res) => {
  try {
    const stock = req.query.stock || '2330';
    const months = parseInt(req.query.months, 10) || 2;
    const allData = await fetchStockHistory(stock, months);
    res.json({ success: true, stock, data: allData.slice(-30) });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/market', async (req, res) => {
  try {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const url = `https://www.twse.com.tw/exchangeReport/FMTQIK?response=json&date=${dateStr}`;
    const data = await fetchJSON(url);

    if (data.stat !== 'OK' || !data.data) {
      return res.json({ success: false, error: '無法取得大盤資料' });
    }

    const rows = data.data.map(row => {
      const dateParts = row[0].split('/');
      const year = parseInt(dateParts[0], 10) + 1911;
      return {
        date: `${year}-${dateParts[1]}-${dateParts[2]}`,
        index: row[1].replace(/,/g, ''),
        change: row[2],
        volume: row[3],
      };
    });

    let realtime = null;
    try {
      const rtUrl = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw&json=1&delay=0&_=${Date.now()}`;
      const rtData = await fetchJSON(rtUrl);
      if (rtData.msgArray && rtData.msgArray.length > 0) {
        const item = rtData.msgArray[0];
        realtime = {
          index: item.z !== '-' ? parseFloat(item.z) : null,
          open: item.o !== '-' ? parseFloat(item.o) : null,
          high: item.h !== '-' ? parseFloat(item.h) : null,
          low: item.l !== '-' ? parseFloat(item.l) : null,
          yesterday: item.y !== '-' ? parseFloat(item.y) : null,
          volume: item.v ? parseInt(item.v, 10) : null,
          time: item.t,
        };
      }
    } catch {
      // Ignore real-time failure.
    }

    res.json({ success: true, data: rows, realtime });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Official, normalized TWSE OpenAPI v1 datasets. Large endpoints are brief and
// limited by default; callers opt into details/all rows explicitly.
app.get('/api/openapi/stock-day', officialDatasetHandler('stockDay'));
app.get('/api/openapi/market-index', officialDatasetHandler('marketIndex'));
app.get('/api/openapi/taiex-total-return', officialDatasetHandler('taiexTotalReturn'));
app.get('/api/openapi/valuation', officialDatasetHandler('valuation'));
app.get('/api/openapi/revenue', officialDatasetHandler('revenue'));
app.get('/api/openapi/material-events', officialDatasetHandler('materialEvents'));
app.get('/api/openapi/ex-rights', officialDatasetHandler('exRights'));

app.get('/api/openapi/status', async (req, res) => {
  try {
    const datasets = await Promise.all(DATASET_KEYS.map(key => getDataset(key, { force: req.query.refresh === '1' })));
    res.json({
      success: true,
      datasets: Object.fromEntries(datasets.map(dataset => [dataset.dataset, {
        source: dataset.source,
        fetchedAt: dataset.fetchedAt,
        asOf: dataset.asOf,
        count: dataset.count,
        stale: dataset.stale,
        fallbackReason: dataset.fallbackReason,
      }])),
    });
  } catch (error) {
    res.status(502).json({ success: false, error: error.message });
  }
});

app.get('/api/factor-research', (req, res) => {
  try {
    const report = JSON.parse(fs.readFileSync(FACTOR_REPORT_PATH, 'utf8'));
    const factor = String(req.query.factor || '').trim();
    const limit = boundedLimit(req.query.limit, 10, 50);
    if (factor) {
      const rows = report.rankings?.[factor];
      if (!rows) return res.status(400).json({ success: false, error: `unknown factor: ${factor}` });
      return res.json({
        success: true,
        modelVersion: report.modelVersion,
        asOf: report.asOf,
        factor,
        count: Math.min(rows.length, limit),
        data: rows.slice(0, limit),
        forwardEvidence: report.forwardEvidence,
      });
    }
    return res.json({ success: true, ...report });
  } catch (error) {
    return res.status(503).json({ success: false, error: `factor research unavailable: ${error.message}` });
  }
});

app.get('/api/investor-snapshot', async (req, res) => {
  try {
    const [symbol] = parseSymbols(req.query.stock, 1);
    if (!symbol) return res.status(400).json({ success: false, error: '請提供 stock 參數' });

    const entries = await Promise.all(DATASET_KEYS.map(async key => [key, await getDataset(key, {
      force: req.query.refresh === '1',
    })]));
    const datasets = Object.fromEntries(entries);
    const price = datasets.stockDay.data.find(row => row.symbol === symbol) || null;
    const valuation = datasets.valuation.data.find(row => row.symbol === symbol) || null;
    const revenue = datasets.revenue.data.find(row => row.symbol === symbol) || null;
    const events = datasets.materialEvents.data.filter(row => row.symbol === symbol).slice(0, 10);
    const exRights = datasets.exRights.data.filter(row => row.symbol === symbol).slice(0, 10);
    const taiex = datasets.marketIndex.data.find(row => row.indexName === '發行量加權股價指數') || null;
    const totalReturn = datasets.taiexTotalReturn.data.slice().sort((a, b) => a.date.localeCompare(b.date)).at(-1) || null;
    const alerts = buildAlerts({ materialEvents: events, exRights }, { symbols: [symbol] }).slice(0, 20);

    res.json({
      success: true,
      symbol,
      name: price?.name || valuation?.name || revenue?.name || symbol,
      asOf: datasets.stockDay.asOf,
      stale: Object.values(datasets).some(dataset => dataset.stale),
      price,
      valuation,
      revenue,
      market: { taiex, taiexTotalReturn: totalReturn },
      alerts,
      materialEvents: events.map(event => req.query.details === '1' ? event : briefMaterialEvent(event)),
      exRights,
      provenance: Object.fromEntries(DATASET_KEYS.map(key => [key, {
        source: datasets[key].source,
        sourceUrl: datasets[key].sourceUrl,
        fetchedAt: datasets[key].fetchedAt,
        asOf: datasets[key].asOf,
        stale: datasets[key].stale,
      }])),
    });
  } catch (error) {
    res.status(502).json({ success: false, error: error.message });
  }
});

app.get('/api/sector-radar', async (req, res) => {
  try {
    const months = Math.min(Math.max(parseInt(req.query.months, 10) || 2, 2), 4);
    const forceRefresh = req.query.refresh === '1';
    const cacheFresh = sectorRadarCache
      && sectorRadarCache.months === months
      && (Date.now() - sectorRadarCache.createdAt) < SECTOR_CACHE_TTL_MS;

    if (!forceRefresh && cacheFresh) {
      return res.json({ success: true, cached: true, data: sectorRadarCache.data });
    }

    const radar = await buildSectorRadar({
      fetchHistory: fetchStockHistory,
      months,
      concurrency: 3,
    });

    sectorRadarCache = {
      months,
      createdAt: Date.now(),
      data: radar,
    };

    res.json({ success: true, cached: false, data: radar });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/agent-analysis', async (req, res) => {
  const { stock, stockName, stockData, historicalData } = req.body;

  if (!process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY) {
    return res.json({
      success: false,
      error: '請設定 ANTHROPIC_API_KEY 或 GEMINI_API_KEY 環境變數'
    });
  }

  try {
    const result = await runMultiAgentAnalysis({
      stock,
      stockName,
      stockData,
      historicalData,
      anthropicKey: process.env.ANTHROPIC_API_KEY,
      geminiKey: process.env.GEMINI_API_KEY,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 台灣股票看板啟動: http://localhost:${PORT}`);
  console.log('   Sector Radar: ✅ baseline-v0.1');
  console.log(`   Claude API: ${process.env.ANTHROPIC_API_KEY ? '✅ 已設定' : '❌ 未設定'}`);
  console.log(`   Gemini API: ${process.env.GEMINI_API_KEY ? '✅ 已設定' : '❌ 未設定'}`);
});

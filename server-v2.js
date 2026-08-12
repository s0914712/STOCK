require('dotenv').config();
const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const { runMultiAgentAnalysis } = require('./agents');
const { buildSectorRadar } = require('./sectorRadar');

const app = express();
const PORT = process.env.PORT || 3000;
const SECTOR_CACHE_TTL_MS = 15 * 60 * 1000;
let sectorRadarCache = null;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Failed to parse JSON response'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

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

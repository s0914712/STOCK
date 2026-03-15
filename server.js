require('dotenv').config();
const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const { runMultiAgentAnalysis } = require('./agents');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Helper: fetch URL and return JSON ---
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

// --- API: Real-time stock quote ---
// GET /api/quote?stocks=2330,2317,2454
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
      volume: item.v ? parseInt(item.v) : null,
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

// --- API: Historical stock data (for K-line chart) ---
// GET /api/history?stock=2330&months=2
app.get('/api/history', async (req, res) => {
  try {
    const stock = req.query.stock || '2330';
    const months = parseInt(req.query.months) || 2;

    const allData = [];
    const now = new Date();

    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`;
      const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${stock}`;

      try {
        const data = await fetchJSON(url);
        if (data.stat === 'OK' && data.data) {
          for (const row of data.data) {
            // row: [日期, 成交股數, 成交金額, 開盤價, 最高價, 最低價, 收盤價, 漲跌價差, 成交筆數]
            const dateParts = row[0].split('/');
            const year = parseInt(dateParts[0]) + 1911; // ROC year to AD
            const month = dateParts[1];
            const day = dateParts[2];
            allData.push({
              date: `${year}-${month}-${day}`,
              volume: parseInt(row[1].replace(/,/g, '')),
              open: parseFloat(row[3].replace(/,/g, '')),
              high: parseFloat(row[4].replace(/,/g, '')),
              low: parseFloat(row[5].replace(/,/g, '')),
              close: parseFloat(row[6].replace(/,/g, '')),
              change: row[7],
            });
          }
        }
      } catch {
        // Skip failed months
      }

      // Rate limit: TWSE blocks rapid requests
      if (i < months - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Sort by date and return last 30 trading days
    allData.sort((a, b) => a.date.localeCompare(b.date));
    const last30 = allData.slice(-30);

    res.json({ success: true, stock, data: last30 });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// --- API: Market overview (TAIEX) ---
// GET /api/market
app.get('/api/market', async (req, res) => {
  try {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const url = `https://www.twse.com.tw/exchangeReport/FMTQIK?response=json&date=${dateStr}`;
    const data = await fetchJSON(url);

    if (data.stat !== 'OK' || !data.data) {
      return res.json({ success: false, error: '無法取得大盤資料' });
    }

    // data.data rows: [日期, 發行量加權股價指數, 漲跌點數, 成交金額(億)]
    const rows = data.data.map(row => {
      const dateParts = row[0].split('/');
      const year = parseInt(dateParts[0]) + 1911;
      return {
        date: `${year}-${dateParts[1]}-${dateParts[2]}`,
        index: row[1].replace(/,/g, ''),
        change: row[2],
        volume: row[3],
      };
    });

    // Also try to get real-time TAIEX
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
          volume: item.v ? parseInt(item.v) : null,
          time: item.t,
        };
      }
    } catch {
      // Ignore real-time failure
    }

    res.json({ success: true, data: rows, realtime });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// --- API: Multi-Agent Analysis ---
// POST /api/agent-analysis { stock: "2330", stockData: {...} }
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
  console.log(`   Claude API: ${process.env.ANTHROPIC_API_KEY ? '✅ 已設定' : '❌ 未設定'}`);
  console.log(`   Gemini API: ${process.env.GEMINI_API_KEY ? '✅ 已設定' : '❌ 未設定'}`);
});

// ==========================================
// Taiwan Stock Dashboard - Frontend Logic
// ==========================================

let klineChart = null;
let rsiChart = null;
let marketChart = null;
let lastHistoricalData = null;
let lastStockData = null;

// --- Utility ---
function showError(el, msg) {
  el.innerHTML = `<div class="error-msg">${msg}</div>`;
}

function getPriceClass(change) {
  if (!change) return 'price-flat';
  const v = parseFloat(change);
  if (v > 0) return 'price-up';
  if (v < 0) return 'price-down';
  return 'price-flat';
}

function formatNumber(n) {
  if (n == null) return 'N/A';
  return n.toLocaleString();
}

// ==========================================
// Section 1: Real-time Quote
// ==========================================
async function fetchQuote() {
  const input = document.getElementById('quote-input').value.trim();
  const result = document.getElementById('quote-result');
  if (!input) { showError(result, '請輸入股票代碼'); return; }

  result.innerHTML = '<div class="loading"><div class="spinner"></div><span>查詢中...</span></div>';

  try {
    const res = await fetch(`/api/quote?stocks=${encodeURIComponent(input)}`);
    const json = await res.json();

    if (!json.success) {
      showError(result, json.error || '查詢失敗');
      return;
    }

    if (json.data.length === 1) {
      lastStockData = json.data[0];
    }

    let html = '<div class="quote-cards">';
    for (const s of json.data) {
      const cls = getPriceClass(s.change);
      const arrow = parseFloat(s.change) > 0 ? '▲' : parseFloat(s.change) < 0 ? '▼' : '－';
      html += `
        <div class="quote-card">
          <div class="stock-header">
            <span class="stock-name">${s.name || s.symbol}</span>
            <span class="stock-symbol">${s.symbol}</span>
          </div>
          <div class="stock-price ${cls}">${s.price != null ? s.price : '—'}</div>
          <div class="stock-change ${cls}">
            ${arrow} ${s.change || '0.00'} (${s.changePercent || '0.00'}%)
          </div>
          <div class="stock-details">
            <span>開盤: ${s.open || '—'}</span>
            <span>最高: ${s.high || '—'}</span>
            <span>最低: ${s.low || '—'}</span>
            <span>昨收: ${s.yesterday || '—'}</span>
            <span>成交量: ${formatNumber(s.volume)} 張</span>
            <span>時間: ${s.time || '—'}</span>
          </div>
        </div>`;
    }
    html += '</div>';
    result.innerHTML = html;
  } catch (err) {
    showError(result, `查詢錯誤: ${err.message}`);
  }
}

// ==========================================
// Section 2: Official TWSE investor evidence
// ==========================================
function officialValue(value, digits = 2, suffix = '') {
  return Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : '—';
}

function revenueValue(value) {
  return Number.isFinite(value) ? `${Math.round(value).toLocaleString()} 仟元` : '—';
}

async function fetchInvestorSnapshot() {
  const stock = document.getElementById('official-input').value.trim().toUpperCase();
  const result = document.getElementById('official-result');
  const button = document.getElementById('official-btn');
  if (!/^[0-9A-Z]{4,8}$/.test(stock)) {
    showError(result, '請輸入有效的上市證券代碼');
    return;
  }

  button.disabled = true;
  result.innerHTML = '<div class="loading"><div class="spinner"></div><span>載入 TWSE 官方資料中...</span></div>';
  try {
    const response = await fetch(`/api/investor-snapshot?stock=${encodeURIComponent(stock)}`);
    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.error || `HTTP ${response.status}`);

    const price = json.price || {};
    const valuation = json.valuation || {};
    const revenue = json.revenue || {};
    const taiex = json.market?.taiex || {};
    const totalReturn = json.market?.taiexTotalReturn || {};
    const alerts = json.alerts || [];
    const stale = json.stale
      ? '<span class="official-badge stale">快照備援／可能過期</span>'
      : '<span class="official-badge live">官方最新快照</span>';

    const alertHtml = alerts.length
      ? alerts.slice(0, 8).map(alert => `
          <li class="official-alert ${escapeHtml(alert.severity)}">
            <span class="official-alert-date">${escapeHtml(alert.date)}</span>
            <span>${escapeHtml(alert.title)}</span>
          </li>`).join('')
      : '<li class="official-empty">目前快照沒有此股票的重大訊息或除權息事件。</li>';

    result.innerHTML = `
      <div class="official-heading">
        <div><strong>${escapeHtml(json.name)}</strong> <span class="stock-symbol">${escapeHtml(stock)}</span></div>
        <div>${stale}<span class="official-asof">資料日 ${escapeHtml(json.asOf || '—')}</span></div>
      </div>
      <div class="official-grid">
        <article class="official-card">
          <h3>每日行情</h3>
          <strong>${officialValue(price.close, 2)}</strong>
          <span>漲跌 ${officialValue(price.change, 2)}</span>
          <span>成交量 ${Number.isFinite(price.volume) ? Math.round(price.volume).toLocaleString() : '—'}</span>
        </article>
        <article class="official-card">
          <h3>估值</h3>
          <strong>PE ${officialValue(valuation.pe, 2)}</strong>
          <span>PB ${officialValue(valuation.pb, 2)}</span>
          <span>殖利率 ${officialValue(valuation.dividendYield, 2, '%')}</span>
        </article>
        <article class="official-card">
          <h3>月營收 ${escapeHtml(revenue.dataMonth || '—')}</h3>
          <strong>YoY ${officialValue(revenue.yoyPercent, 1, '%')}</strong>
          <span>MoM ${officialValue(revenue.momPercent, 1, '%')}</span>
          <span>${revenueValue(revenue.currentMonthRevenue)}</span>
        </article>
        <article class="official-card">
          <h3>市場基準</h3>
          <strong>TAIEX ${officialValue(taiex.close, 2)}</strong>
          <span>單日 ${officialValue(taiex.changePercent, 2, '%')}</span>
          <span>含息指數 ${officialValue(totalReturn.index, 2)}</span>
        </article>
      </div>
      <div class="official-alerts">
        <h3>事件與除權息警報</h3>
        <ul>${alertHtml}</ul>
      </div>
      <p class="official-footnote">來源：臺灣證券交易所 OpenAPI。空值代表官方資料集未提供，不以 AI 猜測補值。</p>`;
  } catch (error) {
    showError(result, `官方資料載入失敗: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

// ==========================================
// Section 3: K-Line Chart + Technical Analysis
// ==========================================
async function fetchKline() {
  const stock = document.getElementById('kline-input').value.trim();
  const taSummary = document.getElementById('ta-summary');
  if (!stock) { showError(taSummary, '請輸入股票代碼'); return; }

  taSummary.innerHTML = '<div class="loading"><div class="spinner"></div><span>載入歷史資料中...</span></div>';
  document.getElementById('kline-btn').disabled = true;

  try {
    const res = await fetch(`/api/history?stock=${encodeURIComponent(stock)}&months=3`);
    const json = await res.json();

    if (!json.success || !json.data || json.data.length === 0) {
      showError(taSummary, json.error || '無法取得歷史資料');
      document.getElementById('kline-btn').disabled = false;
      return;
    }

    lastHistoricalData = json.data;
    renderKlineChart(json.data, stock);
    renderTechnicalAnalysis(json.data);
  } catch (err) {
    showError(taSummary, `載入錯誤: ${err.message}`);
  }

  document.getElementById('kline-btn').disabled = false;
}

function renderKlineChart(data, stock) {
  const ctx = document.getElementById('kline-chart').getContext('2d');
  if (klineChart) klineChart.destroy();

  const labels = data.map(d => d.date);
  const closes = data.map(d => d.close);

  // Compute MAs
  const sma5 = computeSMAArray(closes, 5);
  const sma10 = computeSMAArray(closes, 10);
  const sma20 = computeSMAArray(closes, 20);

  // Candlestick via bar chart (high-low as error bars simulation)
  // We'll use a combination: bar chart for body + line charts for MAs
  const bodyColors = data.map(d => d.close >= d.open ? 'rgba(255,68,68,0.8)' : 'rgba(68,204,68,0.8)');
  const borderColors = data.map(d => d.close >= d.open ? '#ff4444' : '#44cc44');

  klineChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '收盤價',
          data: data.map(d => ({ x: d.date, o: d.open, h: d.high, l: d.low, c: d.close })),
          // Use close price for bar height visualization
          type: 'bar',
          data: closes,
          backgroundColor: bodyColors,
          borderColor: borderColors,
          borderWidth: 1,
          barPercentage: 0.6,
          yAxisID: 'y',
        },
        {
          label: 'MA5',
          type: 'line',
          data: sma5,
          borderColor: '#ffaa00',
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          yAxisID: 'y',
        },
        {
          label: 'MA10',
          type: 'line',
          data: sma10,
          borderColor: '#00d4ff',
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          yAxisID: 'y',
        },
        {
          label: 'MA20',
          type: 'line',
          data: sma20,
          borderColor: '#ff44ff',
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          yAxisID: 'y',
        },
        {
          label: '成交量',
          type: 'bar',
          data: data.map(d => d.volume),
          backgroundColor: data.map(d => d.close >= d.open ? 'rgba(255,68,68,0.3)' : 'rgba(68,204,68,0.3)'),
          yAxisID: 'y1',
          barPercentage: 0.4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: `${stock} K線圖`,
          color: '#00d4ff',
        },
        legend: {
          labels: { color: '#8892b0', font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              const i = ctx.dataIndex;
              const d = data[i];
              if (ctx.dataset.label === '收盤價') {
                return `開:${d.open} 高:${d.high} 低:${d.low} 收:${d.close}`;
              }
              if (ctx.dataset.label === '成交量') {
                return `成交量: ${formatNumber(d.volume)}`;
              }
              return `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2) || 'N/A'}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#8892b0', maxRotation: 45, font: { size: 10 } },
          grid: { color: '#1a1a3a' },
        },
        y: {
          position: 'left',
          ticks: { color: '#8892b0' },
          grid: { color: '#1a1a3a' },
        },
        y1: {
          position: 'right',
          ticks: { color: '#555', font: { size: 10 } },
          grid: { display: false },
        },
      },
    },
  });
}

function renderTechnicalAnalysis(data) {
  const closes = data.map(d => d.close);
  const taSummary = document.getElementById('ta-summary');

  // RSI
  const rsiValues = computeRSIArray(closes, 14);

  // Render RSI chart
  const ctx = document.getElementById('rsi-chart').getContext('2d');
  if (rsiChart) rsiChart.destroy();

  rsiChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.date),
      datasets: [
        {
          label: 'RSI(14)',
          data: rsiValues,
          borderColor: '#ffaa00',
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
        },
        {
          label: '超買線(70)',
          data: data.map(() => 70),
          borderColor: 'rgba(255,68,68,0.5)',
          borderWidth: 1,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false,
        },
        {
          label: '超賣線(30)',
          data: data.map(() => 30),
          borderColor: 'rgba(68,204,68,0.5)',
          borderWidth: 1,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: 'RSI(14)', color: '#00d4ff' },
        legend: { labels: { color: '#8892b0', font: { size: 11 } } },
      },
      scales: {
        x: {
          ticks: { color: '#8892b0', maxRotation: 45, font: { size: 10 } },
          grid: { color: '#1a1a3a' },
        },
        y: {
          min: 0, max: 100,
          ticks: { color: '#8892b0' },
          grid: { color: '#1a1a3a' },
        },
      },
    },
  });

  // TA summary cards
  const lastClose = closes[closes.length - 1];
  const sma5 = computeSMA(closes, 5);
  const sma10 = computeSMA(closes, 10);
  const sma20 = computeSMA(closes, 20);
  const rsi = rsiValues[rsiValues.length - 1];

  let rsiSignal = '中性';
  let rsiColor = '#ffaa00';
  if (rsi > 70) { rsiSignal = '超買'; rsiColor = '#ff4444'; }
  else if (rsi < 30) { rsiSignal = '超賣'; rsiColor = '#44cc44'; }

  let maSignal = '中性';
  let maColor = '#ffaa00';
  if (lastClose > sma5 && sma5 > sma10 && sma10 > sma20) {
    maSignal = '多頭排列'; maColor = '#ff4444';
  } else if (lastClose < sma5 && sma5 < sma10 && sma10 < sma20) {
    maSignal = '空頭排列'; maColor = '#44cc44';
  }

  taSummary.innerHTML = `
    <div class="ta-grid">
      <div class="ta-item">
        <div class="ta-label">收盤價</div>
        <div class="ta-value">${lastClose}</div>
      </div>
      <div class="ta-item">
        <div class="ta-label">RSI(14)</div>
        <div class="ta-value" style="color:${rsiColor}">${rsi != null ? rsi.toFixed(1) : 'N/A'}</div>
        <div class="ta-label">${rsiSignal}</div>
      </div>
      <div class="ta-item">
        <div class="ta-label">MA5</div>
        <div class="ta-value">${sma5.toFixed(2)}</div>
      </div>
      <div class="ta-item">
        <div class="ta-label">MA10</div>
        <div class="ta-value">${sma10.toFixed(2)}</div>
      </div>
      <div class="ta-item">
        <div class="ta-label">MA20</div>
        <div class="ta-value">${sma20 ? sma20.toFixed(2) : 'N/A'}</div>
      </div>
      <div class="ta-item">
        <div class="ta-label">均線排列</div>
        <div class="ta-value" style="color:${maColor};font-size:16px">${maSignal}</div>
      </div>
    </div>
  `;
}

// --- Technical Indicator Helpers ---

function computeSMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function computeSMAArray(closes, period) {
  const result = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += closes[j];
      result.push(sum / period);
    }
  }
  return result;
}

function computeRSIArray(closes, period) {
  const result = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      result.push(null);
    } else {
      let gains = 0, losses = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const diff = closes[j] - closes[j - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
      }
      const avgGain = gains / period;
      const avgLoss = losses / period;
      if (avgLoss === 0) { result.push(100); continue; }
      const rs = avgGain / avgLoss;
      result.push(100 - (100 / (1 + rs)));
    }
  }
  return result;
}

// ==========================================
// Section 3: Market Overview
// ==========================================
async function fetchMarket() {
  const result = document.getElementById('market-result');
  result.innerHTML = '<div class="loading"><div class="spinner"></div><span>載入大盤資料中...</span></div>';

  try {
    const res = await fetch('/api/market');
    const json = await res.json();

    if (!json.success) {
      showError(result, json.error || '查詢失敗');
      return;
    }

    let html = '';

    // Real-time TAIEX
    if (json.realtime) {
      const rt = json.realtime;
      const change = rt.index && rt.yesterday ? (rt.index - rt.yesterday).toFixed(2) : null;
      const changePct = change && rt.yesterday ? (change / rt.yesterday * 100).toFixed(2) : null;
      const cls = change > 0 ? 'price-up' : change < 0 ? 'price-down' : 'price-flat';

      html += `
        <div class="market-realtime">
          <div>
            <div class="index-label">加權指數 TAIEX</div>
            <div class="index-value ${cls}">${rt.index || '—'}</div>
          </div>
          <div class="stat">
            <div class="index-label">漲跌</div>
            <div class="stat-value ${cls}">${change || '—'} (${changePct || '—'}%)</div>
          </div>
          <div class="stat">
            <div class="index-label">開盤</div>
            <div class="stat-value">${rt.open || '—'}</div>
          </div>
          <div class="stat">
            <div class="index-label">最高</div>
            <div class="stat-value">${rt.high || '—'}</div>
          </div>
          <div class="stat">
            <div class="index-label">最低</div>
            <div class="stat-value">${rt.low || '—'}</div>
          </div>
          <div class="stat">
            <div class="index-label">成交量(億)</div>
            <div class="stat-value">${rt.volume || '—'}</div>
          </div>
        </div>`;
    }

    // Historical table (last 10 days)
    if (json.data && json.data.length > 0) {
      const rows = json.data.slice(-10);
      html += `
        <table class="market-table">
          <thead>
            <tr><th>日期</th><th>加權指數</th><th>漲跌點數</th><th>成交金額(億)</th></tr>
          </thead>
          <tbody>`;
      for (const row of rows.reverse()) {
        const cls = parseFloat(row.change) > 0 ? 'price-up' : parseFloat(row.change) < 0 ? 'price-down' : 'price-flat';
        html += `<tr>
          <td>${row.date}</td>
          <td>${row.index}</td>
          <td class="${cls}">${row.change}</td>
          <td>${row.volume}</td>
        </tr>`;
      }
      html += '</tbody></table>';

      // Chart
      renderMarketChart(json.data);
    }

    result.innerHTML = html;
  } catch (err) {
    showError(result, `查詢錯誤: ${err.message}`);
  }
}

function renderMarketChart(data) {
  const ctx = document.getElementById('market-chart').getContext('2d');
  if (marketChart) marketChart.destroy();

  marketChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.date),
      datasets: [{
        label: '加權指數',
        data: data.map(d => parseFloat(d.index)),
        borderColor: '#00d4ff',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#00d4ff',
        fill: {
          target: 'origin',
          above: 'rgba(0,212,255,0.1)',
        },
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#8892b0' } },
      },
      scales: {
        x: {
          ticks: { color: '#8892b0', maxRotation: 45, font: { size: 10 } },
          grid: { color: '#1a1a3a' },
        },
        y: {
          ticks: { color: '#8892b0' },
          grid: { color: '#1a1a3a' },
        },
      },
    },
  });
}

// ==========================================
// Section 4: Multi-Agent AI Analysis
// ==========================================
async function runAgentAnalysis() {
  const stock = document.getElementById('agent-input').value.trim();
  const result = document.getElementById('agent-result');
  const loading = document.getElementById('agent-loading');
  const btn = document.getElementById('agent-btn');

  if (!stock) { showError(result, '請輸入股票代碼'); return; }

  btn.disabled = true;
  loading.style.display = 'flex';
  result.innerHTML = '';

  try {
    // First fetch stock data if not already loaded
    let stockData = lastStockData;
    let historicalData = lastHistoricalData;

    if (!stockData || stockData.symbol !== stock) {
      const quoteRes = await fetch(`/api/quote?stocks=${stock}`);
      const quoteJson = await quoteRes.json();
      if (quoteJson.success && quoteJson.data.length > 0) {
        stockData = quoteJson.data[0];
      }
    }

    if (!historicalData || historicalData.length === 0) {
      const histRes = await fetch(`/api/history?stock=${stock}&months=2`);
      const histJson = await histRes.json();
      if (histJson.success) {
        historicalData = histJson.data;
      }
    }

    // Run agent analysis
    const res = await fetch('/api/agent-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stock,
        stockName: stockData?.name || stock,
        stockData,
        historicalData,
      }),
    });

    const json = await res.json();

    if (!json.success) {
      showError(result, json.error || 'AI 分析失敗');
      return;
    }

    const d = json.data;
    let html = '';

    // Final recommendation
    html += `
      <div class="recommendation-box">
        <h3>🎯 最終交易建議</h3>
        <div>${escapeHtml(d.recommendation)}</div>
      </div>`;

    // Agent steps
    html += '<h3 style="color:#00d4ff;margin:16px 0 8px">📋 分析過程</h3>';

    const agentLabels = {
      fundamentalAnalyst: { icon: '📊', name: '基本面分析師' },
      technicalAnalyst: { icon: '📈', name: '技術面分析師' },
      sentimentAnalyst: { icon: '💭', name: '情緒分析師' },
      newsAnalyst: { icon: '📰', name: '總經分析師' },
      bullResearcher: { icon: '🐂', name: '看多研究員' },
      bearResearcher: { icon: '🐻', name: '看空研究員' },
      trader: { icon: '💼', name: '交易決策者' },
    };

    for (const step of d.steps) {
      const label = agentLabels[step.agent] || { icon: '🤖', name: step.agent };
      html += `
        <div class="agent-step">
          <div class="agent-header">
            <span>${label.icon}</span>
            <span class="agent-name">${label.name}</span>
            <span class="agent-llm ${step.llm}">${step.llm}</span>
            <span class="agent-llm">${step.role}</span>
          </div>
          <div class="agent-content">${escapeHtml(step.content)}</div>
        </div>`;
    }

    html += `<p style="color:#555;font-size:12px;margin-top:8px">分析時間: ${d.timestamp}</p>`;

    result.innerHTML = html;
  } catch (err) {
    showError(result, `AI 分析錯誤: ${err.message}`);
  } finally {
    btn.disabled = false;
    loading.style.display = 'none';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==========================================
// Auto-load on page ready
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  fetchQuote();
  fetchMarket();
});

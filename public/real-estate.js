const DATA_PATH = './data/dashboard/real_estate_balance_sheet_latest.json';

const fmt = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 });
function pct(v, d = 1) { return Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '—'; }
function num(v, d = 2) { return Number.isFinite(v) ? Number(v).toFixed(d) : '—'; }
function money(v) { return Number.isFinite(v) ? `${fmt.format(v / 1e6)} 百萬` : '—'; }
function safe(v) { return String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch])); }

function stockCard(row) {
  const m = row.metrics || {};
  const b = row.balanceSheet || {};
  const notes = (row.interpretation || []).map(x => `<li>${safe(x)}</li>`).join('') || '<li>目前資料不足以形成額外判讀。</li>';
  const score = Number.isFinite(row.balanceSheetSafetyScore) ? row.balanceSheetSafetyScore.toFixed(1) : '—';
  const pb = Number.isFinite(m.priceToBook) ? `${m.priceToBook.toFixed(2)}x` : (Number.isFinite(row.valuation?.pb) ? `${row.valuation.pb.toFixed(2)}x` : '—');
  return `<article class="stock-card">
    <div class="stock-head">
      <div><span class="rank">#${row.rank}</span><h3>${safe(row.symbol)} ${safe(row.name)}</h3><small>${safe(row.fiscalYear)} 年 Q${safe(row.quarter)} · 股價 ${Number.isFinite(row.close) ? row.close : '—'}</small></div>
      <div><span class="score">${score}</span><small>安全度</small></div>
    </div>
    <div class="metric-grid">
      <div class="metric"><span>流動比率</span><strong>${num(m.currentRatio)}x</strong></div>
      <div class="metric"><span>負債比</span><strong>${pct(m.debtRatio)}</strong></div>
      <div class="metric"><span>權益比</span><strong>${pct(m.equityRatio)}</strong></div>
      <div class="metric"><span>營運資金 / 資產</span><strong>${pct(m.workingCapitalToAssets)}</strong></div>
      <div class="metric"><span>保留盈餘 / 權益</span><strong>${pct(m.retainedToEquity)}</strong></div>
      <div class="metric"><span>股價 / 每股淨值</span><strong>${pb}</strong></div>
      <div class="metric"><span>每股參考淨值</span><strong>${Number.isFinite(b.bvps) ? b.bvps.toFixed(2) : '—'}</strong></div>
      <div class="metric"><span>營收 YoY</span><strong>${Number.isFinite(row.revenue?.yoyPercent) ? `${row.revenue.yoyPercent.toFixed(1)}%` : '—'}</strong></div>
      <div class="metric"><span>總資產</span><strong>${money(b.totalAssets)}</strong></div>
    </div>
    <ul class="notes">${notes}</ul>
  </article>`;
}

async function boot() {
  const res = await fetch(`${DATA_PATH}?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const rows = data.rows || [];
  const first = rows[0];
  document.getElementById('period').textContent = first ? `${first.fiscalYear} Q${first.quarter}` : '—';
  document.getElementById('company-count').textContent = rows.length;
  document.getElementById('top-safety').textContent = first ? `${first.symbol} ${first.name}` : '—';
  document.getElementById('generated').textContent = `市場資料 ${data.marketAsOf || '—'}`;
  document.getElementById('stock-grid').innerHTML = rows.length ? rows.map(stockCard).join('') : '<div class="error-box">尚無可用的建材營造資產負債表資料。</div>';
}

boot().catch(error => {
  console.error(error);
  document.getElementById('stock-grid').innerHTML = `<div class="error-box">資料載入失敗：${safe(error.message || error)}</div>`;
});

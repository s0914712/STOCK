async function fetchSectorRadar() {
  const button = document.getElementById('sector-radar-btn');
  const result = document.getElementById('sector-radar-result');
  if (!result) return;

  button.disabled = true;
  result.innerHTML = '<div class="loading"><div class="spinner"></div><span>建立類股相對強弱排名中...</span></div>';

  try {
    const response = await fetch('/api/sector-radar');
    const json = await response.json();
    if (!json.success) throw new Error(json.error || '類股雷達建立失敗');

    const radar = json.data;
    const rows = radar.data || [];
    if (!rows.length) throw new Error('沒有足夠資料可建立類股排名');

    const formatPct = value => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'N/A';
    const formatRatio = value => Number.isFinite(value) ? `${value.toFixed(2)}x` : 'N/A';

    let html = `
      <div class="sector-meta">
        <span><strong>模型：</strong>${radar.model}</span>
        <span><strong>資料日：</strong>${radar.asOf || 'N/A'}</span>
        <span><strong>類股數：</strong>${radar.sectorCount}</span>
      </div>
      <div class="sector-warning">
        v0.1 為 cross-sectional baseline。0–100 分是相對強弱分數，不是已校準的未來上漲機率。
      </div>
      <div class="sector-table-wrap">
        <table class="sector-table">
          <thead>
            <tr>
              <th>#</th><th>類股</th><th>分數</th><th>訊號</th>
              <th>5日動能</th><th>20日動能</th><th>量比</th><th>站上MA20</th><th>年化波動</th>
            </tr>
          </thead>
          <tbody>`;

    for (const row of rows) {
      const scoreClass = row.score >= 60 ? 'sector-strong' : row.score <= 40 ? 'sector-weak' : 'sector-neutral';
      html += `
        <tr>
          <td>${row.rank}</td>
          <td><strong>${row.sector}</strong><div class="sector-symbols">${row.availableSymbols.join(', ')}</div></td>
          <td class="${scoreClass}">${row.score.toFixed(1)}</td>
          <td class="${scoreClass}">${row.signal}</td>
          <td>${formatPct(row.momentum5)}</td>
          <td>${formatPct(row.momentum20)}</td>
          <td>${formatRatio(row.volumeRatio)}</td>
          <td>${formatPct(row.breadthAboveMA20)}</td>
          <td>${formatPct(row.volatility20)}</td>
        </tr>`;
    }

    html += '</tbody></table></div>';
    if (radar.failures && radar.failures.length) {
      html += `<div class="sector-footnote">${radar.failures.length} 檔樣本因資料不足或抓取失敗而略過。</div>`;
    }
    result.innerHTML = html;
  } catch (error) {
    result.innerHTML = `<div class="error-msg">${error.message}</div>`;
  } finally {
    button.disabled = false;
  }
}

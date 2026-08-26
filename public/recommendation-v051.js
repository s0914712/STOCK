(function () {
  const DATA_PATH = './data/dashboard/recommendation_v0.5.1_latest.json';

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function pct(value, digits = 1) {
    return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : '—';
  }

  function actionClass(action) {
    if (action === '優先觀察') return 'top-pick';
    if (action === '暫避') return 'risk-text';
    return '';
  }

  function render(report) {
    const rows = report?.recommendations || [];
    if (!rows.length) return;
    const target = document.querySelector('.dashboard-shell .panel');
    if (!target) return;

    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.id = 'recommendation-v051';
    const aligned = report.status === 'aligned';
    const statusClass = aligned ? 'pill good' : 'pill warning';
    const statusText = aligned ? 'Signals aligned' : 'Data lagged';
    panel.innerHTML = `
      <div class="panel-heading">
        <div>
          <p class="eyebrow">RECOMMENDATION v0.5.1</p>
          <h2>Composite Factor × Sector ML</h2>
        </div>
        <span class="${statusClass}">${statusText}</span>
      </div>
      <p class="panel-note">研究排序把個股 Composite Factor 與類股 Challenger 機率合併；只有資料同日、ML 有覆蓋且無事件扣分時，才可能標成「優先觀察」。未覆蓋類股使用中性先驗；不自動下單。</p>
      <p class="panel-note">Factor ${esc(report.factorAsOf || '—')} · Challenger ${esc(report.challengerAsOf || '—')} · Champion ${esc(report.champion?.model || '—')} (${esc(report.champion?.evidence || '—')})</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>排名</th>
              <th>股票</th>
              <th>v0.5.1 Score</th>
              <th>動作</th>
              <th>Composite</th>
              <th>Sector ML</th>
              <th>信心</th>
              <th>理由 / 風險</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => {
              const sector = row.sector ? `${row.sector} ${pct(row.sectorProbability)}` : '未覆蓋';
              const rationale = (row.rationale || []).join('；');
              const risks = row.riskFlags?.length ? `；${row.riskFlags.join('；')}` : '';
              return `
                <tr>
                  <td class="top-pick">#${esc(row.rank)}</td>
                  <td><strong>${esc(row.symbol)} ${esc(row.name)}</strong><br><span class="rank">${esc(row.industry || '—')} · 收盤 ${esc(row.close ?? '—')}</span></td>
                  <td class="factor-score">${pct(row.recommendationScore)}</td>
                  <td class="${actionClass(row.action)}"><strong>${esc(row.action)}</strong></td>
                  <td>${pct(row.factorScore)}</td>
                  <td>${esc(sector)}</td>
                  <td>${esc(row.confidence)}</td>
                  <td class="risk-text">${esc(rationale + risks)}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    target.parentNode.insertBefore(panel, target);
  }

  async function boot() {
    try {
      const response = await fetch(`${DATA_PATH}?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      render(await response.json());
    } catch (error) {
      console.warn('v0.5.1 recommendation unavailable', error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

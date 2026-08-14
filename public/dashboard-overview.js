(() => {
  const PATHS = {
    market: './data/dashboard/market_latest.json',
    leverageShadow: './data/shadow/leverage_5050_latest.json',
    leverageBacktest: './data/backtests/leverage_5050_v5.json',
  };

  const fmt = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 });
  const fmt0 = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });

  async function loadJson(path) {
    const response = await fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  }

  function pct(value, digits = 2, signed = false) {
    if (!Number.isFinite(value)) return '—';
    const n = value * 100;
    const sign = signed && n > 0 ? '+' : '';
    return `${sign}${n.toFixed(digits)}%`;
  }

  function points(value) {
    if (!Number.isFinite(value)) return '—';
    return `${value > 0 ? '+' : ''}${fmt.format(value)}`;
  }

  function amount(value) {
    if (!Number.isFinite(value)) return '—';
    return `${fmt0.format(value / 1e8)} 億`;
  }

  function moveClass(value) {
    if (!Number.isFinite(value) || value === 0) return 'flat';
    return value > 0 ? 'up' : 'down';
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function renderMarket(snapshot) {
    const m = snapshot?.market;
    if (!m) return;
    setText('market-date', `${m.asOf} 收盤`);
    setText('market-index', fmt.format(m.close));
    setText('market-change', `${points(m.change)} / ${pct(m.changePct, 2, true)}`);
    setText('market-turnover', `成交金額 ${amount(m.amount)}`);
    const change = document.getElementById('market-change');
    if (change) change.className = `overview-change ${moveClass(m.changePct)}`;
  }

  function renderSectors(snapshot) {
    const rows = snapshot?.sectors?.rows ?? [];
    setText('sector-date', `${snapshot?.sectors?.asOf ?? '—'} · Sector Radar`);
    const container = document.getElementById('sector-top-list');
    if (!container) return;
    if (!rows.length) {
      container.innerHTML = '<div class="overview-empty">尚無類股資料</div>';
      return;
    }
    container.innerHTML = rows.slice(0, 3).map(row => `
      <div class="sector-rank-row">
        <span class="sector-rank">#${row.rank}</span>
        <div class="sector-rank-main">
          <strong>${row.sector}</strong>
          <small>${row.signal} · 5D ${pct(row.momentum5, 1, true)}</small>
        </div>
        <span class="sector-score">${Number(row.score).toFixed(1)}</span>
      </div>
    `).join('');
  }

  function findPrimary(report) {
    const factor = report?.factors?.['0.50'];
    const name = report?.primaryCandidate;
    const primary = factor?.ranking?.find(item => item.name === name) ?? null;
    const benchmark = factor?.windows?.full?.benchmarks?.taiwan50TotalReturn ?? null;
    return { primary, benchmark };
  }

  function renderStrategy(shadow, report) {
    const { primary, benchmark } = findPrimary(report);
    const m = primary?.full?.metrics;
    setText('strategy-name', '00631L 35 / 77.5 → 50');
    setText('strategy-return', pct(m?.totalReturn, 2, true));
    setText('strategy-benchmark', `Taiwan 50 TR ${pct(benchmark?.totalReturn, 2, true)}`);
    setText('strategy-risk', `DD ${pct(m?.maxDrawdown, 2)} · Sharpe ${Number.isFinite(m?.sharpe) ? m.sharpe.toFixed(2) : '—'}`);
    setText('strategy-live-weight', `00631L ${pct(shadow?.leveragedEtfWeight, 1)} · Cash ${pct(shadow?.cashWeight, 1)}`);
    setText('strategy-action', shadow?.action ?? '—');
    setText('strategy-date', `${shadow?.asOf ?? report?.period?.end ?? '—'} · Shadow`);
    const action = document.getElementById('strategy-action');
    if (action) action.className = `overview-action action-${String(shadow?.action ?? '').toLowerCase()}`;
  }

  async function boot() {
    const results = await Promise.allSettled([
      loadJson(PATHS.market),
      loadJson(PATHS.leverageShadow),
      loadJson(PATHS.leverageBacktest),
    ]);
    const market = results[0].status === 'fulfilled' ? results[0].value : null;
    const shadow = results[1].status === 'fulfilled' ? results[1].value : null;
    const report = results[2].status === 'fulfilled' ? results[2].value : null;

    if (market) {
      renderMarket(market);
      renderSectors(market);
    }
    if (shadow || report) renderStrategy(shadow, report);

    if (!market) setText('market-date', '等待每日市場快照');
    if (!market) setText('sector-date', '等待每日類股輪動');
    if (!shadow && !report) setText('strategy-date', '等待策略資料');
  }

  boot().catch(error => console.error('dashboard overview:', error));
})();

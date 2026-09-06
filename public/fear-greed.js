'use strict';

(function initFearGreedDashboard() {
  const SIGNAL_DOM_KEYS = {
    optionVolatility: 'option-volatility',
    putCallRatio: 'put-call-ratio',
    usdTwd: 'usd-twd',
    marginMaintenance: 'margin-maintenance',
    foreignFutures: 'foreign-futures',
    marketBreadth: 'market-breadth',
    marginShortRatio: 'margin-short-ratio',
    indexMomentum: 'index-momentum',
    activeAccounts: 'active-accounts',
  };

  function formatValue(signal) {
    if (!Number.isFinite(signal?.value)) return '資料缺漏';
    if (signal.unit === 'contracts') return `${Math.round(signal.value).toLocaleString('zh-TW')} 口`;
    if (signal.unit === 'index') return signal.value.toFixed(2);
    if (signal.unit === '%') return `${signal.value.toFixed(2)}%`;
    if (signal.unit === '20D %') return `${signal.value >= 0 ? '+' : ''}${signal.value.toFixed(2)}% / 20日`;
    if (signal.unit === 'MoM %') return `${signal.value >= 0 ? '+' : ''}${signal.value.toFixed(2)}% / 月`;
    return String(signal.value);
  }

  function renderSignal(signal) {
    const domKey = SIGNAL_DOM_KEYS[signal.key];
    const card = domKey && document.querySelector(`[data-sentiment-signal="${domKey}"]`);
    if (!card) return;

    card.dataset.state = signal.status;
    const oldReading = card.querySelector('.sentiment-signal-reading');
    if (oldReading) oldReading.remove();

    const reading = document.createElement('div');
    reading.className = 'sentiment-signal-reading';

    const value = document.createElement('b');
    value.textContent = formatValue(signal);
    reading.appendChild(value);

    const meta = document.createElement('small');
    const scoreText = Number.isFinite(signal.score) ? ` · 子分數 ${signal.score}` : '';
    meta.textContent = `${signal.asOf || '日期未提供'}${scoreText}`;
    reading.appendChild(meta);

    if (signal.sourceUrl) {
      const link = document.createElement('a');
      link.href = signal.sourceUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = signal.source || '官方來源';
      link.setAttribute('aria-label', `${signal.label}官方資料來源（另開新視窗）`);
      reading.appendChild(link);
    }
    card.appendChild(reading);
  }

  function renderReport(report) {
    const live = document.getElementById('fear-greed-live');
    const score = document.getElementById('fear-greed-score');
    const label = document.getElementById('fear-greed-label');
    const asOf = document.getElementById('fear-greed-asof');
    const coverage = document.getElementById('fear-greed-coverage');
    const marker = document.getElementById('fear-greed-marker');
    if (!live || !score || !label || !asOf || !coverage || !marker) return;

    const complete = report.status === 'complete' && Number.isFinite(report.score);
    live.dataset.state = complete ? 'complete' : 'partial';
    score.textContent = complete ? report.score.toFixed(1) : '—';
    label.textContent = complete ? report.label : '資料未齊，不發布綜合分數';
    asOf.textContent = `資料日期：${report.tradingDate || '—'} · 模型 ${report.modelVersion || '—'}`;
    coverage.textContent = `訊號涵蓋：${report.coverage?.available ?? 0} / ${report.coverage?.total ?? 9}`;
    marker.style.left = complete ? `${Math.max(0, Math.min(100, report.score))}%` : '0%';
    marker.hidden = !complete;

    (report.signals || []).forEach(renderSignal);
  }

  function renderFailure() {
    const live = document.getElementById('fear-greed-live');
    const label = document.getElementById('fear-greed-label');
    const asOf = document.getElementById('fear-greed-asof');
    const coverage = document.getElementById('fear-greed-coverage');
    if (live) live.dataset.state = 'unavailable';
    if (label) label.textContent = '尚無每日快照';
    if (asOf) asOf.textContent = '請先執行 npm run sentiment:daily';
    if (coverage) coverage.textContent = '綜合分數未發布';
  }

  async function loadFearGreed() {
    try {
      const response = await fetch('/api/fear-greed', { headers: { Accept: 'application/json' } });
      const report = await response.json();
      if (!response.ok || !report.success) throw new Error(report.error || `HTTP ${response.status}`);
      renderReport(report);
    } catch {
      renderFailure();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadFearGreed, { once: true });
  } else {
    loadFearGreed();
  }
})();

const DATA_PATHS = {
  challenger: './data/shadow/challenger_latest.json',
  rotation: './data/backtests/rotation_v0.4.json',
};

const MODEL_KEYS = ['baseline', 'lightgbm', 'xgboost'];
const MODEL_LABELS = {
  baseline: 'Baseline',
  lightgbm: 'LightGBM',
  xgboost: 'XGBoost',
};

function escapeHtml(value) {
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

function num(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

async function loadJson(path) {
  const joiner = path.includes('?') ? '&' : '?';
  const response = await fetch(`${path}${joiner}v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

function findChampion(validation = {}) {
  const candidates = MODEL_KEYS
    .map(key => ({ key, brier: finiteOrNull(validation?.[key]?.brier) }))
    .filter(item => item.brier !== null)
    .sort((a, b) => a.brier - b.brier);
  return candidates[0]?.key ?? 'baseline';
}

function renderStatus(challenger, rotation) {
  const latest = challenger?.latestPrediction;
  const validation = challenger?.training?.validation ?? {};
  const champion = findChampion(validation);

  document.getElementById('as-of').textContent = latest?.asOf ?? '—';
  document.getElementById('trained-through').textContent = challenger?.training?.trainedThrough ?? '—';
  document.getElementById('scored-snapshots').textContent = challenger?.performance?.scoredSnapshots ?? 0;
  document.getElementById('backtest-period').textContent = rotation?.period
    ? `${rotation.period.start} → ${rotation.period.end}`
    : '—';
  document.getElementById('target-label').textContent = latest?.target ?? '5D relative outperform probability';
  document.getElementById('champion-badge').textContent = `Champion: ${MODEL_LABELS[champion]}`;

  const generated = latest?.generatedAt || challenger?.training?.generatedAt || rotation?.generatedAt;
  document.getElementById('generated-at').textContent = generated
    ? `Last data generation: ${new Date(generated).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`
    : 'Last data generation: —';
}

function probCell(value, rank) {
  const width = Number.isFinite(value) ? Math.max(0, Math.min(100, value * 100)) : 0;
  const topClass = rank === 1 ? 'top-pick' : '';
  return `
    <div class="prob-cell ${topClass}">
      <div class="prob-top">
        <span>${pct(value, 1)}</span>
        <span class="rank">#${escapeHtml(rank ?? '—')}</span>
      </div>
      <div class="bar"><span style="width:${width.toFixed(1)}%"></span></div>
    </div>`;
}

function renderPredictions(challenger) {
  const body = document.getElementById('prediction-body');
  const sectors = challenger?.latestPrediction?.sectors ?? [];
  if (!sectors.length) {
    body.innerHTML = '<tr><td colspan="5" class="loading-cell">尚無 Shadow prediction。</td></tr>';
    return;
  }

  body.innerHTML = sectors.map(row => {
    const ranks = [
      `B #${row.baselineRank ?? '—'}`,
      `L #${row.lightgbmRank ?? '—'}`,
      `X #${row.xgboostRank ?? '—'}`,
    ].join(' · ');
    return `
      <tr>
        <td><strong>${escapeHtml(row.sector)}</strong></td>
        <td>${probCell(row.baseline, row.baselineRank)}</td>
        <td>${probCell(row.lightgbm, row.lightgbmRank)}</td>
        <td>${probCell(row.xgboost, row.xgboostRank)}</td>
        <td>${escapeHtml(ranks)}</td>
      </tr>`;
  }).join('');
}

function validationCard(key, metrics, champion) {
  const cls = key === champion ? 'model-card champion' : 'model-card';
  const badge = key === champion ? ' · Champion' : '';
  return `
    <div class="${cls}">
      <div class="model-name">${MODEL_LABELS[key]}${badge}</div>
      <div class="model-metric"><span>Brier ↓</span><strong>${num(metrics?.brier, 4)}</strong></div>
      <div class="model-metric"><span>Log loss ↓</span><strong>${num(metrics?.logloss, 4)}</strong></div>
      <div class="model-metric"><span>ROC-AUC ↑</span><strong>${num(metrics?.rocAuc, 3)}</strong></div>
    </div>`;
}

function renderValidation(challenger) {
  const validation = challenger?.training?.validation ?? {};
  const champion = findChampion(validation);
  document.getElementById('validation-cards').innerHTML = MODEL_KEYS
    .map(key => validationCard(key, validation[key], champion))
    .join('');
}

function oosCard(key, metrics = {}) {
  return `
    <div class="model-card">
      <div class="model-name">${MODEL_LABELS[key]}</div>
      <div class="model-metric"><span>Mean Brier</span><strong>${num(metrics.meanBrier, 4)}</strong></div>
      <div class="model-metric"><span>ROC-AUC</span><strong>${num(metrics.meanRocAuc, 3)}</strong></div>
      <div class="model-metric"><span>Top-1 hit</span><strong>${pct(metrics.top1HitRate, 1)}</strong></div>
      <div class="model-metric"><span>Top-3 hit</span><strong>${pct(metrics.meanTop3HitRate, 1)}</strong></div>
    </div>`;
}

function renderOos(challenger) {
  const performance = challenger?.performance ?? {};
  const models = performance.models ?? {};
  document.getElementById('oos-cards').innerHTML = MODEL_KEYS.map(key => oosCard(key, models[key])).join('');

  const n = performance.scoredSnapshots ?? 0;
  const wins = performance.brierWins ?? {};
  document.getElementById('oos-note').textContent = n > 0
    ? `已成熟 ${n} 個 snapshots；Brier wins：Baseline ${wins.baseline ?? 0} / LightGBM ${wins.lightgbm ?? 0} / XGBoost ${wins.xgboost ?? 0}`
    : '等待第一批 5D label 成熟。尚未成熟時顯示 null / — 是正常狀態。';
}

function renderStrategies(rotation) {
  const body = document.getElementById('strategy-body');
  const strategies = rotation?.strategies ?? [];
  if (!strategies.length) {
    body.innerHTML = '<tr><td colspan="6" class="loading-cell">尚無 rotation backtest。</td></tr>';
    return;
  }
  body.innerHTML = strategies.map(item => {
    const m = item.metrics ?? {};
    const isCandidate = item.name?.includes('trail 10%');
    return `
      <tr>
        <td class="${isCandidate ? 'top-pick' : ''}">${escapeHtml(item.name)}${isCandidate ? ' · shadow candidate' : ''}</td>
        <td>${pct(m.totalReturn, 2)}</td>
        <td>${pct(m.annualizedReturn, 2)}</td>
        <td>${pct(m.maxDrawdown, 2)}</td>
        <td>${escapeHtml(m.tradeCount ?? '—')}</td>
        <td>${pct(m.winRate, 1)}</td>
      </tr>`;
  }).join('');
}

function renderProxyChecks(rotation) {
  const container = document.getElementById('proxy-checks');
  const checks = rotation?.officialProxyChecks ?? {};
  const rows = Object.entries(checks);
  if (!rows.length) {
    container.innerHTML = '<div class="loading-cell">尚無 official proxy validation。</div>';
    return;
  }
  container.innerHTML = rows.map(([sector, metrics]) => {
    const corr = metrics?.dailyReturnCorrelation;
    const width = Number.isFinite(corr) ? Math.max(0, Math.min(100, corr * 100)) : 0;
    return `
      <div class="correlation-item">
        <div class="correlation-head">
          <strong>${escapeHtml(sector)}</strong>
          <span class="correlation-value">${num(corr, 3)}</span>
        </div>
        <div class="bar"><span style="width:${width.toFixed(1)}%"></span></div>
        <div class="rank">${escapeHtml(metrics?.observations ?? '—')} daily observations</div>
      </div>`;
  }).join('');

  const thematic = rotation?.thematicOnly ?? [];
  if (thematic.length) {
    container.insertAdjacentHTML('beforeend', `<p class="panel-note">Thematic-only：${escapeHtml(thematic.join('、'))}；不宣稱為官方 point-in-time sector constituents。</p>`);
  }
}

function renderError(message) {
  const shell = document.querySelector('.dashboard-shell');
  shell.insertAdjacentHTML('afterbegin', `<div class="error-box">Dashboard data load failed: ${escapeHtml(message)}</div>`);
}

async function boot() {
  try {
    const [challengerResult, rotationResult] = await Promise.allSettled([
      loadJson(DATA_PATHS.challenger),
      loadJson(DATA_PATHS.rotation),
    ]);

    const challenger = challengerResult.status === 'fulfilled' ? challengerResult.value : null;
    const rotation = rotationResult.status === 'fulfilled' ? rotationResult.value : null;

    if (!challenger && !rotation) {
      const reason = [challengerResult, rotationResult]
        .filter(x => x.status === 'rejected')
        .map(x => x.reason?.message)
        .join(' | ');
      throw new Error(reason || 'no data available');
    }

    if (challenger) {
      renderStatus(challenger, rotation);
      renderPredictions(challenger);
      renderValidation(challenger);
      renderOos(challenger);
    }
    if (rotation) {
      if (!challenger) renderStatus(null, rotation);
      renderStrategies(rotation);
      renderProxyChecks(rotation);
    }
  } catch (error) {
    console.error(error);
    renderError(error.message || error);
  }
}

boot();

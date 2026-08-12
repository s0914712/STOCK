const DATA_PATHS = {
  challenger: './data/shadow/challenger_latest.json',
  rotation: './data/backtests/rotation_v0.4.json',
  v05Shadow: './data/shadow/momentum_v05_latest.json',
  v05Backtest: './data/backtests/momentum_rotation_v0.5.json',
};

const MODEL_KEYS = ['baseline', 'lightgbm', 'xgboost'];
const MODEL_LABELS = { baseline: 'Baseline', lightgbm: 'LightGBM', xgboost: 'XGBoost' };
const V05_LABELS = {
  momentum_only: '1. Momentum only',
  momentum_trend: '2. Momentum + Trend',
  baseline: '3. Baseline probability',
  lightgbm: '4. LightGBM',
  xgboost: '5. XGBoost',
  ensemble: '6. OOS ensemble',
  full_portfolio: '7. Full portfolio rotation',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function pct(value, digits = 1) { return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : '—'; }
function num(value, digits = 3) { return Number.isFinite(value) ? value.toFixed(digits) : '—'; }
function finiteOrNull(value) { return Number.isFinite(value) ? value : null; }

async function loadJson(path) {
  const joiner = path.includes('?') ? '&' : '?';
  const response = await fetch(`${path}${joiner}v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

function findChampion(validation = {}) {
  const candidates = MODEL_KEYS.map(key => ({ key, brier: finiteOrNull(validation?.[key]?.brier) }))
    .filter(item => item.brier !== null).sort((a, b) => a.brier - b.brier);
  return candidates[0]?.key ?? 'baseline';
}

function renderStatus(challenger, rotation, v05Shadow, v05Backtest) {
  const latest = challenger?.latestPrediction;
  const validation = challenger?.training?.validation ?? {};
  const champion = findChampion(validation);
  document.getElementById('as-of').textContent = latest?.asOf ?? '—';
  document.getElementById('trained-through').textContent = challenger?.training?.trainedThrough ?? '—';
  document.getElementById('scored-snapshots').textContent = challenger?.performance?.scoredSnapshots ?? 0;
  const period = v05Backtest?.period ?? rotation?.period;
  document.getElementById('backtest-period').textContent = period ? `${period.start} → ${period.end}` : '—';
  document.getElementById('target-label').textContent = latest?.target ?? '5D relative outperform probability';
  document.getElementById('champion-badge').textContent = `Sector Champion: ${MODEL_LABELS[champion]}`;
  const generated = v05Shadow?.latestPrediction?.generatedAt || v05Backtest?.generatedAt || latest?.generatedAt || challenger?.training?.generatedAt || rotation?.generatedAt;
  document.getElementById('generated-at').textContent = generated
    ? `Last data generation: ${new Date(generated).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`
    : 'Last data generation: —';
}

function probCell(value, rank) {
  const width = Number.isFinite(value) ? Math.max(0, Math.min(100, value * 100)) : 0;
  const topClass = rank === 1 ? 'top-pick' : '';
  return `<div class="prob-cell ${topClass}"><div class="prob-top"><span>${pct(value, 1)}</span><span class="rank">#${escapeHtml(rank ?? '—')}</span></div><div class="bar"><span style="width:${width.toFixed(1)}%"></span></div></div>`;
}

function renderPredictions(challenger) {
  const body = document.getElementById('prediction-body');
  const sectors = challenger?.latestPrediction?.sectors ?? [];
  if (!sectors.length) { body.innerHTML = '<tr><td colspan="5" class="loading-cell">尚無 Shadow prediction。</td></tr>'; return; }
  body.innerHTML = sectors.map(row => {
    const ranks = [`B #${row.baselineRank ?? '—'}`, `L #${row.lightgbmRank ?? '—'}`, `X #${row.xgboostRank ?? '—'}`].join(' · ');
    return `<tr><td><strong>${escapeHtml(row.sector)}</strong></td><td>${probCell(row.baseline, row.baselineRank)}</td><td>${probCell(row.lightgbm, row.lightgbmRank)}</td><td>${probCell(row.xgboost, row.xgboostRank)}</td><td>${escapeHtml(ranks)}</td></tr>`;
  }).join('');
}

function validationCard(key, metrics, champion) {
  const cls = key === champion ? 'model-card champion' : 'model-card';
  const badge = key === champion ? ' · Champion' : '';
  return `<div class="${cls}"><div class="model-name">${MODEL_LABELS[key]}${badge}</div><div class="model-metric"><span>Brier ↓</span><strong>${num(metrics?.brier, 4)}</strong></div><div class="model-metric"><span>Log loss ↓</span><strong>${num(metrics?.logloss, 4)}</strong></div><div class="model-metric"><span>ROC-AUC ↑</span><strong>${num(metrics?.rocAuc, 3)}</strong></div></div>`;
}
function renderValidation(challenger) {
  const validation = challenger?.training?.validation ?? {};
  const champion = findChampion(validation);
  document.getElementById('validation-cards').innerHTML = MODEL_KEYS.map(key => validationCard(key, validation[key], champion)).join('');
}
function oosCard(key, metrics = {}) {
  return `<div class="model-card"><div class="model-name">${MODEL_LABELS[key]}</div><div class="model-metric"><span>Mean Brier</span><strong>${num(metrics.meanBrier, 4)}</strong></div><div class="model-metric"><span>ROC-AUC</span><strong>${num(metrics.meanRocAuc, 3)}</strong></div><div class="model-metric"><span>Top-1 hit</span><strong>${pct(metrics.top1HitRate, 1)}</strong></div><div class="model-metric"><span>Top-3 hit</span><strong>${pct(metrics.meanTop3HitRate, 1)}</strong></div></div>`;
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

function renderV05Shadow(v05) {
  const body = document.getElementById('v05-shadow-body');
  const note = document.getElementById('v05-shadow-note');
  const latest = v05?.latestPrediction;
  const rows = latest?.rows ?? [];
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="7" class="loading-cell">等待 v0.5 trainer / Shadow seed。</td></tr>';
    return;
  }
  const visible = rows.filter(r => r.portfolio_action !== 'WATCH' || r.momentum_rank <= 10);
  body.innerHTML = visible.map(r => {
    const action = escapeHtml(r.portfolio_action ?? 'WATCH');
    const trend = r.trend_pass ? '<span class="trend-pass">PASS</span>' : '<span class="trend-fail">FAIL</span>';
    return `<tr><td><strong>${escapeHtml(r.symbol)}</strong></td><td>${escapeHtml(r.sector)}</td><td>#${escapeHtml(r.momentum_rank)}</td><td>${trend}</td><td>${pct(r.calibrated_probability, 1)}</td><td><span class="action-tag action-${action.toLowerCase()}">${action}</span>${r.exit_reason ? `<div class="rank">${escapeHtml(r.exit_reason)}</div>` : ''}</td><td>${pct(r.target_weight, 1)}</td></tr>`;
  }).join('');
  const selected = latest?.selected ?? [];
  const rotation = latest?.rotationDay ? '本日為 weekly rotation day' : '本日只允許 HOLD / EXIT，不新增部位';
  note.textContent = `as-of ${latest?.asOf ?? '—'} · ${rotation} · selected: ${selected.length ? selected.join(', ') : 'CASH'} · matured OOS: ${v05?.summary?.scoredSnapshots ?? 0}`;
}

function renderV05Ablation(report) {
  const body = document.getElementById('v05-ablation-body');
  const strategies = report?.strategies ?? [];
  if (!strategies.length) {
    body.innerHTML = '<tr><td colspan="9" class="loading-cell">等待 v0.5 5Y walk-forward report。</td></tr>';
    return;
  }
  body.innerHTML = strategies.map(item => {
    const m = item.metrics ?? {};
    const t = m.totalReturn;
    const exT = Number.isFinite(t) && Number.isFinite(m.taiexReturn) ? t - m.taiexReturn : null;
    const ex50 = Number.isFinite(t) && Number.isFinite(m['0050Return']) ? t - m['0050Return'] : null;
    const isFull = item.mode === 'full_portfolio';
    return `<tr><td class="${isFull ? 'top-pick' : ''}">${escapeHtml(V05_LABELS[item.mode] ?? item.mode)}${isFull ? ' · decision layer' : ''}</td><td>${pct(t, 2)}</td><td>${pct(m.annualizedReturn, 2)}</td><td>${pct(m.maxDrawdown, 2)}</td><td>${num(m.sharpe, 2)}</td><td>${num(m.turnover, 2)}x</td><td>${pct(m.precisionAtK, 1)}</td><td>${pct(exT, 2)}</td><td>${pct(ex50, 2)}</td></tr>`;
  }).join('');
}

function renderStrategies(rotation) {
  const body = document.getElementById('strategy-body');
  const strategies = rotation?.strategies ?? [];
  if (!strategies.length) { body.innerHTML = '<tr><td colspan="6" class="loading-cell">尚無 rotation backtest。</td></tr>'; return; }
  body.innerHTML = strategies.map(item => {
    const m = item.metrics ?? {};
    const isCandidate = item.name?.includes('trail 10%');
    return `<tr><td class="${isCandidate ? 'top-pick' : ''}">${escapeHtml(item.name)}${isCandidate ? ' · shadow candidate' : ''}</td><td>${pct(m.totalReturn, 2)}</td><td>${pct(m.annualizedReturn, 2)}</td><td>${pct(m.maxDrawdown, 2)}</td><td>${escapeHtml(m.tradeCount ?? '—')}</td><td>${pct(m.winRate, 1)}</td></tr>`;
  }).join('');
}

function renderProxyChecks(rotation) {
  const container = document.getElementById('proxy-checks');
  const checks = rotation?.officialProxyChecks ?? {};
  const rows = Object.entries(checks);
  if (!rows.length) { container.innerHTML = '<div class="loading-cell">尚無 official proxy validation。</div>'; return; }
  container.innerHTML = rows.map(([sector, metrics]) => {
    const corr = metrics?.dailyReturnCorrelation;
    const width = Number.isFinite(corr) ? Math.max(0, Math.min(100, corr * 100)) : 0;
    return `<div class="correlation-item"><div class="correlation-head"><strong>${escapeHtml(sector)}</strong><span class="correlation-value">${num(corr, 3)}</span></div><div class="bar"><span style="width:${width.toFixed(1)}%"></span></div><div class="rank">${escapeHtml(metrics?.observations ?? '—')} daily observations</div></div>`;
  }).join('');
  const thematic = rotation?.thematicOnly ?? [];
  if (thematic.length) container.insertAdjacentHTML('beforeend', `<p class="panel-note">Thematic-only：${escapeHtml(thematic.join('、'))}；不宣稱為官方 point-in-time sector constituents。</p>`);
}

function renderError(message) {
  document.querySelector('.dashboard-shell').insertAdjacentHTML('afterbegin', `<div class="error-box">Dashboard data load failed: ${escapeHtml(message)}</div>`);
}

async function boot() {
  try {
    const [challengerResult, rotationResult, v05ShadowResult, v05BacktestResult] = await Promise.allSettled([
      loadJson(DATA_PATHS.challenger), loadJson(DATA_PATHS.rotation), loadJson(DATA_PATHS.v05Shadow), loadJson(DATA_PATHS.v05Backtest),
    ]);
    const challenger = challengerResult.status === 'fulfilled' ? challengerResult.value : null;
    const rotation = rotationResult.status === 'fulfilled' ? rotationResult.value : null;
    const v05Shadow = v05ShadowResult.status === 'fulfilled' ? v05ShadowResult.value : null;
    const v05Backtest = v05BacktestResult.status === 'fulfilled' ? v05BacktestResult.value : null;
    if (!challenger && !rotation && !v05Shadow && !v05Backtest) throw new Error('no dashboard data available');

    renderStatus(challenger, rotation, v05Shadow, v05Backtest);
    if (challenger) { renderPredictions(challenger); renderValidation(challenger); renderOos(challenger); }
    if (rotation) { renderStrategies(rotation); renderProxyChecks(rotation); }
    renderV05Shadow(v05Shadow);
    renderV05Ablation(v05Backtest);
  } catch (error) {
    console.error(error);
    renderError(error.message || error);
  }
}

boot();

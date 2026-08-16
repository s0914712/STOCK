const DATA_PATHS = {
  challenger: './data/shadow/challenger_latest.json',
  baseline: './data/shadow/latest.json',
  rotation: './data/backtests/rotation_v0.4.json',
  factor: './data/dashboard/factor_research_latest.json',
  representatives: './data/dashboard/sector_representatives_latest.json',
};

const MODEL_KEYS = ['baseline', 'lightgbm', 'xgboost'];
const MODEL_LABELS = {
  baseline: 'Baseline',
  lightgbm: 'LightGBM',
  xgboost: 'XGBoost',
};
const STOCK_NAMES = {
  '2303': '聯電',
  '2308': '台達電',
  '2317': '鴻海',
  '2327': '國巨',
  '2330': '台積電',
  '2368': '金像電',
  '2382': '廣達',
  '2454': '聯發科',
  '2603': '長榮',
  '2609': '陽明',
  '2615': '萬海',
  '2881': '富邦金',
  '2882': '國泰金',
  '2891': '中信金',
  '3008': '大立光',
  '3037': '欣興',
  '3044': '健鼎',
  '3231': '緯創',
};
const FACTOR_LABELS = {
  value: '價值',
  growth: '營收成長',
  momentum: '一日動能',
  liquidity: '流動性',
  composite: '綜合',
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

function renderStatus(challenger, rotation, factor) {
  const latest = challenger?.latestPrediction;
  const validation = challenger?.training?.validation ?? {};
  const champion = findChampion(validation);

  document.getElementById('as-of').textContent = latest?.asOf ?? '—';
  document.getElementById('trained-through').textContent = challenger?.training?.trainedThrough ?? '—';
  document.getElementById('scored-snapshots').textContent = challenger?.performance?.scoredSnapshots ?? 0;
  document.getElementById('backtest-period').textContent = rotation?.period
    ? `${rotation.period.start} → ${rotation.period.end}`
    : '—';
  document.getElementById('factor-as-of').textContent = factor?.asOf ?? '—';
  document.getElementById('factor-oos-status').textContent = factor?.forwardEvidence?.status === 'eligible-for-research-review'
    ? '可進一步審查'
    : '累積中';
  document.getElementById('target-label').textContent = latest?.target ?? '5D relative outperform probability';
  document.getElementById('champion-badge').textContent = `Champion: ${MODEL_LABELS[champion]}`;

  const generated = factor?.generatedAt || latest?.generatedAt || challenger?.training?.generatedAt || rotation?.generatedAt;
  document.getElementById('generated-at').textContent = generated
    ? `Last data generation: ${new Date(generated).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`
    : 'Last data generation: —';
}

function percentile(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}` : '—';
}

function renderFactorRankings(factor) {
  const body = document.getElementById('factor-body');
  const rows = factor?.rankings?.composite ?? [];
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="10" class="loading-cell">尚無可信的因子排名。</td></tr>';
    return;
  }
  body.innerHTML = rows.map(row => {
    const risks = row.riskFlags?.length ? row.riskFlags.join('；') : '—';
    return `
      <tr>
        <td class="top-pick">#${escapeHtml(row.rank)}</td>
        <td><strong>${escapeHtml(row.symbol)} ${escapeHtml(row.name)}</strong><br><span class="rank">${escapeHtml(row.industry || '產業未提供')} · 收盤 ${escapeHtml(row.close ?? '—')}</span></td>
        <td class="factor-score">${percentile(row.score)}</td>
        <td>${percentile(row.value)}</td>
        <td>${percentile(row.growth)}</td>
        <td>${percentile(row.momentum)}</td>
        <td>${percentile(row.liquidity)}</td>
        <td>${num(row.pe, 2)} / ${num(row.pb, 2)}</td>
        <td>${Number.isFinite(row.revenueYoy) ? `${row.revenueYoy.toFixed(1)}%` : '—'}</td>
        <td class="risk-text">${escapeHtml(risks)}</td>
      </tr>`;
  }).join('');
}

function renderFactorEvidence(factor) {
  const body = document.getElementById('factor-evidence-body');
  const evidence = factor?.forwardEvidence;
  const summaries = evidence?.summaries ?? [];
  const gate = document.getElementById('factor-gate');
  gate.textContent = evidence?.status === 'eligible-for-research-review' ? 'Eligible for research review' : 'Forward OOS collecting';
  gate.className = evidence?.status === 'eligible-for-research-review' ? 'pill good' : 'pill warning';
  document.getElementById('factor-evidence-note').textContent = evidence?.reason
    || '等待後續交易日資料成熟；尚無數值是正常狀態。';
  if (!summaries.length) {
    body.innerHTML = '<tr><td colspan="9" class="loading-cell">尚無 forward OOS 統計。</td></tr>';
    return;
  }
  body.innerHTML = summaries.map(row => `
    <tr>
      <td>${escapeHtml(row.horizonTradingDays)}D</td>
      <td><strong>${escapeHtml(FACTOR_LABELS[row.factor] || row.factor)}</strong></td>
      <td>${escapeHtml(row.maturedSnapshots)}</td>
      <td>${num(row.meanRankIc, 3)}</td>
      <td>${pct(row.rankIcPositiveRate, 1)}</td>
      <td>${pct(row.meanQuantileSpread, 2)}</td>
      <td>${pct(row.meanEstimatedNetReturn, 2)}</td>
      <td>${pct(row.meanTurnover, 1)}</td>
      <td>${pct(row.nonOverlappingMaxDrawdown, 2)} <span class="rank">(${escapeHtml(row.nonOverlappingPeriods)} periods)</span></td>
    </tr>`).join('');
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

function buildAllocationLeaders(challenger, baseline, limit = 2) {
  const latestPrediction = challenger?.latestPrediction;
  const latestBaseline = baseline?.latestPrediction ?? baseline;
  if (!latestPrediction?.asOf || latestPrediction.asOf !== latestBaseline?.asOf) {
    return Object.fromEntries(MODEL_KEYS.map(model => [model, []]));
  }
  const predictionRows = latestPrediction.sectors ?? [];
  const anchorRows = latestBaseline.sectors ?? [];
  const anchorsBySector = new Map(anchorRows.map(row => [
    row.sector,
    (row.anchors ?? row.members ?? [])
      .map(item => String(item?.symbol ?? item ?? ''))
      .filter(Boolean),
  ]));

  return Object.fromEntries(MODEL_KEYS.map(model => {
    const eligible = predictionRows
      .map(row => ({
        sector: row.sector,
        probability: finiteOrNull(row[model]),
        symbols: anchorsBySector.get(row.sector) ?? [],
      }))
      .filter(row => row.probability !== null && row.probability >= 0 && row.symbols.length);
    const probabilityTotal = eligible.reduce((sum, row) => sum + row.probability, 0);
    if (!(probabilityTotal > 0)) return [model, []];

    const stocks = eligible.flatMap(row => {
      const sectorWeight = row.probability / probabilityTotal;
      const stockWeight = sectorWeight / row.symbols.length;
      return row.symbols.map(symbol => ({
        symbol,
        name: STOCK_NAMES[symbol] ?? symbol,
        sector: row.sector,
        weight: stockWeight,
      }));
    });
    stocks.sort((a, b) => b.weight - a.weight || a.symbol.localeCompare(b.symbol));
    return [model, stocks.slice(0, Math.max(0, limit))];
  }));
}

function allocationCell(rows) {
  if (!rows?.length) return '<span class="rank">代表股資料不足</span>';
  return `<ol class="allocation-list">${rows.map(row => `
    <li>
      <span><strong>${escapeHtml(row.symbol)} ${escapeHtml(row.name)}</strong><small>${escapeHtml(row.sector)}</small></span>
      <b>${pct(row.weight, 2)}</b>
    </li>`).join('')}</ol>`;
}

function buildRepresentativeMap(challenger, representatives) {
  const asOf = challenger?.latestPrediction?.asOf;
  if (!asOf || asOf !== representatives?.asOf) return new Map();
  return new Map((representatives.sectors ?? []).map(row => [row.sector, row]));
}

function representativeCell(row) {
  if (!row) return '<span class="rank">同日資料不足</span>';
  const tradeValue = Number.isFinite(row.tradeValue) ? `${(row.tradeValue / 100_000_000).toFixed(1)} 億` : '—';
  return `
    <div class="representative-stock">
      <strong>${escapeHtml(row.symbol)} ${escapeHtml(row.name)}</strong>
      <span>成交額 ${escapeHtml(tradeValue)}</span>
    </div>`;
}

function renderPredictions(challenger, baseline, representatives) {
  const body = document.getElementById('prediction-body');
  const sectors = challenger?.latestPrediction?.sectors ?? [];
  if (!sectors.length) {
    body.innerHTML = '<tr><td colspan="6" class="loading-cell">尚無 Shadow prediction。</td></tr>';
    return;
  }

  const leaders = buildAllocationLeaders(challenger, baseline);
  const representativeMap = buildRepresentativeMap(challenger, representatives);
  const allocationRow = `
    <tr class="allocation-row">
      <td><strong>配置權重前二</strong><br><span class="rank">模型配置 proxy</span></td>
      <td class="allocation-method">各產業代表股見下列；依同日成交金額選出</td>
      <td>${allocationCell(leaders.baseline)}</td>
      <td>${allocationCell(leaders.lightgbm)}</td>
      <td>${allocationCell(leaders.xgboost)}</td>
      <td class="allocation-method">機率跨產業正規化；產業內代表股等權</td>
    </tr>`;

  body.innerHTML = allocationRow + sectors.map(row => {
    const ranks = [
      `B #${row.baselineRank ?? '—'}`,
      `L #${row.lightgbmRank ?? '—'}`,
      `X #${row.xgboostRank ?? '—'}`,
    ].join(' · ');
    return `
      <tr>
        <td><strong>${escapeHtml(row.sector)}</strong></td>
        <td>${representativeCell(representativeMap.get(row.sector))}</td>
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
    const [challengerResult, baselineResult, rotationResult, factorResult, representativesResult] = await Promise.allSettled([
      loadJson(DATA_PATHS.challenger),
      loadJson(DATA_PATHS.baseline),
      loadJson(DATA_PATHS.rotation),
      loadJson(DATA_PATHS.factor),
      loadJson(DATA_PATHS.representatives),
    ]);

    const challenger = challengerResult.status === 'fulfilled' ? challengerResult.value : null;
    const baseline = baselineResult.status === 'fulfilled' ? baselineResult.value : null;
    const rotation = rotationResult.status === 'fulfilled' ? rotationResult.value : null;
    const factor = factorResult.status === 'fulfilled' ? factorResult.value : null;
    const representatives = representativesResult.status === 'fulfilled' ? representativesResult.value : null;

    if (!challenger && !rotation && !factor) {
      const reason = [challengerResult, rotationResult, factorResult]
        .filter(x => x.status === 'rejected')
        .map(x => x.reason?.message)
        .join(' | ');
      throw new Error(reason || 'no data available');
    }

    if (challenger) {
      renderStatus(challenger, rotation, factor);
      renderPredictions(challenger, baseline, representatives);
      renderValidation(challenger);
      renderOos(challenger);
    }
    if (rotation) {
      if (!challenger) renderStatus(null, rotation, factor);
      renderStrategies(rotation);
      renderProxyChecks(rotation);
    }
    if (factor) {
      if (!challenger && !rotation) renderStatus(null, null, factor);
      renderFactorRankings(factor);
      renderFactorEvidence(factor);
    }
  } catch (error) {
    console.error(error);
    renderError(error.message || error);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildAllocationLeaders, buildRepresentativeMap };
}

if (typeof document !== 'undefined') boot();

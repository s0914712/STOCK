'use strict';

/**
 * Transparent v0.1 scoring contract for the Taiwan Fear & Greed Index.
 *
 * Each input is converted to a 0-100 fear-to-greed score using fixed, versioned
 * anchors. Fixed anchors keep a young daily ledger from silently changing its
 * history every time a new observation arrives. They are deliberately exposed
 * in the output and can later be replaced by a separately validated model.
 */

const MODEL_VERSION = 'tw-fear-greed-v0.1';

const SIGNAL_DEFINITIONS = Object.freeze({
  optionVolatility: Object.freeze({
    label: '選擇權波動率',
    unit: 'index',
    fearAnchor: 40,
    greedAnchor: 10,
    description: 'TAIFEX 臺指選擇權波動率最後一分鐘平均值',
  }),
  putCallRatio: Object.freeze({
    label: '賣權／買權比率',
    unit: '%',
    fearAnchor: 130,
    greedAnchor: 70,
    description: 'TXO 賣權／買權未平倉量比率；比率升高代表避險需求增加',
  }),
  usdTwd: Object.freeze({
    label: '美元／新台幣匯率',
    unit: '20D %',
    fearAnchor: 3,
    greedAnchor: -3,
    description: 'USD/NTD 二十個觀測日變動率；新台幣貶值為恐懼方向',
  }),
  marginMaintenance: Object.freeze({
    label: '融資維持率代理值',
    unit: '%',
    fearAnchor: 130,
    greedAnchor: 220,
    description: '上市融資股票市值／上市融資金額的市場代理值',
  }),
  foreignFutures: Object.freeze({
    label: '境外機構期貨持倉',
    unit: 'contracts',
    fearAnchor: -60000,
    greedAnchor: 30000,
    description: '外資在臺股期貨（TX）的淨未平倉口數',
  }),
  marketBreadth: Object.freeze({
    label: '市場廣度',
    unit: '%',
    fearAnchor: 20,
    greedAnchor: 80,
    description: '上市普通股上漲家數占上漲與下跌家數合計',
  }),
  marginShortRatio: Object.freeze({
    label: '融券／融資餘額比',
    unit: '%',
    fearAnchor: 8,
    greedAnchor: 1,
    description: '上市融券餘額／融資餘額；空頭占比升高為恐懼方向',
  }),
  indexMomentum: Object.freeze({
    label: '指數動量',
    unit: '20D %',
    fearAnchor: -15,
    greedAnchor: 15,
    description: '臺灣加權指數二十個交易日報酬率',
  }),
  activeAccounts: Object.freeze({
    label: '有效交易帳戶',
    unit: 'MoM %',
    fearAnchor: -20,
    greedAnchor: 20,
    description: '集中市場月交易人數月增率',
  }),
});

const SIGNAL_KEYS = Object.freeze(Object.keys(SIGNAL_DEFINITIONS));

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function scoreValue(value, definition) {
  if (!Number.isFinite(value)) return null;
  const span = definition.greedAnchor - definition.fearAnchor;
  if (!Number.isFinite(span) || span === 0) throw new Error('signal anchors must be different finite numbers');
  return clamp(((value - definition.fearAnchor) / span) * 100);
}

function classifyScore(score) {
  if (!Number.isFinite(score)) return null;
  if (score <= 24) return '極度恐懼';
  if (score <= 44) return '恐懼';
  if (score <= 55) return '中性';
  if (score <= 75) return '貪婪';
  return '極度貪婪';
}

function scoreSignals(inputSignals) {
  const byKey = new Map((inputSignals || []).map(signal => [signal.key, signal]));
  const signals = SIGNAL_KEYS.map(key => {
    const definition = SIGNAL_DEFINITIONS[key];
    const input = byKey.get(key) || {};
    const available = input.status === 'ok' && Number.isFinite(input.value);
    const componentScore = available ? scoreValue(input.value, definition) : null;
    return {
      ...input,
      key,
      label: definition.label,
      unit: input.unit || definition.unit,
      description: definition.description,
      score: Number.isFinite(componentScore) ? Number(componentScore.toFixed(1)) : null,
      anchors: {
        fear: definition.fearAnchor,
        greed: definition.greedAnchor,
      },
      status: available ? 'ok' : (input.status || 'unavailable'),
    };
  });

  const availableSignals = signals.filter(signal => signal.status === 'ok' && Number.isFinite(signal.score));
  const complete = availableSignals.length === SIGNAL_KEYS.length;
  const score = complete
    ? Number((availableSignals.reduce((sum, signal) => sum + signal.score, 0) / SIGNAL_KEYS.length).toFixed(1))
    : null;

  return {
    modelVersion: MODEL_VERSION,
    status: complete ? 'complete' : 'partial',
    score,
    label: classifyScore(score),
    coverage: {
      available: availableSignals.length,
      total: SIGNAL_KEYS.length,
      complete,
      missing: signals.filter(signal => signal.status !== 'ok').map(signal => signal.key),
    },
    consensus: {
      extremeFear: availableSignals.filter(signal => signal.score <= 24).length,
      extremeGreed: availableSignals.filter(signal => signal.score >= 76).length,
    },
    signals,
  };
}

module.exports = {
  MODEL_VERSION,
  SIGNAL_DEFINITIONS,
  SIGNAL_KEYS,
  classifyScore,
  clamp,
  scoreSignals,
  scoreValue,
};

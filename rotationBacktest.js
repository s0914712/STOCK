const { DEFAULT_SECTORS } = require('./sectorRadar');

const DEFAULT_COSTS = {
  buyCommission: 0.001425,
  sellCommission: 0.001425,
  sellTax: 0.003,
};

const DEFAULT_TRAILING_BOUNDS = { min: 0.03, max: 0.30 };

function mean(values) {
  const xs = values.filter(Number.isFinite);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function std(values) {
  const xs = values.filter(Number.isFinite);
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((sum, v) => sum + (v - m) ** 2, 0) / (xs.length - 1));
}

function pctChange(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b - 1 : null;
}

function rowsToMap(rows) {
  return new Map((rows || []).map(row => [row.date, row]));
}

function buildStockMaps(stockHistoryBySymbol) {
  const maps = new Map();
  for (const [symbol, rows] of stockHistoryBySymbol.entries()) maps.set(symbol, rowsToMap(rows));
  return maps;
}

function quorum(count) {
  return Math.ceil(count * 2 / 3);
}

function sectorTrailingReturn(sectorSymbols, stockMaps, dates, dateIndex, lookback = 10) {
  if (dateIndex < lookback) return null;
  const date = dates[dateIndex];
  const prior = dates[dateIndex - lookback];
  const returns = sectorSymbols.map(symbol => {
    const rows = stockMaps.get(symbol);
    const now = rows && rows.get(date);
    const before = rows && rows.get(prior);
    return now && before ? pctChange(now.close, before.close) : null;
  });
  if (returns.filter(Number.isFinite).length < quorum(sectorSymbols.length)) return null;
  return mean(returns);
}

/**
 * Realized daily volatility of the equal-weight basket, measured on trailing
 * closes only. Used to size a volatility-scaled trailing stop so that one
 * parameter behaves consistently across baskets with very different risk.
 */
function basketDailyVolatility(sectorSymbols, stockMaps, dates, dateIndex, window = 20) {
  if (dateIndex < window) return null;
  const dailyReturns = [];
  for (let i = dateIndex - window + 1; i <= dateIndex; i += 1) {
    const current = dates[i];
    const prior = dates[i - 1];
    const perStock = sectorSymbols.map(symbol => {
      const rows = stockMaps.get(symbol);
      const now = rows && rows.get(current);
      const before = rows && rows.get(prior);
      return now && before ? pctChange(now.close, before.close) : null;
    }).filter(Number.isFinite);
    if (perStock.length < quorum(sectorSymbols.length)) continue;
    dailyReturns.push(mean(perStock));
  }
  if (dailyReturns.length < Math.ceil(window * 0.7)) return null;
  return std(dailyReturns);
}

function rankSectorMomentum({ sectors = DEFAULT_SECTORS, stockMaps, dates, dateIndex, lookback = 10 }) {
  return Object.entries(sectors)
    .map(([sector, symbols]) => ({
      sector,
      momentum: sectorTrailingReturn(symbols, stockMaps, dates, dateIndex, lookback),
    }))
    .filter(row => Number.isFinite(row.momentum))
    .sort((a, b) => b.momentum - a.momentum);
}

/**
 * Market regime gate: TAIEX close versus its own trailing moving average.
 * The average only consumes closes up to and including the signal date, so the
 * gate is observable at signal time.
 */
function buildRegimeGate(taiexRows, lookback) {
  const gate = new Map();
  const rows = (taiexRows || []).filter(row => Number.isFinite(row.index));
  for (let i = 0; i < rows.length; i += 1) {
    if (i + 1 < lookback) {
      gate.set(rows[i].date, null);
      continue;
    }
    const window = rows.slice(i + 1 - lookback, i + 1).map(row => row.index);
    const ma = mean(window);
    gate.set(rows[i].date, Number.isFinite(ma) ? rows[i].index >= ma : null);
  }
  return gate;
}

function basketRelative(symbols, stockMaps, date, entryPrices, field = 'close') {
  const relatives = symbols.map(symbol => {
    const row = stockMaps.get(symbol) && stockMaps.get(symbol).get(date);
    const entry = entryPrices[symbol];
    return row && Number.isFinite(row[field]) && Number.isFinite(entry) && entry > 0
      ? row[field] / entry
      : null;
  });
  if (relatives.filter(Number.isFinite).length < quorum(symbols.length)) return null;
  return mean(relatives);
}

function entryPricesAtOpen(symbols, stockMaps, date) {
  const prices = {};
  for (const symbol of symbols) {
    const row = stockMaps.get(symbol) && stockMaps.get(symbol).get(date);
    if (!row || !Number.isFinite(row.open) || row.open <= 0) return null;
    prices[symbol] = row.open;
  }
  return prices;
}

function maxDrawdown(values) {
  let peak = -Infinity;
  let maxDD = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    peak = Math.max(peak, value);
    if (peak > 0) maxDD = Math.min(maxDD, value / peak - 1);
  }
  return maxDD;
}

function annualizedReturn(totalReturn, tradingDays) {
  if (!Number.isFinite(totalReturn) || tradingDays <= 0 || 1 + totalReturn <= 0) return null;
  return (1 + totalReturn) ** (252 / tradingDays) - 1;
}

function median(values) {
  const xs = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!xs.length) return null;
  const m = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}

function equityRiskMetrics(equityCurve) {
  const daily = [];
  for (let i = 1; i < equityCurve.length; i += 1) {
    const r = pctChange(equityCurve[i].equity, equityCurve[i - 1].equity);
    if (Number.isFinite(r)) daily.push(r);
  }
  const dailyStd = std(daily);
  const dailyMean = mean(daily);
  const annualizedVolatility = Number.isFinite(dailyStd) ? dailyStd * Math.sqrt(252) : null;
  const sharpeRatio = Number.isFinite(dailyStd) && dailyStd > 0 && Number.isFinite(dailyMean)
    ? (dailyMean * 252) / annualizedVolatility
    : null;
  return { annualizedVolatility, sharpeRatio };
}

function backtestRotation({
  stockHistoryBySymbol,
  taiexRows,
  sectors = DEFAULT_SECTORS,
  startDate,
  endDate,
  lookback = 10,
  takeProfit = 0.20,
  stopLoss = -0.20,
  trailingStop = null,
  trailingStopVolMultiple = null,
  trailingStopVolWindow = 20,
  trailingStopBounds = DEFAULT_TRAILING_BOUNDS,
  minMomentum = -Infinity,
  costs = DEFAULT_COSTS,
  switchOnLeaderChange = false,
  regimeFilter = null,
  topK = 1,
  initialCapital = 1,
}) {
  if (!(stockHistoryBySymbol instanceof Map)) throw new TypeError('stockHistoryBySymbol must be a Map');
  if (!Number.isInteger(topK) || topK < 1) throw new TypeError('topK must be a positive integer');
  const stockMaps = buildStockMaps(stockHistoryBySymbol);
  const taiexMap = rowsToMap(taiexRows);
  const dates = (taiexRows || []).map(row => row.date).filter(date => (!startDate || date >= startDate) && (!endDate || date <= endDate));
  if (dates.length < lookback + 2) throw new Error('insufficient backtest dates');

  const allDates = (taiexRows || []).map(row => row.date).filter(date => !endDate || date <= endDate);
  const allIndex = new Map(allDates.map((date, i) => [date, i]));
  const localIndexByDate = new Map(dates.map((date, i) => [date, i]));

  const regimeConfig = regimeFilter
    ? { lookback: regimeFilter.lookback || 60, mode: regimeFilter.mode || 'block-entry' }
    : null;
  const regimeGate = regimeConfig ? buildRegimeGate(taiexRows, regimeConfig.lookback) : null;
  // An undecidable gate (not enough history) is treated as risk-on so that the
  // start of the window is not silently skipped.
  const regimeOn = date => (regimeGate ? regimeGate.get(date) !== false : true);

  const volTrailing = Number.isFinite(trailingStopVolMultiple) && trailingStopVolMultiple > 0;
  const bounds = { ...DEFAULT_TRAILING_BOUNDS, ...(trailingStopBounds || {}) };

  let cash = initialCapital;
  let sleeves = [];
  let pending = [];
  const trades = [];
  const equityCurve = [];
  let filledSlotDays = 0;

  const buyRate = costs.buyCommission || 0;
  const sellRate = (costs.sellCommission || 0) + (costs.sellTax || 0);

  function heldSectors() {
    return new Set(sleeves.map(sleeve => sleeve.sector));
  }

  function trailingDistance(sleeve, globalIndex) {
    if (!volTrailing) {
      return Number.isFinite(trailingStop) && trailingStop > 0 ? trailingStop : null;
    }
    const vol = basketDailyVolatility(sleeve.symbols, stockMaps, allDates, globalIndex, trailingStopVolWindow);
    if (!Number.isFinite(vol) || vol <= 0) return null;
    return Math.min(bounds.max, Math.max(bounds.min, trailingStopVolMultiple * vol));
  }

  function executeEntry(date, sector, signalDate, signalMomentum, slotCapital) {
    const symbols = sectors[sector];
    if (!symbols) return false;
    const prices = entryPricesAtOpen(symbols, stockMaps, date);
    if (!prices) return false;
    const allocated = Math.min(slotCapital, cash);
    if (!Number.isFinite(allocated) || allocated <= 0) return false;
    const notional = allocated / (1 + buyRate);
    cash -= allocated;
    sleeves.push({
      sector, symbols, entryDate: date, signalDate, signalMomentum,
      entryPrices: prices, startingCapital: allocated, notional,
      peakCloseGross: 1, trailingDistanceAtSignal: null,
    });
    return true;
  }

  function closeSleeve(sleeve, date, reason, field) {
    const grossRelative = basketRelative(sleeve.symbols, stockMaps, date, sleeve.entryPrices, field);
    if (!Number.isFinite(grossRelative)) return false;
    const exitCapital = sleeve.notional * grossRelative * (1 - sellRate);
    trades.push({
      sector: sleeve.sector,
      signalDate: sleeve.signalDate,
      entryDate: sleeve.entryDate,
      exitDate: date,
      exitReason: reason,
      signalMomentum10d: sleeve.signalMomentum,
      trailingDistance: sleeve.trailingDistanceAtSignal,
      peakGrossReturn: sleeve.peakCloseGross - 1,
      grossReturn: grossRelative - 1,
      netReturn: exitCapital / sleeve.startingCapital - 1,
      holdingTradingDays: Math.max(1, (localIndexByDate.get(date) ?? 0) - (localIndexByDate.get(sleeve.entryDate) ?? 0)),
      startCapital: sleeve.startingCapital,
      endCapital: exitCapital,
    });
    cash += exitCapital;
    return true;
  }

  function executeExit(date, sector, reason) {
    const sleeve = sleeves.find(item => item.sector === sector);
    if (!sleeve) return;
    if (!closeSleeve(sleeve, date, reason, 'open')) return;
    sleeves = sleeves.filter(item => item !== sleeve);
  }

  for (let localIndex = 0; localIndex < dates.length; localIndex += 1) {
    const date = dates[localIndex];

    const dueToday = pending.filter(action => action.date === date);
    pending = pending.filter(action => action.date !== date);
    // Exits settle before entries so freed capital can be redeployed same day,
    // which reproduces the single-sleeve rotate-on-exit behaviour.
    for (const action of dueToday.filter(a => a.type === 'exit')) {
      executeExit(date, action.sector, action.reason);
    }
    const entriesToday = dueToday.filter(a => a.type === 'entry' && !heldSectors().has(a.sector));
    if (entriesToday.length) {
      // Size against every open slot, not just the ones being filled today, so
      // a thin signal day leaves the unfilled slot in cash instead of quietly
      // collapsing topK back to a single concentrated sleeve.
      const openSlots = Math.max(1, topK - sleeves.length);
      const slotCapital = cash / openSlots;
      for (const action of entriesToday) {
        if (sleeves.length >= topK) break;
        executeEntry(date, action.sector, action.signalDate, action.signalMomentum, slotCapital);
      }
    }

    const globalIndex = allIndex.get(date);
    const ranking = rankSectorMomentum({ sectors, stockMaps, dates: allDates, dateIndex: globalIndex, lookback });
    const eligible = ranking.filter(row => row.momentum > minMomentum);
    const targets = eligible.slice(0, topK);
    const targetSectors = new Set(targets.map(row => row.sector));
    const riskOn = regimeOn(date);

    let investedEquity = 0;
    const closeGrossBySector = new Map();
    for (const sleeve of sleeves) {
      const closeGross = basketRelative(sleeve.symbols, stockMaps, date, sleeve.entryPrices, 'close');
      if (Number.isFinite(closeGross)) {
        sleeve.peakCloseGross = Math.max(sleeve.peakCloseGross || 1, closeGross);
        closeGrossBySector.set(sleeve.sector, closeGross);
        investedEquity += sleeve.notional * closeGross * (1 - sellRate);
      } else {
        investedEquity += sleeve.startingCapital;
      }
    }
    filledSlotDays += sleeves.length / topK;
    equityCurve.push({
      date,
      equity: cash + investedEquity,
      sectors: sleeves.map(sleeve => sleeve.sector),
      sector: sleeves.length ? sleeves[0].sector : null,
      regimeOn: regimeGate ? regimeGate.get(date) : null,
    });

    const nextDate = dates[localIndex + 1];
    if (!nextDate) continue;

    const exitingSectors = new Set();
    for (const sleeve of sleeves) {
      const closeGross = closeGrossBySector.get(sleeve.sector);
      const grossReturnAtClose = Number.isFinite(closeGross) ? closeGross - 1 : null;
      const distance = trailingDistance(sleeve, globalIndex);
      sleeve.trailingDistanceAtSignal = distance;
      const trailingFloor = Number.isFinite(distance) && sleeve.peakCloseGross > 1
        ? sleeve.peakCloseGross * (1 - distance)
        : null;

      let reason = null;
      if (Number.isFinite(grossReturnAtClose) && grossReturnAtClose >= takeProfit) reason = 'take_profit';
      else if (Number.isFinite(grossReturnAtClose) && grossReturnAtClose <= stopLoss) reason = 'stop_loss';
      else if (Number.isFinite(trailingFloor) && Number.isFinite(closeGross) && closeGross <= trailingFloor) reason = 'trailing_stop';
      else if (regimeConfig && regimeConfig.mode === 'exit-and-block' && !riskOn) reason = 'regime_off';
      else if (switchOnLeaderChange && !targetSectors.has(sleeve.sector)) reason = eligible.length ? 'leader_change' : 'momentum_gate';

      if (reason) {
        exitingSectors.add(sleeve.sector);
        pending.push({ type: 'exit', date: nextDate, sector: sleeve.sector, reason });
      }
    }

    if (!riskOn) continue;

    const reserved = new Set([...heldSectors()].filter(sector => !exitingSectors.has(sector)));
    const plannedEntries = pending.filter(action => action.type === 'entry' && action.date === nextDate).length;
    let freeSlots = topK - reserved.size - plannedEntries;
    for (const target of targets) {
      if (freeSlots <= 0) break;
      if (reserved.has(target.sector)) continue;
      pending.push({
        type: 'entry', date: nextDate, sector: target.sector,
        signalDate: date, signalMomentum: target.momentum,
      });
      reserved.add(target.sector);
      freeSlots -= 1;
    }
  }

  const finalDate = dates.at(-1);
  const unliquidated = sleeves.filter(sleeve => !closeSleeve(sleeve, finalDate, 'end_of_test', 'close'));
  if (sleeves.length && equityCurve.length) {
    equityCurve[equityCurve.length - 1].equity = cash
      + unliquidated.reduce((sum, sleeve) => sum + sleeve.startingCapital, 0);
  }
  // Capital that could not be marked out at the final close is still owned, so
  // it is carried at cost rather than silently dropped from the final figure.
  const capital = cash + unliquidated.reduce((sum, sleeve) => sum + sleeve.startingCapital, 0);
  sleeves = [];

  const wins = trades.filter(t => t.netReturn > 0);
  const losses = trades.filter(t => t.netReturn < 0);
  const grossProfits = wins.reduce((sum, t) => sum + t.netReturn, 0);
  const grossLosses = Math.abs(losses.reduce((sum, t) => sum + t.netReturn, 0));
  const startTaiex = taiexMap.get(dates[0]);
  const endTaiex = taiexMap.get(dates.at(-1));
  const benchmarkReturn = startTaiex && endTaiex ? pctChange(endTaiex.index, startTaiex.index) : null;
  const totalReturn = capital / initialCapital - 1;
  const cagr = annualizedReturn(totalReturn, dates.length);
  const dd = maxDrawdown(equityCurve.map(row => row.equity));
  const positiveGate = Number.isFinite(minMomentum) && minMomentum >= 0;
  const trailLabel = volTrailing
    ? `-trailvol${trailingStopVolMultiple}`
    : (Number.isFinite(trailingStop) && trailingStop > 0 ? `-trail${Math.round(trailingStop * 100)}` : '');
  const regimeLabel = regimeConfig ? `-regime${regimeConfig.lookback}${regimeConfig.mode === 'exit-and-block' ? 'x' : 'b'}` : '';
  const topKLabel = topK > 1 ? `-top${topK}` : '';
  const risk = equityRiskMetrics(equityCurve);

  return {
    strategy: `${positiveGate ? 'positive-' : ''}${lookback}d-leader-${switchOnLeaderChange ? 'rotation' : 'entry-hold'}${topKLabel}-tp${Math.round(takeProfit * 100)}-sl${Math.round(Math.abs(stopLoss) * 100)}${trailLabel}${regimeLabel}`,
    assumptions: {
      signal: `rank sector by trailing ${lookback} trading-day equal-weight constituent close return`,
      execution: 'signal after close; trade at next session open',
      basket: 'equal capital weight in sector representative stocks at entry',
      takeProfit,
      stopLoss,
      trailingStop: Number.isFinite(trailingStop) ? trailingStop : null,
      trailingStopVolMultiple: volTrailing ? trailingStopVolMultiple : null,
      trailingStopVolWindow: volTrailing ? trailingStopVolWindow : null,
      trailingStopBounds: volTrailing ? bounds : null,
      minMomentum: Number.isFinite(minMomentum) ? minMomentum : null,
      switchOnLeaderChange,
      regimeFilter: regimeConfig,
      topK,
      costs,
    },
    period: { start: dates[0], end: dates.at(-1), tradingDays: dates.length },
    metrics: {
      initialCapital,
      finalCapital: capital,
      totalReturn,
      annualizedReturn: cagr,
      taiexReturn: benchmarkReturn,
      excessVsTaiex: Number.isFinite(benchmarkReturn) ? totalReturn - benchmarkReturn : null,
      maxDrawdown: dd,
      calmarRatio: Number.isFinite(cagr) && Number.isFinite(dd) && dd < 0 ? cagr / Math.abs(dd) : null,
      annualizedVolatility: risk.annualizedVolatility,
      sharpeRatio: risk.sharpeRatio,
      tradeCount: trades.length,
      winRate: trades.length ? wins.length / trades.length : null,
      profitFactor: grossLosses > 0 ? grossProfits / grossLosses : (grossProfits > 0 ? Infinity : null),
      avgTradeReturn: mean(trades.map(t => t.netReturn)),
      medianHoldingTradingDays: median(trades.map(t => t.holdingTradingDays)),
      exposure: dates.length ? filledSlotDays / dates.length : null,
      takeProfitCount: trades.filter(t => t.exitReason === 'take_profit').length,
      stopLossCount: trades.filter(t => t.exitReason === 'stop_loss').length,
      trailingStopCount: trades.filter(t => t.exitReason === 'trailing_stop').length,
      leaderChangeCount: trades.filter(t => t.exitReason === 'leader_change').length,
      momentumGateExitCount: trades.filter(t => t.exitReason === 'momentum_gate').length,
      regimeOffCount: trades.filter(t => t.exitReason === 'regime_off').length,
    },
    trades,
    equityCurve,
  };
}

module.exports = {
  DEFAULT_COSTS,
  DEFAULT_TRAILING_BOUNDS,
  sectorTrailingReturn,
  basketDailyVolatility,
  buildRegimeGate,
  rankSectorMomentum,
  backtestRotation,
};

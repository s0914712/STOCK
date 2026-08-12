const { DEFAULT_SECTORS } = require('./sectorRadar');

const DEFAULT_COSTS = {
  buyCommission: 0.001425,
  sellCommission: 0.001425,
  sellTax: 0.003,
};

function mean(values) {
  const xs = values.filter(Number.isFinite);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
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
  if (returns.filter(Number.isFinite).length < Math.ceil(sectorSymbols.length * 2 / 3)) return null;
  return mean(returns);
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

function basketRelative(symbols, stockMaps, date, entryPrices, field = 'close') {
  const relatives = symbols.map(symbol => {
    const row = stockMaps.get(symbol) && stockMaps.get(symbol).get(date);
    const entry = entryPrices[symbol];
    return row && Number.isFinite(row[field]) && Number.isFinite(entry) && entry > 0
      ? row[field] / entry
      : null;
  });
  if (relatives.filter(Number.isFinite).length < Math.ceil(symbols.length * 2 / 3)) return null;
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

function backtestRotation({
  stockHistoryBySymbol,
  taiexRows,
  sectors = DEFAULT_SECTORS,
  startDate,
  endDate,
  lookback = 10,
  takeProfit = 0.20,
  stopLoss = -0.20,
  minMomentum = -Infinity,
  costs = DEFAULT_COSTS,
  switchOnLeaderChange = false,
  initialCapital = 1,
}) {
  if (!(stockHistoryBySymbol instanceof Map)) throw new TypeError('stockHistoryBySymbol must be a Map');
  const stockMaps = buildStockMaps(stockHistoryBySymbol);
  const taiexMap = rowsToMap(taiexRows);
  const dates = (taiexRows || []).map(row => row.date).filter(date => (!startDate || date >= startDate) && (!endDate || date <= endDate));
  if (dates.length < lookback + 2) throw new Error('insufficient backtest dates');

  const allDates = (taiexRows || []).map(row => row.date).filter(date => !endDate || date <= endDate);
  const allIndex = new Map(allDates.map((date, i) => [date, i]));

  let capital = initialCapital;
  let position = null;
  let pending = null;
  const trades = [];
  const equityCurve = [];
  let exposedDays = 0;

  const buyRate = costs.buyCommission || 0;
  const sellRate = (costs.sellCommission || 0) + (costs.sellTax || 0);

  function executeEntry(date, sector, signalDate, signalMomentum) {
    const symbols = sectors[sector];
    const prices = entryPricesAtOpen(symbols, stockMaps, date);
    if (!prices) return false;
    const notional = capital / (1 + buyRate);
    position = {
      sector, symbols, entryDate: date, signalDate, signalMomentum,
      entryPrices: prices, startingCapital: capital, notional,
    };
    return true;
  }

  function executeExit(date, reason, nextSector, nextSignalDate, nextSignalMomentum) {
    if (!position) return;
    const grossRelative = basketRelative(position.symbols, stockMaps, date, position.entryPrices, 'open');
    if (!Number.isFinite(grossRelative)) return;
    const exitCapital = position.notional * grossRelative * (1 - sellRate);
    const netReturn = exitCapital / position.startingCapital - 1;
    trades.push({
      sector: position.sector,
      signalDate: position.signalDate,
      entryDate: position.entryDate,
      exitDate: date,
      exitReason: reason,
      signalMomentum10d: position.signalMomentum,
      grossReturn: grossRelative - 1,
      netReturn,
      holdingTradingDays: Math.max(1, dates.indexOf(date) - dates.indexOf(position.entryDate)),
      startCapital: position.startingCapital,
      endCapital: exitCapital,
    });
    capital = exitCapital;
    position = null;
    if (nextSector) executeEntry(date, nextSector, nextSignalDate, nextSignalMomentum);
  }

  for (let localIndex = 0; localIndex < dates.length; localIndex += 1) {
    const date = dates[localIndex];

    if (pending && pending.date === date) {
      if (pending.type === 'entry') {
        executeEntry(date, pending.sector, pending.signalDate, pending.signalMomentum);
      } else if (pending.type === 'exit') {
        executeExit(date, pending.reason, pending.nextSector, pending.signalDate, pending.signalMomentum);
      }
      pending = null;
    }

    const globalIndex = allIndex.get(date);
    const ranking = rankSectorMomentum({ sectors, stockMaps, dates: allDates, dateIndex: globalIndex, lookback });
    const leader = ranking.find(row => row.momentum > minMomentum) || null;

    let liquidationEquity = capital;
    let closeGross = null;
    if (position) {
      exposedDays += 1;
      closeGross = basketRelative(position.symbols, stockMaps, date, position.entryPrices, 'close');
      if (Number.isFinite(closeGross)) liquidationEquity = position.notional * closeGross * (1 - sellRate);
    }
    equityCurve.push({ date, equity: liquidationEquity, sector: position ? position.sector : null });

    const nextDate = dates[localIndex + 1];
    if (!nextDate) continue;

    if (!position) {
      if (leader) {
        pending = { type: 'entry', date: nextDate, sector: leader.sector, signalDate: date, signalMomentum: leader.momentum };
      }
      continue;
    }

    const grossReturnAtClose = Number.isFinite(closeGross) ? closeGross - 1 : null;
    let reason = null;
    if (Number.isFinite(grossReturnAtClose) && grossReturnAtClose >= takeProfit) reason = 'take_profit';
    else if (Number.isFinite(grossReturnAtClose) && grossReturnAtClose <= stopLoss) reason = 'stop_loss';
    else if (switchOnLeaderChange && (!leader || leader.sector !== position.sector)) reason = leader ? 'leader_change' : 'momentum_gate';

    if (reason) {
      pending = {
        type: 'exit', date: nextDate, reason,
        nextSector: leader ? leader.sector : null,
        signalDate: date,
        signalMomentum: leader ? leader.momentum : null,
      };
    }
  }

  if (position) {
    const date = dates.at(-1);
    const grossRelative = basketRelative(position.symbols, stockMaps, date, position.entryPrices, 'close');
    if (Number.isFinite(grossRelative)) {
      const exitCapital = position.notional * grossRelative * (1 - sellRate);
      trades.push({
        sector: position.sector,
        signalDate: position.signalDate,
        entryDate: position.entryDate,
        exitDate: date,
        exitReason: 'end_of_test',
        signalMomentum10d: position.signalMomentum,
        grossReturn: grossRelative - 1,
        netReturn: exitCapital / position.startingCapital - 1,
        holdingTradingDays: Math.max(1, dates.length - 1 - dates.indexOf(position.entryDate)),
        startCapital: position.startingCapital,
        endCapital: exitCapital,
      });
      capital = exitCapital;
      equityCurve[equityCurve.length - 1].equity = capital;
    }
  }

  const wins = trades.filter(t => t.netReturn > 0);
  const losses = trades.filter(t => t.netReturn < 0);
  const grossProfits = wins.reduce((sum, t) => sum + t.netReturn, 0);
  const grossLosses = Math.abs(losses.reduce((sum, t) => sum + t.netReturn, 0));
  const startTaiex = taiexMap.get(dates[0]);
  const endTaiex = taiexMap.get(dates.at(-1));
  const benchmarkReturn = startTaiex && endTaiex ? pctChange(endTaiex.index, startTaiex.index) : null;
  const totalReturn = capital / initialCapital - 1;
  const positiveGate = Number.isFinite(minMomentum) && minMomentum >= 0;

  return {
    strategy: `${positiveGate ? 'positive-' : ''}${lookback}d-leader-${switchOnLeaderChange ? 'rotation' : 'entry-hold'}-tp${Math.round(takeProfit * 100)}-sl${Math.round(Math.abs(stopLoss) * 100)}`,
    assumptions: {
      signal: `rank sector by trailing ${lookback} trading-day equal-weight constituent close return`,
      execution: 'signal after close; trade at next session open',
      basket: 'equal capital weight in sector representative stocks at entry',
      takeProfit,
      stopLoss,
      minMomentum: Number.isFinite(minMomentum) ? minMomentum : null,
      switchOnLeaderChange,
      costs,
    },
    period: { start: dates[0], end: dates.at(-1), tradingDays: dates.length },
    metrics: {
      initialCapital,
      finalCapital: capital,
      totalReturn,
      annualizedReturn: annualizedReturn(totalReturn, dates.length),
      taiexReturn: benchmarkReturn,
      excessVsTaiex: Number.isFinite(benchmarkReturn) ? totalReturn - benchmarkReturn : null,
      maxDrawdown: maxDrawdown(equityCurve.map(row => row.equity)),
      tradeCount: trades.length,
      winRate: trades.length ? wins.length / trades.length : null,
      profitFactor: grossLosses > 0 ? grossProfits / grossLosses : (grossProfits > 0 ? Infinity : null),
      avgTradeReturn: mean(trades.map(t => t.netReturn)),
      medianHoldingTradingDays: median(trades.map(t => t.holdingTradingDays)),
      exposure: dates.length ? exposedDays / dates.length : null,
      takeProfitCount: trades.filter(t => t.exitReason === 'take_profit').length,
      stopLossCount: trades.filter(t => t.exitReason === 'stop_loss').length,
      leaderChangeCount: trades.filter(t => t.exitReason === 'leader_change').length,
      momentumGateExitCount: trades.filter(t => t.exitReason === 'momentum_gate').length,
    },
    trades,
    equityCurve,
  };
}

module.exports = {
  DEFAULT_COSTS,
  sectorTrailingReturn,
  rankSectorMomentum,
  backtestRotation,
};

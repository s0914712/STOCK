/**
 * Core-satellite rotation, benchmarked against 0050.
 *
 * Why this exists
 * ---------------
 * The v0.4 rotation loses to 0050 and the reason is visible in its own yearly
 * table: it trailed TAIEX in 2022, 2023, 2024 and 2025, and only won overall
 * because 2026 returned +180%. A momentum-gated all-or-nothing book spends long
 * stretches out of the market or parked in the wrong basket, and against a
 * benchmark that simply stays invested, time out of the market is the whole
 * deficit.
 *
 * The fix is structural rather than parametric: the default holding is the
 * benchmark itself. The book is K slots; each slot holds a sector basket when
 * one qualifies, and 0050 otherwise. The strategy is therefore always fully
 * invested and can only deviate from 0050 when there is an actual signal. That
 * caps how badly it can lose to the benchmark, and concentrates the tracking
 * error on the days the signal claims an edge.
 *
 * Extra controls over the v0.5 engine:
 *   - `maxSatelliteSlots` caps how much of the book may ever leave the core.
 *   - `cooldownDays` blocks re-buying a sector straight after a stop, which
 *     removes the v0.4 churn where a take-profit exit immediately re-entered
 *     the same basket.
 *   - `benchmarkDividendYield` accrues to the benchmark *and* to the core leg,
 *     so a dividend assumption cannot flatter either side of the comparison.
 */

const {
  DEFAULT_COSTS,
  DEFAULT_TRAILING_BOUNDS,
  mean,
  std,
  pctChange,
  rowsToMap,
  buildStockMaps,
  basketDailyVolatility,
  buildRegimeGate,
  basketRelative,
  entryPricesAtOpen,
  maxDrawdown,
  annualizedReturn,
  rankSectorMomentum,
} = require('./rotationBacktest');

const CORE = '__CORE__';

function dailyAccrual(annualYield) {
  return Number.isFinite(annualYield) && annualYield > 0
    ? (1 + annualYield) ** (1 / 252) - 1
    : 0;
}

/**
 * Buy-and-hold benchmark: bought at the first available open, marked at each
 * close, sold once at the end. Entry and exit costs are charged so the
 * comparison is not tilted by giving the benchmark free execution.
 */
function benchmarkCurve({ rows, dates, costs, dividendYield = 0, initialCapital = 1 }) {
  const map = rowsToMap(rows);
  const buyRate = costs.buyCommission || 0;
  const sellRate = (costs.sellCommission || 0) + (costs.sellTax || 0);
  const accrual = dailyAccrual(dividendYield);

  const first = dates.find(date => {
    const row = map.get(date);
    return row && Number.isFinite(row.open) && row.open > 0;
  });
  if (!first) return null;

  let units = (initialCapital / (1 + buyRate)) / map.get(first).open;
  const curve = [];
  let lastValue = initialCapital;
  for (const date of dates) {
    // Strictly after the entry session, matching how the strategy's core leg
    // accrues: the purchase day itself pays nothing on either side.
    if (date > first) units *= 1 + accrual;
    const row = map.get(date);
    if (date >= first && row && Number.isFinite(row.close)) {
      lastValue = units * row.close * (1 - sellRate);
    }
    curve.push({ date, equity: lastValue });
  }
  return { curve, finalEquity: lastValue, entryDate: first };
}

function alignedDailyReturns(strategyCurve, benchmarkCurve_) {
  const benchmarkByDate = new Map(benchmarkCurve_.map(row => [row.date, row.equity]));
  const strategy = [];
  const benchmark = [];
  for (let i = 1; i < strategyCurve.length; i += 1) {
    const date = strategyCurve[i].date;
    const prevDate = strategyCurve[i - 1].date;
    const s = pctChange(strategyCurve[i].equity, strategyCurve[i - 1].equity);
    const b = pctChange(benchmarkByDate.get(date), benchmarkByDate.get(prevDate));
    if (Number.isFinite(s) && Number.isFinite(b)) {
      strategy.push(s);
      benchmark.push(b);
    }
  }
  return { strategy, benchmark };
}

/**
 * The metrics that actually decide "did this beat 0050": not raw return, but
 * whether the deviation from the benchmark was paid for.
 */
function benchmarkComparison({ strategyCurve, benchmarkRows, dates, costs, dividendYield, initialCapital }) {
  const bench = benchmarkCurve({ rows: benchmarkRows, dates, costs, dividendYield, initialCapital });
  if (!bench) return null;

  const { strategy, benchmark } = alignedDailyReturns(strategyCurve, bench.curve);
  if (strategy.length < 30) return null;

  const strategyTotal = strategyCurve.at(-1).equity / initialCapital - 1;
  const benchmarkTotal = bench.finalEquity / initialCapital - 1;
  const tradingDays = strategyCurve.length;

  const meanS = mean(strategy);
  const meanB = mean(benchmark);
  const varB = benchmark.reduce((sum, b) => sum + (b - meanB) ** 2, 0) / (benchmark.length - 1);
  const covariance = strategy.reduce((sum, s, i) => sum + (s - meanS) * (benchmark[i] - meanB), 0) / (strategy.length - 1);
  const beta = varB > 0 ? covariance / varB : null;
  const alphaDaily = Number.isFinite(beta) ? meanS - beta * meanB : null;

  const active = strategy.map((s, i) => s - benchmark[i]);
  const activeStd = std(active);
  const trackingError = Number.isFinite(activeStd) ? activeStd * Math.sqrt(252) : null;
  const activeMean = mean(active);
  const informationRatio = Number.isFinite(trackingError) && trackingError > 0
    ? (activeMean * 252) / trackingError
    : null;

  const upDays = benchmark.map((b, i) => (b > 0 ? [strategy[i], b] : null)).filter(Boolean);
  const downDays = benchmark.map((b, i) => (b < 0 ? [strategy[i], b] : null)).filter(Boolean);
  const upCapture = upDays.length ? mean(upDays.map(p => p[0])) / mean(upDays.map(p => p[1])) : null;
  const downCapture = downDays.length ? mean(downDays.map(p => p[0])) / mean(downDays.map(p => p[1])) : null;

  // Rolling one-year windows: how often would an investor who started on a
  // random day have been better off in the strategy than in 0050?
  const window = 252;
  const benchmarkByDate = new Map(bench.curve.map(row => [row.date, row.equity]));
  let rollingWins = 0;
  let rollingTotal = 0;
  let worstRollingExcess = null;
  for (let i = window; i < strategyCurve.length; i += 1) {
    const s = pctChange(strategyCurve[i].equity, strategyCurve[i - window].equity);
    const b = pctChange(benchmarkByDate.get(strategyCurve[i].date), benchmarkByDate.get(strategyCurve[i - window].date));
    if (!Number.isFinite(s) || !Number.isFinite(b)) continue;
    rollingTotal += 1;
    if (s > b) rollingWins += 1;
    const excess = s - b;
    worstRollingExcess = worstRollingExcess === null ? excess : Math.min(worstRollingExcess, excess);
  }

  const strategyDD = maxDrawdown(strategyCurve.map(row => row.equity));
  const benchmarkDD = maxDrawdown(bench.curve.map(row => row.equity));
  const strategyCagr = annualizedReturn(strategyTotal, tradingDays);
  const benchmarkCagr = annualizedReturn(benchmarkTotal, tradingDays);

  return {
    benchmarkTotalReturn: benchmarkTotal,
    benchmarkAnnualizedReturn: benchmarkCagr,
    benchmarkMaxDrawdown: benchmarkDD,
    benchmarkCalmar: Number.isFinite(benchmarkCagr) && benchmarkDD < 0 ? benchmarkCagr / Math.abs(benchmarkDD) : null,
    benchmarkDividendYield: dividendYield || 0,
    strategyTotalReturn: strategyTotal,
    strategyAnnualizedReturn: strategyCagr,
    strategyMaxDrawdown: strategyDD,
    strategyCalmar: Number.isFinite(strategyCagr) && strategyDD < 0 ? strategyCagr / Math.abs(strategyDD) : null,
    excessTotalReturn: strategyTotal - benchmarkTotal,
    excessAnnualized: Number.isFinite(strategyCagr) && Number.isFinite(benchmarkCagr) ? strategyCagr - benchmarkCagr : null,
    beta,
    annualizedAlpha: Number.isFinite(alphaDaily) ? alphaDaily * 252 : null,
    trackingError,
    informationRatio,
    upCapture,
    downCapture,
    rollingOneYearWinRate: rollingTotal ? rollingWins / rollingTotal : null,
    rollingOneYearWindows: rollingTotal,
    worstRollingOneYearExcess: worstRollingExcess,
    beatsBenchmark: strategyTotal > benchmarkTotal,
    beatsBenchmarkRiskAdjusted: Number.isFinite(strategyCagr) && Number.isFinite(benchmarkCagr)
      && strategyDD < 0 && benchmarkDD < 0
      && (strategyCagr / Math.abs(strategyDD)) > (benchmarkCagr / Math.abs(benchmarkDD)),
  };
}

function backtestCoreSatellite({
  stockHistoryBySymbol,
  benchmarkSymbol,
  taiexRows,
  sectors,
  startDate,
  endDate,
  lookback = 10,
  minMomentum = 0,
  takeProfit = 0.20,
  stopLoss = -0.20,
  trailingStop = null,
  trailingStopVolMultiple = null,
  trailingStopVolWindow = 20,
  trailingStopBounds = DEFAULT_TRAILING_BOUNDS,
  regimeFilter = null,
  topK = 2,
  maxSatelliteSlots = null,
  cooldownDays = 0,
  exitRankBuffer = 1,
  minHoldingDays = 5,
  rebalanceEvery = 1,
  benchmarkDividendYield = 0,
  costs = DEFAULT_COSTS,
  initialCapital = 1,
}) {
  if (!(stockHistoryBySymbol instanceof Map)) throw new TypeError('stockHistoryBySymbol must be a Map');
  if (!stockHistoryBySymbol.has(benchmarkSymbol)) throw new Error(`benchmark ${benchmarkSymbol} missing from history`);
  if (!Number.isInteger(topK) || topK < 1) throw new TypeError('topK must be a positive integer');

  const stockMaps = buildStockMaps(stockHistoryBySymbol);
  const benchmarkRows = stockHistoryBySymbol.get(benchmarkSymbol);
  const benchmarkMap = stockMaps.get(benchmarkSymbol);

  const dates = (taiexRows || []).map(row => row.date)
    .filter(date => (!startDate || date >= startDate) && (!endDate || date <= endDate))
    .filter(date => benchmarkMap.has(date));
  if (dates.length < lookback + 2) throw new Error('insufficient backtest dates');

  const allDates = (taiexRows || []).map(row => row.date).filter(date => !endDate || date <= endDate);
  const allIndex = new Map(allDates.map((date, i) => [date, i]));
  const localIndexByDate = new Map(dates.map((date, i) => [date, i]));

  const regimeConfig = regimeFilter
    ? { lookback: regimeFilter.lookback || 60, mode: regimeFilter.mode || 'block-entry' }
    : null;
  const regimeGate = regimeConfig ? buildRegimeGate(taiexRows, regimeConfig.lookback) : null;
  const regimeOn = date => (regimeGate ? regimeGate.get(date) !== false : true);

  const satelliteCap = Number.isInteger(maxSatelliteSlots)
    ? Math.max(0, Math.min(maxSatelliteSlots, topK))
    : topK;
  const volTrailing = Number.isFinite(trailingStopVolMultiple) && trailingStopVolMultiple > 0;
  const bounds = { ...DEFAULT_TRAILING_BOUNDS, ...(trailingStopBounds || {}) };
  const buyRate = costs.buyCommission || 0;
  const sellRate = (costs.sellCommission || 0) + (costs.sellTax || 0);
  const accrual = dailyAccrual(benchmarkDividendYield);

  let coreUnits = 0;
  let cash = initialCapital;
  let sleeves = [];
  const cooldownUntil = new Map();
  const trades = [];
  const equityCurve = [];
  let satelliteSlotDays = 0;
  // Every commission and tax actually charged, so a report can state what the
  // broker took rather than leaving it implicit in the return.
  let costsPaid = 0;

  // `field` matters: sizing decisions happen at the open we are trading on, so
  // they must never read that session's close.
  function coreValue(date, field = 'close') {
    const row = benchmarkMap.get(date);
    return row && Number.isFinite(row[field]) ? coreUnits * row[field] * (1 - sellRate) : 0;
  }

  function buyCore(date, amount) {
    const row = benchmarkMap.get(date);
    if (!row || !Number.isFinite(row.open) || row.open <= 0) return false;
    const spend = Math.min(amount, cash);
    if (!(spend > 0)) return false;
    coreUnits += (spend / (1 + buyRate)) / row.open;
    cash -= spend;
    costsPaid += spend - spend / (1 + buyRate);
    return true;
  }

  function sellCore(date, targetProceeds) {
    const row = benchmarkMap.get(date);
    if (!row || !Number.isFinite(row.open) || row.open <= 0 || coreUnits <= 0) return 0;
    const unitProceeds = row.open * (1 - sellRate);
    const unitsNeeded = Math.min(coreUnits, targetProceeds / unitProceeds);
    coreUnits -= unitsNeeded;
    const proceeds = unitsNeeded * unitProceeds;
    cash += proceeds;
    costsPaid += unitsNeeded * row.open * sellRate;
    return proceeds;
  }

  function trailingDistance(sleeve, globalIndex) {
    if (!volTrailing) return Number.isFinite(trailingStop) && trailingStop > 0 ? trailingStop : null;
    const vol = basketDailyVolatility(sleeve.symbols, stockMaps, allDates, globalIndex, trailingStopVolWindow);
    if (!Number.isFinite(vol) || vol <= 0) return null;
    return Math.min(bounds.max, Math.max(bounds.min, trailingStopVolMultiple * vol));
  }

  function openSatellite(date, sector, signalDate, signalMomentum, capital) {
    const symbols = sectors[sector];
    if (!symbols) return false;
    const prices = entryPricesAtOpen(symbols, stockMaps, date);
    if (!prices) return false;
    const allocated = Math.min(capital, cash);
    if (!(allocated > 0)) return false;
    cash -= allocated;
    costsPaid += allocated - allocated / (1 + buyRate);
    sleeves.push({
      sector, symbols, entryDate: date, signalDate, signalMomentum,
      entryPrices: prices, startingCapital: allocated,
      notional: allocated / (1 + buyRate),
      peakCloseGross: 1, trailingDistanceAtSignal: null,
    });
    return true;
  }

  function closeSatellite(date, sector, reason, field = 'open') {
    const sleeve = sleeves.find(item => item.sector === sector);
    if (!sleeve) return false;
    const grossRelative = basketRelative(sleeve.symbols, stockMaps, date, sleeve.entryPrices, field);
    if (!Number.isFinite(grossRelative)) return false;
    const exitCapital = sleeve.notional * grossRelative * (1 - sellRate);
    costsPaid += sleeve.notional * grossRelative * sellRate;
    trades.push({
      sector: sleeve.sector,
      signalDate: sleeve.signalDate,
      entryDate: sleeve.entryDate,
      exitDate: date,
      exitReason: reason,
      signalMomentum: sleeve.signalMomentum,
      trailingDistance: sleeve.trailingDistanceAtSignal,
      peakGrossReturn: sleeve.peakCloseGross - 1,
      grossReturn: grossRelative - 1,
      netReturn: exitCapital / sleeve.startingCapital - 1,
      holdingTradingDays: Math.max(1, (localIndexByDate.get(date) ?? 0) - (localIndexByDate.get(sleeve.entryDate) ?? 0)),
      startCapital: sleeve.startingCapital,
      endCapital: exitCapital,
    });
    cash += exitCapital;
    sleeves = sleeves.filter(item => item !== sleeve);
    if (cooldownDays > 0 && reason !== 'rotate_to_core' && reason !== 'end_of_test') {
      cooldownUntil.set(sleeve.sector, (localIndexByDate.get(date) ?? 0) + cooldownDays);
    }
    return true;
  }

  let pending = [];

  for (let localIndex = 0; localIndex < dates.length; localIndex += 1) {
    const date = dates[localIndex];
    if (coreUnits > 0) coreUnits *= 1 + accrual;

    const dueToday = pending.filter(action => action.date === date);
    pending = pending.filter(action => action.date !== date);

    for (const action of dueToday.filter(a => a.type === 'exit')) {
      closeSatellite(date, action.sector, action.reason);
    }

    const entries = dueToday.filter(a => a.type === 'entry' && !sleeves.some(s => s.sector === a.sector));
    if (entries.length) {
      // Fund satellites out of the core, taking each slot's proportional share
      // of the core leg rather than liquidating the whole benchmark position.
      const coreSlotsBefore = Math.max(1, topK - sleeves.length);
      const available = coreValue(date, 'open') + cash;
      const slotCapital = available / coreSlotsBefore;
      for (const action of entries) {
        if (sleeves.length >= topK) break;
        if (cash < slotCapital) sellCore(date, slotCapital - cash);
        openSatellite(date, action.sector, action.signalDate, action.signalMomentum, Math.min(slotCapital, cash));
      }
    }
    // Any capital not committed to a satellite belongs in the core.
    if (cash > 0 && sleeves.length < topK) buyCore(date, cash);

    const globalIndex = allIndex.get(date);
    const ranking = rankSectorMomentum({ sectors, stockMaps, dates: allDates, dateIndex: globalIndex, lookback });
    const riskOn = regimeOn(date);
    const eligible = riskOn
      ? ranking.filter(row => row.momentum > minMomentum
        && (cooldownUntil.get(row.sector) ?? -1) < localIndex)
      : [];
    const targets = eligible.slice(0, satelliteCap);
    const targetSectors = new Set(targets.map(row => row.sector));
    // Hysteresis: a sector is bought at rank <= satelliteCap but only sold once
    // it falls past a wider band. Without this the top-K set reshuffles almost
    // daily and the book pays a round trip to the core each time.
    const eligibleRank = new Map(eligible.map((row, i) => [row.sector, i]));
    const holdRankLimit = satelliteCap + Math.max(0, exitRankBuffer);
    // Rank-driven moves are throttled to a rebalance cadence; risk exits
    // (take-profit, stop, trailing, regime) still fire on any day.
    const isRebalanceDay = rebalanceEvery <= 1 || localIndex % rebalanceEvery === 0;

    let satelliteEquity = 0;
    const closeGrossBySector = new Map();
    for (const sleeve of sleeves) {
      const closeGross = basketRelative(sleeve.symbols, stockMaps, date, sleeve.entryPrices, 'close');
      if (Number.isFinite(closeGross)) {
        sleeve.peakCloseGross = Math.max(sleeve.peakCloseGross || 1, closeGross);
        closeGrossBySector.set(sleeve.sector, closeGross);
        satelliteEquity += sleeve.notional * closeGross * (1 - sellRate);
      } else {
        satelliteEquity += sleeve.startingCapital;
      }
    }
    satelliteSlotDays += sleeves.length / topK;
    equityCurve.push({
      date,
      equity: cash + coreValue(date) + satelliteEquity,
      coreWeight: null,
      sectors: sleeves.map(s => s.sector),
      regimeOn: regimeGate ? regimeGate.get(date) : null,
    });

    const nextDate = dates[localIndex + 1];
    if (!nextDate) continue;

    const exiting = new Set();
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
      else if (!riskOn) reason = 'regime_off';
      else {
        const rank = eligibleRank.get(sleeve.sector);
        const heldDays = localIndex - (localIndexByDate.get(sleeve.entryDate) ?? localIndex);
        // Losing eligibility outright (momentum gone) always releases the slot;
        // merely being overtaken only does so past the band and the minimum hold.
        if (rank === undefined) reason = 'rotate_to_core';
        else if (rank >= holdRankLimit && heldDays >= minHoldingDays && isRebalanceDay) reason = 'rotate_to_core';
      }

      if (reason) {
        exiting.add(sleeve.sector);
        pending.push({ type: 'exit', date: nextDate, sector: sleeve.sector, reason });
      }
    }

    const held = new Set(sleeves.map(s => s.sector).filter(sector => !exiting.has(sector)));
    let freeSlots = isRebalanceDay ? satelliteCap - held.size : 0;
    for (const target of targets) {
      if (freeSlots <= 0) break;
      if (held.has(target.sector)) continue;
      pending.push({
        type: 'entry', date: nextDate, sector: target.sector,
        signalDate: date, signalMomentum: target.momentum,
      });
      held.add(target.sector);
      freeSlots -= 1;
    }
  }

  const finalDate = dates.at(-1);
  for (const sleeve of [...sleeves]) closeSatellite(finalDate, sleeve.sector, 'end_of_test', 'close');
  const finalEquity = cash + coreValue(finalDate);
  if (equityCurve.length) equityCurve[equityCurve.length - 1].equity = finalEquity;

  const comparison = benchmarkComparison({
    strategyCurve: equityCurve,
    benchmarkRows,
    dates,
    costs,
    dividendYield: benchmarkDividendYield,
    initialCapital,
  });

  const wins = trades.filter(t => t.netReturn > 0);
  const totalReturn = finalEquity / initialCapital - 1;

  return {
    strategy: `core-satellite-top${topK}${Number.isInteger(maxSatelliteSlots) ? `-sat${satelliteCap}` : ''}-${lookback}d-tp${Math.round(takeProfit * 100)}-sl${Math.round(Math.abs(stopLoss) * 100)}${volTrailing ? `-trailvol${trailingStopVolMultiple}` : (trailingStop ? `-trail${Math.round(trailingStop * 100)}` : '')}${regimeConfig ? `-regime${regimeConfig.lookback}` : ''}${cooldownDays ? `-cd${cooldownDays}` : ''}`,
    assumptions: {
      core: `${benchmarkSymbol} held in every slot without a qualifying sector`,
      signal: `rank sector by trailing ${lookback} trading-day equal-weight constituent close return`,
      execution: 'signal after close; trade at next session open',
      takeProfit,
      stopLoss,
      trailingStop: Number.isFinite(trailingStop) ? trailingStop : null,
      trailingStopVolMultiple: volTrailing ? trailingStopVolMultiple : null,
      minMomentum,
      regimeFilter: regimeConfig,
      topK,
      maxSatelliteSlots: satelliteCap,
      cooldownDays,
      exitRankBuffer,
      minHoldingDays,
      rebalanceEvery,
      benchmarkDividendYield,
      costs,
    },
    period: { start: dates[0], end: dates.at(-1), tradingDays: dates.length },
    metrics: {
      initialCapital,
      finalCapital: finalEquity,
      totalReturn,
      annualizedReturn: annualizedReturn(totalReturn, dates.length),
      maxDrawdown: maxDrawdown(equityCurve.map(row => row.equity)),
      tradeCount: trades.length,
      winRate: trades.length ? wins.length / trades.length : null,
      avgTradeReturn: mean(trades.map(t => t.netReturn)),
      satelliteExposure: dates.length ? satelliteSlotDays / dates.length : null,
      costsPaid,
      costsPaidPctOfInitial: costsPaid / initialCapital,
      tradesPerYear: dates.length ? trades.length / (dates.length / 252) : null,
      takeProfitCount: trades.filter(t => t.exitReason === 'take_profit').length,
      stopLossCount: trades.filter(t => t.exitReason === 'stop_loss').length,
      trailingStopCount: trades.filter(t => t.exitReason === 'trailing_stop').length,
      rotateToCoreCount: trades.filter(t => t.exitReason === 'rotate_to_core').length,
      regimeOffCount: trades.filter(t => t.exitReason === 'regime_off').length,
    },
    benchmark: comparison,
    trades,
    equityCurve,
  };
}

module.exports = {
  CORE,
  benchmarkCurve,
  benchmarkComparison,
  backtestCoreSatellite,
};

"""Cash-yield aware simulator for the 00631L leverage challenger.

The strategy logic is unchanged. The only addition is a date-dependent annual
cash yield applied to the uninvested sleeve. This supports conservative
haircuts to official historical deposit rates.
"""
from __future__ import annotations

from typing import Callable, Mapping, Sequence

from leverage5050Backtest import ETF_COSTS, StrategySpec, _cagr, _max_drawdown, _mean, _sharpe


def _run_cash_curve(
    rows: Sequence[Mapping],
    spec: StrategySpec,
    *,
    start_date: str,
    end_date: str,
    annual_cash_yield: Callable[[str], float],
    costs: Mapping,
    liquidate_end: bool,
    signal_on_last_close: bool,
):
    data = [r for r in rows if start_date <= r["date"] <= end_date]
    if len(data) < 2:
        raise ValueError(f"insufficient rows for {start_date}..{end_date}")

    buy_fee = float(costs["buyCommission"])
    sell_fee = float(costs["sellCommission"]) + float(costs["sellTax"])
    slip = float(costs["slippagePerSide"])
    cash, shares = 1.0, 0.0
    pending_target = 0.50
    equity_curve, weights, trades = [], [], []
    trade_notional, paid_cost = 0.0, 0.0
    cash_interest_earned = 0.0

    def rebalance(target, row):
        nonlocal cash, shares, trade_notional, paid_cost
        target = min(0.95, max(0.0, float(target)))
        px = float(row["lev_open"])
        equity = cash + shares * px
        current = (shares * px / equity) if equity > 0 else 0.0
        if abs(target - current) < spec.min_trade_weight:
            return
        desired_value = target * equity
        current_value = shares * px
        delta = desired_value - current_value
        if delta > 0:
            fill = px * (1 + slip)
            max_value = cash / (1 + buy_fee)
            market_value = min(delta, max_value)
            if market_value <= 1e-10:
                return
            qty = market_value / fill
            spend = qty * fill
            fee = spend * buy_fee
            cash -= spend + fee
            shares += qty
            trade_notional += market_value
            paid_cost += market_value * slip + fee
            trades.append({"date": row["date"], "action": "BUY", "target": target, "notional": market_value})
        elif delta < 0:
            sell_value = min(-delta, shares * px)
            qty = sell_value / px
            fill = px * (1 - slip)
            gross = qty * fill
            fee_tax = gross * sell_fee
            cash += gross - fee_tax
            shares -= qty
            trade_notional += sell_value
            paid_cost += sell_value * slip + fee_tax
            trades.append({"date": row["date"], "action": "SELL", "target": target, "notional": sell_value})

    next_open_target = None
    for i, row in enumerate(data):
        if i > 0 and cash > 0:
            annual = max(0.0, float(annual_cash_yield(row["date"])))
            daily = (1.0 + annual) ** (1.0 / 252.0) - 1.0
            earned = cash * daily
            cash += earned
            cash_interest_earned += earned

        if pending_target is not None:
            rebalance(pending_target, row)
            pending_target = None

        close_equity = cash + shares * float(row["lev_close"])
        weight = shares * float(row["lev_close"]) / close_equity if close_equity > 0 else 0.0
        equity_curve.append(close_equity)
        weights.append(weight)

        should_signal = i < len(data) - 1 or signal_on_last_close
        if should_signal:
            target = spec.signal(i, data, weight, None)
            if target is not None:
                if i < len(data) - 1:
                    pending_target = float(target)
                else:
                    next_open_target = float(target)

    if liquidate_end and shares > 0:
        px = float(data[-1]["lev_close"])
        fill = px * (1 - slip)
        gross = shares * fill
        fee_tax = gross * sell_fee
        cash += gross - fee_tax
        trade_notional += shares * px
        paid_cost += shares * px * slip + fee_tax
        shares = 0.0
        equity_curve[-1] = cash

    return {
        "data": data,
        "cash": cash,
        "shares": shares,
        "equityCurve": equity_curve,
        "weights": weights,
        "trades": trades,
        "tradeNotional": trade_notional,
        "paidCost": paid_cost,
        "cashInterestEarned": cash_interest_earned,
        "nextOpenTarget": next_open_target,
    }


def simulate_with_cash_curve(
    rows: Sequence[Mapping],
    spec: StrategySpec,
    *,
    start_date: str,
    end_date: str,
    annual_cash_yield: Callable[[str], float],
    costs: Mapping = ETF_COSTS,
):
    state = _run_cash_curve(
        rows, spec, start_date=start_date, end_date=end_date,
        annual_cash_yield=annual_cash_yield, costs=costs,
        liquidate_end=True, signal_on_last_close=False,
    )
    data = state["data"]
    equity_curve = state["equityCurve"]
    total_return = equity_curve[-1] - 1.0
    avg_eq = _mean(equity_curve) or 1.0
    return {
        "name": spec.name,
        "family": spec.family,
        "period": {"start": data[0]["date"], "end": data[-1]["date"], "tradingDays": len(data)},
        "metrics": {
            "totalReturn": total_return,
            "cagr": _cagr(total_return, len(data)),
            "maxDrawdown": _max_drawdown(equity_curve),
            "sharpe": _sharpe(equity_curve),
            "turnover": state["tradeNotional"] / avg_eq,
            "estimatedTradingCost": state["paidCost"],
            "cashInterestEarnedOnInitialCapital": state["cashInterestEarned"],
            "tradeCount": len(state["trades"]),
            "avgLeveragedEtfWeight": _mean(state["weights"]),
        },
    }


def shadow_state_with_cash_curve(
    rows: Sequence[Mapping],
    spec: StrategySpec,
    *,
    start_date: str,
    end_date: str,
    annual_cash_yield: Callable[[str], float],
    costs: Mapping = ETF_COSTS,
):
    """Reconstruct the hypothetical live portfolio without end liquidation.

    The last close is allowed to generate a signal. If the band is breached,
    `nextOpenTarget` is the weight to rebalance toward at the next available
    session open; otherwise it is None.
    """
    state = _run_cash_curve(
        rows, spec, start_date=start_date, end_date=end_date,
        annual_cash_yield=annual_cash_yield, costs=costs,
        liquidate_end=False, signal_on_last_close=True,
    )
    data = state["data"]
    latest = data[-1]
    equity = state["cash"] + state["shares"] * float(latest["lev_close"])
    weight = state["shares"] * float(latest["lev_close"]) / equity if equity > 0 else 0.0
    target = state["nextOpenTarget"]
    if target is None:
        action = "HOLD"
    elif weight < target:
        action = "BUY_TO_50"
    else:
        action = "SELL_TO_50"
    return {
        "asOf": latest["date"],
        "leveragedEtfWeight": weight,
        "cashWeight": 1.0 - weight,
        "portfolioEquityFrom1": equity,
        "action": action,
        "nextOpenTarget": target,
        "lowerBand": 0.35,
        "upperBand": 0.775,
        "tradeCountSinceInception": len(state["trades"]),
        "lastTrades": state["trades"][-5:],
        "cashInterestEarnedOnInitialCapital": state["cashInterestEarned"],
    }

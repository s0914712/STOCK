"""Cash-yield aware simulator for the 00631L leverage challenger.

The strategy logic is unchanged. The only addition is a date-dependent annual
cash yield applied to the uninvested sleeve. This supports conservative
haircuts to official historical deposit rates.
"""
from __future__ import annotations

from typing import Callable, Mapping, Sequence

from leverage5050Backtest import ETF_COSTS, StrategySpec, _cagr, _max_drawdown, _mean, _sharpe


def simulate_with_cash_curve(
    rows: Sequence[Mapping],
    spec: StrategySpec,
    *,
    start_date: str,
    end_date: str,
    annual_cash_yield: Callable[[str], float],
    costs: Mapping = ETF_COSTS,
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

        if i < len(data) - 1:
            target = spec.signal(i, data, weight, None)
            if target is not None:
                pending_target = float(target)

    if shares > 0:
        px = float(data[-1]["lev_close"])
        fill = px * (1 - slip)
        gross = shares * fill
        fee_tax = gross * sell_fee
        cash += gross - fee_tax
        trade_notional += shares * px
        paid_cost += shares * px * slip + fee_tax
        shares = 0.0
        equity_curve[-1] = cash

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
            "turnover": trade_notional / avg_eq,
            "estimatedTradingCost": paid_cost,
            "cashInterestEarnedOnInitialCapital": cash_interest_earned,
            "tradeCount": len(trades),
            "avgLeveragedEtfWeight": _mean(weights),
        },
    }

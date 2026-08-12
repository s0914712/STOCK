"""Walk-forward ablation and portfolio simulation for Momentum Rotation v0.5."""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime
from typing import Mapping, Optional, Sequence

import numpy as np

from momentumV05Features import (
    DEFAULT_COSTS, ENTRY_RANK, EXIT_RANK, MAX_POSITIONS, PROBABILITY_ENTRY,
    PROBABILITY_EXIT, STOP_LOSS, TAKE_PROFIT,
)
from momentumV05Models import fit_bundle, predict_rows


def _mean(xs):
    vals = [float(x) for x in xs if x is not None and np.isfinite(x)]
    return float(np.mean(vals)) if vals else None


def _std(xs):
    vals = [float(x) for x in xs if x is not None and np.isfinite(x)]
    return float(np.std(vals, ddof=1)) if len(vals) >= 2 else 0.0


def _ret(a, b):
    return float(a / b - 1) if a is not None and b not in (None, 0) else None


def _maps(histories):
    return {s: {r["date"]: r for r in rows} for s, rows in histories.items()}


def _weekly_first_sessions(dates: Sequence[str]) -> set[str]:
    out, seen = set(), set()
    for d in dates:
        iso = datetime.strptime(d, "%Y-%m-%d").isocalendar()
        key = (iso.year, iso.week)
        if key not in seen:
            seen.add(key)
            out.add(d)
    return out


def walk_forward_predictions(feature_rows, start_date: str, end_date: str):
    """Monthly expanding retrain; every predicted row is strictly forward OOS.

    For a month beginning at D, training rows require targetDate < D. Thus no
    ten-day label overlapping the forecast month can enter the learner.
    """
    rows = sorted(feature_rows, key=lambda r: (r["date"], r["symbol"]))
    dates = sorted({r["date"] for r in rows if start_date <= r["date"] <= end_date})
    month_dates = defaultdict(list)
    for d in dates:
        month_dates[d[:7]].append(d)
    predicted = {}
    training_log = []
    for month in sorted(month_dates):
        first = min(month_dates[month])
        train = [r for r in rows if r.get("target") is not None and r.get("targetDate") and r["targetDate"] < first]
        if len(train) < 500 or len({r["date"] for r in train}) < 120:
            continue
        bundle = fit_bundle(train)
        training_log.append({
            "month": month,
            "trainedThrough": bundle["trainedThrough"],
            "labelThrough": bundle["labelThrough"],
            "samples": bundle["samples"],
        })
        for d in month_dates[month]:
            current = [r for r in rows if r["date"] == d]
            for p in predict_rows(current, bundle):
                predicted[(d, p["symbol"])] = p
    return predicted, training_log


def _benchmark_return(rows, start, end, key):
    m = {r["date"]: r for r in rows}
    valid = [d for d in sorted(m) if start <= d <= end]
    if not valid:
        return None
    return _ret(float(m[valid[-1]][key]), float(m[valid[0]][key]))


def _selector(rows, mode):
    ranked = sorted(rows, key=lambda r: r["momentum_rank"])
    if mode == "momentum_only":
        return [r["symbol"] for r in ranked if r["momentum_rank"] <= ENTRY_RANK][:MAX_POSITIONS]
    if mode == "momentum_trend":
        return [r["symbol"] for r in ranked if r["momentum_rank"] <= ENTRY_RANK and r["trend_pass"]][:MAX_POSITIONS]
    key = {
        "baseline": "baseline_probability",
        "lightgbm": "lightgbm_probability",
        "xgboost": "xgboost_probability",
        "ensemble": "calibrated_probability",
    }[mode]
    return [
        r["symbol"] for r in ranked
        if r["momentum_rank"] <= ENTRY_RANK and r["trend_pass"] and r[key] >= PROBABILITY_ENTRY
    ][:MAX_POSITIONS]


def _max_drawdown(equity):
    peak, dd = -float("inf"), 0.0
    for v in equity:
        peak = max(peak, v)
        if peak > 0:
            dd = min(dd, v / peak - 1)
    return dd


def _annualized(total_return, days):
    return (1 + total_return) ** (252 / max(days, 1)) - 1 if 1 + total_return > 0 else -1.0


def _sharpe(equity):
    rets = [equity[i] / equity[i - 1] - 1 for i in range(1, len(equity)) if equity[i - 1] > 0]
    sd = _std(rets)
    return (_mean(rets) / sd * math.sqrt(252)) if rets and sd and sd > 1e-12 else None


def simulate_strategy(
    predicted: Mapping,
    histories: Mapping[str, Sequence[Mapping]],
    taiex_rows: Sequence[Mapping],
    benchmark_0050: Optional[Sequence[Mapping]],
    *, start_date: str, end_date: str, mode: str,
    costs: Mapping = DEFAULT_COSTS,
):
    stock_maps = _maps(histories)
    dates = [r["date"] for r in taiex_rows if start_date <= r["date"] <= end_date]
    weekly = _weekly_first_sessions(dates)
    buy_comm = float(costs.get("buyCommission", 0))
    sell_fee = float(costs.get("sellCommission", 0)) + float(costs.get("sellTax", 0))
    slip = float(costs.get("slippagePerSide", 0))
    cash = 1.0
    positions = {}  # symbol -> shares, entryFill
    pending_target = None
    pending_exits = set()
    equity_curve, decisions = [], []
    total_trade_notional = 0.0
    estimated_cost = 0.0
    precision_labels = []

    def price(symbol, date, field):
        row = stock_maps.get(symbol, {}).get(date)
        return float(row[field]) if row and row.get(field) is not None else None

    def sell(symbol, date, fraction=1.0, reason="rebalance"):
        nonlocal cash, total_trade_notional, estimated_cost
        pos = positions.get(symbol)
        raw = price(symbol, date, "open")
        if not pos or raw is None:
            return
        shares = pos["shares"] * min(max(fraction, 0), 1)
        gross = shares * raw
        fill = raw * (1 - slip)
        proceeds = shares * fill * (1 - sell_fee)
        cash += proceeds
        total_trade_notional += gross
        estimated_cost += gross * (slip + sell_fee)
        pos["shares"] -= shares
        if pos["shares"] <= 1e-12:
            positions.pop(symbol, None)
        decisions.append({"date": date, "symbol": symbol, "action": "SELL", "exit_reason": reason, "grossNotional": gross})

    def buy_value(symbol, date, gross_value):
        nonlocal cash, total_trade_notional, estimated_cost
        raw = price(symbol, date, "open")
        if raw is None or gross_value <= 0:
            return
        max_gross = cash / (1 + buy_comm + slip)
        gross_value = min(gross_value, max_gross)
        if gross_value <= 1e-10:
            return
        fill = raw * (1 + slip)
        fee = gross_value * buy_comm
        shares = gross_value / fill
        cash -= gross_value + fee
        total_trade_notional += gross_value
        estimated_cost += gross_value * (slip + buy_comm)
        if symbol in positions:
            old = positions[symbol]
            old_cost = old["shares"] * old["entryFill"]
            new_cost = shares * fill
            old["entryFill"] = (old_cost + new_cost) / (old["shares"] + shares)
            old["shares"] += shares
        else:
            positions[symbol] = {"shares": shares, "entryFill": fill}
        decisions.append({"date": date, "symbol": symbol, "action": "BUY", "exit_reason": None, "grossNotional": gross_value})

    def rebalance(date, target):
        nonlocal cash
        target = list(dict.fromkeys(target))[:MAX_POSITIONS]
        # First liquidate names not in the target set.
        for symbol in list(positions):
            if symbol not in target:
                sell(symbol, date, 1.0, "rebalance")
        if not target:
            return
        open_equity = cash + sum(
            pos["shares"] * (price(s, date, "open") or 0) for s, pos in positions.items()
        )
        desired = open_equity / len(target)
        # Trim overweight holdings.
        for symbol in list(positions):
            raw = price(symbol, date, "open")
            if raw is None:
                continue
            value = positions[symbol]["shares"] * raw
            if value > desired * 1.01:
                sell(symbol, date, (value - desired) / value, "rebalance_trim")
        # Fill underweight/new holdings.
        for symbol in target:
            raw = price(symbol, date, "open")
            if raw is None:
                continue
            current = positions.get(symbol, {}).get("shares", 0) * raw
            if current < desired * 0.99:
                buy_value(symbol, date, desired - current)

    for idx, date in enumerate(dates):
        if pending_exits:
            for symbol, reason in list(pending_exits):
                sell(symbol, date, 1.0, reason)
            pending_exits.clear()
        if pending_target is not None:
            rebalance(date, pending_target)
            pending_target = None

        # Mark-to-market at close.
        equity = cash + sum(pos["shares"] * (price(s, date, "close") or 0) for s, pos in positions.items())
        equity_curve.append({"date": date, "equity": equity, "cash": cash, "positions": list(positions)})
        next_date = dates[idx + 1] if idx + 1 < len(dates) else None
        rows = [v for (d, _), v in predicted.items() if d == date]
        by_symbol = {r["symbol"]: r for r in rows}

        if mode == "full_portfolio" and next_date:
            # Daily early-exit layer. Hard boundaries take priority.
            for symbol, pos in list(positions.items()):
                close = price(symbol, date, "close")
                if close is None:
                    continue
                r = by_symbol.get(symbol)
                gross_ret = close / pos["entryFill"] - 1
                reason = None
                if gross_ret >= TAKE_PROFIT:
                    reason = "take_profit"
                elif gross_ret <= STOP_LOSS:
                    reason = "stop_loss"
                elif r and not r["trend_pass"]:
                    reason = "trend_fail"
                elif r and r["calibrated_probability"] < PROBABILITY_EXIT:
                    reason = "probability_drop"
                elif r and r["momentum_rank"] > EXIT_RANK:
                    reason = "rank_drop"
                if reason:
                    pending_exits.add((symbol, reason))

        if date not in weekly or not next_date or not rows:
            continue

        if mode == "full_portfolio":
            retained = []
            for symbol in positions:
                r = by_symbol.get(symbol)
                if r and r["trend_pass"] and r["momentum_rank"] <= EXIT_RANK and r["calibrated_probability"] >= PROBABILITY_EXIT:
                    retained.append(symbol)
            entrants = [
                r["symbol"] for r in sorted(rows, key=lambda x: x["momentum_rank"])
                if r["momentum_rank"] <= ENTRY_RANK and r["trend_pass"] and r["calibrated_probability"] >= PROBABILITY_ENTRY
                and r["symbol"] not in retained
            ]
            target = (retained + entrants)[:MAX_POSITIONS]
        else:
            target = _selector(rows, mode)

        # Precision@K is evaluated only after the label is mature; in a historical
        # backtest it is safe to read here because it is used for evaluation only.
        labels = [by_symbol[s].get("target") for s in target if s in by_symbol and by_symbol[s].get("target") is not None]
        precision_labels.extend(int(v) for v in labels)
        pending_target = target
        decisions.append({
            "date": date, "action": "SIGNAL", "mode": mode,
            "target": target, "target_weight": (1 / len(target) if target else 0),
        })

    if positions and dates:
        last = dates[-1]
        for symbol in list(positions):
            # End-of-test liquidation at close, with sell fee/slippage approximation.
            raw = price(symbol, last, "close")
            pos = positions[symbol]
            if raw is None:
                continue
            gross = pos["shares"] * raw
            cash += gross * (1 - slip) * (1 - sell_fee)
            total_trade_notional += gross
            estimated_cost += gross * (slip + sell_fee)
        positions.clear()
        equity_curve[-1]["equity"] = cash

    eq = [r["equity"] for r in equity_curve]
    total_return = (eq[-1] / eq[0] - 1) if len(eq) >= 2 and eq[0] > 0 else None
    avg_eq = _mean(eq) or 1.0
    return {
        "mode": mode,
        "period": {"start": dates[0] if dates else None, "end": dates[-1] if dates else None, "tradingDays": len(dates)},
        "metrics": {
            "totalReturn": total_return,
            "annualizedReturn": _annualized(total_return, len(dates)) if total_return is not None else None,
            "maxDrawdown": _max_drawdown(eq) if eq else None,
            "sharpe": _sharpe(eq),
            "turnover": total_trade_notional / avg_eq,
            "estimatedCost": estimated_cost,
            "precisionAtK": _mean(precision_labels),
            "taiexReturn": _benchmark_return(taiex_rows, start_date, end_date, "index"),
            "0050Return": _benchmark_return(benchmark_0050 or [], start_date, end_date, "close") if benchmark_0050 else None,
        },
        "decisions": decisions,
        "equityCurve": equity_curve,
    }


def run_ablation(predicted, histories, taiex_rows, benchmark_0050, start_date, end_date):
    modes = ["momentum_only", "momentum_trend", "baseline", "lightgbm", "xgboost", "ensemble", "full_portfolio"]
    return [simulate_strategy(
        predicted, histories, taiex_rows, benchmark_0050,
        start_date=start_date, end_date=end_date, mode=mode,
    ) for mode in modes]

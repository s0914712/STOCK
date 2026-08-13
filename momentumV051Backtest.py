"""Momentum Rotation Challenger v0.5.1 calibration / trend ablation.

This module intentionally keeps the v0.5 model predictions fixed and changes only
portfolio decision logic.  It is designed to answer whether trend confirmation,
probability calibration and turnover controls add value to the momentum layer.
"""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime
from typing import Mapping, Optional, Sequence

import numpy as np

from momentumV05Features import DEFAULT_COSTS, ENTRY_RANK, EXIT_RANK, MAX_POSITIONS, STOP_LOSS, TAKE_PROFIT

MIN_HOLD_DAYS = 10
REBALANCE_BAND = 0.05
SOFT_TREND_MIN = 2
PERCENTILE_ENTRY = 0.70  # top 30% continuation probability
PERCENTILE_EXIT = 0.40
ABS_THRESHOLDS = (0.40, 0.45, 0.50, 0.55, 0.60)
PERCENTILE_THRESHOLDS = (0.60, 0.70, 0.80)


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


def _trend_flags(r: Mapping) -> dict:
    return {
        "ma": bool(r.get("close") is not None and r.get("ma20") is not None and r.get("ma60") is not None and r["close"] > r["ma20"] > r["ma60"]),
        "slope": bool((r.get("ma20_slope5") or 0) > 0),
        "volume": bool((r.get("volume_ratio") or 0) >= 0.80),
        "distance": bool(r.get("distance_ma20") is not None and 0 < r["distance_ma20"] <= 0.20),
    }


def trend_score(r: Mapping) -> int:
    return sum(int(v) for v in _trend_flags(r).values())


def trend_pass_variant(r: Mapping, variant: str) -> bool:
    f = _trend_flags(r)
    if variant == "none":
        return True
    if variant == "ma":
        return f["ma"]
    if variant == "ma_slope":
        return f["ma"] and f["slope"]
    if variant == "ma_slope_volume":
        return f["ma"] and f["slope"] and f["volume"]
    if variant == "full":
        return all(f.values())
    if variant == "soft2":
        return trend_score(r) >= SOFT_TREND_MIN
    raise ValueError(f"unknown trend variant: {variant}")


def _percentile_cutoff(rows: Sequence[Mapping], key: str, percentile: float) -> Optional[float]:
    vals = [float(r[key]) for r in rows if r.get(key) is not None and np.isfinite(r[key])]
    return float(np.quantile(vals, percentile)) if vals else None


def _benchmark_return(rows, start, end, key):
    m = {r["date"]: r for r in rows}
    valid = [d for d in sorted(m) if start <= d <= end and m[d].get(key) is not None]
    if not valid:
        return None
    return _ret(float(m[valid[-1]][key]), float(m[valid[0]][key]))


def _max_drawdown(equity):
    peak, dd = -float("inf"), 0.0
    for v in equity:
        peak = max(peak, v)
        if peak > 0:
            dd = min(dd, v / peak - 1)
    return dd


def _annualized(total_return, days):
    return (1 + total_return) ** (252 / max(days, 1)) - 1 if total_return is not None and 1 + total_return > 0 else -1.0


def _sharpe(equity):
    rets = [equity[i] / equity[i - 1] - 1 for i in range(1, len(equity)) if equity[i - 1] > 0]
    sd = _std(rets)
    return (_mean(rets) / sd * math.sqrt(252)) if rets and sd and sd > 1e-12 else None


def _parse_mode(mode: str) -> dict:
    if mode == "momentum_only":
        return {"trend": "none", "prob_key": None, "prob_type": None}
    if mode.startswith("trend_"):
        return {"trend": mode.removeprefix("trend_"), "prob_key": None, "prob_type": None}
    if mode.endswith("_pct30"):
        model = mode.removesuffix("_pct30")
        key = {"baseline": "baseline_probability", "lightgbm": "lightgbm_probability", "xgboost": "xgboost_probability", "ensemble": "calibrated_probability"}[model]
        return {"trend": "soft2", "prob_key": key, "prob_type": "percentile", "threshold": 0.70}
    if mode.startswith("ensemble_abs_"):
        threshold = int(mode.rsplit("_", 1)[1]) / 100
        return {"trend": "soft2", "prob_key": "calibrated_probability", "prob_type": "absolute", "threshold": threshold}
    if mode.startswith("ensemble_pct_"):
        top = int(mode.rsplit("_", 1)[1]) / 100
        return {"trend": "soft2", "prob_key": "calibrated_probability", "prob_type": "percentile", "threshold": 1 - top}
    if mode == "full_v051":
        return {"trend": "soft2", "prob_key": "calibrated_probability", "prob_type": "percentile", "threshold": PERCENTILE_ENTRY, "hysteresis": True}
    raise ValueError(f"unknown mode {mode}")


def _eligible(rows: Sequence[Mapping], mode: str) -> list[str]:
    cfg = _parse_mode(mode)
    ranked = sorted(rows, key=lambda r: r["momentum_rank"])
    candidates = [r for r in ranked if r["momentum_rank"] <= ENTRY_RANK and trend_pass_variant(r, cfg["trend"])]
    key = cfg.get("prob_key")
    if not key:
        return [r["symbol"] for r in candidates][:MAX_POSITIONS]
    if cfg["prob_type"] == "absolute":
        candidates = [r for r in candidates if r.get(key) is not None and r[key] >= cfg["threshold"]]
    else:
        cutoff = _percentile_cutoff(rows, key, cfg["threshold"])
        candidates = [r for r in candidates if cutoff is not None and r.get(key) is not None and r[key] >= cutoff]
    return [r["symbol"] for r in candidates][:MAX_POSITIONS]


def simulate_strategy(
    predicted: Mapping,
    histories: Mapping[str, Sequence[Mapping]],
    taiex_rows: Sequence[Mapping],
    benchmark_0050: Optional[Sequence[Mapping]],
    *,
    start_date: str,
    end_date: str,
    mode: str,
    costs: Mapping = DEFAULT_COSTS,
):
    stock_maps = _maps(histories)
    dates = [r["date"] for r in taiex_rows if start_date <= r["date"] <= end_date]
    weekly = _weekly_first_sessions(dates)
    buy_comm = float(costs.get("buyCommission", 0))
    sell_fee = float(costs.get("sellCommission", 0)) + float(costs.get("sellTax", 0))
    slip = float(costs.get("slippagePerSide", 0))
    cash = 1.0
    positions = {}  # symbol -> shares, entryFill, entryIdx
    pending_target = None
    pending_exits = set()
    equity_curve, decisions = [], []
    total_trade_notional = 0.0
    estimated_cost = 0.0
    precision_labels = []

    def price(symbol, date, field):
        row = stock_maps.get(symbol, {}).get(date)
        return float(row[field]) if row and row.get(field) is not None else None

    def sell(symbol, date, current_idx, fraction=1.0, reason="rebalance"):
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
        decisions.append({"date": date, "symbol": symbol, "action": "SELL", "exit_reason": reason, "grossNotional": gross, "holdDays": current_idx - pos.get("entryIdx", current_idx)})

    def buy_value(symbol, date, current_idx, gross_value):
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
            positions[symbol] = {"shares": shares, "entryFill": fill, "entryIdx": current_idx}
        decisions.append({"date": date, "symbol": symbol, "action": "BUY", "exit_reason": None, "grossNotional": gross_value})

    def rebalance(date, current_idx, target):
        target = list(dict.fromkeys(target))[:MAX_POSITIONS]
        for symbol in list(positions):
            if symbol not in target:
                sell(symbol, date, current_idx, 1.0, "rebalance")
        if not target:
            return
        open_equity = cash + sum(pos["shares"] * (price(s, date, "open") or 0) for s, pos in positions.items())
        desired = open_equity / len(target)
        for symbol in list(positions):
            raw = price(symbol, date, "open")
            if raw is None:
                continue
            value = positions[symbol]["shares"] * raw
            weight = value / open_equity if open_equity else 0
            desired_weight = 1 / len(target)
            if weight > desired_weight + REBALANCE_BAND:
                sell(symbol, date, current_idx, (value - desired) / value, "rebalance_band")
        for symbol in target:
            raw = price(symbol, date, "open")
            if raw is None:
                continue
            current = positions.get(symbol, {}).get("shares", 0) * raw
            current_weight = current / open_equity if open_equity else 0
            desired_weight = 1 / len(target)
            if current_weight < desired_weight - REBALANCE_BAND:
                buy_value(symbol, date, current_idx, max(0, desired - current))

    cfg = _parse_mode(mode)
    for idx, date in enumerate(dates):
        if pending_exits:
            for symbol, reason in list(pending_exits):
                sell(symbol, date, idx, 1.0, reason)
            pending_exits.clear()
        if pending_target is not None:
            rebalance(date, idx, pending_target)
            pending_target = None

        equity = cash + sum(pos["shares"] * (price(s, date, "close") or 0) for s, pos in positions.items())
        equity_curve.append({"date": date, "equity": equity, "cash": cash, "positions": list(positions)})
        next_date = dates[idx + 1] if idx + 1 < len(dates) else None
        rows = [v for (d, _), v in predicted.items() if d == date]
        by_symbol = {r["symbol"]: r for r in rows}

        if mode == "full_v051" and next_date:
            cutoff_exit = _percentile_cutoff(rows, "calibrated_probability", PERCENTILE_EXIT) if rows else None
            for symbol, pos in list(positions.items()):
                close = price(symbol, date, "close")
                if close is None:
                    continue
                r = by_symbol.get(symbol)
                gross_ret = close / pos["entryFill"] - 1
                held = idx - pos.get("entryIdx", idx)
                reason = None
                if gross_ret >= TAKE_PROFIT:
                    reason = "take_profit"
                elif gross_ret <= STOP_LOSS:
                    reason = "stop_loss"
                elif held >= MIN_HOLD_DAYS and r and r["momentum_rank"] > EXIT_RANK:
                    reason = "rank_drop"
                elif held >= MIN_HOLD_DAYS and r and trend_score(r) == 0:
                    reason = "trend_fail_all"
                elif held >= MIN_HOLD_DAYS and r and cutoff_exit is not None and r["calibrated_probability"] < cutoff_exit:
                    reason = "probability_percentile_drop"
                if reason:
                    pending_exits.add((symbol, reason))

        if date not in weekly or not next_date or not rows:
            continue

        if mode == "full_v051":
            entry_cut = _percentile_cutoff(rows, "calibrated_probability", PERCENTILE_ENTRY)
            exit_cut = _percentile_cutoff(rows, "calibrated_probability", PERCENTILE_EXIT)
            retained = []
            for symbol, pos in positions.items():
                r = by_symbol.get(symbol)
                held = idx - pos.get("entryIdx", idx)
                if not r:
                    continue
                if held < MIN_HOLD_DAYS:
                    retained.append(symbol)
                elif r["momentum_rank"] <= EXIT_RANK and trend_score(r) >= 1 and (exit_cut is None or r["calibrated_probability"] >= exit_cut):
                    retained.append(symbol)
            entrants = [
                r["symbol"] for r in sorted(rows, key=lambda x: x["momentum_rank"])
                if r["momentum_rank"] <= ENTRY_RANK
                and trend_score(r) >= SOFT_TREND_MIN
                and entry_cut is not None and r["calibrated_probability"] >= entry_cut
                and r["symbol"] not in retained
            ]
            target = (retained + entrants)[:MAX_POSITIONS]
        else:
            target = _eligible(rows, mode)

        labels = [by_symbol[s].get("target") for s in target if s in by_symbol and by_symbol[s].get("target") is not None]
        precision_labels.extend(int(v) for v in labels)
        pending_target = target
        decisions.append({"date": date, "action": "SIGNAL", "mode": mode, "target": target, "target_weight": (1 / len(target) if target else 0)})

    if positions and dates:
        last = dates[-1]
        for symbol in list(positions):
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
    buy_count = sum(1 for d in decisions if d.get("action") == "BUY")
    sell_count = sum(1 for d in decisions if d.get("action") == "SELL")
    return {
        "mode": mode,
        "config": cfg,
        "period": {"start": dates[0] if dates else None, "end": dates[-1] if dates else None, "tradingDays": len(dates)},
        "metrics": {
            "totalReturn": total_return,
            "annualizedReturn": _annualized(total_return, len(dates)) if total_return is not None else None,
            "maxDrawdown": _max_drawdown(eq) if eq else None,
            "sharpe": _sharpe(eq),
            "turnover": total_trade_notional / avg_eq,
            "estimatedCost": estimated_cost,
            "precisionAtK": _mean(precision_labels),
            "buyCount": buy_count,
            "sellCount": sell_count,
            "taiexReturn": _benchmark_return(taiex_rows, start_date, end_date, "index"),
            "0050Return": _benchmark_return(benchmark_0050 or [], start_date, end_date, "close") if benchmark_0050 else None,
        },
        "decisions": decisions,
        "equityCurve": equity_curve,
    }


def run_v051_ablation(predicted, histories, taiex_rows, benchmark_0050, start_date, end_date):
    modes = [
        "momentum_only",
        "trend_ma",
        "trend_ma_slope",
        "trend_ma_slope_volume",
        "trend_full",
        "baseline_pct30",
        "lightgbm_pct30",
        "xgboost_pct30",
        "ensemble_pct30",
        *[f"ensemble_abs_{int(t * 100)}" for t in ABS_THRESHOLDS],
        *[f"ensemble_pct_{int((1 - p) * 100)}" for p in PERCENTILE_THRESHOLDS],
        "full_v051",
    ]
    return [simulate_strategy(
        predicted, histories, taiex_rows, benchmark_0050,
        start_date=start_date, end_date=end_date, mode=mode,
    ) for mode in modes]

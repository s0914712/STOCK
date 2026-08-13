"""00631L + cash benchmark and risk-control research engine.

All signals are computed from prior close information and executed at the next
available session open. ETF trading costs follow the project assumptions with
ETF sell tax (0.1%) rather than stock sell tax.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable, Mapping, Optional, Sequence

import numpy as np

ETF_COSTS = {
    "buyCommission": 0.001425,
    "sellCommission": 0.001425,
    "sellTax": 0.001,
    "slippagePerSide": 0.001,
}


def _mean(xs):
    vals = [float(x) for x in xs if x is not None and np.isfinite(x)]
    return float(np.mean(vals)) if vals else None


def _std(xs):
    vals = [float(x) for x in xs if x is not None and np.isfinite(x)]
    return float(np.std(vals, ddof=1)) if len(vals) >= 2 else 0.0


def _ret(a, b):
    return float(a / b - 1.0) if a is not None and b not in (None, 0) else None


def _max_drawdown(values):
    peak, worst = -float("inf"), 0.0
    for v in values:
        if not np.isfinite(v) or v <= 0:
            continue
        peak = max(peak, v)
        worst = min(worst, v / peak - 1.0)
    return float(worst)


def _sharpe(values):
    rets = [values[i] / values[i - 1] - 1 for i in range(1, len(values)) if values[i - 1] > 0]
    sd = _std(rets)
    mu = _mean(rets)
    return float(mu / sd * math.sqrt(252)) if mu is not None and sd and sd > 1e-12 else None


def _cagr(total_return, trading_days):
    if total_return is None or 1 + total_return <= 0:
        return -1.0 if total_return is not None else None
    return float((1 + total_return) ** (252 / max(trading_days, 1)) - 1)


def _rolling_mean(values, n):
    out = [None] * len(values)
    for i in range(n - 1, len(values)):
        out[i] = float(np.mean(values[i - n + 1:i + 1]))
    return out


def _rolling_vol(values, n=20):
    out = [None] * len(values)
    rets = [None] + [_ret(values[i], values[i - 1]) for i in range(1, len(values))]
    for i in range(n, len(values)):
        xs = [x for x in rets[i - n + 1:i + 1] if x is not None]
        if len(xs) >= n - 2:
            out[i] = float(np.std(xs, ddof=1) * math.sqrt(252))
    return out


def _rolling_drawdown(values, n=252):
    out = [None] * len(values)
    for i in range(len(values)):
        start = max(0, i - n + 1)
        peak = max(values[start:i + 1])
        out[i] = float(values[i] / peak - 1.0) if peak > 0 else None
    return out


def align_market(lev_rows: Sequence[Mapping], benchmark_rows: Sequence[Mapping]):
    lm = {r["date"]: r for r in lev_rows}
    bm = {r["date"]: r for r in benchmark_rows}
    dates = sorted(set(lm) & set(bm))
    rows = []
    for d in dates:
        rows.append({
            "date": d,
            "lev_open": float(lm[d]["open"]),
            "lev_close": float(lm[d]["close"]),
            "bench_open": float(bm[d]["open"]),
            "bench_close": float(bm[d]["close"]),
        })
    closes = [r["bench_close"] for r in rows]
    ma200 = _rolling_mean(closes, 200)
    vol20 = _rolling_vol(closes, 20)
    dd252 = _rolling_drawdown(closes, 252)
    for i, row in enumerate(rows):
        row["ma200"] = ma200[i]
        row["vol20"] = vol20[i]
        row["dd252"] = dd252[i]
    return rows


@dataclass(frozen=True)
class StrategySpec:
    name: str
    family: str
    signal: Callable[[int, Sequence[Mapping], float, Optional[float]], Optional[float]]
    min_trade_weight: float = 0.01


def _month_end(i, rows):
    return i == len(rows) - 1 or rows[i]["date"][:7] != rows[i + 1]["date"][:7]


def _quarter_end(i, rows):
    if i == len(rows) - 1:
        return True
    d, nd = rows[i]["date"], rows[i + 1]["date"]
    return d[:4] != nd[:4] or ((int(d[5:7]) - 1) // 3 != (int(nd[5:7]) - 1) // 3)


def _week_end(i, rows):
    if i == len(rows) - 1:
        return True
    from datetime import datetime
    a = datetime.strptime(rows[i]["date"], "%Y-%m-%d").isocalendar()[:2]
    b = datetime.strptime(rows[i + 1]["date"], "%Y-%m-%d").isocalendar()[:2]
    return a != b


def strategy_specs():
    def hold50(i, rows, w, state):
        return None

    def scheduled(target, schedule):
        return lambda i, rows, w, state: target if schedule(i, rows) else None

    def band(lower, upper, target=0.50):
        return lambda i, rows, w, state: target if w < lower or w > upper else None

    def dd_ladder(levels, schedule=_week_end):
        def sig(i, rows, w, state):
            if not schedule(i, rows):
                return None
            dd = rows[i].get("dd252")
            if dd is None:
                return None
            target = levels[0][1]
            for threshold, weight in levels:
                if dd <= threshold:
                    target = weight
            return target
        return sig

    def ma_rule(above, below, schedule=_week_end):
        def sig(i, rows, w, state):
            if not schedule(i, rows):
                return None
            ma = rows[i].get("ma200")
            if ma is None:
                return None
            return above if rows[i]["bench_close"] > ma else below
        return sig

    def vol_rule(target_vol, floor, cap, schedule=_week_end):
        def sig(i, rows, w, state):
            if not schedule(i, rows):
                return None
            vol = rows[i].get("vol20")
            if vol is None or vol <= 1e-9:
                return None
            target = 0.5 * target_vol / vol
            return float(min(cap, max(floor, target)))
        return sig

    def regime_ladder(above, below_base, below_steps, schedule=_week_end):
        def sig(i, rows, w, state):
            if not schedule(i, rows):
                return None
            ma = rows[i].get("ma200")
            dd = rows[i].get("dd252")
            if ma is None or dd is None:
                return None
            if rows[i]["bench_close"] > ma:
                return above
            target = below_base
            for threshold, weight in below_steps:
                if dd <= threshold:
                    target = weight
            return target
        return sig

    def vol_dd(target_vol=0.18, schedule=_week_end):
        def sig(i, rows, w, state):
            if not schedule(i, rows):
                return None
            vol, dd = rows[i].get("vol20"), rows[i].get("dd252")
            if vol is None or dd is None or vol <= 1e-9:
                return None
            target = min(0.70, max(0.25, 0.5 * target_vol / vol))
            if dd <= -0.10:
                target += 0.05
            if dd <= -0.20:
                target += 0.05
            if dd <= -0.30:
                target += 0.05
            return min(0.75, target)
        return sig

    return [
        StrategySpec("lev50_hold", "fixed", hold50),
        StrategySpec("lev50_monthly", "fixed", scheduled(0.50, _month_end)),
        StrategySpec("lev50_quarterly", "fixed", scheduled(0.50, _quarter_end)),
        StrategySpec("fixed40_monthly", "fixed", scheduled(0.40, _month_end)),
        StrategySpec("fixed45_monthly", "fixed", scheduled(0.45, _month_end)),
        StrategySpec("fixed55_monthly", "fixed", scheduled(0.55, _month_end)),
        StrategySpec("band45_55", "band", band(0.45, 0.55)),
        StrategySpec("band40_60", "band", band(0.40, 0.60)),
        StrategySpec("band35_65", "band", band(0.35, 0.65)),
        StrategySpec("dd_50_60_70_80", "drawdown", dd_ladder([(0.0, 0.50), (-0.10, 0.60), (-0.20, 0.70), (-0.30, 0.80)])),
        StrategySpec("dd_45_55_65_75", "drawdown", dd_ladder([(0.0, 0.45), (-0.10, 0.55), (-0.20, 0.65), (-0.30, 0.75)])),
        StrategySpec("ma200_50_25", "trend", ma_rule(0.50, 0.25)),
        StrategySpec("ma200_55_35", "trend", ma_rule(0.55, 0.35)),
        StrategySpec("vol18", "volatility", vol_rule(0.18, 0.25, 0.70)),
        StrategySpec("vol22", "volatility", vol_rule(0.22, 0.25, 0.75)),
        StrategySpec("vol18_dd", "hybrid", vol_dd(0.18)),
        StrategySpec("regime_ladder_A", "hybrid", regime_ladder(0.50, 0.25, [(-0.10, 0.35), (-0.20, 0.50), (-0.30, 0.65)])),
        StrategySpec("regime_ladder_B", "hybrid", regime_ladder(0.55, 0.30, [(-0.10, 0.40), (-0.20, 0.55), (-0.30, 0.70)])),
    ]


def simulate(rows: Sequence[Mapping], spec: StrategySpec, *, start_date: str, end_date: str,
             cash_annual_yield: float = 0.0, costs: Mapping = ETF_COSTS):
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
    daily_cash_rate = (1.0 + cash_annual_yield) ** (1 / 252) - 1.0

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
        if i > 0 and cash_annual_yield:
            cash *= 1 + daily_cash_rate
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

    # End-of-test liquidation at final close for investable after-cost return.
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
            "tradeCount": len(trades),
            "avgLeveragedEtfWeight": _mean(weights),
        },
    }


def benchmark_buy_hold(rows: Sequence[Mapping], *, start_date: str, end_date: str,
                       costs: Mapping = ETF_COSTS):
    data = [r for r in rows if start_date <= r["date"] <= end_date]
    if len(data) < 2:
        raise ValueError("insufficient benchmark rows")
    buy_fee = float(costs["buyCommission"])
    sell_fee = float(costs["sellCommission"]) + float(costs["sellTax"])
    slip = float(costs["slippagePerSide"])
    entry = float(data[0]["bench_open"]) * (1 + slip)
    shares = 1.0 / (entry * (1 + buy_fee))
    values = [shares * float(r["bench_close"]) for r in data]
    exit_fill = float(data[-1]["bench_close"]) * (1 - slip)
    final = shares * exit_fill * (1 - sell_fee)
    values[-1] = final
    tr = final - 1.0
    return {
        "name": "0050_buyhold_after_cost",
        "period": {"start": data[0]["date"], "end": data[-1]["date"], "tradingDays": len(data)},
        "metrics": {
            "totalReturn": tr,
            "cagr": _cagr(tr, len(data)),
            "maxDrawdown": _max_drawdown(values),
            "sharpe": _sharpe(values),
        },
    }


def index_benchmark(index_rows: Sequence[Mapping], *, start_date: str, end_date: str, value_key: str):
    data = [r for r in index_rows if start_date <= r["date"] <= end_date and r.get(value_key) is not None]
    if len(data) < 2:
        return None
    values = [float(r[value_key]) for r in data]
    tr = values[-1] / values[0] - 1.0
    return {
        "totalReturn": tr,
        "cagr": _cagr(tr, len(values)),
        "maxDrawdown": _max_drawdown(values),
        "sharpe": _sharpe(values),
        "tradingDays": len(values),
    }

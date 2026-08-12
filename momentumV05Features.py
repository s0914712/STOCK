"""Feature and label construction for Momentum Rotation Challenger v0.5."""
from __future__ import annotations

import math
from datetime import datetime
from typing import Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

import numpy as np
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score

from mlChallenger import DEFAULT_SECTORS

VERSION = "v0.5"
HORIZON = 10
MOMENTUM_WEIGHTS = {5: 0.15, 10: 0.25, 20: 0.30, 60: 0.30}
PROBABILITY_ENTRY = 0.60
PROBABILITY_EXIT = 0.50
ENTRY_RANK = 5
EXIT_RANK = 10
MAX_POSITIONS = 5
TARGET_SLOT_WEIGHT = 0.20
COST_BUFFER = 0.01
LABEL_MAX_DRAWDOWN = -0.10
TAKE_PROFIT = 0.20
STOP_LOSS = -0.20
DEFAULT_COSTS = {
    "buyCommission": 0.001425,
    "sellCommission": 0.001425,
    "sellTax": 0.003,
    "slippagePerSide": 0.001,
}
SECTOR_BY_SYMBOL = {symbol: sector for sector, symbols in DEFAULT_SECTORS.items() for symbol in symbols}
DEFAULT_UNIVERSE = sorted(SECTOR_BY_SYMBOL)
BASE_FEATURE_NAMES = [
    "momentum5", "momentum10", "momentum20", "momentum60",
    "relative5", "relative10", "relative20", "relative60",
    "momentum_score", "volume_ratio", "distance_ma20", "ma20_slope5",
    "ma20_over_ma60", "volatility20",
]
FEATURE_NAMES = BASE_FEATURE_NAMES + [f"sector_{i}" for i in range(len(DEFAULT_SECTORS))]

def _mean(values: Iterable[float]) -> float:
    xs = [float(v) for v in values if v is not None and np.isfinite(v)]
    return float(np.mean(xs)) if xs else float("nan")


def _std(values: Iterable[float]) -> float:
    xs = [float(v) for v in values if v is not None and np.isfinite(v)]
    return float(np.std(xs, ddof=1)) if len(xs) >= 2 else 0.0


def _ret(a: float, b: float) -> float:
    return float(a / b - 1.0) if np.isfinite(a) and np.isfinite(b) and b else float("nan")


def _z(value: float, values: Sequence[float]) -> float:
    xs = [float(v) for v in values if np.isfinite(v)]
    if not np.isfinite(value) or len(xs) < 2:
        return 0.0
    s = _std(xs)
    return 0.0 if s < 1e-12 else float((value - _mean(xs)) / s)


def _max_drawdown(prices: Sequence[float]) -> float:
    peak = -float("inf")
    dd = 0.0
    for p in prices:
        if not np.isfinite(p) or p <= 0:
            continue
        peak = max(peak, p)
        if peak > 0:
            dd = min(dd, p / peak - 1.0)
    return float(dd)


def _safe_auc(y: Sequence[int], p: Sequence[float]) -> Optional[float]:
    return float(roc_auc_score(y, p)) if len(set(int(v) for v in y)) > 1 else None


def _metrics(y: Sequence[int], p: Sequence[float]) -> dict:
    if not y:
        return {"brier": None, "logloss": None, "rocAuc": None}
    clipped = np.clip(np.asarray(p, dtype=float), 1e-6, 1 - 1e-6)
    return {
        "brier": float(brier_score_loss(y, clipped)),
        "logloss": float(log_loss(y, clipped, labels=[0, 1])),
        "rocAuc": _safe_auc(y, clipped),
    }


def _weekly_signal_dates(dates: Sequence[str], start: Optional[str] = None, end: Optional[str] = None) -> List[str]:
    groups: Dict[Tuple[int, int], str] = {}
    for date in dates:
        if start and date < start:
            continue
        if end and date > end:
            continue
        iso = datetime.strptime(date, "%Y-%m-%d").isocalendar()
        groups[(iso.year, iso.week)] = date
    return list(groups.values())


def _rows_to_map(rows: Sequence[Mapping]) -> Dict[str, Mapping]:
    return {str(r["date"]): r for r in rows}


def build_feature_rows(
    histories: Mapping[str, Sequence[Mapping]],
    taiex_rows: Sequence[Mapping],
    *,
    include_unmatured: bool = False,
    cost_buffer: float = COST_BUFFER,
    max_drawdown_floor: float = LABEL_MAX_DRAWDOWN,
) -> List[dict]:
    """Build point-in-time stock rows and a 10-trading-day continuation label.

    Label = 1 iff stock forward 10d return > TAIEX forward 10d return +
    cost_buffer AND the forward path max drawdown is not worse than the risk
    floor.  The current date itself is included as the starting point for path
    drawdown.
    """
    stock_maps = {s: _rows_to_map(rows) for s, rows in histories.items()}
    taiex_map = _rows_to_map(taiex_rows)
    dates = [str(r["date"]) for r in taiex_rows]
    sectors = list(DEFAULT_SECTORS)
    out: List[dict] = []

    for i in range(60, len(dates)):
        date = dates[i]
        if date not in taiex_map:
            continue
        taiex_now = float(taiex_map[date]["index"])
        taiex_mom = {
            h: _ret(taiex_now, float(taiex_map[dates[i - h]]["index"]))
            for h in MOMENTUM_WEIGHTS
        }
        daily: List[dict] = []
        for symbol in DEFAULT_UNIVERSE:
            smap = stock_maps.get(symbol, {})
            current = smap.get(date)
            if not current:
                continue
            anchors = {h: smap.get(dates[i - h]) for h in MOMENTUM_WEIGHTS}
            if not all(anchors.values()):
                continue
            close_window = [smap.get(dates[j]) for j in range(i - 64, i + 1) if j >= 0]
            close_window = [r for r in close_window if r]
            if len(close_window) < 60:
                continue
            closes = [float(r["close"]) for r in close_window]
            vols = [float(r["volume"]) for r in close_window]
            close = float(current["close"])
            ma20 = _mean(closes[-20:])
            ma60 = _mean(closes[-60:])
            # 20-day moving average as it stood five trading days earlier.
            ma20_prev5 = _mean(closes[-25:-5]) if len(closes) >= 25 else float("nan")
            daily_rets = [_ret(closes[j], closes[j - 1]) for j in range(1, len(closes))]
            row = {
                "date": date,
                "symbol": symbol,
                "sector": SECTOR_BY_SYMBOL[symbol],
                "close": close,
                "ma20": ma20,
                "ma60": ma60,
                "ma20_slope5": _ret(ma20, ma20_prev5),
                "volume_ratio": _mean(vols[-5:]) / _mean(vols[-20:]),
                "distance_ma20": _ret(close, ma20),
                "ma20_over_ma60": _ret(ma20, ma60),
                "volatility20": _std(daily_rets[-20:]) * math.sqrt(252),
            }
            for h in MOMENTUM_WEIGHTS:
                row[f"momentum{h}"] = _ret(close, float(anchors[h]["close"]))
                row[f"relative{h}"] = row[f"momentum{h}"] - taiex_mom[h]
            daily.append(row)

        if len(daily) < 8:
            continue
        cross = {h: [r[f"momentum{h}"] for r in daily] for h in MOMENTUM_WEIGHTS}
        for r in daily:
            r["momentum_score"] = float(sum(
                MOMENTUM_WEIGHTS[h] * _z(r[f"momentum{h}"], cross[h])
                for h in MOMENTUM_WEIGHTS
            ))
        daily.sort(key=lambda r: r["momentum_score"], reverse=True)
        for rank, r in enumerate(daily, 1):
            r["momentum_rank"] = rank
            r["trend_pass"] = bool(
                r["close"] > r["ma20"] > r["ma60"]
                and r["ma20_slope5"] > 0
                and r["volume_ratio"] >= 0.80
                and 0 < r["distance_ma20"] <= 0.20
            )

            target = None
            target_date = None
            forward_return = None
            taiex_forward = None
            forward_mdd = None
            if i + HORIZON < len(dates):
                target_date = dates[i + HORIZON]
                future = stock_maps[r["symbol"]].get(target_date)
                if future:
                    forward_return = _ret(float(future["close"]), r["close"])
                    taiex_forward = _ret(float(taiex_map[target_date]["index"]), taiex_now)
                    path = [r["close"]]
                    for j in range(i + 1, i + HORIZON + 1):
                        rr = stock_maps[r["symbol"]].get(dates[j])
                        if rr:
                            path.append(float(rr["close"]))
                    if len(path) == HORIZON + 1:
                        forward_mdd = _max_drawdown(path)
                        target = int(
                            forward_return > taiex_forward + cost_buffer
                            and forward_mdd >= max_drawdown_floor
                        )
            if target is None and not include_unmatured:
                continue

            sector_i = sectors.index(r["sector"])
            r["features"] = [
                r[name] for name in BASE_FEATURE_NAMES
            ] + [1.0 if j == sector_i else 0.0 for j in range(len(sectors))]
            r["target"] = target
            r["targetDate"] = target_date
            r["forwardReturn10"] = forward_return
            r["taiexForward10"] = taiex_forward
            r["forwardMaxDrawdown10"] = forward_mdd
            out.append(r)
    return out


def benchmark_return(rows: Sequence[Mapping], start_date: str, end_date: str, value_key: str) -> Optional[float]:
    m = _rows_to_map(rows)
    if start_date not in m or end_date not in m:
        return None
    return _ret(float(m[end_date][value_key]), float(m[start_date][value_key]))


def score_shadow_snapshot(snapshot: Mapping, feature_rows: Sequence[Mapping]) -> Optional[dict]:
    as_of = snapshot.get("asOf")
    actual = {
        r["symbol"]: r for r in feature_rows
        if r.get("date") == as_of and r.get("target") is not None
    }
    if not actual:
        return None
    predicted = [r for r in snapshot.get("rows", []) if r.get("symbol") in actual]
    if not predicted:
        return None
    y = [int(actual[r["symbol"]]["target"]) for r in predicted]
    model_metrics = {}
    for key in ["baseline_probability", "lightgbm_probability", "xgboost_probability", "calibrated_probability"]:
        probs = [r.get(key) for r in predicted]
        if any(v is None for v in probs):
            continue
        model_metrics[key.replace("_probability", "")] = _metrics(y, [float(v) for v in probs])
    selected = set(snapshot.get("selected", []))
    selected_actual = [actual[s] for s in selected if s in actual]
    target_date = max(r["targetDate"] for r in actual.values() if r.get("targetDate"))
    return {
        "id": snapshot.get("id"),
        "asOf": as_of,
        "targetDate": target_date,
        "selected": list(selected),
        "precisionAtK": _mean(int(r["target"]) for r in selected_actual) if selected_actual else None,
        "avgSelectedReturn10": _mean(r["forwardReturn10"] for r in selected_actual) if selected_actual else None,
        "avgSelectedExcess10": _mean(
            r["forwardReturn10"] - r["taiexForward10"] for r in selected_actual
        ) if selected_actual else None,
        "models": model_metrics,
        "actual": [{
            "symbol": r["symbol"],
            "target": int(actual[r["symbol"]]["target"]),
            "realized_return": actual[r["symbol"]]["forwardReturn10"],
            "taiex_return": actual[r["symbol"]]["taiexForward10"],
            "max_drawdown_10d": actual[r["symbol"]]["forwardMaxDrawdown10"],
        } for r in predicted],
    }


def summarize_shadow_scores(scores: Sequence[Mapping]) -> dict:
    result = {
        "scoredSnapshots": len(scores),
        "precisionAtK": _mean(s.get("precisionAtK") for s in scores),
        "avgSelectedReturn10": _mean(s.get("avgSelectedReturn10") for s in scores),
        "avgSelectedExcess10": _mean(s.get("avgSelectedExcess10") for s in scores),
        "models": {},
    }
    for model in ["baseline", "lightgbm", "xgboost", "calibrated"]:
        blocks = [s.get("models", {}).get(model) for s in scores]
        blocks = [b for b in blocks if b]
        result["models"][model] = {
            "meanBrier": _mean(b.get("brier") for b in blocks),
            "meanLogloss": _mean(b.get("logloss") for b in blocks),
            "meanRocAuc": _mean(b.get("rocAuc") for b in blocks),
        }
    return result

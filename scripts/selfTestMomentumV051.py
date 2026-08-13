#!/usr/bin/env python3
from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from mlChallenger import DEFAULT_SECTORS
from momentumV05Backtest import walk_forward_predictions
from momentumV05Features import build_feature_rows
from momentumV051Backtest import run_v051_ablation, trend_score, trend_pass_variant


def main():
    rng = np.random.default_rng(51)
    dates = pd.bdate_range("2023-01-03", periods=430).strftime("%Y-%m-%d").tolist()
    histories = {}
    symbols = [s for members in DEFAULT_SECTORS.values() for s in members]
    for si, symbol in enumerate(symbols):
        price = 70.0 + si
        rows = []
        for i, date in enumerate(dates):
            regime = 0.0018 if (i // 55 + si) % 4 else -0.0010
            noise = rng.normal(0, 0.008)
            price *= max(0.80, 1 + regime + noise + 0.0008 * math.sin(i / 11 + si))
            open_px = price * (1 + rng.normal(0, 0.0015))
            rows.append({
                "date": date, "open": open_px, "high": max(open_px, price) * 1.01,
                "low": min(open_px, price) * 0.99, "close": price,
                "volume": 120000 + 900 * i + 6000 * abs(math.sin(i / 9 + si)),
            })
        histories[symbol] = rows

    taiex = []
    idx = 12000.0
    for i, date in enumerate(dates):
        idx *= 1 + 0.0004 + 0.0018 * math.sin(i / 33)
        taiex.append({"date": date, "index": idx})
    etf = [{"date": r["date"], "open": r["index"] / 200, "close": r["index"] / 200} for r in taiex]

    rows = build_feature_rows(histories, taiex)
    assert rows
    probe = rows[len(rows) // 2]
    assert 0 <= trend_score(probe) <= 4
    assert trend_pass_variant(probe, "none") is True

    start, end = dates[280], dates[-11]
    predicted, log = walk_forward_predictions(rows, start, end)
    assert predicted and log
    results = run_v051_ablation(predicted, histories, taiex, etf, start, end)
    modes = {r["mode"] for r in results}
    expected = {
        "momentum_only", "trend_ma", "trend_ma_slope", "trend_ma_slope_volume", "trend_full",
        "baseline_pct30", "lightgbm_pct30", "xgboost_pct30", "ensemble_pct30",
        "ensemble_abs_40", "ensemble_abs_45", "ensemble_abs_50", "ensemble_abs_55", "ensemble_abs_60",
        "ensemble_pct_40", "ensemble_pct_30", "ensemble_pct_19", "full_v051",
    }
    assert modes == expected, (modes, expected)
    assert all(r["metrics"]["maxDrawdown"] is not None for r in results)
    candidate = next(r for r in results if r["mode"] == "full_v051")
    assert candidate["metrics"]["turnover"] >= 0
    print(f"v0.5.1 self-test passed: predictions={len(predicted)} strategies={len(results)}")


if __name__ == "__main__":
    main()

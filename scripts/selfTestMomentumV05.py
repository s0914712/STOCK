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
from momentumV05Backtest import run_ablation, walk_forward_predictions
from momentumV05Features import FEATURE_NAMES, build_feature_rows
from momentumV05Models import fit_bundle, predict_rows


def main():
    rng = np.random.default_rng(42)
    dates = pd.bdate_range("2024-01-02", periods=340).strftime("%Y-%m-%d").tolist()
    histories = {}
    symbols = [s for members in DEFAULT_SECTORS.values() for s in members]
    for si, symbol in enumerate(symbols):
        price = 80.0 + si
        rows = []
        for i, date in enumerate(dates):
            regime = 0.0014 if (i // 45 + si) % 3 else -0.0007
            noise = rng.normal(0, 0.009)
            price *= max(0.80, 1 + regime + noise + 0.0007 * math.sin(i / 8 + si))
            open_px = price * (1 + rng.normal(0, 0.002))
            rows.append({
                "date": date, "open": open_px, "high": max(open_px, price) * 1.01,
                "low": min(open_px, price) * 0.99, "close": price,
                "volume": 100000 + 1500 * i + 5000 * abs(math.sin(i / 7 + si)),
            })
        histories[symbol] = rows
    taiex = []
    idx = 10000.0
    for i, date in enumerate(dates):
        idx *= 1 + 0.00045 + 0.002 * math.sin(i / 31)
        taiex.append({"date": date, "index": idx})
    etf = [{"date": r["date"], "open": r["index"] / 200, "close": r["index"] / 200} for r in taiex]

    rows = build_feature_rows(histories, taiex)
    assert rows and all(len(r["features"]) == len(FEATURE_NAMES) for r in rows)
    assert set(r["target"] for r in rows) == {0, 1}
    train = [r for r in rows if r["date"] < dates[250] and r["targetDate"] < dates[250]]
    bundle = fit_bundle(train)
    current = [r for r in rows if r["date"] == dates[250]]
    preds = predict_rows(current, bundle)
    assert len(preds) >= 8
    assert all(0 <= p["calibrated_probability"] <= 1 for p in preds)

    start, end = dates[250], dates[-11]
    predicted, log = walk_forward_predictions(rows, start, end)
    assert predicted and log
    results = run_ablation(predicted, histories, taiex, etf, start, end)
    assert len(results) == 7
    assert {r["mode"] for r in results} == {
        "momentum_only", "momentum_trend", "baseline", "lightgbm", "xgboost", "ensemble", "full_portfolio"
    }
    assert all(r["metrics"]["maxDrawdown"] is not None for r in results)
    print(f"v0.5 self-test passed: features={len(rows)} predictions={len(predicted)} strategies={len(results)}")


if __name__ == "__main__":
    main()

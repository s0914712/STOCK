#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from mlChallenger import fetch_stock_history, fetch_universe, month_keys
from momentumV05Backtest import run_ablation, walk_forward_predictions
from momentumV05Features import build_feature_rows

START_DATE = "2021-08-11"
ETF_0050_SPLIT_DATE = "2025-06-18"
ETF_0050_SPLIT_RATIO = 4.0


def pct(x):
    return "—" if x is None else f"{x * 100:.2f}%"


def num(x, suffix=""):
    return "—" if x is None else f"{x:.2f}{suffix}"


def adjust_0050_split(rows):
    """Return a split-adjusted 0050 price series.

    TWSE announced a 4:1 split effective with the new units listed on
    2025-06-18. STOCK_DAY is a raw-price series, so all pre-split OHLC values
    are divided by four to avoid treating the corporate action as a -75% loss.
    This remains a price-return benchmark (dividends are not reinvested), which
    is directionally consistent with using the TAIEX price index as the other
    benchmark.
    """
    adjusted = []
    for row in rows:
        item = dict(row)
        if item.get("date") and item["date"] < ETF_0050_SPLIT_DATE:
            for field in ("open", "high", "low", "close"):
                if item.get(field) is not None:
                    item[field] = float(item[field]) / ETF_0050_SPLIT_RATIO
        adjusted.append(item)
    return adjusted


def report_markdown(strategies, start_date, end_date):
    lines = [
        "# Momentum Rotation Challenger v0.5 — Walk-forward Backtest",
        "",
        f"Period: **{start_date} → {end_date}**",
        "",
        "All ML rows are produced by monthly expanding walk-forward retraining. A training row is eligible only when its full 10-trading-day label matured before the forecast month.",
        "",
        "0050 uses TWSE raw STOCK_DAY prices adjusted for the official 4:1 split effective 2025-06-18. Dividends are not reinvested, so this is a split-adjusted price-return benchmark rather than total return.",
        "",
        "| Layer | Net return | CAGR | Max DD | Sharpe | Turnover | Precision@K | Excess vs TAIEX | Excess vs 0050 |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for s in strategies:
        m = s["metrics"]
        t = m.get("totalReturn")
        excess_taiex = None if t is None or m.get("taiexReturn") is None else t - m["taiexReturn"]
        excess_0050 = None if t is None or m.get("0050Return") is None else t - m["0050Return"]
        lines.append(
            f"| {s['mode']} | {pct(t)} | {pct(m.get('annualizedReturn'))} | {pct(m.get('maxDrawdown'))} | "
            f"{num(m.get('sharpe'))} | {num(m.get('turnover'), 'x')} | {pct(m.get('precisionAtK'))} | "
            f"{pct(excess_taiex)} | {pct(excess_0050)} |"
        )
    lines += [
        "",
        "## Interpretation gate",
        "",
        "The ML layer is not promoted merely for higher AUC. It must beat `momentum_trend` after costs on portfolio return / drawdown / Sharpe / turnover / Precision@K and remain superior in forward Shadow data.",
        "",
        "`full_portfolio` adds the v0.5 decision layer: Top-5 entry, Top-10 hysteresis, probability 0.60 entry / 0.50 exit, trend-failure exit, +20% take-profit and -20% stop-loss.",
    ]
    return "\n".join(lines) + "\n"


def main():
    months = month_keys(96)
    histories, taiex = fetch_universe(month_count=96, workers=5)
    benchmark_0050 = adjust_0050_split(fetch_stock_history("0050", months))
    rows = build_feature_rows(histories, taiex, include_unmatured=True)
    end_date = max(r["date"] for r in taiex)
    predicted, training_log = walk_forward_predictions(rows, START_DATE, end_date)
    strategies = run_ablation(predicted, histories, taiex, benchmark_0050, START_DATE, end_date)
    report = {
        "version": "v0.5",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "period": {"start": START_DATE, "end": end_date},
        "target": "10d return > TAIEX 10d return + 1% cost buffer AND forward max drawdown >= -10%",
        "execution": "weekly signal after close; next-session open; daily early exits for full portfolio",
        "costs": {
            "buyCommission": 0.001425,
            "sellCommission": 0.001425,
            "sellTax": 0.003,
            "slippagePerSide": 0.001,
        },
        "benchmarks": {
            "TAIEX": "price index",
            "0050": {
                "type": "split-adjusted price return; dividends not reinvested",
                "splitDate": ETF_0050_SPLIT_DATE,
                "splitRatio": ETF_0050_SPLIT_RATIO,
            },
        },
        "walkForwardTraining": training_log,
        "strategies": strategies,
    }
    out = ROOT / "data/backtests/momentum_rotation_v0.5.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")

    md = ROOT / "docs/MOMENTUM_ROTATION_V05.md"
    md.parent.mkdir(parents=True, exist_ok=True)
    md.write_text(report_markdown(strategies, START_DATE, end_date), encoding="utf-8")
    print(md.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()

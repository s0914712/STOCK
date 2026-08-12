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


def pct(x):
    return "—" if x is None else f"{x * 100:.2f}%"


def main():
    months = month_keys(96)
    histories, taiex = fetch_universe(month_count=96, workers=5)
    benchmark_0050 = fetch_stock_history("0050", months)
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
        "walkForwardTraining": training_log,
        "strategies": strategies,
    }
    out = ROOT / "data/backtests/momentum_rotation_v0.5.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# Momentum Rotation Challenger v0.5 — Walk-forward Backtest",
        "",
        f"Period: **{START_DATE} → {end_date}**",
        "",
        "All ML rows are produced by monthly expanding walk-forward retraining. A training row is eligible only when its full 10-trading-day label matured before the forecast month.",
        "",
        "| Layer | Net return | CAGR | Max DD | Sharpe | Turnover | Precision@K | Excess vs TAIEX | Excess vs 0050 |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for s in strategies:
        m = s["metrics"]
        t = m.get("totalReturn")
        lines.append(
            f"| {s['mode']} | {pct(t)} | {pct(m.get('annualizedReturn'))} | {pct(m.get('maxDrawdown'))} | "
            f"{('—' if m.get('sharpe') is None else f'{m.get("sharpe"):.2f}')} | "
            f"{('—' if m.get('turnover') is None else f'{m.get("turnover"):.2f}x')} | {pct(m.get('precisionAtK'))} | "
            f"{pct(None if t is None or m.get('taiexReturn') is None else t - m.get('taiexReturn'))} | "
            f"{pct(None if t is None or m.get('0050Return') is None else t - m.get('0050Return'))} |"
        )
    lines += [
        "",
        "## Interpretation gate",
        "",
        "The ML layer is not promoted merely for higher AUC. It must beat `momentum_trend` after costs on portfolio return / drawdown / Sharpe / turnover / Precision@K and remain superior in forward Shadow data.",
        "",
        "`full_portfolio` adds the v0.5 decision layer: Top-5 entry, Top-10 hysteresis, probability 0.60 entry / 0.50 exit, trend-failure exit, +20% take-profit and -20% stop-loss.",
    ]
    md = ROOT / "docs/MOMENTUM_ROTATION_V05.md"
    md.parent.mkdir(parents=True, exist_ok=True)
    md.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "data/backtests/momentum_rotation_v0.5.json"
DOC = ROOT / "docs/MOMENTUM_ROTATION_V05.md"
ETF_0050_SPLIT_DATE = "2025-06-18"
ETF_0050_SPLIT_RATIO = 4.0


def pct(x):
    return "—" if x is None else f"{x * 100:.2f}%"


def num(x, suffix=""):
    return "—" if x is None else f"{x:.2f}{suffix}"


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
        m = s.get("metrics", {})
        t = m.get("totalReturn")
        ex_taiex = None if t is None or m.get("taiexReturn") is None else t - m["taiexReturn"]
        ex_0050 = None if t is None or m.get("0050Return") is None else t - m["0050Return"]
        lines.append(
            f"| {s.get('mode')} | {pct(t)} | {pct(m.get('annualizedReturn'))} | {pct(m.get('maxDrawdown'))} | "
            f"{num(m.get('sharpe'))} | {num(m.get('turnover'), 'x')} | {pct(m.get('precisionAtK'))} | "
            f"{pct(ex_taiex)} | {pct(ex_0050)} |"
        )
    lines += [
        "",
        "## Interpretation gate",
        "",
        "Current v0.5.0 does **not** pass the promotion gate: Momentum-only remains positive but trails both major benchmarks; the current Trend filter reduces performance; and the 0.60 probability gate produces no trades for all ML portfolio layers.",
        "",
        "The ML layer is not promoted merely for higher AUC. It must beat `momentum_trend` after costs on portfolio return / drawdown / Sharpe / turnover / Precision@K and remain superior in forward Shadow data.",
        "",
        "`full_portfolio` adds the v0.5 decision layer: Top-5 entry, Top-10 hysteresis, probability 0.60 entry / 0.50 exit, trend-failure exit, +20% take-profit and -20% stop-loss.",
    ]
    return "\n".join(lines) + "\n"


def main():
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    period = report.get("period", {})
    crosses_split = period.get("start", "9999") < ETF_0050_SPLIT_DATE <= period.get("end", "0000")
    if not crosses_split:
        raise RuntimeError("v0.5 report does not straddle the known 0050 split; refusing blind correction")

    for strategy in report.get("strategies", []):
        metrics = strategy.get("metrics", {})
        raw = metrics.get("0050ReturnRawUnadjusted", metrics.get("0050Return"))
        if raw is None:
            continue
        metrics["0050ReturnRawUnadjusted"] = raw
        metrics["0050Return"] = (1.0 + float(raw)) * ETF_0050_SPLIT_RATIO - 1.0

    report["benchmarks"] = {
        "TAIEX": "price index",
        "0050": {
            "type": "split-adjusted price return; dividends not reinvested",
            "splitDate": ETF_0050_SPLIT_DATE,
            "splitRatio": ETF_0050_SPLIT_RATIO,
            "sourceSeries": "TWSE STOCK_DAY raw prices",
            "correction": "pre-split prices divided by four; equivalent total-period return correction applied to the first-run report",
        },
    }
    report["benchmarkCorrectionAppliedAt"] = datetime.now(timezone.utc).isoformat()
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    DOC.write_text(report_markdown(report.get("strategies", []), period.get("start"), period.get("end")), encoding="utf-8")
    print(DOC.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()

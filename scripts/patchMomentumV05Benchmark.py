#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.runMomentumV05Backtest import (
    ETF_0050_SPLIT_DATE,
    ETF_0050_SPLIT_RATIO,
    report_markdown,
)

REPORT = ROOT / "data/backtests/momentum_rotation_v0.5.json"
DOC = ROOT / "docs/MOMENTUM_ROTATION_V05.md"


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

#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/backtests/momentum_rotation_v0.5.1.json"
OUT = ROOT / "data/backtests/momentum_rotation_v0.5.1_summary.json"


def main():
    report = json.loads(SOURCE.read_text(encoding="utf-8"))
    strategies = []
    for s in report.get("strategies", []):
        m = s.get("metrics", {})
        total = m.get("totalReturn")
        taiex = m.get("taiexReturn")
        etf = m.get("0050Return")
        strategies.append({
            "mode": s.get("mode"),
            "netReturn": total,
            "cagr": m.get("annualizedReturn"),
            "maxDrawdown": m.get("maxDrawdown"),
            "sharpe": m.get("sharpe"),
            "turnover": m.get("turnover"),
            "precisionAtK": m.get("precisionAtK"),
            "buys": m.get("buyCount"),
            "sells": m.get("sellCount"),
            "estimatedCost": m.get("estimatedCost"),
            "excessVsTAIEX": None if total is None or taiex is None else total - taiex,
            "excessVs0050": None if total is None or etf is None else total - etf,
        })
    summary = {
        "version": report.get("version", "v0.5.1"),
        "generatedAt": report.get("generatedAt"),
        "period": report.get("period"),
        "candidate": report.get("design"),
        "strategies": strategies,
        "benchmark": report.get("benchmark"),
        "promotionGate": report.get("verdict"),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    # The detailed trace is deliberately ephemeral; it is useful during the run
    # but should not be committed to the repository.
    SOURCE.unlink(missing_ok=True)
    print(f"wrote compact summary: {OUT}")


if __name__ == "__main__":
    main()

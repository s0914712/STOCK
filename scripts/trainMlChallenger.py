#!/usr/bin/env python3
import json
from pathlib import Path

from mlChallenger import build_feature_rows, fetch_universe, train_models

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "data" / "models" / "sector_challenger_v031"
REPORT = ROOT / "data" / "backtests" / "ml_challenger_v031.json"


def main():
    histories, taiex = fetch_universe(month_count=32, workers=5)
    rows = build_feature_rows(histories, taiex, include_unmatured=False)
    metadata = train_models(rows, MODEL_DIR)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps({
        "version": "v0.3.1",
        "purpose": "weekly expanding-history challenger training",
        "dataSource": "TWSE STOCK_DAY + FMTQIK",
        "universe": "same six-sector / eighteen-stock proxy universe as v0.3",
        "leakageRule": "training row is eligible only after its 5-trading-day target is observable",
        **metadata,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

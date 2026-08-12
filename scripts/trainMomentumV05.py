#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from mlChallenger import fetch_universe
from momentumV05Features import build_feature_rows
from momentumV05Models import chronological_validation, fit_bundle, save_bundle


def main():
    histories, taiex = fetch_universe(month_count=72, workers=5)
    rows = build_feature_rows(histories, taiex)
    validation = chronological_validation(rows)
    bundle = fit_bundle(rows)
    metadata = save_bundle(bundle, ROOT / "data/models/v05", {"validation": validation})
    out = {
        "version": "v0.5",
        "metadata": metadata,
        "validation": validation,
    }
    path = ROOT / "data/backtests/momentum_v05_ml_validation.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

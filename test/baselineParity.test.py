#!/usr/bin/env python3
"""
Champion baseline parity — Python side.

Twin of `test/baselineParity.test.js`. Both assert the same
`test/fixtures/baseline_golden.json`, so the JavaScript baseline that serves the
live radar and the Python baseline that feeds the ML challenger's
`baseline_linear` feature cannot drift apart without failing CI.

Imports only `baselineScore`, never `mlChallenger`, so this runs on a bare
Python with no numpy / lightgbm / xgboost installed.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from baselineScore import (
    BASELINE_SIGMOID_SLOPE,
    BASELINE_WEIGHTS,
    baseline_columns,
    baseline_linear,
    baseline_score01,
)

GOLDEN_PATH = ROOT / "test" / "fixtures" / "baseline_golden.json"


def main() -> None:
    golden = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))
    tolerance = golden["tolerance"]

    # The fixture pins the constants too. Without this, changing a weight in
    # both the code and the fixture would pass while silently redefining the
    # champion the challenger is measured against.
    assert BASELINE_WEIGHTS == golden["weights"], (
        f"baselineScore.py weights {BASELINE_WEIGHTS} drifted from {GOLDEN_PATH.name} "
        f"{golden['weights']}"
    )
    assert BASELINE_SIGMOID_SLOPE == golden["sigmoidSlope"], (
        f"baselineScore.py sigmoid slope {BASELINE_SIGMOID_SLOPE} drifted from "
        f"{golden['sigmoidSlope']}"
    )

    checked = 0
    worst = 0.0
    for case in golden["cases"]:
        columns = baseline_columns(case["rows"])
        for index, row in enumerate(case["rows"]):
            expected = case["expected"][index]
            linear = baseline_linear(row, columns)
            score01 = baseline_score01(linear)

            for label, actual, want in (
                ("linear", linear, expected["linear"]),
                ("score01", score01, expected["score01"]),
            ):
                diff = abs(actual - want)
                worst = max(worst, diff)
                assert diff <= tolerance, (
                    f"{case['name']}[{index}] {label}: got {actual!r}, "
                    f"expected {want!r} (diff {diff} > {tolerance}). "
                    "The Python and JavaScript baselines have drifted."
                )
            checked += 1

    print(
        f"baseline parity (py) passed: {checked} rows across {len(golden['cases'])} "
        f"golden cases, worst deviation {worst:.3e} (tolerance {tolerance:.0e})"
    )


if __name__ == "__main__":
    main()

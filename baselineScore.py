"""
Champion baseline scoring formula — Python side.

This exact formula also exists in JavaScript (`sectorRadar.js`), because the
live radar ranks sectors in Node while the ML challenger consumes the same
score as its `baseline_linear` feature. Two independent implementations of the
champion is a drift hazard: if the weights diverge, the challenger is silently
compared against a baseline that is no longer the one being served, and nothing
raises an error.

`test/fixtures/baseline_golden.json` pins the contract. `test/baselineParity.test.py`
and `test/baselineParity.test.js` both assert against it, so a change made on
one side and not the other fails CI instead of drifting.

Deliberately stdlib-only: the parity test must run without numpy/lightgbm so it
stays cheap enough to sit in the ordinary test job.
"""

from __future__ import annotations

import math
from typing import Iterable, Mapping, Optional, Sequence

# Feature key -> weight. Ordering is irrelevant to the result but is kept in the
# same order as the JS side to make the two readable side by side.
BASELINE_WEIGHTS = {
    "momentum5": 0.40,
    "momentum20": 0.30,
    "volume_ratio": 0.15,
    "breadth_ma20": 0.15,
    "volatility20": -0.10,
}

# Slope applied before the logistic squash. Not a fitted parameter: it only sets
# how quickly the 0-100 display score saturates.
BASELINE_SIGMOID_SLOPE = 1.15

_EPSILON_STD = 1e-12


def is_finite(value) -> bool:
    """None-tolerant isfinite. JS `Number.isFinite(null)` is false, not a throw."""
    if value is None or isinstance(value, bool):
        return False
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


def mean(values: Iterable[float]) -> Optional[float]:
    xs = [float(v) for v in values if is_finite(v)]
    if not xs:
        return None
    return sum(xs) / len(xs)


def std(values: Iterable[float]) -> float:
    """Sample standard deviation (ddof=1), matching the JS implementation."""
    xs = [float(v) for v in values if is_finite(v)]
    if len(xs) < 2:
        return 0.0
    m = sum(xs) / len(xs)
    variance = sum((x - m) ** 2 for x in xs) / (len(xs) - 1)
    return math.sqrt(variance)


def zscore(value, values: Sequence[float]) -> float:
    if not is_finite(value):
        return 0.0
    xs = [float(v) for v in values if is_finite(v)]
    if len(xs) < 2:
        return 0.0
    s = std(xs)
    if not math.isfinite(s) or s < _EPSILON_STD:
        return 0.0
    return (float(value) - (sum(xs) / len(xs))) / s


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def baseline_components(row: Mapping, columns: Mapping[str, Sequence[float]]) -> dict:
    """Cross-sectional z-score of each weighted feature, for one row."""
    return {key: zscore(row.get(key), columns.get(key, ())) for key in BASELINE_WEIGHTS}


def baseline_linear(row: Mapping, columns: Mapping[str, Sequence[float]]) -> float:
    components = baseline_components(row, columns)
    return sum(BASELINE_WEIGHTS[key] * components[key] for key in BASELINE_WEIGHTS)


def baseline_score01(linear: float) -> float:
    """Calibration input for the ML challenger: the raw 0-1 logistic output."""
    return sigmoid(BASELINE_SIGMOID_SLOPE * linear)


def baseline_columns(rows: Sequence[Mapping]) -> dict:
    """Build the cross-sectional column vectors the z-scores are taken against."""
    return {key: [r.get(key) for r in rows] for key in BASELINE_WEIGHTS}

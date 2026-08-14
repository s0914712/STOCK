"""Model training/inference for Momentum Rotation Challenger v0.5."""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Mapping, Optional, Sequence

import joblib
import numpy as np
from lightgbm import LGBMClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from xgboost import XGBClassifier

from momentumV05Features import FEATURE_NAMES

BASELINE_NAMES = ["momentum_score", "relative20", "ma20_slope5", "distance_ma20", "volume_ratio"]


def _safe_auc(y, p):
    return float(roc_auc_score(y, p)) if len(set(int(v) for v in y)) > 1 else None


def metric_block(y, p):
    if len(y) == 0:
        return {"brier": None, "logloss": None, "rocAuc": None}
    pp = np.clip(np.asarray(p, dtype=float), 1e-6, 1 - 1e-6)
    return {
        "brier": float(brier_score_loss(y, pp)),
        "logloss": float(log_loss(y, pp, labels=[0, 1])),
        "rocAuc": _safe_auc(y, pp),
    }


class IdentityCalibrator:
    def predict_proba(self, x):
        p = np.asarray(x, dtype=float).reshape(-1)
        return np.column_stack([1 - p, p])


def _matrix(rows: Sequence[Mapping]):
    return np.asarray([r["features"] for r in rows], dtype=float)


def _baseline_matrix(rows: Sequence[Mapping]):
    return np.asarray([[float(r[name]) for name in BASELINE_NAMES] for r in rows], dtype=float)


def _targets(rows: Sequence[Mapping]):
    return np.asarray([int(r["target"]) for r in rows], dtype=int)


def _fit_sigmoid(raw_prob, y):
    if len(y) < 30 or len(set(int(v) for v in y)) < 2:
        return IdentityCalibrator()
    model = LogisticRegression(C=1.0, max_iter=1000, random_state=42)
    model.fit(np.asarray(raw_prob).reshape(-1, 1), y)
    return model


def fit_bundle(rows: Sequence[Mapping]):
    mature = sorted([r for r in rows if r.get("target") is not None], key=lambda r: (r["date"], r["symbol"]))
    dates = sorted({r["date"] for r in mature})
    if len(mature) < 500 or len(dates) < 120:
        raise RuntimeError(f"insufficient v0.5 training history: rows={len(mature)} dates={len(dates)}")
    split_idx = max(80, int(len(dates) * 0.80))
    split_date = dates[min(split_idx, len(dates) - 1)]
    core = [r for r in mature if r["date"] < split_date]
    cal = [r for r in mature if r["date"] >= split_date]
    if len(set(_targets(core))) < 2:
        raise RuntimeError("v0.5 training target has one class")

    baseline = LogisticRegression(C=0.7, max_iter=1500, random_state=42)
    lgb = LGBMClassifier(
        n_estimators=180, learning_rate=0.035, num_leaves=15,
        min_child_samples=30, subsample=0.9, colsample_bytree=0.85,
        reg_lambda=1.5, random_state=42, verbosity=-1,
    )
    xgb = XGBClassifier(
        n_estimators=200, learning_rate=0.035, max_depth=3,
        min_child_weight=4, subsample=0.9, colsample_bytree=0.85,
        reg_lambda=1.5, objective="binary:logistic", eval_metric="logloss",
        random_state=42, n_jobs=2,
    )

    baseline.fit(_baseline_matrix(core), _targets(core))
    lgb.fit(_matrix(core), _targets(core))
    xgb.fit(_matrix(core), _targets(core))

    if cal and len(set(_targets(cal))) > 1:
        lraw = lgb.predict_proba(_matrix(cal))[:, 1]
        xraw = xgb.predict_proba(_matrix(cal))[:, 1]
        lcal = _fit_sigmoid(lraw, _targets(cal))
        xcal = _fit_sigmoid(xraw, _targets(cal))
    else:
        lcal, xcal = IdentityCalibrator(), IdentityCalibrator()

    # Deployable learners refit on all currently mature observations. Calibrators
    # remain fitted only on the earlier chronological calibration block.
    baseline.fit(_baseline_matrix(mature), _targets(mature))
    lgb.fit(_matrix(mature), _targets(mature))
    xgb.fit(_matrix(mature), _targets(mature))
    return {
        "baseline": baseline,
        "lightgbm": lgb,
        "xgboost": xgb,
        "lightgbm_calibrator": lcal,
        "xgboost_calibrator": xcal,
        "trainedThrough": max(r["date"] for r in mature),
        "labelThrough": max(r["targetDate"] for r in mature if r.get("targetDate")),
        "samples": len(mature),
        "dates": len(dates),
    }


def predict_rows(rows: Sequence[Mapping], bundle: Mapping) -> list[dict]:
    if not rows:
        return []
    x = _matrix(rows)
    xb = _baseline_matrix(rows)
    bp = bundle["baseline"].predict_proba(xb)[:, 1]
    lraw = bundle["lightgbm"].predict_proba(x)[:, 1]
    xraw = bundle["xgboost"].predict_proba(x)[:, 1]
    lp = bundle["lightgbm_calibrator"].predict_proba(lraw.reshape(-1, 1))[:, 1]
    xp = bundle["xgboost_calibrator"].predict_proba(xraw.reshape(-1, 1))[:, 1]
    ep = (bp + lp + xp) / 3.0
    out = []
    for i, r in enumerate(rows):
        out.append({
            **dict(r),
            "baseline_probability": float(bp[i]),
            "lightgbm_probability": float(lp[i]),
            "xgboost_probability": float(xp[i]),
            # Equal-weight OOS ensemble for v0.5.0. It is evaluated as a
            # probability forecast; no champion status is implied.
            "calibrated_probability": float(ep[i]),
        })
    for key in ["baseline_probability", "lightgbm_probability", "xgboost_probability", "calibrated_probability"]:
        ranked = sorted(out, key=lambda z: z[key], reverse=True)
        for rank, row in enumerate(ranked, 1):
            row[key.replace("_probability", "_rank")] = rank
    return out


def chronological_validation(rows: Sequence[Mapping]) -> dict:
    mature = [r for r in rows if r.get("target") is not None]
    dates = sorted({r["date"] for r in mature})
    if len(dates) < 180:
        raise RuntimeError("insufficient dates for v0.5 chronological validation")
    split = dates[int(len(dates) * 0.80)]
    train = [r for r in mature if r["date"] < split and r.get("targetDate") and r["targetDate"] < split]
    valid = [r for r in mature if r["date"] >= split]
    bundle = fit_bundle(train)
    pred = predict_rows(valid, bundle)
    y = [int(r["target"]) for r in pred]
    metrics = {}
    for key in ["baseline_probability", "lightgbm_probability", "xgboost_probability", "calibrated_probability"]:
        metrics[key.replace("_probability", "")] = metric_block(y, [r[key] for r in pred])
    return {
        "splitDate": split,
        "trainSamples": len(train),
        "validationSamples": len(valid),
        "metrics": metrics,
    }


def save_bundle(bundle: Mapping, model_dir: Path, metadata: Optional[Mapping] = None):
    model_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(dict(bundle), model_dir / "bundle.joblib")
    meta = {
        "version": "v0.5",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "target": "10d stock return > TAIEX 10d return + 1% cost buffer AND max drawdown >= -10%",
        "featureNames": FEATURE_NAMES,
        "trainedThrough": bundle.get("trainedThrough"),
        "labelThrough": bundle.get("labelThrough"),
        "samples": bundle.get("samples"),
        "dates": bundle.get("dates"),
        **(dict(metadata or {})),
    }
    (model_dir / "metadata.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return meta


def load_bundle(model_dir: Path):
    return joblib.load(model_dir / "bundle.joblib")

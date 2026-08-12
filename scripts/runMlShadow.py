#!/usr/bin/env python3
import json
from datetime import datetime, timezone
from pathlib import Path

from mlChallenger import (
    build_feature_rows,
    fetch_universe,
    load_models,
    predict_date,
    score_shadow_prediction,
    summarize_scores,
)

ROOT = Path(__file__).resolve().parents[1]
SHADOW = ROOT / "data" / "shadow"
MODEL_DIR = ROOT / "data" / "models" / "sector_challenger_v031"
BASELINE_LEDGER = SHADOW / "predictions.jsonl"
PRED_PATH = SHADOW / "challenger_predictions.jsonl"
SCORE_PATH = SHADOW / "challenger_scores.jsonl"
LATEST_PATH = SHADOW / "challenger_latest.json"


def read_jsonl(path: Path):
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def append_jsonl(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")


def main():
    if not BASELINE_LEDGER.exists():
        raise RuntimeError("baseline shadow ledger missing; run npm run shadow first")
    if not (MODEL_DIR / "metadata.json").exists():
        raise RuntimeError("ML models missing; run scripts/trainMlChallenger.py first")

    baseline_predictions = read_jsonl(BASELINE_LEDGER)
    if not baseline_predictions:
        raise RuntimeError("baseline shadow ledger is empty")
    as_of = baseline_predictions[-1]["asOf"]

    # Daily inference/scoring only needs recent data. Weekly training owns the long history fetch.
    histories, taiex = fetch_universe(month_count=4, workers=5)
    feature_rows = build_feature_rows(histories, taiex, include_unmatured=True)
    models = load_models(MODEL_DIR)
    metadata = json.loads((MODEL_DIR / "metadata.json").read_text(encoding="utf-8"))

    predictions = read_jsonl(PRED_PATH)
    scores = read_jsonl(SCORE_PATH)
    prediction_ids = {r["id"] for r in predictions}
    scored_ids = {r["id"] for r in scores}

    snapshot_id = f"{as_of}:sector-challenger-v0.3.1"
    if snapshot_id not in prediction_ids:
        sectors = predict_date(feature_rows, models, as_of)
        snapshot = {
            "id": snapshot_id,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "asOf": as_of,
            "version": "v0.3.1",
            "target": "P(5d sector return > 5d TAIEX return)",
            "models": ["baseline", "lightgbm", "xgboost"],
            "baselineSemantics": "existing heuristic score calibrated by logistic regression on mature historical labels",
            "modelTrainedThrough": metadata.get("trainedThrough"),
            "sectors": sectors,
        }
        append_jsonl(PRED_PATH, snapshot)
        predictions.append(snapshot)
        print(f"Appended challenger prediction {snapshot_id}")
    else:
        print(f"Challenger prediction already exists: {snapshot_id}")

    for prediction in predictions:
        if prediction["id"] in scored_ids:
            continue
        score = score_shadow_prediction(prediction, feature_rows)
        if score is None:
            print(f"Not mature yet: {prediction['id']}")
            continue
        append_jsonl(SCORE_PATH, score)
        scores.append(score)
        scored_ids.add(score["id"])
        print(f"Scored {score['id']} winner={score['winnerByBrier']}")

    latest = {
        "version": "v0.3.1",
        "latestPrediction": predictions[-1] if predictions else None,
        "latestScore": scores[-1] if scores else None,
        "performance": summarize_scores(scores),
        "training": metadata,
    }
    LATEST_PATH.write_text(json.dumps(latest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(latest["performance"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

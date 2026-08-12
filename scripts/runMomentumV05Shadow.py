#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from mlChallenger import fetch_universe
from momentumV05Features import (
    DEFAULT_COSTS, ENTRY_RANK, EXIT_RANK, MAX_POSITIONS, PROBABILITY_ENTRY,
    PROBABILITY_EXIT, build_feature_rows, score_shadow_snapshot,
    summarize_shadow_scores,
)
from momentumV05Models import load_bundle, predict_rows

SHADOW = ROOT / "data/shadow"
PRED = SHADOW / "momentum_v05_predictions.jsonl"
SCORES = SHADOW / "momentum_v05_scores.jsonl"
LATEST = SHADOW / "momentum_v05_latest.json"


def read_jsonl(path):
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            out.append(json.loads(line))
    return out


def append_jsonl(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(value, ensure_ascii=False, allow_nan=False) + "\n")


def week_key(date):
    iso = datetime.strptime(date, "%Y-%m-%d").isocalendar()
    return (iso.year, iso.week)


def main():
    histories, taiex = fetch_universe(month_count=6, workers=5)
    features = build_feature_rows(histories, taiex, include_unmatured=True)
    as_of = max(r["date"] for r in features)
    current = [r for r in features if r["date"] == as_of]
    bundle = load_bundle(ROOT / "data/models/v05")
    rows = predict_rows(current, bundle)

    predictions = read_jsonl(PRED)
    scores = read_jsonl(SCORES)
    existing_score_ids = {s.get("id") for s in scores}
    for snapshot in predictions:
        if snapshot.get("id") in existing_score_ids:
            continue
        score = score_shadow_snapshot(snapshot, features)
        if score:
            append_jsonl(SCORES, score)
            scores.append(score)
            existing_score_ids.add(snapshot.get("id"))

    if not any(p.get("asOf") == as_of for p in predictions):
        previous = predictions[-1] if predictions else None
        prev_selected = set(previous.get("selected", [])) if previous else set()
        taiex_dates = sorted(r["date"] for r in taiex if r["date"] <= as_of)
        previous_date = taiex_dates[-2] if len(taiex_dates) >= 2 else None
        rotation_day = previous_date is None or week_key(previous_date) != week_key(as_of)
        by_symbol = {r["symbol"]: r for r in rows}

        retained = []
        for symbol in prev_selected:
            r = by_symbol.get(symbol)
            if r and r["trend_pass"] and r["momentum_rank"] <= EXIT_RANK and r["calibrated_probability"] >= PROBABILITY_EXIT:
                retained.append(symbol)
        entrants = []
        if rotation_day:
            entrants = [
                r["symbol"] for r in sorted(rows, key=lambda z: z["momentum_rank"])
                if r["momentum_rank"] <= ENTRY_RANK and r["trend_pass"]
                and r["calibrated_probability"] >= PROBABILITY_ENTRY
                and r["symbol"] not in retained
            ]
        selected = (retained + entrants)[:MAX_POSITIONS]
        target_weight = 1 / len(selected) if selected else 0.0

        ledger_rows = []
        for r in sorted(rows, key=lambda z: z["momentum_rank"]):
            symbol = r["symbol"]
            was_held, now_held = symbol in prev_selected, symbol in selected
            if now_held and not was_held:
                action, reason = "BUY", None
                estimated = DEFAULT_COSTS["buyCommission"] + DEFAULT_COSTS["slippagePerSide"]
            elif now_held and was_held:
                action, reason, estimated = "HOLD", None, 0.0
            elif was_held and not now_held:
                action = "EXIT"
                if not r["trend_pass"]:
                    reason = "trend_fail"
                elif r["calibrated_probability"] < PROBABILITY_EXIT:
                    reason = "probability_drop"
                elif r["momentum_rank"] > EXIT_RANK:
                    reason = "rank_drop"
                else:
                    reason = "rotation"
                estimated = DEFAULT_COSTS["sellCommission"] + DEFAULT_COSTS["sellTax"] + DEFAULT_COSTS["slippagePerSide"]
            else:
                action, reason, estimated = "WATCH", None, 0.0
            ledger_rows.append({
                "symbol": symbol,
                "sector": r["sector"],
                "momentum_score": r["momentum_score"],
                "momentum_rank": r["momentum_rank"],
                "trend_pass": r["trend_pass"],
                "baseline_probability": r["baseline_probability"],
                "lightgbm_probability": r["lightgbm_probability"],
                "xgboost_probability": r["xgboost_probability"],
                "calibrated_probability": r["calibrated_probability"],
                "portfolio_action": action,
                "target_weight": target_weight if now_held else 0.0,
                "exit_reason": reason,
                "estimated_cost": estimated,
                "realized_return": None,
            })
        snapshot = {
            "id": f"momentum-v05-{as_of}",
            "version": "v0.5",
            "asOf": as_of,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "rotationDay": rotation_day,
            "selected": selected,
            "rows": ledger_rows,
        }
        append_jsonl(PRED, snapshot)
        predictions.append(snapshot)

    latest = {
        "version": "v0.5",
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "latestPrediction": predictions[-1] if predictions else None,
        "latestScore": scores[-1] if scores else None,
        "summary": summarize_shadow_scores(scores),
    }
    SHADOW.mkdir(parents=True, exist_ok=True)
    LATEST.write_text(json.dumps(latest, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(latest, ensure_ascii=False, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()

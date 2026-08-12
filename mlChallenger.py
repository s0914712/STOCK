"""Sector Radar v0.3.1 ML challenger.

Builds point-in-time sector features, trains a calibrated baseline plus LightGBM
and XGBoost, and provides OOS scoring helpers. Labels are only considered
mature when the full five-trading-day forward window is already observable.
"""

from __future__ import annotations

import json
import math
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
from xgboost import XGBClassifier

DEFAULT_SECTORS = {
    "半導體": ["2330", "2454", "2303"],
    "AI伺服器": ["2317", "2382", "3231"],
    "PCB": ["3037", "2368", "3044"],
    "金融": ["2881", "2882", "2891"],
    "航運": ["2603", "2609", "2615"],
    "電子零組件": ["2308", "2327", "3008"],
}

HORIZON = 5
FEATURE_NAMES = [
    "momentum5", "momentum10", "momentum20", "volume_ratio",
    "breadth_ma20", "volatility20", "relative5", "relative20",
    "baseline_linear",
] + [f"sector_{i}" for i in range(len(DEFAULT_SECTORS))]


def _mean(xs: Iterable[float]) -> float:
    vals = [float(x) for x in xs if x is not None and np.isfinite(x)]
    return float(np.mean(vals)) if vals else float("nan")


def _std(xs: Iterable[float]) -> float:
    vals = [float(x) for x in xs if x is not None and np.isfinite(x)]
    return float(np.std(vals, ddof=1)) if len(vals) >= 2 else 0.0


def _ret(a: float, b: float) -> float:
    return float(a / b - 1.0) if np.isfinite(a) and np.isfinite(b) and b != 0 else float("nan")


def _z(value: float, values: Sequence[float]) -> float:
    vals = [float(x) for x in values if np.isfinite(x)]
    if not np.isfinite(value) or len(vals) < 2:
        return 0.0
    s = _std(vals)
    return 0.0 if s < 1e-12 else float((value - _mean(vals)) / s)


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def month_keys(count: int, now: Optional[datetime] = None) -> List[str]:
    now = now or datetime.now(timezone.utc)
    y, m = now.year, now.month
    out = []
    for i in range(count):
        mm = m - i
        yy = y
        while mm <= 0:
            yy -= 1
            mm += 12
        out.append(f"{yy}{mm:02d}01")
    return list(reversed(out))


def _parse_roc(value: str) -> Optional[str]:
    try:
        y, m, d = str(value).split("/")
        return f"{int(y) + 1911:04d}-{int(m):02d}-{int(d):02d}"
    except Exception:
        return None


def _fetch_json(url: str, attempts: int = 3) -> Mapping:
    last = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 STOCK-sector-challenger/0.3.1",
                "Accept": "application/json",
            })
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as exc:
            last = exc
            time.sleep(0.6 * (attempt + 1))
    raise RuntimeError(f"fetch failed: {last}")


def fetch_stock_history(symbol: str, months: Sequence[str], pause: float = 0.07) -> List[dict]:
    rows: Dict[str, dict] = {}
    for key in months:
        try:
            data = _fetch_json(
                f"https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date={key}&stockNo={symbol}"
            )
            if data.get("stat") == "OK":
                for raw in data.get("data", []):
                    date = _parse_roc(raw[0])
                    if not date:
                        continue
                    rows[date] = {
                        "date": date,
                        "open": float(str(raw[3]).replace(",", "")),
                        "high": float(str(raw[4]).replace(",", "")),
                        "low": float(str(raw[5]).replace(",", "")),
                        "close": float(str(raw[6]).replace(",", "")),
                        "volume": float(str(raw[1]).replace(",", "")),
                    }
        except Exception as exc:
            print(f"WARN stock {symbol} {key}: {exc}")
        time.sleep(pause)
    return [rows[k] for k in sorted(rows)]


def fetch_taiex_history(months: Sequence[str], pause: float = 0.07) -> List[dict]:
    rows: Dict[str, dict] = {}
    for key in months:
        try:
            data = _fetch_json(f"https://www.twse.com.tw/exchangeReport/FMTQIK?response=json&date={key}")
            if data.get("stat") == "OK":
                for raw in data.get("data", []):
                    date = _parse_roc(raw[0])
                    if not date:
                        continue
                    # FMTQIK currently exposes TAIEX at column 5 (zero-based 4).
                    index = float(str(raw[4]).replace(",", ""))
                    rows[date] = {"date": date, "index": index}
        except Exception as exc:
            print(f"WARN TAIEX {key}: {exc}")
        time.sleep(pause)
    return [rows[k] for k in sorted(rows)]


def fetch_universe(month_count: int = 32, workers: int = 5) -> Tuple[Dict[str, List[dict]], List[dict]]:
    months = month_keys(month_count)
    symbols = sorted({s for members in DEFAULT_SECTORS.values() for s in members})
    histories: Dict[str, List[dict]] = {}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {pool.submit(fetch_stock_history, symbol, months): symbol for symbol in symbols}
        for fut in as_completed(futs):
            symbol = futs[fut]
            histories[symbol] = fut.result()
            print(f"{symbol}: {len(histories[symbol])} rows")
    taiex = fetch_taiex_history(months)
    return histories, taiex


def _maps(histories: Mapping[str, Sequence[dict]]) -> Dict[str, Dict[str, dict]]:
    return {s: {r["date"]: r for r in rows} for s, rows in histories.items()}


def _stock_feature(stock_map: Mapping[str, dict], dates: Sequence[str], i: int) -> Optional[dict]:
    if i < 20:
        return None
    needed = dates[i - 20 : i + 1]
    rows = [stock_map.get(d) for d in needed]
    if sum(r is not None for r in rows) < 19:
        return None
    closes = [r["close"] for r in rows if r is not None]
    vols = [r["volume"] for r in rows if r is not None]
    if len(closes) < 19 or len(vols) < 19:
        return None
    current = stock_map.get(dates[i])
    d5 = stock_map.get(dates[i - 5])
    d10 = stock_map.get(dates[i - 10])
    d20 = stock_map.get(dates[i - 20])
    if not all([current, d5, d10, d20]):
        return None
    daily = []
    for j in range(1, len(closes)):
        daily.append(_ret(closes[j], closes[j - 1]))
    ma20 = _mean(closes[-20:])
    return {
        "close": current["close"],
        "momentum5": _ret(current["close"], d5["close"]),
        "momentum10": _ret(current["close"], d10["close"]),
        "momentum20": _ret(current["close"], d20["close"]),
        "volume_ratio": _mean(vols[-5:]) / _mean(vols[-20:]),
        "above_ma20": 1.0 if current["close"] > ma20 else 0.0,
        "volatility20": _std(daily[-20:]) * math.sqrt(252),
    }


def build_feature_rows(
    histories: Mapping[str, Sequence[dict]],
    taiex_rows: Sequence[dict],
    include_unmatured: bool = False,
) -> List[dict]:
    stock_maps = _maps(histories)
    taiex_map = {r["date"]: r for r in taiex_rows}
    dates = [r["date"] for r in taiex_rows]
    sector_names = list(DEFAULT_SECTORS)
    out: List[dict] = []

    for i in range(20, len(dates)):
        date = dates[i]
        if date not in taiex_map:
            continue
        taiex5 = _ret(taiex_map[date]["index"], taiex_map[dates[i - 5]]["index"])
        taiex20 = _ret(taiex_map[date]["index"], taiex_map[dates[i - 20]]["index"])
        raw = []
        for sector, members in DEFAULT_SECTORS.items():
            fs = [_stock_feature(stock_maps[m], dates, i) for m in members]
            fs = [f for f in fs if f is not None]
            if len(fs) < 2:
                continue
            raw.append({
                "sector": sector,
                "members": members,
                "momentum5": _mean(f["momentum5"] for f in fs),
                "momentum10": _mean(f["momentum10"] for f in fs),
                "momentum20": _mean(f["momentum20"] for f in fs),
                "volume_ratio": _mean(f["volume_ratio"] for f in fs),
                "breadth_ma20": _mean(f["above_ma20"] for f in fs),
                "volatility20": _mean(f["volatility20"] for f in fs),
            })
        if len(raw) < 3:
            continue

        cols = {k: [r[k] for r in raw] for k in [
            "momentum5", "momentum20", "volume_ratio", "breadth_ma20", "volatility20"
        ]}
        for r in raw:
            linear = (
                0.40 * _z(r["momentum5"], cols["momentum5"])
                + 0.30 * _z(r["momentum20"], cols["momentum20"])
                + 0.15 * _z(r["volume_ratio"], cols["volume_ratio"])
                + 0.15 * _z(r["breadth_ma20"], cols["breadth_ma20"])
                - 0.10 * _z(r["volatility20"], cols["volatility20"])
            )
            r["baseline_linear"] = linear
            r["baseline_score"] = _sigmoid(1.15 * linear)
            r["relative5"] = r["momentum5"] - taiex5
            r["relative20"] = r["momentum20"] - taiex20

            y = None
            future_end = None
            sector_fwd = None
            taiex_fwd = None
            if i + HORIZON < len(dates):
                future_end = dates[i + HORIZON]
                member_returns = []
                for member in r["members"]:
                    now_row = stock_maps[member].get(date)
                    future_row = stock_maps[member].get(future_end)
                    if now_row and future_row:
                        member_returns.append(_ret(future_row["close"], now_row["close"]))
                if len(member_returns) >= 2:
                    sector_fwd = _mean(member_returns)
                    taiex_fwd = _ret(taiex_map[future_end]["index"], taiex_map[date]["index"])
                    y = int(sector_fwd > taiex_fwd)
            if y is None and not include_unmatured:
                continue

            sector_i = sector_names.index(r["sector"])
            feature_values = [
                r["momentum5"], r["momentum10"], r["momentum20"], r["volume_ratio"],
                r["breadth_ma20"], r["volatility20"], r["relative5"], r["relative20"],
                r["baseline_linear"],
            ] + [1.0 if j == sector_i else 0.0 for j in range(len(sector_names))]
            out.append({
                "date": date,
                "sector": r["sector"],
                "baseline_score": r["baseline_score"],
                "features": feature_values,
                "target": y,
                "targetDate": future_end,
                "sectorForward5": sector_fwd,
                "taiexForward5": taiex_fwd,
            })
    return out


def _safe_auc(y: Sequence[int], p: Sequence[float]) -> Optional[float]:
    return float(roc_auc_score(y, p)) if len(set(y)) > 1 else None


def metric_block(y: Sequence[int], p: Sequence[float]) -> dict:
    return {
        "brier": float(brier_score_loss(y, p)),
        "logloss": float(log_loss(y, p, labels=[0, 1])),
        "rocAuc": _safe_auc(y, p),
    }


def train_models(rows: Sequence[dict], model_dir: Path) -> dict:
    mature = [r for r in rows if r["target"] is not None]
    if len(mature) < 300:
        raise RuntimeError(f"insufficient mature ML rows: {len(mature)}")
    dates = sorted({r["date"] for r in mature})
    split_date = dates[max(1, int(len(dates) * 0.8) - 1)]
    train = [r for r in mature if r["date"] <= split_date]
    valid = [r for r in mature if r["date"] > split_date]
    if len(valid) < 50:
        raise RuntimeError("validation window too small")

    def xy(items):
        return np.asarray([r["features"] for r in items], dtype=float), np.asarray([r["target"] for r in items], dtype=int)

    x_train, y_train = xy(train)
    x_valid, y_valid = xy(valid)
    baseline_train = np.asarray([[r["baseline_score"]] for r in train])
    baseline_valid = np.asarray([[r["baseline_score"]] for r in valid])

    baseline = LogisticRegression(C=1.0, max_iter=1000, random_state=42)
    lightgbm = LGBMClassifier(
        n_estimators=240, learning_rate=0.03, num_leaves=15, max_depth=-1,
        subsample=0.9, colsample_bytree=0.9, reg_lambda=1.0,
        random_state=42, verbosity=-1,
    )
    xgboost = XGBClassifier(
        n_estimators=260, learning_rate=0.03, max_depth=3,
        subsample=0.9, colsample_bytree=0.9, min_child_weight=3,
        reg_lambda=1.0, objective="binary:logistic", eval_metric="logloss",
        random_state=42, n_jobs=2,
    )
    baseline.fit(baseline_train, y_train)
    lightgbm.fit(x_train, y_train)
    xgboost.fit(x_train, y_train)

    validation = {
        "baseline": metric_block(y_valid, baseline.predict_proba(baseline_valid)[:, 1]),
        "lightgbm": metric_block(y_valid, lightgbm.predict_proba(x_valid)[:, 1]),
        "xgboost": metric_block(y_valid, xgboost.predict_proba(x_valid)[:, 1]),
    }

    # Refit all mature observations for the deployable weekly challenger.
    x_all, y_all = xy(mature)
    baseline_all = np.asarray([[r["baseline_score"]] for r in mature])
    baseline.fit(baseline_all, y_all)
    lightgbm.fit(x_all, y_all)
    xgboost.fit(x_all, y_all)

    model_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(baseline, model_dir / "baseline_calibrator.joblib")
    joblib.dump(lightgbm, model_dir / "lightgbm.joblib")
    joblib.dump(xgboost, model_dir / "xgboost.joblib")
    metadata = {
        "version": "v0.3.1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "featureNames": FEATURE_NAMES,
        "label": "P(5d sector return > 5d TAIEX return)",
        "horizonTradingDays": HORIZON,
        "matureSamples": len(mature),
        "dateCount": len(dates),
        "trainedThrough": max(r["date"] for r in mature),
        "labelThrough": max(r["targetDate"] for r in mature if r["targetDate"]),
        "validationSplitDate": split_date,
        "validationSamples": len(valid),
        "validation": validation,
    }
    (model_dir / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return metadata


def load_models(model_dir: Path):
    return {
        "baseline": joblib.load(model_dir / "baseline_calibrator.joblib"),
        "lightgbm": joblib.load(model_dir / "lightgbm.joblib"),
        "xgboost": joblib.load(model_dir / "xgboost.joblib"),
    }


def predict_date(rows: Sequence[dict], models: Mapping[str, object], as_of: str) -> List[dict]:
    current = [r for r in rows if r["date"] == as_of]
    if not current:
        raise RuntimeError(f"no feature rows for {as_of}")
    x = np.asarray([r["features"] for r in current], dtype=float)
    b = np.asarray([[r["baseline_score"]] for r in current], dtype=float)
    bp = models["baseline"].predict_proba(b)[:, 1]
    lp = models["lightgbm"].predict_proba(x)[:, 1]
    xp = models["xgboost"].predict_proba(x)[:, 1]
    out = []
    for idx, r in enumerate(current):
        out.append({
            "sector": r["sector"],
            "baselineRawScore": float(r["baseline_score"]),
            "baseline": float(bp[idx]),
            "lightgbm": float(lp[idx]),
            "xgboost": float(xp[idx]),
        })
    for model in ["baseline", "lightgbm", "xgboost"]:
        ranked = sorted(out, key=lambda z: z[model], reverse=True)
        for rank, row in enumerate(ranked, 1):
            row[f"{model}Rank"] = rank
    return out


def score_shadow_prediction(prediction: Mapping, feature_rows: Sequence[dict]) -> Optional[dict]:
    as_of = prediction["asOf"]
    actual = {r["sector"]: r for r in feature_rows if r["date"] == as_of and r["target"] is not None}
    if len(actual) < 3:
        return None
    rows = [r for r in prediction["sectors"] if r["sector"] in actual]
    y = [actual[r["sector"]]["target"] for r in rows]
    model_metrics = {}
    for model in ["baseline", "lightgbm", "xgboost"]:
        probs = [r[model] for r in rows]
        ranked = sorted(rows, key=lambda z: z[model], reverse=True)
        top1 = int(actual[ranked[0]["sector"]]["target"] == 1)
        top3 = float(np.mean([actual[r["sector"]]["target"] for r in ranked[:3]]))
        model_metrics[model] = {**metric_block(y, probs), "top1Hit": top1, "top3HitRate": top3}
    winner = min(model_metrics, key=lambda m: model_metrics[m]["brier"])
    target_date = max(actual[r["sector"]]["targetDate"] for r in rows)
    return {
        "id": prediction["id"],
        "asOf": as_of,
        "targetDate": target_date,
        "models": model_metrics,
        "winnerByBrier": winner,
        "actual": [{
            "sector": r["sector"],
            "outperformedTaiex": actual[r["sector"]]["target"],
            "sectorForward5": actual[r["sector"]]["sectorForward5"],
            "taiexForward5": actual[r["sector"]]["taiexForward5"],
        } for r in rows],
    }


def summarize_scores(scores: Sequence[Mapping]) -> dict:
    result = {"scoredSnapshots": len(scores), "models": {}}
    for model in ["baseline", "lightgbm", "xgboost"]:
        blocks = [s["models"][model] for s in scores if model in s.get("models", {})]
        result["models"][model] = {
            "meanBrier": _mean(b["brier"] for b in blocks),
            "meanLogloss": _mean(b["logloss"] for b in blocks),
            "meanRocAuc": _mean(b["rocAuc"] for b in blocks),
            "top1HitRate": _mean(b["top1Hit"] for b in blocks),
            "meanTop3HitRate": _mean(b["top3HitRate"] for b in blocks),
        }
    winners = {m: 0 for m in ["baseline", "lightgbm", "xgboost"]}
    for s in scores:
        if s.get("winnerByBrier") in winners:
            winners[s["winnerByBrier"]] += 1
    result["brierWins"] = winners
    return result


def self_test() -> None:
    # Synthetic 100-session universe: sector A outperforms, B lags.
    dates = pd.bdate_range("2025-01-02", periods=100).strftime("%Y-%m-%d").tolist()
    histories = {}
    sectors = list(DEFAULT_SECTORS)
    for si, sector in enumerate(sectors):
        drift = 0.0025 - si * 0.00035
        for mi, symbol in enumerate(DEFAULT_SECTORS[sector]):
            price = 100 + mi
            rows = []
            for di, date in enumerate(dates):
                price *= 1 + drift + 0.0002 * math.sin(di / 4 + mi)
                rows.append({"date": date, "open": price * 0.999, "high": price * 1.01, "low": price * 0.99, "close": price, "volume": 100000 + di * 50})
            histories[symbol] = rows
    taiex = [{"date": d, "index": 10000 * ((1.0008) ** i)} for i, d in enumerate(dates)]
    rows = build_feature_rows(histories, taiex)
    assert rows and all(len(r["features"]) == len(FEATURE_NAMES) for r in rows)
    assert all(r["target"] in (0, 1) for r in rows)
    print(f"mlChallenger self-test passed: {len(rows)} mature rows")


if __name__ == "__main__":
    self_test()

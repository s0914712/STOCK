#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from leverage5050Backtest import align_market
from leverage5050CashBacktest import shadow_state_with_cash_curve
from scripts.runLeverage5050Backtest import START_FLOOR, adjust_split, fetch_stock, month_keys
from scripts.runLeverage5050V5Cash import PRIMARY, fetch_cbc_rates, local_specs, make_cash_curve

MONTH_COUNT = 144
CASH_RATE_FACTOR = 0.50
LATEST = ROOT / "data/shadow/leverage_5050_latest.json"
LEDGER = ROOT / "data/shadow/leverage_5050_predictions.jsonl"


def load_ledger():
    if not LEDGER.exists():
        return []
    out = []
    for line in LEDGER.read_text(encoding="utf-8").splitlines():
        if line.strip():
            out.append(json.loads(line))
    return out


def main():
    months = month_keys(MONTH_COUNT)
    with ThreadPoolExecutor(max_workers=3) as pool:
        f0050 = pool.submit(fetch_stock, "0050", months)
        f631 = pool.submit(fetch_stock, "00631L", months)
        fcash = pool.submit(fetch_cbc_rates)
        rows0050 = adjust_split(f0050.result(), "0050")
        rows631 = adjust_split(f631.result(), "00631L")
        avg_rates, _ = fcash.result()

    market = [r for r in align_market(rows631, rows0050) if r["date"] >= START_FLOOR]
    if len(market) < 2500:
        raise RuntimeError(f"insufficient common history: {len(market)}")
    spec = next(s for s in local_specs() if s.name == PRIMARY)
    curve = make_cash_curve(avg_rates, CASH_RATE_FACTOR)
    state = shadow_state_with_cash_curve(
        market,
        spec,
        start_date=market[0]["date"],
        end_date=market[-1]["date"],
        annual_cash_yield=curve,
    )
    snapshot = {
        "version": "leverage-5050-shadow-v1",
        "method": PRIMARY,
        "instrument": "00631L",
        "cashRateFactor": CASH_RATE_FACTOR,
        "cashRateSource": "CBC five leading banks 1Y fixed deposit average, one-month lag, 50% haircut",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        **state,
    }
    LATEST.parent.mkdir(parents=True, exist_ok=True)
    ledger = load_ledger()
    if not any(x.get("asOf") == snapshot["asOf"] for x in ledger):
        with LEDGER.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(snapshot, ensure_ascii=False, allow_nan=False) + "\n")
    LATEST.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(snapshot, ensure_ascii=False, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
from __future__ import annotations

import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from leverage5050Backtest import align_market, benchmark_buy_hold, simulate, strategy_specs


def main():
    lev, bench = [], []
    p, b = 20.0, 40.0
    for i in range(700):
        year = 2023 + i // 252
        day = i % 252
        date = f"{year:04d}-{(day // 21) % 12 + 1:02d}-{day % 20 + 1:02d}"
        br = 0.00035 + 0.006 * math.sin(i / 37)
        b *= max(0.85, 1 + br)
        p *= max(0.70, 1 + 2 * br - 0.00015)
        bench.append({"date": date, "open": b * 0.999, "high": b * 1.01, "low": b * 0.99, "close": b, "volume": 1e6})
        lev.append({"date": date, "open": p * 0.999, "high": p * 1.02, "low": p * 0.98, "close": p, "volume": 1e6})
    market = align_market(lev, bench)
    assert len(market) == 700
    specs = strategy_specs()
    assert len(specs) >= 15
    start, end = market[0]["date"], market[-1]["date"]
    results = [simulate(market, s, start_date=start, end_date=end) for s in specs]
    assert all(r["metrics"]["totalReturn"] is not None for r in results)
    assert all(r["metrics"]["maxDrawdown"] <= 1e-12 for r in results)
    bres = benchmark_buy_hold(market, start_date=start, end_date=end)
    assert bres["metrics"]["totalReturn"] is not None
    print(f"leverage 50/50 self-test passed: rows={len(market)} strategies={len(results)}")


if __name__ == "__main__":
    main()

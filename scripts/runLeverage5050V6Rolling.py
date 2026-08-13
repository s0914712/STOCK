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

from leverage5050Backtest import ETF_COSTS, align_market, index_benchmark
from leverage5050CashBacktest import simulate_with_cash_curve
from scripts.runLeverage5050Backtest import START_FLOOR, SPLITS, adjust_split, fetch_stock, fetch_taiwan50, month_keys
from scripts.runLeverage5050V5Cash import PRIMARY, fetch_cbc_rates, local_specs, make_cash_curve

MONTH_COUNT = 144
CASH_FACTOR = 0.50


def pct(x): return "—" if x is None else f"{x * 100:.2f}%"
def num(x): return "—" if x is None else f"{x:.3f}"


def rolling_windows(market_start, market_end):
    windows = []
    # Pre-registered confirmation: complete 3-calendar-year windows, one-year step.
    for year in range(2015, 2024):
        start = f"{year}-01-01"
        end = f"{year + 2}-12-31"
        if start >= market_start and end <= market_end:
            windows.append((f"{year}-{year+2}", start, end))
    return windows


def calendar_windows(market_start, market_end):
    y0, y1 = int(market_start[:4]), int(market_end[:4])
    out = []
    for year in range(y0 + 1, y1 + 1):
        start, end = f"{year}-01-01", f"{year}-12-31"
        if end <= market_end:
            out.append((str(year), start, end))
    return out


def run_one(market, tai50, spec, curve, label, start, end):
    a = max(start, market[0]["date"])
    z = min(end, market[-1]["date"])
    window_market = [r for r in market if a <= r["date"] <= z]
    common_dates = {r["date"] for r in window_market}
    tr_rows = [r for r in tai50 if r["date"] in common_dates]
    if len(window_market) < 100 or len(tr_rows) != len(window_market):
        return None
    strategy = simulate_with_cash_curve(
        market, spec, start_date=a, end_date=z, annual_cash_yield=curve
    )
    benchmark = index_benchmark(tr_rows, start_date=a, end_date=z, value_key="taiwan50TR")
    sm, bm = strategy["metrics"], benchmark
    return {
        "label": label,
        "period": {"start": strategy["period"]["start"], "end": strategy["period"]["end"], "tradingDays": strategy["period"]["tradingDays"]},
        "strategy": sm,
        "benchmark": bm,
        "returnWin": sm["totalReturn"] > bm["totalReturn"],
        "sharpeWin": (sm.get("sharpe") or -99) > (bm.get("sharpe") or -99),
        "drawdownWithin5pp": sm["maxDrawdown"] >= bm["maxDrawdown"] - 0.05,
        "relativeReturn": sm["totalReturn"] - bm["totalReturn"],
    }


def markdown(report):
    rows = report["rolling3y"]
    lines = [
        "# Leverage 50/50 Challenger v6 — Rolling-Window Confirmation",
        "",
        f"Fixed method: **{PRIMARY}**. Cash assumption: **50% of the one-month-lagged CBC five-bank average 1Y fixed deposit rate**. No strategy parameter is changed from the v5 accepted primary.",
        "",
        "Confirmation gate registered before this run: among complete 3-year rolling windows, return must beat Taiwan 50 Total Return in at least 5/9, Sharpe in at least 5/9, and drawdown must stay within 5 percentage points in at least 7/9. This is an additional confirmation layer; it does not replace the v5 full/holdout/regime gate.",
        "",
        "| Window | Strategy return | Taiwan50 TR | Relative | Strategy Sharpe | TR Sharpe | Strategy DD | TR DD |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for r in rows:
        s, b = r["strategy"], r["benchmark"]
        lines.append(
            f"| {r['label']} | {pct(s['totalReturn'])} | {pct(b['totalReturn'])} | {pct(r['relativeReturn'])} | "
            f"{num(s.get('sharpe'))} | {num(b.get('sharpe'))} | {pct(s['maxDrawdown'])} | {pct(b['maxDrawdown'])} |"
        )
    g = report["confirmationGate"]
    lines += [
        "", "## Confirmation verdict", "",
        f"- 3Y return wins: **{g['returnWins']}/{g['windowCount']}**",
        f"- 3Y Sharpe wins: **{g['sharpeWins']}/{g['windowCount']}**",
        f"- 3Y DD within 5pp: **{g['drawdownPasses']}/{g['windowCount']}**",
        f"- Confirmation gate: **{'PASS' if g['passed'] else 'FAIL'}**",
        "",
    ]
    if g["passed"]:
        lines += ["**The v5 method survives the fixed rolling-window confirmation.** It remains a research challenger rather than a production mandate; live Shadow evidence is still required."]
    else:
        lines += ["The v5 method does not survive the rolling-window confirmation; do not promote it despite the full-period result."]
    lines += ["", "Calendar-year comparisons are retained in JSON as diagnostics, not used to tune or redefine the method.", "", "Research only, not investment advice."]
    return "\n".join(lines) + "\n"


def main():
    months = month_keys(MONTH_COUNT)
    with ThreadPoolExecutor(max_workers=4) as pool:
        f0050 = pool.submit(fetch_stock, "0050", months)
        f631 = pool.submit(fetch_stock, "00631L", months)
        ft50 = pool.submit(fetch_taiwan50, months)
        fcash = pool.submit(fetch_cbc_rates)
        rows0050 = adjust_split(f0050.result(), "0050")
        rows631 = adjust_split(f631.result(), "00631L")
        tai50 = ft50.result()
        avg_rates, _ = fcash.result()

    market = [r for r in align_market(rows631, rows0050) if r["date"] >= START_FLOOR]
    if len(market) < 2500:
        raise RuntimeError(f"insufficient history: {len(market)}")
    spec = next(s for s in local_specs() if s.name == PRIMARY)
    curve = make_cash_curve(avg_rates, CASH_FACTOR)

    rolling = [run_one(market, tai50, spec, curve, label, start, end)
               for label, start, end in rolling_windows(market[0]["date"], market[-1]["date"])]
    rolling = [r for r in rolling if r]
    annual = [run_one(market, tai50, spec, curve, label, start, end)
              for label, start, end in calendar_windows(market[0]["date"], market[-1]["date"])]
    annual = [r for r in annual if r]

    n = len(rolling)
    return_wins = sum(r["returnWin"] for r in rolling)
    sharpe_wins = sum(r["sharpeWin"] for r in rolling)
    dd_passes = sum(r["drawdownWithin5pp"] for r in rolling)
    # For the expected nine complete windows, thresholds are 5/9, 5/9, 7/9.
    required_return = (n + 1) // 2
    required_sharpe = (n + 1) // 2
    required_dd = max(1, int((7 / 9) * n + 0.999999))
    gate = {
        "windowCount": n,
        "returnWins": return_wins,
        "sharpeWins": sharpe_wins,
        "drawdownPasses": dd_passes,
        "requiredReturnWins": required_return,
        "requiredSharpeWins": required_sharpe,
        "requiredDrawdownPasses": required_dd,
        "passed": bool(n >= 8 and return_wins >= required_return and sharpe_wins >= required_sharpe and dd_passes >= required_dd),
    }
    report = {
        "version": "leverage-5050-v6-rolling-confirmation",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "method": PRIMARY,
        "cashRateFactor": CASH_FACTOR,
        "cashRateSource": "CBC five leading banks, 1Y fixed term-deposit average, one-month lag",
        "costs": ETF_COSTS,
        "corporateActions": SPLITS,
        "rolling3y": rolling,
        "calendarYears": annual,
        "confirmationGate": gate,
    }
    out = ROOT / "data/backtests/leverage_5050_v6.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    doc = ROOT / "docs/LEVERAGE_5050_V6.md"
    doc.parent.mkdir(parents=True, exist_ok=True)
    doc.write_text(markdown(report), encoding="utf-8")
    print(doc.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()

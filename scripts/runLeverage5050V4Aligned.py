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

from leverage5050Backtest import ETF_COSTS, align_market, benchmark_buy_hold, index_benchmark, simulate
from scripts.runLeverage5050Backtest import START_FLOOR, SPLITS, adjust_split, fetch_stock, fetch_taiwan50, month_keys
from scripts.runLeverage5050V2 import WINDOWS, strict_gate
from scripts.runLeverage5050V3 import specs

MONTH_COUNT = 144


def pct(x): return "—" if x is None else f"{x * 100:.2f}%"
def num(x): return "—" if x is None else f"{x:.4f}"


def compact(r):
    return {"name": r["name"], "family": r.get("family"), "period": r["period"], "metrics": r["metrics"]}


def run_window(market, tai50, start, end):
    a = max(start, market[0]["date"])
    z = min(end, market[-1]["date"])
    window_market = [r for r in market if a <= r["date"] <= z]
    common_dates = {r["date"] for r in window_market}
    aligned_tr = [r for r in tai50 if r["date"] in common_dates]
    b0050 = benchmark_buy_hold(market, start_date=a, end_date=z)
    btr = index_benchmark(aligned_tr, start_date=a, end_date=z, value_key="taiwan50TR")
    results = [simulate(market, s, start_date=a, end_date=z) for s in specs()]
    return a, z, b0050, btr, results, len(window_market), len(aligned_tr)


def markdown(report):
    tr = report["windows"]["full"]["benchmarks"]["taiwan50TotalReturn"]
    lines = [
        "# Leverage 50/50 Challenger v4 — Common-Calendar Validation",
        "",
        f"Period: **{report['period']['start']} → {report['period']['end']}**",
        "",
        "This run changes no strategy parameter. It re-evaluates the pre-registered v3 asymmetric-band grid after sampling the Taiwan 50 Total Return Index on exactly the same tradable common dates used by 00631L/0050. This avoids comparing a leveraged ETF return series with suspended/missing sessions against an index Sharpe calculated on extra dates.",
        "",
        f"Aligned Taiwan 50 Total Return: {pct(tr['totalReturn'])}, DD {pct(tr['maxDrawdown'])}, Sharpe {num(tr['sharpe'])}, observations {tr['tradingDays']}.",
        "",
        "| Strategy | Return | Max DD | Sharpe | Holdout return | Holdout Sharpe | Regime wins | Gate |",
        "|---|---:|---:|---:|---:|---:|---:|---|",
    ]
    for r in report["ranking"]:
        m, h = r["full"]["metrics"], r["holdout"]["metrics"]
        lines.append(
            f"| {r['name']} | {pct(m['totalReturn'])} | {pct(m['maxDrawdown'])} | {num(m['sharpe'])} | "
            f"{pct(h['totalReturn'])} | {num(h['sharpe'])} | {r['regimeWins']}/3 | {'PASS' if r['gatePassed'] else '—'} |"
        )
    lines += ["", "## Verdict", ""]
    if report["passingCount"] >= 3:
        lines += [f"**Calendar-corrected robust zone exists:** {report['passingCount']} v3 neighbors pass the strict Total Return gate."]
    elif report["passingCount"]:
        lines += [f"Only {report['passingCount']} isolated candidate(s) pass after calendar alignment; this is not yet a robust method family."]
    else:
        lines += ["No candidate passes after common-calendar alignment."]
    lines += ["", "No strategy rule or threshold was changed in v4. Research only, not investment advice."]
    return "\n".join(lines) + "\n"


def main():
    months = month_keys(MONTH_COUNT)
    with ThreadPoolExecutor(max_workers=3) as pool:
        f0050 = pool.submit(fetch_stock, "0050", months)
        f631 = pool.submit(fetch_stock, "00631L", months)
        ft50 = pool.submit(fetch_taiwan50, months)
        rows0050 = adjust_split(f0050.result(), "0050")
        rows631 = adjust_split(f631.result(), "00631L")
        tai50 = ft50.result()
    market = [r for r in align_market(rows631, rows0050) if r["date"] >= START_FLOOR]
    if len(market) < 2500:
        raise RuntimeError(f"insufficient common history: {len(market)}")
    start, end = market[0]["date"], market[-1]["date"]
    windows = {"full": (start, end), **WINDOWS}
    wr, benchmarks, per = {}, {}, {}
    for key, (ws, we) in windows.items():
        a, z, b0050, btr, results, n_market, n_tr = run_window(market, tai50, ws, we)
        if n_market != n_tr:
            raise RuntimeError(f"calendar alignment failed for {key}: market={n_market}, tr={n_tr}")
        benchmarks[key] = {"0050": b0050, "taiwan50TotalReturn": btr}
        wr[key] = {"period": {"start": a, "end": z}, "benchmarks": benchmarks[key], "commonObservations": n_market}
        for r in results:
            per.setdefault(r["name"], {"name": r["name"], "family": r["family"]})[key] = compact(r)
    ranking = []
    for block in per.values():
        checks, passed, wins = strict_gate(block, benchmarks)
        block["gate"] = checks
        block["gatePassed"] = passed
        block["regimeWins"] = wins
        ranking.append(block)
    ranking.sort(key=lambda r: (r["gatePassed"], r["regimeWins"], r["full"]["metrics"]["sharpe"], r["full"]["metrics"]["totalReturn"]), reverse=True)
    passing = sum(1 for r in ranking if r["gatePassed"])
    report = {
        "version": "leverage-5050-v4-common-calendar",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "period": {"start": start, "end": end},
        "passingCount": passing,
        "costs": ETF_COSTS,
        "corporateActions": SPLITS,
        "windows": wr,
        "ranking": ranking,
    }
    out = ROOT / "data/backtests/leverage_5050_v4.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    doc = ROOT / "docs/LEVERAGE_5050_V4.md"
    doc.parent.mkdir(parents=True, exist_ok=True)
    doc.write_text(markdown(report), encoding="utf-8")
    print(doc.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()

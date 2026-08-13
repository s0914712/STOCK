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

from leverage5050Backtest import ETF_COSTS, StrategySpec, align_market, benchmark_buy_hold, index_benchmark, simulate
from scripts.runLeverage5050Backtest import START_FLOOR, SPLITS, adjust_split, fetch_stock, fetch_taiwan50, month_keys
from scripts.runLeverage5050V2 import WINDOWS, strict_gate

MONTH_COUNT = 144
CENTER = "asym35_75_t52_5"


def asym_band(lower, upper, target):
    def signal(i, rows, weight, state):
        if i == 0:
            return target
        return target if weight < lower or weight > upper else None
    return signal


def specs():
    # Pre-registered asymmetric-band neighborhood. Lower threshold refills risk
    # earlier after selloffs; upper threshold deliberately lets bull-market gains run.
    candidates = [
        (0.35, 0.725, 0.50), (0.35, 0.725, 0.525), (0.35, 0.725, 0.55),
        (0.35, 0.75, 0.50), (0.35, 0.75, 0.525), (0.35, 0.75, 0.55),
        (0.35, 0.775, 0.50), (0.35, 0.775, 0.525), (0.35, 0.775, 0.55),
        (0.325, 0.75, 0.50), (0.325, 0.75, 0.525), (0.325, 0.75, 0.55),
        (0.375, 0.75, 0.50), (0.375, 0.75, 0.525), (0.375, 0.75, 0.55),
    ]
    out = []
    for low, high, target in candidates:
        def f(x):
            return str(int(round(x * 1000))).rstrip("0") if abs(x * 100 - round(x * 100)) > 1e-8 else str(int(round(x * 100)))
        name = f"asym{f(low)}_{f(high)}_t{f(target)}"
        out.append(StrategySpec(name, "asymmetric_band", asym_band(low, high, target)))
    return out


def pct(x): return "—" if x is None else f"{x * 100:.2f}%"
def num(x): return "—" if x is None else f"{x:.3f}"


def compact(r):
    return {"name": r["name"], "family": r.get("family"), "period": r["period"], "metrics": r["metrics"]}


def run_window(market, tai50, start, end):
    a = max(start, market[0]["date"])
    z = min(end, market[-1]["date"])
    b0050 = benchmark_buy_hold(market, start_date=a, end_date=z)
    btr = index_benchmark(tai50, start_date=a, end_date=z, value_key="taiwan50TR")
    return a, z, b0050, btr, [simulate(market, s, start_date=a, end_date=z) for s in specs()]


def neighborhood_count(ranking):
    return sum(1 for r in ranking if r["gatePassed"])


def markdown(report):
    tr = report["windows"]["full"]["benchmarks"]["taiwan50TotalReturn"]
    lines = [
        "# Leverage 50/50 Challenger v3 — Asymmetric Band",
        "",
        f"Period: **{report['period']['start']} → {report['period']['end']}**",
        "",
        "Hypothesis registered before this run: refill leveraged exposure relatively early after a selloff, but let bull-market gains drift farther before trimming. Center candidate: `asym35_75_t52_5`.",
        "",
        f"Strict benchmark — Taiwan 50 Total Return: {pct(tr['totalReturn'])}, Max DD {pct(tr['maxDrawdown'])}, Sharpe {num(tr['sharpe'])}.",
        "",
        "| Strategy | Return | CAGR | Max DD | Sharpe | Turnover | Trades | Avg 00631L wt | Holdout return | Holdout Sharpe | Regime wins | Gate |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ]
    for r in report["ranking"]:
        m, h = r["full"]["metrics"], r["holdout"]["metrics"]
        lines.append(
            f"| {r['name']} | {pct(m['totalReturn'])} | {pct(m['cagr'])} | {pct(m['maxDrawdown'])} | {num(m['sharpe'])} | "
            f"{num(m['turnover'])}x | {m['tradeCount']} | {pct(m['avgLeveragedEtfWeight'])} | {pct(h['totalReturn'])} | "
            f"{num(h['sharpe'])} | {r['regimeWins']}/3 | {'PASS' if r['gatePassed'] else '—'} |"
        )
    lines += ["", "## Robustness verdict", ""]
    center = next(r for r in report["ranking"] if r["name"] == CENTER)
    if report["robustFamilyPassed"]:
        lines += [
            f"**Robust method family found.** Center `{CENTER}` passes the strict gate and {report['passingCount']} / {len(report['ranking'])} pre-registered neighbors also pass.",
            "",
            f"Center full: {pct(center['full']['metrics']['totalReturn'])}, DD {pct(center['full']['metrics']['maxDrawdown'])}, Sharpe {num(center['full']['metrics']['sharpe'])}.",
            f"Center 2022+ holdout: {pct(center['holdout']['metrics']['totalReturn'])}, DD {pct(center['holdout']['metrics']['maxDrawdown'])}, Sharpe {num(center['holdout']['metrics']['sharpe'])}.",
        ]
    elif report["passingCount"]:
        lines += [f"Some isolated variants pass ({report['passingCount']}), but the pre-registered center does not or fewer than 3 neighbors pass; treat as unstable, not a found method."]
    else:
        lines += ["No asymmetric-band candidate passes the strict total-return gate."]
    lines += ["", "Cash yield remains 0%; costs and split adjustments are unchanged. Research only, not investment advice."]
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
        a, z, b0050, btr, results = run_window(market, tai50, ws, we)
        benchmarks[key] = {"0050": b0050, "taiwan50TotalReturn": btr}
        wr[key] = {"period": {"start": a, "end": z}, "benchmarks": benchmarks[key]}
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
    passing = neighborhood_count(ranking)
    center = next(r for r in ranking if r["name"] == CENTER)
    robust = bool(center["gatePassed"] and passing >= 3)
    report = {
        "version": "leverage-5050-v3",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "period": {"start": start, "end": end},
        "centerCandidate": CENTER,
        "passingCount": passing,
        "robustFamilyPassed": robust,
        "costs": ETF_COSTS,
        "corporateActions": SPLITS,
        "windows": wr,
        "ranking": ranking,
    }
    out = ROOT / "data/backtests/leverage_5050_v3.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    doc = ROOT / "docs/LEVERAGE_5050_V3.md"
    doc.parent.mkdir(parents=True, exist_ok=True)
    doc.write_text(markdown(report), encoding="utf-8")
    print(doc.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()

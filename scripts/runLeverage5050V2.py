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

from leverage5050Backtest import (
    ETF_COSTS, StrategySpec, align_market, benchmark_buy_hold, index_benchmark, simulate,
)
from scripts.runLeverage5050Backtest import (
    START_FLOOR, SPLITS, adjust_split, fetch_stock, fetch_taiwan50, month_keys,
)

MONTH_COUNT = 144
WINDOWS = {
    "development": ("2014-10-31", "2021-12-31"),
    "holdout": ("2022-01-01", "2099-12-31"),
    "regime_2015_2019": ("2014-10-31", "2019-12-31"),
    "regime_2020_2022": ("2020-01-01", "2022-12-31"),
    "regime_2023_now": ("2023-01-01", "2099-12-31"),
}


def month_end(i, rows):
    return i == len(rows) - 1 or rows[i]["date"][:7] != rows[i + 1]["date"][:7]


def scheduled(target):
    def signal(i, rows, weight, state):
        if i == 0 or month_end(i, rows):
            return target
        return None
    return signal


def band(lower, upper, target):
    def signal(i, rows, weight, state):
        if i == 0:
            return target
        return target if weight < lower or weight > upper else None
    return signal


def specs():
    # Structural frontier pre-registered before seeing v2 results.
    return [
        StrategySpec("anchor_band35_65_t50", "anchor", band(0.35, 0.65, 0.50)),
        StrategySpec("band30_70_t50", "wide_band", band(0.30, 0.70, 0.50)),
        StrategySpec("band25_75_t50", "wide_band", band(0.25, 0.75, 0.50)),
        StrategySpec("band20_80_t50", "wide_band", band(0.20, 0.80, 0.50)),
        StrategySpec("fixed57_5_monthly", "fixed", scheduled(0.575)),
        StrategySpec("fixed60_monthly", "fixed", scheduled(0.60)),
        StrategySpec("fixed62_5_monthly", "fixed", scheduled(0.625)),
        StrategySpec("fixed65_monthly", "fixed", scheduled(0.65)),
        StrategySpec("target55_band45_65", "target_band", band(0.45, 0.65, 0.55)),
        StrategySpec("target55_band40_70", "target_band", band(0.40, 0.70, 0.55)),
        StrategySpec("target55_band35_75", "target_band", band(0.35, 0.75, 0.55)),
        StrategySpec("target60_band50_70", "target_band", band(0.50, 0.70, 0.60)),
        StrategySpec("target60_band45_75", "target_band", band(0.45, 0.75, 0.60)),
        StrategySpec("target60_band40_80", "target_band", band(0.40, 0.80, 0.60)),
        StrategySpec("target62_5_band50_75", "target_band", band(0.50, 0.75, 0.625)),
        StrategySpec("target62_5_band45_80", "target_band", band(0.45, 0.80, 0.625)),
    ]


def pct(x):
    return "—" if x is None else f"{x * 100:.2f}%"


def num(x):
    return "—" if x is None else f"{x:.3f}"


def compact(result):
    return {
        "name": result["name"], "family": result.get("family"),
        "period": result["period"], "metrics": result["metrics"],
    }


def run_window(market, tai50, start, end):
    actual_start = max(start, market[0]["date"])
    actual_end = min(end, market[-1]["date"])
    b0050 = benchmark_buy_hold(market, start_date=actual_start, end_date=actual_end)
    btr = index_benchmark(tai50, start_date=actual_start, end_date=actual_end, value_key="taiwan50TR")
    results = [simulate(market, s, start_date=actual_start, end_date=actual_end) for s in specs()]
    return actual_start, actual_end, b0050, btr, results


def strict_gate(block, benchmarks):
    full = block["full"]["metrics"]
    hold = block["holdout"]["metrics"]
    tr_full = benchmarks["full"]["taiwan50TotalReturn"]
    tr_hold = benchmarks["holdout"]["taiwan50TotalReturn"]
    regime_wins = 0
    for key in ("regime_2015_2019", "regime_2020_2022", "regime_2023_now"):
        tr = benchmarks[key]["taiwan50TotalReturn"]
        if tr and block[key]["metrics"]["totalReturn"] > tr["totalReturn"]:
            regime_wins += 1
    checks = {
        "fullReturnBeatsTaiwan50TR": full["totalReturn"] > tr_full["totalReturn"],
        "fullSharpeBeatsTaiwan50TR": (full.get("sharpe") or -99) > (tr_full.get("sharpe") or -99),
        "fullDrawdownWithin5ppOfTaiwan50TR": full["maxDrawdown"] >= tr_full["maxDrawdown"] - 0.05,
        "holdoutReturnBeatsTaiwan50TR": hold["totalReturn"] > tr_hold["totalReturn"],
        "holdoutSharpeBeatsTaiwan50TR": (hold.get("sharpe") or -99) > (tr_hold.get("sharpe") or -99),
        "winsAtLeast2of3RegimesVsTaiwan50TR": regime_wins >= 2,
    }
    return checks, all(checks.values()), regime_wins


def markdown(report):
    b = report["windows"]["full"]["benchmarks"]
    tr = b["taiwan50TotalReturn"]
    p0050 = b["0050"]["metrics"]
    lines = [
        "# Leverage 50/50 Challenger v2 — Total-Return Gate",
        "",
        f"Period: **{report['period']['start']} → {report['period']['end']}**",
        "",
        "v2 is a pre-registered exposure frontier around the v1 35/65-band finding. It does not change instruments, execution, costs or corporate-action handling; it only tests wider bands and 57.5%–62.5% target leveraged-ETF weights.",
        "",
        "## Strict benchmark",
        "",
        f"- Official Taiwan 50 Total Return: {pct(tr['totalReturn'])}, Max DD {pct(tr['maxDrawdown'])}, Sharpe {num(tr.get('sharpe'))}",
        f"- Investable 0050 price buy-and-hold after external trading costs: {pct(p0050['totalReturn'])}",
        "",
        "A method passes only if it beats Taiwan 50 Total Return on full-period return + Sharpe, keeps Max DD within 5 percentage points, beats Total Return on both return + Sharpe in the 2022+ holdout, and wins at least 2/3 regime blocks by return.",
        "",
        "## Full-period frontier",
        "",
        "| Strategy | Return | CAGR | Max DD | Sharpe | Turnover | Trades | Avg 00631L wt | Regime wins | Strict gate |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ]
    for row in report["ranking"]:
        m = row["full"]["metrics"]
        lines.append(
            f"| {row['name']} | {pct(m['totalReturn'])} | {pct(m['cagr'])} | {pct(m['maxDrawdown'])} | "
            f"{num(m.get('sharpe'))} | {num(m.get('turnover'))}x | {m.get('tradeCount', 0)} | "
            f"{pct(m.get('avgLeveragedEtfWeight'))} | {row['regimeWins']}/3 | {'PASS' if row['gatePassed'] else '—'} |"
        )
    lines += ["", "## Verdict", ""]
    if report.get("foundMethod"):
        f = report["foundMethod"]
        fm = f["full"]["metrics"]
        hm = f["holdout"]["metrics"]
        lines += [
            f"**Method found under the pre-registered strict gate: `{f['name']}`.**",
            "",
            f"Full: {pct(fm['totalReturn'])}, Max DD {pct(fm['maxDrawdown'])}, Sharpe {num(fm.get('sharpe'))}.",
            f"2022+ holdout: {pct(hm['totalReturn'])}, Max DD {pct(hm['maxDrawdown'])}, Sharpe {num(hm.get('sharpe'))}.",
            f"Regime wins vs Taiwan 50 Total Return: {f['regimeWins']}/3.",
        ]
    else:
        lines += ["**No v2 candidate passes every strict gate.**"]
    lines += [
        "",
        "Corporate actions remain split-adjusted: 0050 4:1 (2025-06-18) and 00631L 22:1 (2026-03-31). Cash yield is conservatively set to 0%. This is research, not investment advice.",
    ]
    return "\n".join(lines) + "\n"


def main():
    months = month_keys(MONTH_COUNT)
    with ThreadPoolExecutor(max_workers=3) as pool:
        f0050 = pool.submit(fetch_stock, "0050", months)
        f631 = pool.submit(fetch_stock, "00631L", months)
        ftai50 = pool.submit(fetch_taiwan50, months)
        rows0050 = adjust_split(f0050.result(), "0050")
        rows631 = adjust_split(f631.result(), "00631L")
        tai50 = ftai50.result()

    market = [r for r in align_market(rows631, rows0050) if r["date"] >= START_FLOOR]
    if len(market) < 2500:
        raise RuntimeError(f"insufficient common history: {len(market)}")
    start, end = market[0]["date"], market[-1]["date"]
    windows = {"full": (start, end), **WINDOWS}
    window_report, benchmarks, per_strategy = {}, {}, {}
    for key, (ws, we) in windows.items():
        a, z, b0050, btr, results = run_window(market, tai50, ws, we)
        benchmarks[key] = {"0050": b0050, "taiwan50TotalReturn": btr}
        window_report[key] = {"period": {"start": a, "end": z}, "benchmarks": benchmarks[key]}
        for result in results:
            per_strategy.setdefault(result["name"], {"name": result["name"], "family": result["family"]})[key] = compact(result)

    ranking = []
    for block in per_strategy.values():
        checks, passed, wins = strict_gate(block, benchmarks)
        block["gate"] = checks
        block["gatePassed"] = passed
        block["regimeWins"] = wins
        ranking.append(block)
    ranking.sort(key=lambda r: (
        r["gatePassed"], r["regimeWins"],
        r["full"]["metrics"].get("sharpe") or -99,
        r["full"]["metrics"]["totalReturn"],
    ), reverse=True)
    found = next((r for r in ranking if r["gatePassed"]), None)
    report = {
        "version": "leverage-5050-v2",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "period": {"start": start, "end": end},
        "cashAnnualYield": 0.0,
        "costs": ETF_COSTS,
        "corporateActions": SPLITS,
        "gateBenchmark": "FTSE TWSE Taiwan 50 Total Return Index",
        "windows": window_report,
        "ranking": ranking,
        "foundMethod": found,
    }
    out = ROOT / "data/backtests/leverage_5050_v2.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    doc = ROOT / "docs/LEVERAGE_5050_V2.md"
    doc.parent.mkdir(parents=True, exist_ok=True)
    doc.write_text(markdown(report), encoding="utf-8")
    print(doc.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()

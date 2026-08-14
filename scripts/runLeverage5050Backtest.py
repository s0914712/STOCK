#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from leverage5050Backtest import (
    ETF_COSTS, align_market, benchmark_buy_hold, index_benchmark,
    simulate, strategy_specs,
)

MONTH_COUNT = 144
START_FLOOR = "2014-10-31"
SPLITS = {
    "0050": {"date": "2025-06-18", "ratio": 4.0},
    "00631L": {"date": "2026-03-31", "ratio": 22.0},
}
WINDOWS = {
    "development": ("2014-10-31", "2021-12-31"),
    "holdout": ("2022-01-01", "2099-12-31"),
    "regime_2015_2019": ("2014-10-31", "2019-12-31"),
    "regime_2020_2022": ("2020-01-01", "2022-12-31"),
    "regime_2023_now": ("2023-01-01", "2099-12-31"),
}


def month_keys(count):
    now = datetime.now(timezone.utc)
    y, m = now.year, now.month
    out = []
    for i in range(count):
        mm, yy = m - i, y
        while mm <= 0:
            yy -= 1
            mm += 12
        out.append(f"{yy}{mm:02d}01")
    return list(reversed(out))


def parse_date(value):
    try:
        y, m, d = str(value).split("/")
        yy = int(y)
        if yy < 1911:
            yy += 1911
        return f"{yy:04d}-{int(m):02d}-{int(d):02d}"
    except Exception:
        return None


def fetch_json(url, attempts=4):
    last = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 STOCK-leverage-5050/1.0",
                "Accept": "application/json",
            })
            with urllib.request.urlopen(req, timeout=25) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            last = exc
            time.sleep(0.7 * (attempt + 1))
    raise RuntimeError(f"fetch failed: {last}")


def fetch_stock(symbol, months):
    rows = {}
    for key in months:
        try:
            data = fetch_json(
                f"https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date={key}&stockNo={symbol}"
            )
            if data.get("stat") == "OK":
                for raw in data.get("data", []):
                    date = parse_date(raw[0])
                    if not date:
                        continue
                    def n(v): return float(str(v).replace(",", ""))
                    rows[date] = {
                        "date": date, "open": n(raw[3]), "high": n(raw[4]),
                        "low": n(raw[5]), "close": n(raw[6]), "volume": n(raw[1]),
                    }
        except Exception as exc:
            print(f"WARN {symbol} {key}: {exc}")
        time.sleep(0.04)
    return [rows[d] for d in sorted(rows)]


def fetch_taiwan50(months):
    rows = {}
    for key in months:
        try:
            data = fetch_json(f"https://www.twse.com.tw/indicesReport/TAI50I?response=json&date={key}")
            fields = [str(x) for x in data.get("fields", [])]
            price_idx = next((i for i, x in enumerate(fields) if "Taiwan 50 Index" in x and "Total Return" not in x), 1)
            tr_idx = next((i for i, x in enumerate(fields) if "Total Return" in x or "報酬" in x), 2)
            for raw in data.get("data", []):
                date = parse_date(raw[0])
                if not date:
                    continue
                try:
                    price = float(str(raw[price_idx]).replace(",", ""))
                    tr = float(str(raw[tr_idx]).replace(",", ""))
                except Exception:
                    continue
                rows[date] = {"date": date, "taiwan50": price, "taiwan50TR": tr}
        except Exception as exc:
            print(f"WARN TAI50I {key}: {exc}")
        time.sleep(0.04)
    return [rows[d] for d in sorted(rows)]


def adjust_split(rows, symbol):
    split = SPLITS[symbol]
    out = []
    for row in rows:
        item = dict(row)
        if item["date"] < split["date"]:
            for field in ("open", "high", "low", "close"):
                item[field] = float(item[field]) / split["ratio"]
        out.append(item)
    return out


def pct(x):
    return "—" if x is None else f"{x * 100:.2f}%"


def num(x):
    return "—" if x is None else f"{x:.2f}"


def calmar(metrics):
    dd = metrics.get("maxDrawdown")
    cagr = metrics.get("cagr")
    return cagr / abs(dd) if cagr is not None and dd is not None and abs(dd) > 1e-9 else None


def compact_result(result):
    return {"name": result["name"], "family": result.get("family"), "period": result["period"], "metrics": result["metrics"]}


def run_window(market, tai50, start, end):
    actual_start = max(start, market[0]["date"])
    actual_end = min(end, market[-1]["date"])
    bench0050 = benchmark_buy_hold(market, start_date=actual_start, end_date=actual_end)
    bench_tr = index_benchmark(tai50, start_date=actual_start, end_date=actual_end, value_key="taiwan50TR")
    strategies = [simulate(market, s, start_date=actual_start, end_date=actual_end) for s in strategy_specs()]
    return actual_start, actual_end, bench0050, bench_tr, strategies


def gate(strategy_by_window, bench_by_window):
    full = strategy_by_window["full"]["metrics"]
    full_b = bench_by_window["full"]["0050"]["metrics"]
    hold = strategy_by_window["holdout"]["metrics"]
    hold_b = bench_by_window["holdout"]["0050"]["metrics"]
    regime_wins = 0
    for key in ("regime_2015_2019", "regime_2020_2022", "regime_2023_now"):
        if strategy_by_window[key]["metrics"]["totalReturn"] > bench_by_window[key]["0050"]["metrics"]["totalReturn"]:
            regime_wins += 1
    checks = {
        "fullReturnBeats0050": full["totalReturn"] > full_b["totalReturn"],
        "fullSharpeBeats0050": (full.get("sharpe") or -99) > (full_b.get("sharpe") or -99),
        "fullDrawdownWithin5pp": full["maxDrawdown"] >= full_b["maxDrawdown"] - 0.05,
        "holdoutReturnBeats0050": hold["totalReturn"] > hold_b["totalReturn"],
        "holdoutSharpeBeats0050": (hold.get("sharpe") or -99) > (hold_b.get("sharpe") or -99),
        "winsAtLeast2of3Regimes": regime_wins >= 2,
    }
    return checks, all(checks.values()), regime_wins


def build_markdown(report):
    full_b = report["windows"]["full"]["benchmarks"]
    lines = [
        "# 50/50 Leveraged ETF Challenger — 00631L + Cash",
        "",
        f"Period: **{report['period']['start']} → {report['period']['end']}**",
        "",
        "Execution uses prior-close signals and next-session opens. Base cash yield is 0% (conservative). ETF external trading costs: 0.1425% commission each side, 0.1% sell tax and 0.1% slippage each side. 00631L/0050 fund-level expenses are already embedded in historical market prices and are not double-counted.",
        "",
        "Corporate actions: 0050 pre-2025-06-18 prices /4; 00631L pre-2026-03-31 prices /22.",
        "",
        "## Full-period comparison",
        "",
        "| Strategy | Return | CAGR | Max DD | Sharpe | Turnover | Trades | Avg 00631L wt | Gate |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---|",
    ]
    for s in report["ranking"]:
        m = s["full"]["metrics"]
        lines.append(
            f"| {s['name']} | {pct(m['totalReturn'])} | {pct(m['cagr'])} | {pct(m['maxDrawdown'])} | {num(m.get('sharpe'))} | "
            f"{num(m.get('turnover'))}x | {m.get('tradeCount', 0)} | {pct(m.get('avgLeveragedEtfWeight'))} | {'PASS' if s['gatePassed'] else '—'} |"
        )
    b5 = full_b["0050"]["metrics"]
    tr = full_b.get("taiwan50TotalReturn")
    lines += [
        "",
        f"0050 buy-and-hold after external trading costs: **{pct(b5['totalReturn'])}**, Max DD {pct(b5['maxDrawdown'])}, Sharpe {num(b5.get('sharpe'))}.",
        f"Official Taiwan 50 Total Return Index: **{pct(tr['totalReturn']) if tr else '—'}** (dividends reinvested index benchmark).",
        "",
        "## Robustness gate",
        "",
        "A method is considered found only if it beats investable 0050 after costs on full-period return and Sharpe, keeps full-period drawdown within 5 percentage points of 0050, beats 0050 on both return and Sharpe in the 2022+ holdout, and wins at least 2 of 3 regime blocks (2015–2019 / 2020–2022 / 2023+).",
        "",
    ]
    if report.get("foundMethod"):
        f = report["foundMethod"]
        lines += [
            f"### Method found: `{f['name']}`",
            "",
            f"Full return {pct(f['full']['metrics']['totalReturn'])}, Max DD {pct(f['full']['metrics']['maxDrawdown'])}, Sharpe {num(f['full']['metrics']['sharpe'])}; regime wins {f['regimeWins']}/3.",
        ]
    else:
        lines += ["### No method passed all robustness gates in this sweep.", ""]
    lines += [
        "",
        "## Notes",
        "",
        "- `lev50_hold` is the literal 50% 00631L + 50% cash buy-and-hold baseline.",
        "- `band*` rebalances to 50% only when the leveraged-ETF weight leaves the stated band.",
        "- `dd_*` adds leveraged exposure as 0050 falls from its trailing 252-session peak.",
        "- `ma200_*` cuts exposure below the 200-day moving average.",
        "- `vol*` scales exposure using 20-day annualized 0050 volatility.",
        "- `regime_ladder_*` combines MA200 de-risking with deeper-drawdown re-entry.",
        "",
        "This is research, not investment advice.",
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
        raise RuntimeError(f"insufficient common history: {len(market)} rows")
    start, end = market[0]["date"], market[-1]["date"]
    windows = {"full": (start, end), **WINDOWS}
    window_results = {}
    per_strategy = {}
    bench_by_window = {}

    for key, (ws, we) in windows.items():
        a, b, bench0050, bench_tr, strategies = run_window(market, tai50, ws, we)
        bench_by_window[key] = {"0050": bench0050, "taiwan50TotalReturn": bench_tr}
        window_results[key] = {
            "period": {"start": a, "end": b},
            "benchmarks": bench_by_window[key],
        }
        for s in strategies:
            per_strategy.setdefault(s["name"], {"name": s["name"], "family": s["family"]})[key] = compact_result(s)

    ranking = []
    for name, block in per_strategy.items():
        checks, passed, wins = gate(block, bench_by_window)
        block["gate"] = checks
        block["gatePassed"] = passed
        block["regimeWins"] = wins
        m = block["full"]["metrics"]
        block["calmar"] = calmar(m)
        ranking.append(block)
    ranking.sort(key=lambda x: (
        x["gatePassed"], x["regimeWins"], x["full"]["metrics"].get("sharpe") or -99,
        x["full"]["metrics"]["totalReturn"]
    ), reverse=True)
    found = next((x for x in ranking if x["gatePassed"]), None)

    report = {
        "version": "leverage-5050-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "period": {"start": start, "end": end},
        "instrument": "00631L Yuanta Taiwan 50 Daily 2X",
        "cashAnnualYield": 0.0,
        "costs": ETF_COSTS,
        "corporateActions": SPLITS,
        "windows": window_results,
        "ranking": ranking,
        "foundMethod": found,
    }
    out = ROOT / "data/backtests/leverage_5050_v1.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    md = ROOT / "docs/LEVERAGE_5050_V1.md"
    md.parent.mkdir(parents=True, exist_ok=True)
    md.write_text(build_markdown(report), encoding="utf-8")
    print(md.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()

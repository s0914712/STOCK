# 50/50 Leveraged ETF Challenger — 00631L + Cash

Period: **2014-10-31 → 2026-08-13**

Execution uses prior-close signals and next-session opens. Base cash yield is 0% (conservative). ETF external trading costs: 0.1425% commission each side, 0.1% sell tax and 0.1% slippage each side. 00631L/0050 fund-level expenses are already embedded in historical market prices and are not double-counted.

Corporate actions: 0050 pre-2025-06-18 prices /4; 00631L pre-2026-03-31 prices /22.

## Full-period comparison

| Strategy | Return | CAGR | Max DD | Sharpe | Turnover | Trades | Avg 00631L wt | Gate |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| band35_65 | 790.60% | 21.21% | -31.20% | 1.08 | 3.90x | 8 | 52.64% | PASS |
| ma200_55_35 | 680.79% | 19.81% | -27.11% | 1.07 | 11.20x | 230 | 49.77% | PASS |
| regime_ladder_B | 756.26% | 20.79% | -29.94% | 1.06 | 13.62x | 238 | 51.67% | PASS |
| lev50_hold | 1938.05% | 30.36% | -51.49% | 1.01 | 5.89x | 1 | 74.17% | — |
| band40_60 | 780.61% | 21.09% | -31.53% | 1.08 | 4.13x | 16 | 52.98% | — |
| band45_55 | 726.38% | 20.41% | -30.49% | 1.07 | 5.13x | 46 | 50.99% | — |
| lev50_quarterly | 710.77% | 20.21% | -31.29% | 1.06 | 4.17x | 41 | 51.13% | — |
| regime_ladder_A | 604.55% | 18.74% | -27.39% | 1.06 | 13.40x | 239 | 47.02% | — |
| fixed40_monthly | 420.32% | 15.61% | -25.67% | 1.05 | 4.29x | 94 | 40.37% | — |
| fixed45_monthly | 528.58% | 17.55% | -28.51% | 1.05 | 4.66x | 97 | 45.37% | — |
| lev50_monthly | 655.45% | 19.47% | -31.28% | 1.05 | 4.99x | 98 | 50.35% | — |
| fixed55_monthly | 807.11% | 21.40% | -33.97% | 1.05 | 5.33x | 97 | 55.35% | — |
| dd_50_60_70_80 | 725.21% | 20.40% | -36.37% | 0.98 | 10.25x | 242 | 53.68% | — |
| dd_45_55_65_75 | 588.47% | 18.49% | -34.05% | 0.98 | 9.98x | 247 | 48.68% | — |
| vol22 | 647.41% | 19.35% | -35.04% | 0.92 | 27.77x | 367 | 63.34% | — |
| vol18 | 480.33% | 16.73% | -30.51% | 0.92 | 27.98x | 426 | 55.06% | — |
| vol18_dd | 507.26% | 17.19% | -33.57% | 0.90 | 29.13x | 433 | 56.81% | — |
| ma200_50_25 | 512.86% | 17.29% | -23.28% | 1.06 | 11.95x | 223 | 43.83% | — |

0050 buy-and-hold after external trading costs: **552.78%**, Max DD -36.38%, Sharpe 0.93.
Official Taiwan 50 Total Return Index: **879.80%** (dividends reinvested index benchmark).

## Robustness gate

A method is considered found only if it beats investable 0050 after costs on full-period return and Sharpe, keeps full-period drawdown within 5 percentage points of 0050, beats 0050 on both return and Sharpe in the 2022+ holdout, and wins at least 2 of 3 regime blocks (2015–2019 / 2020–2022 / 2023+).

### Method found: `band35_65`

Full return 790.60%, Max DD -31.20%, Sharpe 1.08; regime wins 2/3.

## Notes

- `lev50_hold` is the literal 50% 00631L + 50% cash buy-and-hold baseline.
- `band*` rebalances to 50% only when the leveraged-ETF weight leaves the stated band.
- `dd_*` adds leveraged exposure as 0050 falls from its trailing 252-session peak.
- `ma200_*` cuts exposure below the 200-day moving average.
- `vol*` scales exposure using 20-day annualized 0050 volatility.
- `regime_ladder_*` combines MA200 de-risking with deeper-drawdown re-entry.

This is research, not investment advice.

# Sector Rotation v0.5 — parameter robustness sweep

Generated: 2026-10-03T06:11:57.313Z
Data snapshot: 2026-10-03T06:11:29.483Z (cached TWSE snapshot)

## Why this report exists

v0.4 compared four configurations and reported the best one. Its own numbers show
why that is not enough: holding the trailing stop family fixed and moving the
parameter from 8% to 12% swung the five-year result from +683.64% to -27.96%. A
result that sensitive to one parameter is a statement about the parameter, not
about the market.

v0.5 evaluates 56 configurations across three axes and scores each
*family* of neighbouring parameters together:

- **Market regime gate** — TAIEX versus its own trailing moving average, either
  blocking new entries or also forcing an exit. v0.4 gated only entry momentum,
  so a position could be held all the way down; the first v0.4 trade sat in
  半導體 for 210 trading days from +14.7% to -24.0%.
- **Volatility-scaled trailing stop** — the stop distance is a multiple of the
  basket's own 20-day realized volatility instead of a flat percentage, so 航運
  and 金融 are not forced to share one threshold.
- **Concentration** — top-1 versus top-2 sector sleeves.

## Robustness by parameter family

Ranked by median Calmar across the family. `CAGR spread` is the fragility
measure: how far the annualized return moves when only the trailing parameter
changes.

| Family | Members | Median CAGR | Min CAGR | Max CAGR | CAGR spread | Median Calmar | Worst Calmar | Worst DD | Both halves positive |
|---|---:|---:|---:|---:|---:|---:|---:|---:|:--:|
| ma60-exit/top2/vol-scaled | 4 | 38.06% | 33.07% | 43.95% | 10.87% | 1.91 | 1.30 | -25.53% | yes |
| ma60-exit/top1/vol-scaled | 4 | 45.20% | 34.18% | 61.42% | 27.25% | 1.62 | 1.14 | -30.03% | yes |
| ma120-exit/top2/vol-scaled | 4 | 42.81% | 27.59% | 49.28% | 21.69% | 1.52 | 1.02 | -29.44% | no |
| ma120-exit/top1/vol-scaled | 4 | 51.09% | 47.54% | 73.83% | 26.29% | 1.37 | 1.12 | -43.98% | no |
| ma60-exit/top1/fixed-pct | 3 | 38.25% | 37.54% | 40.47% | 2.93% | 1.36 | 1.28 | -29.84% | yes |
| ma60-exit/top2/fixed-pct | 3 | 32.73% | 29.51% | 32.97% | 3.46% | 1.27 | 1.23 | -26.89% | yes |
| ma60-block/top2/vol-scaled | 4 | 39.59% | 34.39% | 47.90% | 13.51% | 1.19 | 0.95 | -36.01% | yes |
| ma60-block/top1/vol-scaled | 4 | 47.90% | 25.91% | 59.55% | 33.64% | 1.11 | 0.61 | -53.35% | no |
| ma120-exit/top2/fixed-pct | 3 | 25.58% | 23.67% | 33.59% | 9.92% | 1.06 | 0.98 | -24.14% | yes |
| ma120-exit/top1/fixed-pct | 3 | 33.75% | 21.64% | 51.46% | 29.82% | 1.04 | 0.59 | -37.46% | no |
| none/top1/fixed-pct | 3 | 53.83% | 18.99% | 55.71% | 36.72% | 0.98 | 0.50 | -54.86% | no |
| none/top2/fixed-pct | 3 | 36.35% | 23.82% | 47.23% | 23.41% | 0.93 | 0.51 | -46.97% | yes |
| none/top2/vol-scaled | 4 | 36.25% | 29.06% | 47.22% | 18.16% | 0.81 | 0.66 | -45.62% | no |
| ma60-block/top2/fixed-pct | 3 | 30.53% | 24.81% | 30.99% | 6.18% | 0.75 | 0.70 | -40.93% | yes |
| none/top1/vol-scaled | 4 | 32.00% | 26.65% | 42.21% | 15.56% | 0.59 | 0.50 | -68.20% | no |
| ma60-block/top1/fixed-pct | 3 | 28.24% | 16.81% | 46.18% | 29.37% | 0.57 | 0.33 | -50.71% | no |

## Best fifteen configurations by Calmar

| Config | Net return | CAGR | Max DD | Calmar | Sharpe | Trades | Exposure | Years > TAIEX |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ma60-exit/top2/vol-4 | 478.25% | 43.95% | -19.06% | 2.31 | 1.70 | 103 | 67.59% | 6/6 |
| ma60-exit/top1/vol-3 | 904.35% | 61.42% | -27.58% | 2.23 | 1.71 | 62 | 68.20% | 5/6 |
| ma60-exit/top2/vol-3 | 449.53% | 42.43% | -19.17% | 2.21 | 1.66 | 118 | 67.59% | 5/6 |
| none/top1/fixed-10 | 744.20% | 55.71% | -28.07% | 1.98 | 1.56 | 30 | 98.76% | 3/6 |
| ma120-exit/top1/vol-4 | 1334.81% | 73.83% | -37.22% | 1.98 | 1.75 | 50 | 75.12% | 3/6 |
| ma120-exit/top2/vol-4 | 588.99% | 49.28% | -29.21% | 1.69 | 1.67 | 92 | 74.30% | 3/6 |
| ma60-exit/top1/vol-4 | 593.38% | 49.47% | -29.46% | 1.68 | 1.42 | 56 | 68.29% | 5/6 |
| ma60-exit/top2/vol-6 | 305.07% | 33.69% | -20.99% | 1.61 | 1.46 | 90 | 67.96% | 5/6 |
| ma60-exit/top1/vol-5 | 422.26% | 40.93% | -26.29% | 1.56 | 1.30 | 51 | 68.12% | 4/6 |
| ma120-exit/top2/vol-5 | 436.12% | 41.70% | -26.93% | 1.55 | 1.51 | 84 | 73.93% | 3/6 |
| ma60-exit/top1/fixed-08 | 414.03% | 40.47% | -26.29% | 1.54 | 1.31 | 57 | 68.53% | 4/6 |
| ma120-exit/top2/vol-6 | 477.79% | 43.92% | -29.44% | 1.49 | 1.60 | 73 | 74.55% | 2/6 |
| ma60-block/top2/vol-6 | 558.89% | 47.90% | -32.31% | 1.48 | 1.57 | 48 | 82.00% | 3/6 |
| ma120-exit/top1/vol-3 | 551.28% | 47.54% | -32.80% | 1.45 | 1.38 | 50 | 74.71% | 3/6 |
| ma120-exit/top2/fixed-08 | 303.63% | 33.59% | -24.14% | 1.39 | 1.37 | 85 | 73.64% | 2/6 |

## Half-sample stability

A configuration that only works in one half of the window is not a strategy.

Split at 2024-04-08.

| Config | H1 return | H1 excess | H2 return | H2 excess |
|---|---:|---:|---:|---:|
| ma60-exit/top2/vol-4 | 55.45% | 31.02% | 212.27% | 74.85% |
| ma60-exit/top1/vol-3 | 96.60% | 72.16% | 339.25% | 201.83% |
| ma60-exit/top2/vol-3 | 58.66% | 34.22% | 215.20% | 77.78% |
| none/top1/fixed-10 | 190.13% | 165.70% | 189.82% | 52.40% |
| ma120-exit/top1/vol-4 | 52.86% | 28.42% | 659.66% | 522.24% |
| ma120-exit/top2/vol-4 | 72.63% | 48.19% | 243.53% | 106.11% |
| ma60-exit/top1/vol-4 | 51.51% | 27.07% | 248.60% | 111.18% |
| ma60-exit/top2/vol-6 | 39.54% | 15.11% | 158.11% | 20.69% |
| ma60-exit/top1/vol-5 | 59.29% | 34.85% | 189.88% | 52.46% |
| ma120-exit/top2/vol-5 | 10.58% | -13.85% | 315.08% | 177.66% |
| ma60-exit/top1/fixed-08 | 30.41% | 5.97% | 219.39% | 81.97% |
| ma120-exit/top2/vol-6 | -0.14% | -24.57% | 367.62% | 230.20% |
| ma60-block/top2/vol-6 | 27.97% | 3.53% | 391.18% | 253.76% |
| ma120-exit/top1/vol-3 | 146.10% | 121.66% | 127.54% | -9.88% |
| ma120-exit/top2/fixed-08 | 44.79% | 20.36% | 128.32% | -9.10% |

## v0.4 incumbents, same measurement

| Config | Net return | CAGR | Max DD | Calmar | Years > TAIEX |
|---|---:|---:|---:|---:|---:|
| v0.4 fixed 20/20 | 626.67% | 50.94% | -34.95% | 1.46 | 1/6 |
| v0.4 TP20 + trail 8% | 696.25% | 53.83% | -54.86% | 0.98 | 2/6 |
| v0.4 TP20 + trail 10% | 744.20% | 55.71% | -28.07% | 1.98 | 3/6 |

## Promotion decision

**Shadow candidate:** `ma60-exit/top2/vol-6` (family `ma60-exit/top2/vol-scaled`).

Selected as the median parameter of the most robust family. This is a forward-shadow candidate, not an approved champion; promotion still requires matured out-of-sample evidence.

### Families rejected by the gate

| Family | Reasons |
|---|---|
| none/top1/fixed-pct | CAGR spread 36.7pp exceeds 35pp; worst-member Calmar below 0.5 |
| ma60-block/top2/fixed-pct | median Calmar below 0.8 |
| none/top1/vol-scaled | worst-member Calmar below 0.5; median Calmar below 0.8 |
| ma60-block/top1/fixed-pct | worst-member Calmar below 0.5; median Calmar below 0.8 |

## Gate thresholds

| Criterion | Threshold |
|---|---|
| Max CAGR spread within a family | 35.00% |
| Min Calmar of the worst family member | 0.50 |
| Min median Calmar of the family | 0.80 |
| Member losing more than half of capital | disqualifies the family |
| Any member negative in the second half | disqualifies the family |

Inside a qualifying family the *median* parameter is selected, never the best
performing one, because the best member is the one most likely to be fitted to
this particular window.

## Limitations

- Same curated six-sector / eighteen-stock proxy universe as v0.3 and v0.4, so
  the curated-universe and hindsight-selection risks are unchanged.
- One five-year window is still one sample. The half-sample and per-year columns
  bound the overfitting risk; they do not remove it.
- The regime gate is fitted on the same window it is measured on. Its
  out-of-sample value is unproven until forward shadow snapshots mature.
- Backtest results are not live trading results, and nothing here is investment
  advice.

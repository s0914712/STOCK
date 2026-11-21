# Sector Rotation v0.5 — parameter robustness sweep

Generated: 2026-11-21T08:09:35.835Z
Data snapshot: 2026-11-21T08:09:07.442Z (cached TWSE snapshot)

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
| ma60-exit/top2/vol-scaled | 4 | 35.22% | 30.53% | 41.16% | 10.63% | 1.72 | 1.21 | -25.16% | yes |
| ma60-exit/top1/vol-scaled | 4 | 44.81% | 31.94% | 65.25% | 33.31% | 1.70 | 1.08 | -29.65% | yes |
| ma60-exit/top1/fixed-pct | 3 | 35.95% | 35.25% | 38.14% | 2.89% | 1.30 | 1.22 | -29.45% | yes |
| ma60-exit/top2/fixed-pct | 3 | 29.72% | 27.45% | 30.58% | 3.13% | 1.15 | 1.09 | -27.22% | yes |
| ma120-exit/top1/vol-scaled | 4 | 41.75% | 37.65% | 65.05% | 27.40% | 1.03 | 0.74 | -51.49% | no |
| ma60-block/top2/vol-scaled | 4 | 32.92% | 25.38% | 38.55% | 13.17% | 1.00 | 0.75 | -34.71% | yes |
| ma120-exit/top2/vol-scaled | 4 | 32.43% | 27.46% | 41.76% | 14.30% | 0.95 | 0.85 | -40.17% | yes |
| ma60-block/top1/vol-scaled | 4 | 37.51% | 16.09% | 49.71% | 33.62% | 0.91 | 0.38 | -49.79% | no |
| none/top1/fixed-pct | 3 | 43.15% | 8.07% | 43.21% | 35.13% | 0.78 | 0.17 | -55.07% | no |
| ma120-exit/top1/fixed-pct | 3 | 29.52% | 13.86% | 49.46% | 35.60% | 0.73 | 0.33 | -41.92% | no |
| none/top2/fixed-pct | 3 | 28.81% | 17.69% | 36.74% | 19.04% | 0.65 | 0.36 | -49.82% | yes |
| none/top2/vol-scaled | 4 | 29.49% | 17.83% | 36.53% | 18.71% | 0.63 | 0.36 | -51.00% | no |
| ma120-exit/top2/fixed-pct | 3 | 22.41% | 17.94% | 33.64% | 15.70% | 0.63 | 0.52 | -35.58% | yes |
| ma60-block/top2/fixed-pct | 3 | 23.93% | 22.24% | 25.19% | 2.96% | 0.63 | 0.63 | -40.05% | yes |
| ma60-block/top1/fixed-pct | 3 | 26.38% | 9.51% | 37.81% | 28.31% | 0.54 | 0.19 | -50.71% | yes |
| none/top1/vol-scaled | 4 | 24.07% | 18.77% | 29.21% | 10.44% | 0.44 | 0.34 | -66.51% | no |

## Best fifteen configurations by Calmar

| Config | Net return | CAGR | Max DD | Calmar | Sharpe | Trades | Exposure | Years > TAIEX |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ma60-exit/top1/vol-3 | 1019.74% | 65.25% | -27.58% | 2.37 | 1.76 | 63 | 68.07% | 6/6 |
| ma60-exit/top2/vol-4 | 424.83% | 41.16% | -18.88% | 2.18 | 1.62 | 102 | 67.45% | 6/6 |
| ma60-exit/top2/vol-3 | 402.47% | 39.89% | -19.17% | 2.08 | 1.59 | 115 | 67.45% | 5/6 |
| ma60-exit/top1/vol-4 | 626.40% | 51.03% | -26.29% | 1.94 | 1.44 | 55 | 68.15% | 6/6 |
| ma120-exit/top1/vol-4 | 1013.49% | 65.05% | -37.22% | 1.75 | 1.57 | 52 | 74.09% | 4/6 |
| ma60-exit/top1/vol-5 | 380.51% | 38.59% | -26.29% | 1.47 | 1.24 | 51 | 67.99% | 5/6 |
| ma60-exit/top1/fixed-08 | 372.94% | 38.14% | -26.29% | 1.45 | 1.25 | 57 | 68.40% | 5/6 |
| ma120-exit/top2/vol-4 | 435.68% | 41.76% | -29.21% | 1.43 | 1.45 | 96 | 73.51% | 4/6 |
| ma60-exit/top2/vol-6 | 260.14% | 30.53% | -22.43% | 1.36 | 1.36 | 90 | 67.82% | 5/6 |
| ma120-exit/top1/fixed-08 | 590.86% | 49.46% | -37.46% | 1.32 | 1.35 | 50 | 74.01% | 4/6 |
| ma60-exit/top1/fixed-12 | 327.23% | 35.25% | -27.21% | 1.30 | 1.16 | 48 | 68.15% | 4/6 |
| ma60-exit/top2/fixed-08 | 221.06% | 27.45% | -21.68% | 1.27 | 1.25 | 104 | 67.74% | 5/6 |
| none/top1/fixed-10 | 461.49% | 43.15% | -35.12% | 1.23 | 1.23 | 33 | 98.84% | 4/6 |
| ma60-exit/top1/fixed-10 | 338.05% | 35.95% | -29.45% | 1.22 | 1.20 | 51 | 67.90% | 4/6 |
| ma60-exit/top2/vol-5 | 260.51% | 30.56% | -25.16% | 1.21 | 1.34 | 94 | 67.57% | 5/6 |

## Half-sample stability

A configuration that only works in one half of the window is not a strategy.

Split at 2024-05-24.

| Config | H1 return | H1 excess | H2 return | H2 excess |
|---|---:|---:|---:|---:|
| ma60-exit/top1/vol-3 | 199.03% | 177.90% | 385.37% | 318.28% |
| ma60-exit/top2/vol-4 | 70.57% | 49.44% | 199.36% | 132.27% |
| ma60-exit/top2/vol-3 | 69.29% | 48.16% | 243.01% | 175.92% |
| ma60-exit/top1/vol-4 | 116.55% | 95.42% | 221.47% | 154.38% |
| ma120-exit/top1/vol-4 | 111.79% | 90.66% | 457.92% | 390.83% |
| ma60-exit/top1/vol-5 | 81.89% | 60.76% | 166.02% | 98.93% |
| ma60-exit/top1/fixed-08 | 53.88% | 32.75% | 263.08% | 195.99% |
| ma120-exit/top2/vol-4 | 85.30% | 64.17% | 194.36% | 127.28% |
| ma60-exit/top2/vol-6 | 44.03% | 22.90% | 148.73% | 81.64% |
| ma120-exit/top1/fixed-08 | 156.21% | 135.08% | 218.44% | 151.35% |
| ma60-exit/top1/fixed-12 | 59.24% | 38.11% | 247.75% | 180.66% |
| ma60-exit/top2/fixed-08 | 37.52% | 16.39% | 153.51% | 86.43% |
| none/top1/fixed-10 | 137.29% | 116.16% | 134.67% | 67.59% |
| ma60-exit/top1/fixed-10 | 54.35% | 33.22% | 235.28% | 168.19% |
| ma60-exit/top2/vol-5 | 34.47% | 13.34% | 165.84% | 98.76% |

## v0.4 incumbents, same measurement

| Config | Net return | CAGR | Max DD | Calmar | Years > TAIEX |
|---|---:|---:|---:|---:|---:|
| v0.4 fixed 20/20 | 167.09% | 22.66% | -61.26% | 0.37 | 2/6 |
| v0.4 TP20 + trail 8% | 462.47% | 43.21% | -55.07% | 0.78 | 3/6 |
| v0.4 TP20 + trail 10% | 461.49% | 43.15% | -35.12% | 1.23 | 4/6 |

## Promotion decision

**Shadow candidate:** `ma60-exit/top2/vol-5` (family `ma60-exit/top2/vol-scaled`).

Selected as the median parameter of the most robust family. This is a forward-shadow candidate, not an approved champion; promotion still requires matured out-of-sample evidence.

### Families rejected by the gate

| Family | Reasons |
|---|---|
| ma60-block/top1/vol-scaled | worst-member Calmar below 0.5 |
| none/top1/fixed-pct | CAGR spread 35.1pp exceeds 35pp; worst-member Calmar below 0.5; median Calmar below 0.8 |
| ma120-exit/top1/fixed-pct | CAGR spread 35.6pp exceeds 35pp; worst-member Calmar below 0.5; median Calmar below 0.8 |
| none/top2/fixed-pct | worst-member Calmar below 0.5; median Calmar below 0.8 |
| none/top2/vol-scaled | worst-member Calmar below 0.5; median Calmar below 0.8 |
| ma120-exit/top2/fixed-pct | median Calmar below 0.8 |
| ma60-block/top2/fixed-pct | median Calmar below 0.8 |
| ma60-block/top1/fixed-pct | worst-member Calmar below 0.5; median Calmar below 0.8 |
| none/top1/vol-scaled | worst-member Calmar below 0.5; median Calmar below 0.8 |

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

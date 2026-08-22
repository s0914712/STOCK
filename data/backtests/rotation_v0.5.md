# Sector Rotation v0.5 — parameter robustness sweep

Generated: 2026-08-22T02:30:55.126Z
Data snapshot: 2026-08-22T02:30:28.206Z (cached TWSE snapshot)

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
| ma60-exit/top2/vol-scaled | 4 | 34.93% | 29.34% | 41.35% | 12.00% | 1.76 | 1.15 | -25.53% | no |
| ma60-exit/top1/vol-scaled | 4 | 42.94% | 32.08% | 58.90% | 26.82% | 1.54 | 1.07 | -30.03% | no |
| ma60-exit/top1/fixed-pct | 3 | 36.09% | 35.39% | 38.28% | 2.89% | 1.28 | 1.21 | -29.84% | no |
| ma60-exit/top2/fixed-pct | 3 | 29.01% | 27.98% | 29.24% | 1.26% | 1.12 | 1.09 | -26.89% | no |
| ma120-exit/top2/vol-scaled | 4 | 34.34% | 25.49% | 40.65% | 15.16% | 1.04 | 0.94 | -33.44% | no |
| ma60-block/top2/vol-scaled | 4 | 35.21% | 27.95% | 39.17% | 11.22% | 1.01 | 0.87 | -36.01% | no |
| ma60-block/top1/vol-scaled | 4 | 39.57% | 20.53% | 46.41% | 25.88% | 0.85 | 0.48 | -53.35% | no |
| none/top2/fixed-pct | 3 | 33.80% | 21.15% | 43.09% | 21.93% | 0.84 | 0.43 | -48.81% | no |
| none/top2/vol-scaled | 4 | 33.38% | 22.47% | 42.58% | 20.11% | 0.79 | 0.49 | -47.20% | no |
| ma120-exit/top2/fixed-pct | 3 | 22.20% | 20.43% | 28.49% | 8.06% | 0.79 | 0.68 | -32.65% | no |
| none/top1/fixed-pct | 3 | 41.89% | 8.43% | 44.63% | 36.20% | 0.71 | 0.17 | -62.46% | no |
| ma60-block/top2/fixed-pct | 3 | 27.78% | 20.90% | 28.22% | 7.32% | 0.71 | 0.59 | -38.98% | no |
| ma120-exit/top1/vol-scaled | 4 | 35.79% | 33.33% | 49.50% | 16.16% | 0.69 | 0.58 | -57.54% | no |
| ma120-exit/top1/fixed-pct | 3 | 24.26% | 12.60% | 36.44% | 23.83% | 0.50 | 0.23 | -54.37% | no |
| ma60-block/top1/fixed-pct | 3 | 21.41% | 13.52% | 34.14% | 20.62% | 0.43 | 0.27 | -50.71% | no |
| none/top1/vol-scaled | 4 | 22.82% | 15.41% | 36.89% | 21.47% | 0.39 | 0.25 | -73.55% | no |

## Best fifteen configurations by Calmar

| Config | Net return | CAGR | Max DD | Calmar | Sharpe | Trades | Exposure | Years > TAIEX |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ma60-exit/top2/vol-3 | 429.65% | 41.35% | -19.17% | 2.16 | 1.63 | 121 | 66.10% | 5/6 |
| ma60-exit/top1/vol-3 | 830.97% | 58.90% | -27.58% | 2.14 | 1.67 | 64 | 66.72% | 5/6 |
| ma60-exit/top2/vol-4 | 404.22% | 39.91% | -19.06% | 2.09 | 1.59 | 107 | 66.10% | 6/6 |
| ma60-exit/top1/vol-4 | 542.72% | 47.14% | -29.46% | 1.60 | 1.38 | 58 | 66.80% | 5/6 |
| ma60-exit/top1/vol-5 | 384.10% | 38.73% | -26.29% | 1.47 | 1.26 | 53 | 66.64% | 4/6 |
| ma60-exit/top1/fixed-08 | 376.47% | 38.28% | -26.29% | 1.46 | 1.27 | 59 | 67.05% | 3/6 |
| ma60-exit/top2/vol-6 | 253.21% | 29.94% | -20.99% | 1.43 | 1.34 | 94 | 66.47% | 5/6 |
| ma120-exit/top2/vol-4 | 417.27% | 40.65% | -31.21% | 1.30 | 1.42 | 97 | 73.27% | 3/6 |
| ma60-exit/top1/fixed-12 | 330.43% | 35.39% | -27.61% | 1.28 | 1.18 | 50 | 66.80% | 2/6 |
| ma60-exit/top2/fixed-08 | 228.18% | 27.98% | -22.00% | 1.27 | 1.27 | 109 | 66.39% | 4/6 |
| ma60-block/top1/vol-3 | 492.83% | 44.69% | -35.58% | 1.26 | 1.32 | 41 | 77.68% | 2/6 |
| ma60-exit/top1/fixed-10 | 341.32% | 36.09% | -29.84% | 1.21 | 1.22 | 53 | 66.56% | 2/6 |
| ma60-block/top2/vol-6 | 389.23% | 39.04% | -32.31% | 1.21 | 1.36 | 50 | 81.84% | 2/6 |
| ma60-exit/top2/vol-5 | 245.38% | 29.34% | -25.53% | 1.15 | 1.30 | 98 | 66.23% | 5/6 |
| ma60-block/top2/vol-4 | 391.52% | 39.17% | -34.32% | 1.14 | 1.41 | 70 | 78.05% | 3/6 |

## Half-sample stability

A configuration that only works in one half of the window is not a strategy.

Split at 2024-02-23.

| Config | H1 return | H1 excess | H2 return | H2 excess |
|---|---:|---:|---:|---:|
| ma60-exit/top2/vol-3 | 32.94% | 20.11% | 295.68% | 156.26% |
| ma60-exit/top1/vol-3 | 65.40% | 52.57% | 377.72% | 238.30% |
| ma60-exit/top2/vol-4 | 32.34% | 19.51% | 278.74% | 139.32% |
| ma60-exit/top1/vol-4 | 27.47% | 14.64% | 295.15% | 155.73% |
| ma60-exit/top1/vol-5 | 8.58% | -4.24% | 258.70% | 119.28% |
| ma60-exit/top1/fixed-08 | 9.71% | -3.11% | 268.65% | 129.23% |
| ma60-exit/top2/vol-6 | 7.83% | -5.00% | 186.86% | 47.44% |
| ma120-exit/top2/vol-4 | 22.96% | 10.13% | 321.10% | 181.68% |
| ma60-exit/top1/fixed-12 | -4.94% | -17.76% | 241.66% | 102.24% |
| ma60-exit/top2/fixed-08 | 4.98% | -7.85% | 210.69% | 71.28% |
| ma60-block/top1/vol-3 | 67.92% | 55.10% | 199.93% | 60.51% |
| ma60-exit/top1/fixed-10 | -7.86% | -20.69% | 253.01% | 113.59% |
| ma60-block/top2/vol-6 | -5.95% | -18.78% | 375.44% | 236.03% |
| ma60-exit/top2/vol-5 | -2.18% | -15.01% | 216.97% | 77.55% |
| ma60-block/top2/vol-4 | 44.01% | 31.18% | 259.52% | 120.10% |

## v0.4 incumbents, same measurement

| Config | Net return | CAGR | Max DD | Calmar | Years > TAIEX |
|---|---:|---:|---:|---:|---:|
| v0.4 fixed 20/20 | 401.17% | 39.73% | -34.95% | 1.14 | 1/6 |
| v0.4 TP20 + trail 8% | 491.55% | 44.63% | -62.46% | 0.71 | 2/6 |
| v0.4 TP20 + trail 10% | 439.50% | 41.89% | -38.77% | 1.08 | 3/6 |

## Promotion decision

**Shadow candidate:** `ma60-exit/top2/vol-6` (family `ma60-exit/top2/vol-scaled`).

Selected as the median parameter of the most robust family. This is a forward-shadow candidate, not an approved champion; promotion still requires matured out-of-sample evidence.

### Families rejected by the gate

| Family | Reasons |
|---|---|
| ma60-block/top1/vol-scaled | worst-member Calmar below 0.5 |
| none/top2/fixed-pct | worst-member Calmar below 0.5 |
| none/top2/vol-scaled | worst-member Calmar below 0.5; median Calmar below 0.8 |
| ma120-exit/top2/fixed-pct | median Calmar below 0.8 |
| none/top1/fixed-pct | CAGR spread 36.2pp exceeds 35pp; worst-member Calmar below 0.5; median Calmar below 0.8 |
| ma60-block/top2/fixed-pct | median Calmar below 0.8 |
| ma120-exit/top1/vol-scaled | median Calmar below 0.8 |
| ma120-exit/top1/fixed-pct | worst-member Calmar below 0.5; median Calmar below 0.8 |
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

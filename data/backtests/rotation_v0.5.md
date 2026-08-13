# Sector Rotation v0.5 — parameter robustness sweep

Generated: 2026-08-13T02:47:32.166Z
Data snapshot: 2026-08-13T02:47:04.698Z (cached TWSE snapshot)

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
| ma60-exit/top2/vol-scaled | 4 | 34.71% | 22.42% | 43.34% | 20.92% | 1.75 | 0.88 | -25.53% | no |
| ma120-exit/top2/vol-scaled | 4 | 36.95% | 26.85% | 43.15% | 16.30% | 1.20 | 0.99 | -30.83% | no |
| none/top1/fixed-pct | 3 | 35.58% | -6.62% | 53.26% | 59.88% | 1.11 | -0.17 | -47.79% | no |
| ma60-block/top2/vol-scaled | 4 | 35.46% | 31.66% | 38.98% | 7.32% | 1.07 | 1.00 | -34.32% | yes |
| ma60-exit/top1/vol-scaled | 4 | 28.80% | 21.31% | 54.86% | 33.55% | 0.96 | 0.71 | -30.03% | no |
| none/top2/vol-scaled | 4 | 41.47% | 30.22% | 48.06% | 17.83% | 0.95 | 0.72 | -46.97% | yes |
| none/top2/fixed-pct | 3 | 32.99% | 25.72% | 40.50% | 14.78% | 0.84 | 0.55 | -47.17% | no |
| ma60-exit/top2/fixed-pct | 3 | 21.93% | 21.56% | 27.56% | 6.00% | 0.83 | 0.82 | -26.89% | no |
| ma120-exit/top1/vol-scaled | 4 | 41.53% | 32.66% | 56.42% | 23.76% | 0.81 | 0.79 | -52.43% | no |
| ma120-exit/top2/fixed-pct | 3 | 21.42% | 19.38% | 27.76% | 8.39% | 0.79 | 0.67 | -31.62% | no |
| ma60-exit/top1/fixed-pct | 3 | 19.00% | 18.30% | 34.76% | 16.46% | 0.64 | 0.61 | -29.92% | no |
| none/top1/vol-scaled | 4 | 28.33% | 27.51% | 36.27% | 8.76% | 0.62 | 0.40 | -69.63% | no |
| ma60-block/top1/vol-scaled | 4 | 30.93% | 17.92% | 37.36% | 19.44% | 0.61 | 0.42 | -57.29% | no |
| ma120-exit/top1/fixed-pct | 3 | 23.13% | 11.57% | 41.62% | 30.05% | 0.56 | 0.24 | -47.62% | no |
| ma60-block/top2/fixed-pct | 3 | 21.36% | 17.95% | 29.88% | 11.93% | 0.56 | 0.51 | -38.98% | no |
| ma60-block/top1/fixed-pct | 3 | 9.17% | 0.06% | 19.82% | 19.76% | 0.19 | 0.00 | -51.25% | no |

## Best fifteen configurations by Calmar

| Config | Net return | CAGR | Max DD | Calmar | Sharpe | Trades | Exposure | Years > TAIEX |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ma60-exit/top2/vol-3 | 466.58% | 43.34% | -19.17% | 2.26 | 1.70 | 118 | 65.65% | 5/6 |
| ma60-exit/top2/vol-4 | 404.18% | 39.91% | -19.06% | 2.09 | 1.59 | 105 | 65.61% | 6/6 |
| ma60-exit/top1/vol-3 | 722.24% | 54.86% | -27.58% | 1.99 | 1.59 | 63 | 66.23% | 4/6 |
| ma120-exit/top2/vol-4 | 463.02% | 43.15% | -29.87% | 1.44 | 1.49 | 96 | 73.31% | 4/6 |
| ma60-exit/top2/vol-6 | 247.65% | 29.52% | -20.99% | 1.41 | 1.33 | 92 | 65.98% | 5/6 |
| ma60-exit/top1/fixed-08 | 320.83% | 34.76% | -26.29% | 1.32 | 1.18 | 58 | 66.56% | 3/6 |
| none/top2/vol-4 | 559.22% | 47.92% | -38.12% | 1.26 | 1.54 | 74 | 95.18% | 3/6 |
| ma60-exit/top2/fixed-08 | 223.02% | 27.56% | -22.00% | 1.25 | 1.26 | 107 | 65.90% | 5/6 |
| ma120-exit/top2/vol-6 | 370.63% | 37.92% | -30.83% | 1.23 | 1.41 | 79 | 73.97% | 3/6 |
| ma60-block/top2/vol-6 | 388.23% | 38.98% | -32.31% | 1.21 | 1.36 | 53 | 80.77% | 3/6 |
| ma120-exit/top1/vol-4 | 763.07% | 56.42% | -46.96% | 1.20 | 1.44 | 51 | 74.14% | 4/6 |
| none/top1/fixed-10 | 333.32% | 35.58% | -29.92% | 1.19 | 1.08 | 32 | 99.18% | 2/6 |
| ma120-exit/top2/vol-5 | 339.48% | 35.98% | -30.74% | 1.17 | 1.28 | 84 | 73.15% | 3/6 |
| ma60-block/top2/vol-4 | 377.35% | 38.33% | -34.32% | 1.12 | 1.38 | 69 | 77.47% | 3/6 |
| none/top1/fixed-08 | 682.24% | 53.26% | -47.79% | 1.11 | 1.38 | 43 | 97.61% | 2/6 |

## Half-sample stability

A configuration that only works in one half of the window is not a strategy.

Split at 2024-02-05.

| Config | H1 return | H1 excess | H2 return | H2 excess |
|---|---:|---:|---:|---:|
| ma60-exit/top2/vol-3 | 29.74% | 24.65% | 327.55% | 176.01% |
| ma60-exit/top2/vol-4 | 31.38% | 26.30% | 263.52% | 111.98% |
| ma60-exit/top1/vol-3 | 71.75% | 66.66% | 347.77% | 196.23% |
| ma120-exit/top2/vol-4 | 34.29% | 29.20% | 318.62% | 167.08% |
| ma60-exit/top2/vol-6 | 5.37% | 0.29% | 188.35% | 36.82% |
| ma60-exit/top1/fixed-08 | 13.93% | 8.84% | 229.80% | 78.26% |
| none/top2/vol-4 | 45.43% | 40.35% | 338.65% | 187.11% |
| ma60-exit/top2/fixed-08 | 2.59% | -2.50% | 199.91% | 48.38% |
| ma120-exit/top2/vol-6 | -15.29% | -20.37% | 368.58% | 217.04% |
| ma60-block/top2/vol-6 | 14.52% | 9.44% | 347.62% | 196.09% |
| ma120-exit/top1/vol-4 | 15.46% | 10.37% | 547.84% | 396.31% |
| none/top1/fixed-10 | 138.09% | 133.00% | 69.81% | -81.72% |
| ma120-exit/top2/vol-5 | -9.39% | -14.48% | 348.40% | 196.87% |
| ma60-block/top2/vol-4 | 40.40% | 35.31% | 234.14% | 82.60% |
| none/top1/fixed-08 | 74.30% | 69.22% | 301.78% | 150.25% |

## v0.4 incumbents, same measurement

| Config | Net return | CAGR | Max DD | Calmar | Years > TAIEX |
|---|---:|---:|---:|---:|---:|
| v0.4 fixed 20/20 | 186.12% | 24.39% | -59.11% | 0.41 | 2/6 |
| v0.4 TP20 + trail 8% | 682.24% | 53.26% | -47.79% | 1.11 | 2/6 |
| v0.4 TP20 + trail 10% | 333.32% | 35.58% | -29.92% | 1.19 | 2/6 |

## Promotion decision

**Shadow candidate:** `ma60-exit/top2/vol-6` (family `ma60-exit/top2/vol-scaled`).

Selected as the median parameter of the most robust family. This is a forward-shadow candidate, not an approved champion; promotion still requires matured out-of-sample evidence.

### Families rejected by the gate

| Family | Reasons |
|---|---|
| none/top1/fixed-pct | CAGR spread 59.9pp exceeds 35pp; worst-member Calmar below 0.5; a member is negative in the second half |
| ma120-exit/top2/fixed-pct | median Calmar below 0.8 |
| ma60-exit/top1/fixed-pct | median Calmar below 0.8 |
| none/top1/vol-scaled | worst-member Calmar below 0.5; median Calmar below 0.8 |
| ma60-block/top1/vol-scaled | worst-member Calmar below 0.5; median Calmar below 0.8 |
| ma120-exit/top1/fixed-pct | worst-member Calmar below 0.5; median Calmar below 0.8 |
| ma60-block/top2/fixed-pct | median Calmar below 0.8 |
| ma60-block/top1/fixed-pct | worst-member Calmar below 0.5; median Calmar below 0.8; a member is negative in the second half |

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

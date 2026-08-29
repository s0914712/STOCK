# Sector Rotation v0.5 — parameter robustness sweep

Generated: 2026-08-29T07:48:15.798Z
Data snapshot: 2026-08-29T07:47:46.230Z (cached TWSE snapshot)

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
| ma60-exit/top2/vol-scaled | 4 | 34.57% | 29.00% | 40.97% | 11.97% | 1.74 | 1.14 | -25.53% | yes |
| ma60-exit/top1/vol-scaled | 4 | 40.43% | 29.76% | 56.11% | 26.35% | 1.45 | 0.99 | -30.03% | no |
| ma60-exit/top1/fixed-pct | 3 | 33.71% | 33.01% | 35.85% | 2.84% | 1.20 | 1.13 | -29.84% | no |
| ma60-exit/top2/fixed-pct | 3 | 28.67% | 27.64% | 28.90% | 1.26% | 1.11 | 1.07 | -26.89% | no |
| ma120-exit/top2/vol-scaled | 4 | 35.72% | 24.60% | 40.16% | 15.57% | 1.06 | 0.89 | -34.14% | no |
| ma60-block/top2/vol-scaled | 4 | 34.74% | 29.44% | 41.26% | 11.82% | 1.03 | 0.85 | -36.01% | no |
| ma60-block/top1/vol-scaled | 4 | 39.13% | 17.86% | 48.94% | 31.08% | 0.90 | 0.42 | -53.35% | no |
| none/top2/vol-scaled | 4 | 33.71% | 23.60% | 41.90% | 18.30% | 0.79 | 0.51 | -47.73% | no |
| none/top1/fixed-pct | 3 | 45.35% | 11.07% | 48.15% | 37.08% | 0.79 | 0.24 | -61.18% | no |
| none/top2/fixed-pct | 3 | 31.62% | 19.29% | 41.27% | 21.98% | 0.77 | 0.39 | -49.11% | no |
| ma120-exit/top1/vol-scaled | 4 | 38.09% | 33.24% | 53.14% | 19.90% | 0.72 | 0.65 | -56.09% | no |
| ma120-exit/top2/fixed-pct | 3 | 20.49% | 18.65% | 26.35% | 7.71% | 0.71 | 0.61 | -33.39% | no |
| ma60-block/top2/fixed-pct | 3 | 26.02% | 19.15% | 26.23% | 7.08% | 0.67 | 0.54 | -38.98% | yes |
| ma60-block/top1/fixed-pct | 3 | 23.50% | 11.01% | 36.45% | 25.44% | 0.48 | 0.22 | -50.71% | no |
| ma120-exit/top1/fixed-pct | 3 | 22.36% | 10.88% | 39.76% | 28.88% | 0.48 | 0.21 | -52.81% | no |
| none/top1/vol-scaled | 4 | 23.39% | 18.23% | 34.79% | 16.57% | 0.40 | 0.30 | -72.65% | no |

## Best fifteen configurations by Calmar

| Config | Net return | CAGR | Max DD | Calmar | Sharpe | Trades | Exposure | Years > TAIEX |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ma60-exit/top2/vol-3 | 422.94% | 40.97% | -19.17% | 2.14 | 1.62 | 123 | 66.43% | 5/6 |
| ma60-exit/top2/vol-4 | 397.84% | 39.54% | -19.06% | 2.07 | 1.57 | 109 | 66.43% | 6/6 |
| ma60-exit/top1/vol-3 | 754.87% | 56.11% | -27.58% | 2.03 | 1.60 | 65 | 67.05% | 4/6 |
| ma60-exit/top1/vol-4 | 490.18% | 44.56% | -29.46% | 1.51 | 1.31 | 59 | 67.13% | 4/6 |
| ma60-exit/top2/vol-6 | 248.73% | 29.60% | -20.99% | 1.41 | 1.33 | 96 | 66.80% | 5/6 |
| ma60-exit/top1/vol-5 | 344.53% | 36.30% | -26.29% | 1.38 | 1.19 | 54 | 66.97% | 3/6 |
| ma60-exit/top1/fixed-08 | 337.53% | 35.85% | -26.29% | 1.36 | 1.20 | 60 | 67.38% | 3/6 |
| ma60-block/top2/vol-6 | 428.16% | 41.26% | -32.31% | 1.28 | 1.41 | 50 | 82.25% | 2/6 |
| ma120-exit/top2/vol-4 | 408.65% | 40.16% | -31.94% | 1.26 | 1.40 | 97 | 73.31% | 3/6 |
| ma60-exit/top2/fixed-08 | 224.02% | 27.64% | -22.00% | 1.26 | 1.26 | 111 | 66.72% | 5/6 |
| none/top1/fixed-10 | 505.88% | 45.35% | -36.67% | 1.24 | 1.32 | 31 | 98.68% | 3/6 |
| ma60-exit/top1/fixed-12 | 295.24% | 33.01% | -27.61% | 1.20 | 1.11 | 51 | 67.13% | 2/6 |
| ma60-block/top1/vol-3 | 432.24% | 41.49% | -35.58% | 1.17 | 1.24 | 41 | 78.09% | 2/6 |
| ma60-exit/top2/vol-5 | 241.01% | 29.00% | -25.53% | 1.14 | 1.29 | 100 | 66.56% | 5/6 |
| ma60-block/top2/vol-4 | 385.26% | 38.80% | -34.32% | 1.13 | 1.40 | 70 | 78.46% | 3/6 |

## Half-sample stability

A configuration that only works in one half of the window is not a strategy.

Split at 2024-03-04.

| Config | H1 return | H1 excess | H2 return | H2 excess |
|---|---:|---:|---:|---:|
| ma60-exit/top2/vol-3 | 34.89% | 23.92% | 283.71% | 143.72% |
| ma60-exit/top2/vol-4 | 34.29% | 23.31% | 265.40% | 125.40% |
| ma60-exit/top1/vol-3 | 65.52% | 54.55% | 377.41% | 237.42% |
| ma60-exit/top1/vol-4 | 27.56% | 16.59% | 323.31% | 183.31% |
| ma60-exit/top2/vol-6 | 10.30% | -0.67% | 173.09% | 33.10% |
| ma60-exit/top1/vol-5 | 9.72% | -1.25% | 207.17% | 67.18% |
| ma60-exit/top1/fixed-08 | 9.80% | -1.18% | 292.55% | 152.56% |
| ma60-block/top2/vol-6 | -6.11% | -17.08% | 394.97% | 254.98% |
| ma120-exit/top2/vol-4 | 20.26% | 9.29% | 321.09% | 181.09% |
| ma60-exit/top2/fixed-08 | 6.52% | -4.45% | 197.58% | 57.58% |
| none/top1/fixed-10 | 103.16% | 92.19% | 188.07% | 48.07% |
| ma60-exit/top1/fixed-12 | -3.94% | -14.92% | 242.89% | 102.90% |
| ma60-block/top1/vol-3 | 67.89% | 56.91% | 193.05% | 53.06% |
| ma60-exit/top2/vol-5 | 0.06% | -10.91% | 196.50% | 56.50% |
| ma60-block/top2/vol-4 | 42.45% | 31.48% | 240.37% | 100.38% |

## v0.4 incumbents, same measurement

| Config | Net return | CAGR | Max DD | Calmar | Years > TAIEX |
|---|---:|---:|---:|---:|---:|
| v0.4 fixed 20/20 | 438.75% | 41.85% | -34.95% | 1.20 | 1/6 |
| v0.4 TP20 + trail 8% | 564.33% | 48.15% | -61.18% | 0.79 | 2/6 |
| v0.4 TP20 + trail 10% | 505.88% | 45.35% | -36.67% | 1.24 | 3/6 |

## Promotion decision

**Shadow candidate:** `ma60-exit/top2/vol-6` (family `ma60-exit/top2/vol-scaled`).

Selected as the median parameter of the most robust family. This is a forward-shadow candidate, not an approved champion; promotion still requires matured out-of-sample evidence.

### Families rejected by the gate

| Family | Reasons |
|---|---|
| ma60-block/top1/vol-scaled | worst-member Calmar below 0.5 |
| none/top2/vol-scaled | median Calmar below 0.8 |
| none/top1/fixed-pct | CAGR spread 37.1pp exceeds 35pp; worst-member Calmar below 0.5; median Calmar below 0.8 |
| none/top2/fixed-pct | worst-member Calmar below 0.5; median Calmar below 0.8 |
| ma120-exit/top1/vol-scaled | median Calmar below 0.8 |
| ma120-exit/top2/fixed-pct | median Calmar below 0.8 |
| ma60-block/top2/fixed-pct | median Calmar below 0.8 |
| ma60-block/top1/fixed-pct | worst-member Calmar below 0.5; median Calmar below 0.8 |
| ma120-exit/top1/fixed-pct | worst-member Calmar below 0.5; median Calmar below 0.8 |
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

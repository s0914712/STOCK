# Sector Rotation v0.5 — parameter robustness sweep

Generated: 2026-09-05T05:20:13.812Z
Data snapshot: 2026-09-05T05:19:41.083Z (cached TWSE snapshot)

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
| ma60-exit/top2/vol-scaled | 4 | 33.80% | 28.27% | 40.17% | 11.90% | 1.70 | 1.11 | -25.53% | yes |
| ma60-exit/top1/vol-scaled | 4 | 43.00% | 32.14% | 58.97% | 26.83% | 1.54 | 1.07 | -30.03% | yes |
| ma60-exit/top1/fixed-pct | 3 | 36.16% | 35.45% | 38.34% | 2.89% | 1.28 | 1.21 | -29.84% | yes |
| ma60-block/top2/vol-scaled | 4 | 39.17% | 32.67% | 43.95% | 11.28% | 1.14 | 0.97 | -36.35% | yes |
| ma120-exit/top1/vol-scaled | 4 | 43.73% | 38.99% | 65.98% | 26.99% | 1.13 | 0.76 | -51.15% | no |
| ma60-exit/top2/fixed-pct | 3 | 27.94% | 26.91% | 28.16% | 1.25% | 1.08 | 1.05 | -26.89% | yes |
| ma120-exit/top2/vol-scaled | 4 | 38.98% | 29.62% | 47.13% | 17.51% | 1.08 | 1.03 | -36.76% | no |
| ma60-block/top1/vol-scaled | 4 | 41.66% | 20.78% | 50.50% | 29.71% | 0.95 | 0.49 | -49.44% | no |
| none/top2/vol-scaled | 4 | 36.80% | 26.26% | 44.41% | 18.15% | 0.83 | 0.54 | -48.68% | no |
| none/top1/fixed-pct | 3 | 45.61% | 9.89% | 48.94% | 39.05% | 0.83 | 0.20 | -59.27% | no |
| ma60-block/top2/fixed-pct | 3 | 30.28% | 23.26% | 31.64% | 8.37% | 0.74 | 0.63 | -41.03% | yes |
| ma120-exit/top1/fixed-pct | 3 | 27.78% | 18.33% | 45.60% | 27.27% | 0.69 | 0.44 | -41.51% | no |
| ma120-exit/top2/fixed-pct | 3 | 23.59% | 22.88% | 31.98% | 9.10% | 0.67 | 0.67 | -35.44% | no |
| ma60-block/top1/fixed-pct | 3 | 28.34% | 16.37% | 38.82% | 22.45% | 0.57 | 0.32 | -50.71% | no |
| none/top2/fixed-pct | 3 | 28.35% | 25.51% | 46.09% | 20.58% | 0.56 | 0.53 | -50.26% | yes |
| none/top1/vol-scaled | 4 | 28.76% | 20.20% | 41.32% | 21.12% | 0.54 | 0.36 | -66.27% | no |

## Best fifteen configurations by Calmar

| Config | Net return | CAGR | Max DD | Calmar | Sharpe | Trades | Exposure | Years > TAIEX |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ma60-exit/top1/vol-3 | 833.02% | 58.97% | -27.58% | 2.14 | 1.66 | 64 | 67.13% | 5/6 |
| ma60-exit/top2/vol-3 | 408.74% | 40.17% | -19.17% | 2.10 | 1.59 | 121 | 66.52% | 5/6 |
| ma60-exit/top2/vol-4 | 384.32% | 38.75% | -19.06% | 2.03 | 1.55 | 107 | 66.52% | 6/6 |
| ma120-exit/top1/vol-4 | 1048.32% | 65.98% | -37.22% | 1.77 | 1.61 | 52 | 75.37% | 3/6 |
| ma60-exit/top1/vol-4 | 544.14% | 47.21% | -29.46% | 1.60 | 1.37 | 58 | 67.22% | 5/6 |
| ma120-exit/top2/vol-4 | 542.45% | 47.13% | -29.98% | 1.57 | 1.59 | 94 | 74.75% | 4/6 |
| ma60-exit/top1/vol-5 | 385.17% | 38.80% | -26.29% | 1.48 | 1.25 | 53 | 67.05% | 4/6 |
| ma60-exit/top1/fixed-08 | 377.52% | 38.34% | -26.29% | 1.46 | 1.26 | 59 | 67.46% | 4/6 |
| ma60-exit/top2/vol-6 | 239.26% | 28.86% | -20.99% | 1.37 | 1.30 | 94 | 66.89% | 5/6 |
| ma60-block/top2/vol-6 | 460.69% | 43.03% | -32.29% | 1.33 | 1.45 | 48 | 83.32% | 3/6 |
| none/top1/fixed-10 | 511.08% | 45.61% | -34.67% | 1.32 | 1.32 | 31 | 99.01% | 4/6 |
| ma60-exit/top1/fixed-12 | 331.37% | 35.45% | -27.61% | 1.28 | 1.17 | 50 | 67.22% | 3/6 |
| ma60-block/top1/vol-3 | 511.98% | 45.65% | -35.58% | 1.28 | 1.36 | 40 | 79.49% | 2/6 |
| ma60-block/top2/vol-4 | 478.35% | 43.95% | -34.62% | 1.27 | 1.53 | 68 | 79.86% | 4/6 |
| ma60-exit/top2/fixed-08 | 215.22% | 26.91% | -22.00% | 1.22 | 1.23 | 109 | 66.80% | 4/6 |

## Half-sample stability

A configuration that only works in one half of the window is not a strategy.

Split at 2024-03-11.

| Config | H1 return | H1 excess | H2 return | H2 excess |
|---|---:|---:|---:|---:|
| ma60-exit/top1/vol-3 | 86.89% | 74.14% | 401.50% | 265.51% |
| ma60-exit/top2/vol-3 | 38.26% | 25.50% | 289.82% | 153.83% |
| ma60-exit/top2/vol-4 | 37.64% | 24.89% | 268.94% | 132.95% |
| ma120-exit/top1/vol-4 | 57.88% | 45.13% | 654.46% | 518.48% |
| ma60-exit/top1/vol-4 | 44.03% | 31.28% | 349.26% | 213.27% |
| ma120-exit/top2/vol-4 | 47.52% | 34.77% | 361.86% | 225.87% |
| ma60-exit/top1/vol-5 | 21.22% | 8.47% | 232.66% | 96.67% |
| ma60-exit/top1/fixed-08 | 23.97% | 11.22% | 287.02% | 151.03% |
| ma60-exit/top2/vol-6 | 16.41% | 3.66% | 189.57% | 53.59% |
| ma60-block/top2/vol-6 | 9.06% | -3.69% | 404.85% | 268.86% |
| none/top1/fixed-10 | 118.25% | 105.50% | 183.85% | 47.86% |
| ma60-exit/top1/fixed-12 | 6.13% | -6.62% | 213.54% | 77.55% |
| ma60-block/top1/vol-3 | 98.45% | 85.70% | 209.78% | 73.79% |
| ma60-block/top2/vol-4 | 61.35% | 48.60% | 272.45% | 136.46% |
| ma60-exit/top2/fixed-08 | 9.18% | -3.57% | 203.08% | 67.09% |

## v0.4 incumbents, same measurement

| Config | Net return | CAGR | Max DD | Calmar | Years > TAIEX |
|---|---:|---:|---:|---:|---:|
| v0.4 fixed 20/20 | 183.84% | 24.18% | -60.29% | 0.40 | 2/6 |
| v0.4 TP20 + trail 8% | 581.43% | 48.94% | -59.27% | 0.83 | 3/6 |
| v0.4 TP20 + trail 10% | 511.08% | 45.61% | -34.67% | 1.32 | 4/6 |

## Promotion decision

**Shadow candidate:** `ma60-exit/top2/vol-6` (family `ma60-exit/top2/vol-scaled`).

Selected as the median parameter of the most robust family. This is a forward-shadow candidate, not an approved champion; promotion still requires matured out-of-sample evidence.

### Families rejected by the gate

| Family | Reasons |
|---|---|
| ma60-block/top1/vol-scaled | worst-member Calmar below 0.5 |
| none/top1/fixed-pct | CAGR spread 39.0pp exceeds 35pp; worst-member Calmar below 0.5 |
| ma60-block/top2/fixed-pct | median Calmar below 0.8 |
| ma120-exit/top1/fixed-pct | worst-member Calmar below 0.5; median Calmar below 0.8 |
| ma120-exit/top2/fixed-pct | median Calmar below 0.8 |
| ma60-block/top1/fixed-pct | worst-member Calmar below 0.5; median Calmar below 0.8 |
| none/top2/fixed-pct | median Calmar below 0.8 |
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

# Sector Rotation v0.5 — parameter robustness sweep

Generated: 2026-10-24T05:30:05.529Z
Data snapshot: 2026-10-24T05:29:31.973Z (cached TWSE snapshot)

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
| ma60-exit/top2/vol-scaled | 4 | 38.76% | 33.01% | 44.17% | 11.16% | 1.95 | 1.29 | -25.53% | yes |
| ma60-exit/top1/vol-scaled | 4 | 46.96% | 35.80% | 63.38% | 27.58% | 1.68 | 1.19 | -30.03% | yes |
| ma120-exit/top2/vol-scaled | 4 | 41.85% | 29.35% | 44.02% | 14.66% | 1.49 | 1.08 | -29.21% | no |
| ma60-exit/top1/fixed-pct | 3 | 39.93% | 39.20% | 42.17% | 2.97% | 1.42 | 1.34 | -29.84% | yes |
| ma120-exit/top1/vol-scaled | 4 | 55.82% | 38.60% | 66.58% | 27.98% | 1.33 | 0.95 | -45.14% | no |
| ma120-exit/top2/fixed-pct | 3 | 28.77% | 23.68% | 36.86% | 13.18% | 1.29 | 1.00 | -23.70% | yes |
| ma60-exit/top2/fixed-pct | 3 | 32.67% | 29.61% | 32.90% | 3.30% | 1.26 | 1.22 | -26.89% | yes |
| ma120-exit/top1/fixed-pct | 3 | 40.03% | 22.23% | 52.16% | 29.93% | 1.23 | 0.61 | -37.46% | no |
| ma60-block/top2/vol-scaled | 4 | 36.90% | 31.98% | 45.83% | 13.86% | 1.08 | 0.94 | -36.01% | yes |
| ma60-block/top1/vol-scaled | 4 | 44.67% | 24.62% | 57.75% | 33.12% | 1.05 | 0.58 | -53.35% | no |
| none/top2/fixed-pct | 3 | 39.14% | 31.31% | 49.54% | 18.22% | 1.01 | 0.82 | -38.80% | yes |
| none/top2/vol-scaled | 4 | 36.94% | 27.64% | 43.09% | 15.45% | 0.87 | 0.65 | -44.13% | no |
| none/top1/fixed-pct | 3 | 51.21% | 22.83% | 59.85% | 37.02% | 0.83 | 0.54 | -61.90% | no |
| ma60-block/top2/fixed-pct | 3 | 28.15% | 25.56% | 31.52% | 5.96% | 0.74 | 0.72 | -40.93% | yes |
| none/top1/vol-scaled | 4 | 36.17% | 19.51% | 44.36% | 24.85% | 0.65 | 0.33 | -63.21% | no |
| ma60-block/top1/fixed-pct | 3 | 26.28% | 13.46% | 44.52% | 31.06% | 0.53 | 0.27 | -50.71% | no |

## Best fifteen configurations by Calmar

| Config | Net return | CAGR | Max DD | Calmar | Sharpe | Trades | Exposure | Years > TAIEX |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ma60-exit/top2/vol-3 | 482.57% | 44.17% | -19.17% | 2.30 | 1.69 | 118 | 68.66% | 5/6 |
| ma60-exit/top2/vol-4 | 476.97% | 43.88% | -19.06% | 2.30 | 1.68 | 104 | 68.66% | 6/6 |
| ma60-exit/top1/vol-3 | 964.28% | 63.38% | -27.58% | 2.30 | 1.73 | 62 | 69.28% | 6/6 |
| none/top1/fixed-10 | 857.88% | 59.85% | -28.89% | 2.07 | 1.58 | 32 | 99.01% | 4/6 |
| ma60-exit/top1/vol-4 | 634.75% | 51.28% | -29.46% | 1.74 | 1.44 | 56 | 69.36% | 6/6 |
| ma120-exit/top2/fixed-08 | 353.41% | 36.86% | -22.44% | 1.64 | 1.45 | 88 | 74.14% | 3/6 |
| ma120-exit/top2/vol-5 | 418.65% | 40.73% | -24.97% | 1.63 | 1.45 | 86 | 74.42% | 4/6 |
| ma60-exit/top1/vol-5 | 453.42% | 42.64% | -26.29% | 1.62 | 1.33 | 51 | 69.19% | 5/6 |
| ma60-exit/top1/fixed-08 | 444.70% | 42.17% | -26.29% | 1.60 | 1.34 | 57 | 69.60% | 4/6 |
| ma60-exit/top2/vol-6 | 304.17% | 33.63% | -20.99% | 1.60 | 1.44 | 91 | 69.03% | 5/6 |
| ma120-exit/top1/vol-5 | 835.56% | 59.06% | -37.30% | 1.58 | 1.54 | 45 | 75.37% | 4/6 |
| none/top2/fixed-10 | 594.80% | 49.54% | -32.39% | 1.53 | 1.59 | 57 | 97.65% | 3/6 |
| ma120-exit/top2/vol-6 | 479.63% | 44.02% | -29.09% | 1.51 | 1.57 | 75 | 75.04% | 3/6 |
| ma120-exit/top1/vol-4 | 1068.58% | 66.58% | -44.55% | 1.49 | 1.61 | 52 | 75.37% | 4/6 |
| ma120-exit/top2/vol-4 | 459.53% | 42.97% | -29.21% | 1.47 | 1.49 | 95 | 74.79% | 4/6 |

## Half-sample stability

A configuration that only works in one half of the window is not a strategy.

Split at 2024-04-25.

| Config | H1 return | H1 excess | H2 return | H2 excess |
|---|---:|---:|---:|---:|
| ma60-exit/top2/vol-3 | 49.41% | 31.83% | 295.99% | 164.13% |
| ma60-exit/top2/vol-4 | 46.01% | 28.43% | 293.57% | 161.71% |
| ma60-exit/top1/vol-3 | 94.85% | 77.27% | 442.41% | 310.55% |
| none/top1/fixed-10 | 209.34% | 191.76% | 241.73% | 109.87% |
| ma60-exit/top1/vol-4 | 50.16% | 32.59% | 385.90% | 254.04% |
| ma120-exit/top2/fixed-08 | 53.80% | 36.23% | 197.76% | 65.90% |
| ma120-exit/top2/vol-5 | 17.16% | -0.42% | 348.08% | 216.22% |
| ma60-exit/top1/vol-5 | 43.62% | 26.04% | 282.66% | 150.80% |
| ma60-exit/top1/fixed-08 | 21.50% | 3.93% | 345.19% | 213.33% |
| ma60-exit/top2/vol-6 | 25.78% | 8.20% | 219.96% | 88.10% |
| ma120-exit/top1/vol-5 | -10.44% | -28.02% | 958.07% | 826.21% |
| none/top2/fixed-10 | 92.57% | 74.99% | 272.52% | 140.66% |
| ma120-exit/top2/vol-6 | -0.86% | -18.44% | 456.34% | 324.48% |
| ma120-exit/top1/vol-4 | 38.61% | 21.03% | 754.05% | 622.19% |
| ma120-exit/top2/vol-4 | 53.02% | 35.44% | 278.82% | 146.96% |

## v0.4 incumbents, same measurement

| Config | Net return | CAGR | Max DD | Calmar | Years > TAIEX |
|---|---:|---:|---:|---:|---:|
| v0.4 fixed 20/20 | 408.18% | 40.14% | -46.86% | 0.86 | 2/6 |
| v0.4 TP20 + trail 8% | 632.97% | 51.21% | -61.90% | 0.83 | 3/6 |
| v0.4 TP20 + trail 10% | 857.88% | 59.85% | -28.89% | 2.07 | 4/6 |

## Promotion decision

**Shadow candidate:** `ma60-exit/top2/vol-6` (family `ma60-exit/top2/vol-scaled`).

Selected as the median parameter of the most robust family. This is a forward-shadow candidate, not an approved champion; promotion still requires matured out-of-sample evidence.

### Families rejected by the gate

| Family | Reasons |
|---|---|
| none/top1/fixed-pct | CAGR spread 37.0pp exceeds 35pp |
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

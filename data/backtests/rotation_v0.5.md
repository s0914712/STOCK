# Sector Rotation v0.5 — parameter robustness sweep

Generated: 2026-11-28T08:52:41.075Z
Data snapshot: 2026-11-28T08:52:13.321Z (cached TWSE snapshot)

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
| ma60-exit/top2/vol-scaled | 4 | 33.26% | 29.42% | 38.02% | 8.60% | 1.30 | 1.06 | -27.65% | yes |
| ma60-exit/top1/vol-scaled | 4 | 42.23% | 29.58% | 60.40% | 30.82% | 1.16 | 0.67 | -44.29% | yes |
| ma60-exit/top2/fixed-pct | 3 | 28.62% | 26.36% | 29.47% | 3.10% | 1.02 | 0.97 | -29.64% | yes |
| ma120-exit/top2/vol-scaled | 4 | 33.40% | 25.75% | 37.20% | 11.45% | 0.95 | 0.82 | -38.91% | yes |
| ma60-block/top2/vol-scaled | 4 | 31.12% | 25.30% | 38.24% | 12.93% | 0.83 | 0.75 | -38.42% | yes |
| ma60-exit/top1/fixed-pct | 3 | 33.53% | 32.83% | 35.67% | 2.84% | 0.78 | 0.76 | -44.13% | yes |
| ma120-exit/top2/fixed-pct | 3 | 23.95% | 19.02% | 31.27% | 12.25% | 0.77 | 0.61 | -33.55% | yes |
| ma120-exit/top1/vol-scaled | 4 | 40.78% | 33.62% | 58.89% | 25.27% | 0.76 | 0.64 | -58.74% | no |
| none/top2/fixed-pct | 3 | 31.27% | 20.58% | 39.57% | 18.99% | 0.68 | 0.48 | -46.09% | yes |
| ma60-block/top1/vol-scaled | 4 | 33.86% | 14.44% | 45.45% | 31.01% | 0.66 | 0.34 | -61.39% | no |
| ma120-exit/top1/fixed-pct | 3 | 30.06% | 13.51% | 43.34% | 29.83% | 0.63 | 0.27 | -50.59% | no |
| ma60-block/top2/fixed-pct | 3 | 23.87% | 19.84% | 25.05% | 5.22% | 0.63 | 0.54 | -39.83% | yes |
| none/top1/fixed-pct | 3 | 34.21% | 8.10% | 39.41% | 31.31% | 0.59 | 0.15 | -65.30% | no |
| none/top2/vol-scaled | 4 | 28.70% | 17.58% | 34.23% | 16.64% | 0.57 | 0.36 | -53.01% | no |
| ma60-block/top1/fixed-pct | 3 | 20.98% | 7.11% | 34.86% | 27.76% | 0.43 | 0.14 | -51.58% | yes |
| none/top1/vol-scaled | 4 | 20.71% | 11.30% | 26.17% | 14.87% | 0.31 | 0.16 | -75.45% | no |

## Best fifteen configurations by Calmar

| Config | Net return | CAGR | Max DD | Calmar | Sharpe | Trades | Exposure | Years > TAIEX |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ma60-exit/top1/vol-3 | 870.43% | 60.40% | -29.87% | 2.02 | 1.64 | 62 | 67.66% | 6/6 |
| ma60-exit/top2/vol-3 | 355.61% | 37.07% | -25.34% | 1.46 | 1.49 | 116 | 67.04% | 5/6 |
| ma60-exit/top2/vol-4 | 370.99% | 38.02% | -26.67% | 1.43 | 1.51 | 104 | 67.04% | 6/6 |
| ma60-exit/top1/vol-4 | 566.16% | 48.33% | -37.10% | 1.30 | 1.36 | 57 | 67.74% | 6/6 |
| ma120-exit/top1/vol-4 | 827.25% | 58.89% | -48.18% | 1.22 | 1.45 | 53 | 73.68% | 4/6 |
| ma60-exit/top2/vol-6 | 245.63% | 29.42% | -25.01% | 1.18 | 1.31 | 91 | 67.41% | 5/6 |
| ma60-block/top2/vol-6 | 374.58% | 38.24% | -34.95% | 1.09 | 1.28 | 50 | 82.01% | 3/6 |
| ma60-exit/top2/fixed-08 | 208.12% | 26.36% | -24.29% | 1.09 | 1.20 | 105 | 67.33% | 5/6 |
| ma60-exit/top2/vol-5 | 245.98% | 29.44% | -27.65% | 1.06 | 1.29 | 95 | 67.16% | 5/6 |
| ma60-block/top1/vol-5 | 506.17% | 45.45% | -44.03% | 1.03 | 1.28 | 37 | 76.49% | 4/6 |
| ma60-exit/top1/vol-5 | 340.66% | 36.12% | -35.31% | 1.02 | 1.16 | 53 | 67.57% | 5/6 |
| ma60-exit/top2/fixed-10 | 246.27% | 29.47% | -29.00% | 1.02 | 1.30 | 93 | 66.91% | 5/6 |
| ma60-exit/top2/fixed-12 | 235.46% | 28.62% | -29.64% | 0.97 | 1.24 | 90 | 67.41% | 5/6 |
| ma120-exit/top2/vol-5 | 274.29% | 31.58% | -32.77% | 0.96 | 1.17 | 86 | 72.73% | 4/6 |
| ma120-exit/top2/vol-4 | 357.67% | 37.20% | -38.91% | 0.96 | 1.33 | 97 | 73.10% | 4/6 |

## Half-sample stability

A configuration that only works in one half of the window is not a strategy.

Split at 2024-05-31.

| Config | H1 return | H1 excess | H2 return | H2 excess |
|---|---:|---:|---:|---:|
| ma60-exit/top1/vol-3 | 158.71% | 136.51% | 380.56% | 294.92% |
| ma60-exit/top2/vol-3 | 51.51% | 29.31% | 242.58% | 156.94% |
| ma60-exit/top2/vol-4 | 52.49% | 30.30% | 198.83% | 113.19% |
| ma60-exit/top1/vol-4 | 98.24% | 76.05% | 218.42% | 132.78% |
| ma120-exit/top1/vol-4 | 76.11% | 53.91% | 452.63% | 366.98% |
| ma60-exit/top2/vol-6 | 37.71% | 15.51% | 148.25% | 62.61% |
| ma60-block/top2/vol-6 | 31.59% | 9.40% | 264.55% | 178.91% |
| ma60-exit/top2/fixed-08 | 30.20% | 8.01% | 152.82% | 67.18% |
| ma60-exit/top2/vol-5 | 28.57% | 6.37% | 165.31% | 79.66% |
| ma60-block/top1/vol-5 | 111.49% | 89.29% | 185.23% | 99.59% |
| ma60-exit/top1/vol-5 | 66.52% | 44.32% | 163.35% | 77.71% |
| ma60-exit/top2/fixed-10 | 25.50% | 3.31% | 193.10% | 107.45% |
| ma60-exit/top2/fixed-12 | 29.74% | 7.54% | 192.88% | 107.24% |
| ma120-exit/top2/vol-5 | 17.37% | -4.83% | 208.98% | 123.33% |
| ma120-exit/top2/vol-4 | 56.17% | 33.97% | 193.85% | 108.21% |

## v0.4 incumbents, same measurement

| Config | Net return | CAGR | Max DD | Calmar | Years > TAIEX |
|---|---:|---:|---:|---:|---:|
| v0.4 fixed 20/20 | 204.51% | 26.05% | -59.82% | 0.44 | 2/6 |
| v0.4 TP20 + trail 8% | 394.22% | 39.41% | -65.30% | 0.60 | 3/6 |
| v0.4 TP20 + trail 10% | 311.68% | 34.21% | -57.84% | 0.59 | 4/6 |

## Promotion decision

**Shadow candidate:** `ma60-exit/top2/vol-5` (family `ma60-exit/top2/vol-scaled`).

Selected as the median parameter of the most robust family. This is a forward-shadow candidate, not an approved champion; promotion still requires matured out-of-sample evidence.

### Families rejected by the gate

| Family | Reasons |
|---|---|
| ma60-exit/top1/fixed-pct | median Calmar below 0.8 |
| ma120-exit/top2/fixed-pct | median Calmar below 0.8 |
| ma120-exit/top1/vol-scaled | median Calmar below 0.8 |
| none/top2/fixed-pct | worst-member Calmar below 0.5; median Calmar below 0.8 |
| ma60-block/top1/vol-scaled | worst-member Calmar below 0.5; median Calmar below 0.8 |
| ma120-exit/top1/fixed-pct | worst-member Calmar below 0.5; median Calmar below 0.8 |
| ma60-block/top2/fixed-pct | median Calmar below 0.8 |
| none/top1/fixed-pct | worst-member Calmar below 0.5; median Calmar below 0.8 |
| none/top2/vol-scaled | worst-member Calmar below 0.5; median Calmar below 0.8 |
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

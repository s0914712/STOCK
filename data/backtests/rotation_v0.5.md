# Sector Rotation v0.5 — parameter robustness sweep

Generated: 2026-10-17T05:28:35.411Z
Data snapshot: 2026-10-17T05:28:07.063Z (cached TWSE snapshot)

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
| ma60-exit/top2/vol-scaled | 4 | 39.80% | 34.24% | 45.21% | 10.97% | 2.00 | 1.34 | -25.53% | yes |
| ma60-exit/top1/vol-scaled | 4 | 47.87% | 36.65% | 64.39% | 27.75% | 1.71 | 1.22 | -30.03% | yes |
| ma120-exit/top2/vol-scaled | 4 | 41.37% | 27.71% | 46.09% | 18.38% | 1.47 | 1.02 | -29.44% | no |
| ma60-exit/top1/fixed-pct | 3 | 40.80% | 40.07% | 43.05% | 2.99% | 1.45 | 1.37 | -29.84% | yes |
| ma120-exit/top1/vol-scaled | 4 | 50.94% | 44.29% | 73.66% | 29.37% | 1.32 | 1.11 | -43.99% | no |
| ma60-exit/top2/fixed-pct | 3 | 33.90% | 30.12% | 34.14% | 4.02% | 1.31 | 1.27 | -26.89% | yes |
| ma60-block/top2/vol-scaled | 4 | 37.91% | 33.62% | 47.57% | 13.95% | 1.13 | 0.96 | -36.01% | yes |
| ma120-exit/top1/fixed-pct | 3 | 36.02% | 18.74% | 49.89% | 31.15% | 1.11 | 0.51 | -37.46% | no |
| ma120-exit/top2/fixed-pct | 3 | 26.64% | 21.61% | 34.93% | 13.32% | 1.10 | 0.89 | -24.15% | yes |
| ma60-block/top1/vol-scaled | 4 | 46.37% | 26.10% | 59.60% | 33.51% | 1.09 | 0.62 | -53.35% | no |
| none/top2/fixed-pct | 3 | 37.71% | 25.11% | 44.44% | 19.33% | 0.97 | 0.53 | -46.99% | no |
| none/top1/fixed-pct | 3 | 52.23% | 18.88% | 55.56% | 36.68% | 0.95 | 0.50 | -54.86% | no |
| none/top2/vol-scaled | 4 | 36.10% | 27.49% | 44.29% | 16.80% | 0.80 | 0.63 | -45.63% | no |
| ma60-block/top2/fixed-pct | 3 | 28.62% | 26.17% | 31.96% | 5.79% | 0.75 | 0.74 | -40.93% | yes |
| none/top1/vol-scaled | 4 | 31.95% | 26.53% | 39.07% | 12.55% | 0.59 | 0.50 | -68.20% | no |
| ma60-block/top1/fixed-pct | 3 | 27.07% | 14.17% | 46.22% | 32.06% | 0.55 | 0.28 | -50.71% | no |

## Best fifteen configurations by Calmar

| Config | Net return | CAGR | Max DD | Calmar | Sharpe | Trades | Exposure | Years > TAIEX |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ma60-exit/top2/vol-4 | 503.18% | 45.21% | -19.06% | 2.37 | 1.72 | 104 | 68.33% | 6/6 |
| ma60-exit/top1/vol-3 | 996.49% | 64.39% | -27.58% | 2.33 | 1.75 | 62 | 68.95% | 6/6 |
| ma60-exit/top2/vol-3 | 493.48% | 44.72% | -19.17% | 2.33 | 1.71 | 118 | 68.33% | 5/6 |
| ma120-exit/top1/vol-4 | 1327.97% | 73.66% | -37.22% | 1.98 | 1.73 | 51 | 75.37% | 3/6 |
| none/top1/fixed-10 | 740.25% | 55.56% | -28.07% | 1.98 | 1.54 | 31 | 99.01% | 3/6 |
| ma60-exit/top1/vol-4 | 656.99% | 52.22% | -29.46% | 1.77 | 1.46 | 56 | 69.03% | 6/6 |
| ma60-exit/top2/vol-6 | 322.53% | 34.87% | -20.99% | 1.66 | 1.49 | 91 | 68.70% | 5/6 |
| ma60-exit/top1/vol-5 | 470.17% | 43.53% | -26.29% | 1.66 | 1.35 | 51 | 68.86% | 5/6 |
| ma60-exit/top1/fixed-08 | 461.19% | 43.05% | -26.29% | 1.64 | 1.36 | 57 | 69.28% | 4/6 |
| ma120-exit/top2/vol-4 | 520.97% | 46.09% | -29.21% | 1.58 | 1.57 | 93 | 74.79% | 3/6 |
| ma120-exit/top2/vol-6 | 469.36% | 43.48% | -29.44% | 1.48 | 1.57 | 75 | 75.04% | 2/6 |
| ma60-block/top2/vol-6 | 551.94% | 47.57% | -32.31% | 1.47 | 1.55 | 50 | 82.74% | 3/6 |
| ma120-exit/top2/vol-5 | 393.13% | 39.27% | -26.93% | 1.46 | 1.43 | 86 | 74.42% | 3/6 |
| ma60-exit/top1/fixed-12 | 406.95% | 40.07% | -27.61% | 1.45 | 1.27 | 48 | 69.03% | 3/6 |
| ma120-exit/top2/fixed-08 | 323.46% | 34.93% | -24.15% | 1.45 | 1.40 | 86 | 74.14% | 2/6 |

## Half-sample stability

A configuration that only works in one half of the window is not a strategy.

Split at 2024-04-19.

| Config | H1 return | H1 excess | H2 return | H2 excess |
|---|---:|---:|---:|---:|
| ma60-exit/top2/vol-4 | 44.51% | 27.62% | 317.39% | 176.13% |
| ma60-exit/top1/vol-3 | 90.91% | 74.02% | 474.35% | 333.09% |
| ma60-exit/top2/vol-3 | 45.76% | 28.87% | 309.22% | 167.96% |
| ma120-exit/top1/vol-4 | 52.72% | 35.83% | 828.75% | 687.49% |
| none/top1/fixed-10 | 148.93% | 132.04% | 271.62% | 130.36% |
| ma60-exit/top1/vol-4 | 47.12% | 30.23% | 414.52% | 273.26% |
| ma60-exit/top2/vol-6 | 24.75% | 7.86% | 239.31% | 98.05% |
| ma60-exit/top1/vol-5 | 40.72% | 23.82% | 305.19% | 163.93% |
| ma60-exit/top1/fixed-08 | 20.33% | 3.44% | 371.41% | 230.14% |
| ma120-exit/top2/vol-4 | 58.17% | 41.28% | 302.43% | 161.17% |
| ma120-exit/top2/vol-6 | -9.34% | -26.23% | 497.66% | 356.40% |
| ma60-block/top2/vol-6 | 10.88% | -6.01% | 491.22% | 349.95% |
| ma120-exit/top2/vol-5 | 2.68% | -14.21% | 383.37% | 242.11% |
| ma60-exit/top1/fixed-12 | 23.19% | 6.30% | 311.51% | 170.25% |
| ma120-exit/top2/fixed-08 | 38.22% | 21.33% | 209.15% | 67.89% |

## v0.4 incumbents, same measurement

| Config | Net return | CAGR | Max DD | Calmar | Years > TAIEX |
|---|---:|---:|---:|---:|---:|
| v0.4 fixed 20/20 | 672.73% | 52.87% | -34.95% | 1.51 | 1/6 |
| v0.4 TP20 + trail 8% | 657.25% | 52.23% | -54.86% | 0.95 | 2/6 |
| v0.4 TP20 + trail 10% | 740.25% | 55.56% | -28.07% | 1.98 | 3/6 |

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

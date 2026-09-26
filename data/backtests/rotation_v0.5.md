# Sector Rotation v0.5 — parameter robustness sweep

Generated: 2026-09-26T05:58:33.336Z
Data snapshot: 2026-09-26T05:58:12.886Z (cached TWSE snapshot)

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
| ma60-exit/top2/vol-scaled | 4 | 37.89% | 32.62% | 43.44% | 10.82% | 1.90 | 1.28 | -25.53% | yes |
| ma60-exit/top1/vol-scaled | 4 | 45.44% | 34.41% | 61.66% | 27.24% | 1.63 | 1.15 | -30.03% | yes |
| ma120-exit/top2/vol-scaled | 4 | 40.78% | 25.50% | 42.39% | 16.89% | 1.43 | 0.94 | -29.31% | no |
| ma60-exit/top1/fixed-pct | 3 | 38.49% | 37.77% | 40.71% | 2.93% | 1.37 | 1.29 | -29.84% | yes |
| ma120-exit/top1/vol-scaled | 4 | 56.55% | 43.38% | 67.35% | 23.96% | 1.35 | 1.07 | -45.14% | no |
| ma60-exit/top2/fixed-pct | 3 | 32.28% | 29.26% | 32.52% | 3.26% | 1.25 | 1.21 | -26.89% | yes |
| ma120-exit/top1/fixed-pct | 3 | 38.79% | 26.05% | 53.82% | 27.78% | 1.20 | 0.72 | -37.46% | no |
| ma60-block/top2/vol-scaled | 4 | 39.21% | 34.38% | 46.85% | 12.47% | 1.18 | 0.95 | -36.01% | yes |
| ma60-block/top1/vol-scaled | 4 | 47.32% | 25.35% | 58.28% | 32.93% | 1.09 | 0.60 | -53.35% | no |
| ma120-exit/top2/fixed-pct | 3 | 24.56% | 22.56% | 32.46% | 9.90% | 1.09 | 0.95 | -23.70% | yes |
| none/top2/fixed-pct | 3 | 34.42% | 28.33% | 50.99% | 22.66% | 0.87 | 0.73 | -39.53% | yes |
| none/top1/fixed-pct | 3 | 52.86% | 23.46% | 60.59% | 37.14% | 0.85 | 0.55 | -61.90% | yes |
| none/top2/vol-scaled | 4 | 35.05% | 24.89% | 40.73% | 15.84% | 0.81 | 0.59 | -44.58% | no |
| ma60-block/top2/fixed-pct | 3 | 30.70% | 24.98% | 31.02% | 6.04% | 0.75 | 0.71 | -40.93% | yes |
| none/top1/vol-scaled | 4 | 38.70% | 20.38% | 45.51% | 25.13% | 0.67 | 0.34 | -63.21% | no |
| ma60-block/top1/fixed-pct | 3 | 27.53% | 16.86% | 45.03% | 28.17% | 0.56 | 0.33 | -50.71% | no |

## Best fifteen configurations by Calmar

| Config | Net return | CAGR | Max DD | Calmar | Sharpe | Trades | Exposure | Years > TAIEX |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ma60-exit/top2/vol-4 | 470.19% | 43.44% | -19.06% | 2.28 | 1.69 | 103 | 67.15% | 6/6 |
| ma60-exit/top1/vol-3 | 915.21% | 61.66% | -27.58% | 2.24 | 1.71 | 62 | 67.76% | 5/6 |
| ma60-exit/top2/vol-3 | 452.91% | 42.53% | -19.17% | 2.22 | 1.66 | 118 | 67.15% | 5/6 |
| none/top1/fixed-10 | 883.31% | 60.59% | -28.89% | 2.10 | 1.60 | 31 | 99.01% | 4/6 |
| ma60-exit/top1/vol-4 | 600.87% | 49.71% | -29.46% | 1.69 | 1.42 | 56 | 67.85% | 5/6 |
| ma120-exit/top2/vol-5 | 415.80% | 40.49% | -24.95% | 1.62 | 1.44 | 85 | 74.34% | 3/6 |
| none/top2/fixed-10 | 630.34% | 50.99% | -31.63% | 1.61 | 1.59 | 57 | 97.53% | 2/6 |
| ma120-exit/top1/vol-5 | 860.39% | 59.81% | -37.30% | 1.60 | 1.55 | 44 | 75.41% | 4/6 |
| ma60-exit/top2/vol-6 | 299.42% | 33.24% | -20.99% | 1.58 | 1.45 | 90 | 67.52% | 5/6 |
| ma60-exit/top1/vol-5 | 427.90% | 41.17% | -26.29% | 1.57 | 1.31 | 51 | 67.68% | 4/6 |
| ma60-exit/top1/fixed-08 | 419.59% | 40.71% | -26.29% | 1.55 | 1.32 | 57 | 68.09% | 4/6 |
| ma120-exit/top1/vol-4 | 1099.59% | 67.35% | -44.55% | 1.51 | 1.63 | 51 | 75.41% | 4/6 |
| ma120-exit/top2/vol-4 | 450.25% | 42.39% | -29.21% | 1.45 | 1.47 | 93 | 74.71% | 3/6 |
| ma60-block/top2/vol-6 | 538.59% | 46.85% | -32.31% | 1.45 | 1.55 | 48 | 81.54% | 3/6 |
| ma120-exit/top1/fixed-08 | 698.77% | 53.82% | -37.46% | 1.44 | 1.44 | 50 | 75.33% | 3/6 |

## Half-sample stability

A configuration that only works in one half of the window is not a strategy.

Split at 2024-03-28.

| Config | H1 return | H1 excess | H2 return | H2 excess |
|---|---:|---:|---:|---:|
| ma60-exit/top2/vol-4 | 51.66% | 34.94% | 258.02% | 119.64% |
| ma60-exit/top1/vol-3 | 95.79% | 79.06% | 395.45% | 257.07% |
| ma60-exit/top2/vol-3 | 54.73% | 38.01% | 251.16% | 112.78% |
| none/top1/fixed-10 | 233.65% | 216.93% | 229.58% | 91.20% |
| ma60-exit/top1/vol-4 | 50.88% | 34.16% | 338.20% | 199.82% |
| ma120-exit/top2/vol-5 | 5.02% | -11.70% | 370.03% | 231.65% |
| none/top2/fixed-10 | 95.84% | 79.12% | 281.75% | 143.37% |
| ma120-exit/top1/vol-5 | -13.48% | -30.20% | 920.44% | 782.06% |
| ma60-exit/top2/vol-6 | 36.08% | 19.36% | 185.41% | 47.04% |
| ma60-exit/top1/vol-5 | 52.35% | 35.62% | 245.09% | 106.71% |
| ma60-exit/top1/fixed-08 | 29.87% | 13.15% | 306.64% | 168.27% |
| ma120-exit/top1/vol-4 | 33.91% | 17.19% | 723.67% | 585.30% |
| ma120-exit/top2/vol-4 | 35.10% | 18.37% | 302.91% | 164.53% |
| ma60-block/top2/vol-6 | 22.86% | 6.14% | 415.27% | 276.90% |
| ma120-exit/top1/fixed-08 | 92.98% | 76.25% | 285.40% | 147.03% |

## v0.4 incumbents, same measurement

| Config | Net return | CAGR | Max DD | Calmar | Years > TAIEX |
|---|---:|---:|---:|---:|---:|
| v0.4 fixed 20/20 | 383.08% | 38.60% | -46.86% | 0.82 | 2/6 |
| v0.4 TP20 + trail 8% | 674.88% | 52.86% | -61.90% | 0.85 | 3/6 |
| v0.4 TP20 + trail 10% | 883.31% | 60.59% | -28.89% | 2.10 | 4/6 |

## Promotion decision

**Shadow candidate:** `ma60-exit/top2/vol-6` (family `ma60-exit/top2/vol-scaled`).

Selected as the median parameter of the most robust family. This is a forward-shadow candidate, not an approved champion; promotion still requires matured out-of-sample evidence.

### Families rejected by the gate

| Family | Reasons |
|---|---|
| none/top1/fixed-pct | CAGR spread 37.1pp exceeds 35pp |
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

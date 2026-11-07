# Sector Rotation v0.5 — parameter robustness sweep

Generated: 2026-11-07T06:59:27.126Z
Data snapshot: 2026-11-07T06:59:08.712Z (cached TWSE snapshot)

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
| ma60-exit/top2/vol-scaled | 4 | 35.92% | 30.37% | 41.46% | 11.08% | 1.83 | 1.21 | -25.07% | yes |
| ma60-exit/top1/vol-scaled | 4 | 42.41% | 31.00% | 63.46% | 32.45% | 1.35 | 0.83 | -37.24% | yes |
| ma60-exit/top2/fixed-pct | 3 | 30.12% | 27.19% | 30.40% | 3.21% | 1.18 | 1.15 | -26.47% | yes |
| ma120-exit/top2/vol-scaled | 4 | 34.86% | 28.71% | 41.18% | 12.47% | 1.11 | 1.06 | -32.20% | yes |
| ma60-block/top2/vol-scaled | 4 | 34.24% | 26.89% | 42.23% | 15.34% | 1.09 | 0.92 | -34.34% | yes |
| ma60-exit/top1/fixed-pct | 3 | 34.29% | 33.70% | 35.64% | 1.95% | 0.98 | 0.84 | -39.91% | yes |
| ma120-exit/top2/fixed-pct | 3 | 25.42% | 19.78% | 31.97% | 12.19% | 0.94 | 0.69 | -31.57% | yes |
| ma120-exit/top1/vol-scaled | 4 | 41.96% | 36.16% | 57.46% | 21.30% | 0.89 | 0.78 | -51.78% | no |
| ma60-block/top1/vol-scaled | 4 | 36.60% | 15.08% | 44.56% | 29.48% | 0.84 | 0.36 | -54.16% | no |
| ma120-exit/top1/fixed-pct | 3 | 31.48% | 13.35% | 42.93% | 29.58% | 0.77 | 0.28 | -47.53% | no |
| none/top2/vol-scaled | 4 | 33.13% | 25.16% | 37.00% | 11.83% | 0.76 | 0.60 | -46.66% | no |
| ma60-block/top2/fixed-pct | 3 | 25.83% | 20.54% | 30.20% | 9.66% | 0.69 | 0.58 | -37.50% | yes |
| none/top1/fixed-pct | 3 | 36.62% | 6.13% | 38.41% | 32.28% | 0.56 | 0.10 | -69.13% | no |
| none/top2/fixed-pct | 3 | 27.21% | 22.54% | 38.59% | 16.05% | 0.54 | 0.50 | -50.17% | yes |
| ma60-block/top1/fixed-pct | 3 | 20.19% | 6.36% | 37.51% | 31.15% | 0.41 | 0.13 | -50.71% | no |
| none/top1/vol-scaled | 4 | 21.67% | 12.30% | 32.42% | 20.13% | 0.32 | 0.17 | -71.04% | no |

## Best fifteen configurations by Calmar

| Config | Net return | CAGR | Max DD | Calmar | Sharpe | Trades | Exposure | Years > TAIEX |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ma60-exit/top1/vol-3 | 962.60% | 63.46% | -27.58% | 2.30 | 1.69 | 63 | 68.89% | 6/6 |
| ma60-exit/top2/vol-3 | 430.22% | 41.46% | -19.17% | 2.16 | 1.62 | 116 | 68.28% | 5/6 |
| ma60-exit/top2/vol-4 | 420.43% | 40.91% | -18.93% | 2.16 | 1.60 | 103 | 68.28% | 6/6 |
| ma60-exit/top1/vol-4 | 570.21% | 48.52% | -32.35% | 1.50 | 1.36 | 56 | 68.98% | 6/6 |
| ma60-exit/top2/vol-6 | 265.50% | 30.93% | -20.66% | 1.50 | 1.35 | 90 | 68.65% | 5/6 |
| ma60-block/top2/vol-6 | 444.28% | 42.23% | -29.27% | 1.44 | 1.38 | 49 | 81.44% | 3/6 |
| ma120-exit/top2/vol-4 | 425.20% | 41.18% | -29.86% | 1.38 | 1.43 | 97 | 74.34% | 4/6 |
| ma60-exit/top2/fixed-08 | 217.91% | 27.19% | -21.60% | 1.26 | 1.22 | 105 | 68.56% | 5/6 |
| ma120-exit/top1/vol-4 | 787.85% | 57.46% | -46.96% | 1.22 | 1.42 | 51 | 74.92% | 4/6 |
| ma60-exit/top2/vol-5 | 258.12% | 30.37% | -25.07% | 1.21 | 1.32 | 94 | 68.40% | 5/6 |
| ma60-exit/top1/vol-5 | 343.34% | 36.29% | -30.42% | 1.19 | 1.15 | 52 | 68.81% | 5/6 |
| ma60-exit/top2/fixed-12 | 254.75% | 30.12% | -25.55% | 1.18 | 1.29 | 89 | 68.65% | 5/6 |
| ma120-exit/top2/vol-6 | 359.31% | 37.30% | -32.20% | 1.16 | 1.34 | 76 | 74.59% | 3/6 |
| ma60-exit/top2/fixed-10 | 258.42% | 30.40% | -26.47% | 1.15 | 1.33 | 92 | 68.15% | 5/6 |
| ma60-block/top2/vol-3 | 289.38% | 32.66% | -28.98% | 1.13 | 1.28 | 83 | 79.83% | 4/6 |

## Half-sample stability

A configuration that only works in one half of the window is not a strategy.

Split at 2024-05-10.

| Config | H1 return | H1 excess | H2 return | H2 excess |
|---|---:|---:|---:|---:|
| ma60-exit/top1/vol-3 | 142.75% | 123.84% | 309.24% | 217.53% |
| ma60-exit/top2/vol-3 | 60.46% | 41.55% | 229.18% | 137.47% |
| ma60-exit/top2/vol-4 | 54.92% | 36.01% | 226.49% | 134.77% |
| ma60-exit/top1/vol-4 | 70.92% | 52.00% | 266.61% | 174.90% |
| ma60-exit/top2/vol-6 | 33.85% | 14.94% | 165.48% | 73.77% |
| ma60-block/top2/vol-6 | 35.43% | 16.52% | 305.88% | 214.17% |
| ma120-exit/top2/vol-4 | 63.60% | 44.69% | 225.13% | 133.41% |
| ma60-exit/top2/fixed-08 | 22.53% | 3.62% | 153.54% | 61.83% |
| ma120-exit/top1/vol-4 | 44.91% | 26.00% | 474.39% | 382.68% |
| ma60-exit/top2/vol-5 | 22.35% | 3.44% | 184.17% | 92.46% |
| ma60-exit/top1/vol-5 | 43.57% | 24.65% | 188.71% | 97.00% |
| ma60-exit/top2/fixed-12 | 22.28% | 3.37% | 181.26% | 89.55% |
| ma120-exit/top2/vol-6 | 5.93% | -12.98% | 316.90% | 225.18% |
| ma60-exit/top2/fixed-10 | 19.43% | 0.52% | 191.36% | 99.65% |
| ma60-block/top2/vol-3 | 47.99% | 29.07% | 158.34% | 66.62% |

## v0.4 incumbents, same measurement

| Config | Net return | CAGR | Max DD | Calmar | Years > TAIEX |
|---|---:|---:|---:|---:|---:|
| v0.4 fixed 20/20 | 267.24% | 31.06% | -55.49% | 0.56 | 2/6 |
| v0.4 TP20 + trail 8% | 377.47% | 38.41% | -69.13% | 0.56 | 3/6 |
| v0.4 TP20 + trail 10% | 348.45% | 36.62% | -55.95% | 0.65 | 4/6 |

## Promotion decision

**Shadow candidate:** `ma60-exit/top2/vol-6` (family `ma60-exit/top2/vol-scaled`).

Selected as the median parameter of the most robust family. This is a forward-shadow candidate, not an approved champion; promotion still requires matured out-of-sample evidence.

### Families rejected by the gate

| Family | Reasons |
|---|---|
| ma60-block/top1/vol-scaled | worst-member Calmar below 0.5 |
| ma120-exit/top1/fixed-pct | worst-member Calmar below 0.5; median Calmar below 0.8 |
| none/top2/vol-scaled | median Calmar below 0.8 |
| ma60-block/top2/fixed-pct | median Calmar below 0.8 |
| none/top1/fixed-pct | worst-member Calmar below 0.5; median Calmar below 0.8 |
| none/top2/fixed-pct | worst-member Calmar below 0.5; median Calmar below 0.8 |
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

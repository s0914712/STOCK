# Sector Rotation v0.5 — parameter robustness sweep

Generated: 2026-10-10T06:50:10.340Z
Data snapshot: 2026-10-10T06:49:40.907Z (cached TWSE snapshot)

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
| ma60-exit/top2/vol-scaled | 4 | 38.34% | 33.83% | 44.76% | 10.93% | 1.92 | 1.32 | -25.53% | yes |
| ma60-exit/top1/vol-scaled | 4 | 44.75% | 33.75% | 60.91% | 27.16% | 1.60 | 1.12 | -30.03% | yes |
| ma120-exit/top2/vol-scaled | 4 | 44.02% | 27.36% | 49.78% | 22.42% | 1.56 | 1.01 | -29.44% | no |
| ma120-exit/top1/vol-scaled | 4 | 53.27% | 46.55% | 76.34% | 29.78% | 1.39 | 1.17 | -43.99% | no |
| ma60-exit/top1/fixed-pct | 3 | 37.82% | 37.10% | 40.03% | 2.92% | 1.34 | 1.27 | -29.84% | yes |
| ma60-exit/top2/fixed-pct | 3 | 33.48% | 29.83% | 33.72% | 3.89% | 1.30 | 1.25 | -26.89% | yes |
| ma60-block/top2/vol-scaled | 4 | 40.24% | 33.96% | 49.52% | 15.56% | 1.21 | 0.94 | -36.01% | yes |
| ma60-block/top1/vol-scaled | 4 | 48.14% | 27.60% | 61.51% | 33.91% | 1.13 | 0.65 | -53.35% | no |
| ma120-exit/top2/fixed-pct | 3 | 25.43% | 23.08% | 33.41% | 10.33% | 1.05 | 0.96 | -24.14% | yes |
| ma120-exit/top1/fixed-pct | 3 | 33.62% | 20.84% | 52.93% | 32.10% | 1.04 | 0.57 | -37.46% | no |
| none/top1/fixed-pct | 3 | 55.33% | 20.71% | 57.96% | 37.25% | 1.01 | 0.54 | -54.86% | no |
| none/top2/fixed-pct | 3 | 36.16% | 23.66% | 46.48% | 22.82% | 0.93 | 0.50 | -46.93% | yes |
| none/top2/vol-scaled | 4 | 36.96% | 30.02% | 47.79% | 17.78% | 0.82 | 0.69 | -45.61% | no |
| ma60-block/top2/fixed-pct | 3 | 30.10% | 24.49% | 30.21% | 5.72% | 0.74 | 0.69 | -40.93% | yes |
| none/top1/vol-scaled | 4 | 33.98% | 28.48% | 41.26% | 12.78% | 0.63 | 0.53 | -68.20% | no |
| ma60-block/top1/fixed-pct | 3 | 29.21% | 15.79% | 47.97% | 32.18% | 0.59 | 0.31 | -50.71% | no |

## Best fifteen configurations by Calmar

| Config | Net return | CAGR | Max DD | Calmar | Sharpe | Trades | Exposure | Years > TAIEX |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ma60-exit/top2/vol-4 | 494.17% | 44.76% | -19.06% | 2.35 | 1.72 | 104 | 67.92% | 6/6 |
| ma60-exit/top1/vol-3 | 889.14% | 60.91% | -27.58% | 2.21 | 1.69 | 62 | 68.53% | 5/6 |
| ma60-exit/top2/vol-3 | 445.72% | 42.23% | -19.17% | 2.20 | 1.65 | 118 | 67.92% | 5/6 |
| none/top1/fixed-10 | 804.54% | 57.96% | -28.07% | 2.06 | 1.60 | 31 | 99.01% | 3/6 |
| ma120-exit/top1/vol-4 | 1437.31% | 76.34% | -37.22% | 2.05 | 1.78 | 51 | 75.37% | 3/6 |
| ma120-exit/top2/vol-4 | 600.13% | 49.78% | -29.21% | 1.70 | 1.68 | 92 | 74.59% | 3/6 |
| ma60-exit/top1/vol-4 | 582.88% | 49.00% | -29.46% | 1.66 | 1.41 | 56 | 68.62% | 5/6 |
| ma60-exit/top2/vol-6 | 316.22% | 34.45% | -20.99% | 1.64 | 1.49 | 91 | 68.29% | 5/6 |
| ma120-exit/top2/vol-5 | 448.87% | 42.40% | -26.93% | 1.57 | 1.53 | 85 | 74.22% | 3/6 |
| ma120-exit/top2/vol-6 | 511.83% | 45.64% | -29.44% | 1.55 | 1.65 | 74 | 74.84% | 2/6 |
| ma60-exit/top1/vol-5 | 414.35% | 40.49% | -26.29% | 1.54 | 1.29 | 51 | 68.45% | 4/6 |
| ma60-block/top2/vol-6 | 594.47% | 49.52% | -32.31% | 1.53 | 1.61 | 49 | 82.33% | 3/6 |
| ma60-exit/top1/fixed-08 | 406.24% | 40.03% | -26.29% | 1.52 | 1.30 | 57 | 68.86% | 4/6 |
| ma120-exit/top1/vol-3 | 530.50% | 46.55% | -32.80% | 1.42 | 1.36 | 50 | 74.96% | 3/6 |
| ma120-exit/top1/fixed-08 | 674.18% | 52.93% | -37.46% | 1.41 | 1.45 | 48 | 75.29% | 2/6 |

## Half-sample stability

A configuration that only works in one half of the window is not a strategy.

Split at 2024-04-12.

| Config | H1 return | H1 excess | H2 return | H2 excess |
|---|---:|---:|---:|---:|
| ma60-exit/top2/vol-4 | 53.03% | 28.42% | 258.22% | 120.41% |
| ma60-exit/top1/vol-3 | 102.05% | 77.44% | 368.04% | 230.23% |
| ma60-exit/top2/vol-3 | 55.62% | 31.01% | 242.94% | 105.13% |
| none/top1/fixed-10 | 173.03% | 148.41% | 226.36% | 88.55% |
| ma120-exit/top1/vol-4 | 58.62% | 34.00% | 765.85% | 628.04% |
| ma120-exit/top2/vol-4 | 70.38% | 45.76% | 287.04% | 149.24% |
| ma60-exit/top1/vol-4 | 55.71% | 31.10% | 268.93% | 131.12% |
| ma60-exit/top2/vol-6 | 36.71% | 12.09% | 197.70% | 59.89% |
| ma120-exit/top2/vol-5 | 8.05% | -16.56% | 373.55% | 235.74% |
| ma120-exit/top2/vol-6 | -3.32% | -27.94% | 451.80% | 313.99% |
| ma60-exit/top1/vol-5 | 49.16% | 24.54% | 203.16% | 65.35% |
| ma60-block/top2/vol-6 | 20.75% | -3.87% | 479.86% | 342.05% |
| ma60-exit/top1/fixed-08 | 34.03% | 9.41% | 238.02% | 100.21% |
| ma120-exit/top1/vol-3 | 155.56% | 130.94% | 135.88% | -1.93% |
| ma120-exit/top1/fixed-08 | 78.63% | 54.01% | 287.13% | 149.32% |

## v0.4 incumbents, same measurement

| Config | Net return | CAGR | Max DD | Calmar | Years > TAIEX |
|---|---:|---:|---:|---:|---:|
| v0.4 fixed 20/20 | 594.61% | 49.53% | -34.95% | 1.42 | 1/6 |
| v0.4 TP20 + trail 8% | 734.32% | 55.33% | -54.86% | 1.01 | 2/6 |
| v0.4 TP20 + trail 10% | 804.54% | 57.96% | -28.07% | 2.06 | 3/6 |

## Promotion decision

**Shadow candidate:** `ma60-exit/top2/vol-6` (family `ma60-exit/top2/vol-scaled`).

Selected as the median parameter of the most robust family. This is a forward-shadow candidate, not an approved champion; promotion still requires matured out-of-sample evidence.

### Families rejected by the gate

| Family | Reasons |
|---|---|
| none/top1/fixed-pct | CAGR spread 37.2pp exceeds 35pp |
| ma60-block/top2/fixed-pct | median Calmar below 0.8 |
| none/top1/vol-scaled | median Calmar below 0.8 |
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

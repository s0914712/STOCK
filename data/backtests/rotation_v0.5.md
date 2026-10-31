# Sector Rotation v0.5 — parameter robustness sweep

Generated: 2026-10-31T06:43:01.226Z
Data snapshot: 2026-10-31T06:42:37.434Z (cached TWSE snapshot)

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
| ma60-exit/top2/vol-scaled | 4 | 38.34% | 32.61% | 43.81% | 11.20% | 1.93 | 1.28 | -25.53% | yes |
| ma60-exit/top1/vol-scaled | 4 | 46.02% | 34.92% | 62.36% | 27.44% | 1.65 | 1.16 | -30.03% | yes |
| ma60-exit/top1/fixed-pct | 3 | 39.02% | 38.30% | 41.25% | 2.95% | 1.39 | 1.31 | -29.84% | yes |
| ma120-exit/top2/vol-scaled | 4 | 38.67% | 30.57% | 43.71% | 13.14% | 1.28 | 1.13 | -32.44% | yes |
| ma60-exit/top2/fixed-pct | 3 | 32.27% | 29.26% | 32.50% | 3.25% | 1.25 | 1.21 | -26.89% | yes |
| ma120-exit/top1/fixed-pct | 3 | 40.27% | 22.42% | 49.70% | 27.28% | 1.24 | 0.62 | -37.46% | no |
| ma120-exit/top1/vol-scaled | 4 | 52.51% | 36.43% | 60.16% | 23.73% | 1.23 | 0.89 | -44.69% | no |
| ma60-block/top2/vol-scaled | 4 | 39.04% | 30.05% | 45.87% | 15.82% | 1.23 | 1.00 | -34.44% | yes |
| ma120-exit/top2/fixed-pct | 3 | 28.70% | 22.89% | 34.06% | 11.17% | 1.07 | 0.88 | -31.98% | yes |
| ma60-block/top1/vol-scaled | 4 | 41.97% | 18.17% | 58.55% | 40.37% | 1.04 | 0.43 | -44.03% | no |
| none/top2/vol-scaled | 4 | 37.30% | 25.61% | 41.28% | 15.66% | 0.87 | 0.56 | -46.74% | no |
| ma60-block/top2/fixed-pct | 3 | 30.16% | 24.87% | 35.67% | 10.79% | 0.81 | 0.69 | -37.50% | yes |
| none/top1/fixed-pct | 3 | 48.76% | 14.30% | 51.60% | 37.29% | 0.79 | 0.29 | -61.93% | no |
| none/top2/fixed-pct | 3 | 30.80% | 26.14% | 43.60% | 17.46% | 0.60 | 0.56 | -51.24% | yes |
| ma60-block/top1/fixed-pct | 3 | 28.96% | 18.28% | 47.99% | 29.71% | 0.59 | 0.36 | -50.71% | yes |
| none/top1/vol-scaled | 4 | 30.03% | 17.57% | 38.45% | 20.88% | 0.47 | 0.29 | -66.55% | no |

## Best fifteen configurations by Calmar

| Config | Net return | CAGR | Max DD | Calmar | Sharpe | Trades | Exposure | Years > TAIEX |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ma60-exit/top2/vol-3 | 473.98% | 43.81% | -19.17% | 2.29 | 1.68 | 118 | 68.69% | 5/6 |
| ma60-exit/top2/vol-4 | 467.32% | 43.46% | -19.06% | 2.28 | 1.66 | 104 | 68.69% | 6/6 |
| ma60-exit/top1/vol-3 | 928.81% | 62.36% | -27.58% | 2.26 | 1.71 | 62 | 69.31% | 6/6 |
| ma60-exit/top1/vol-4 | 610.26% | 50.32% | -29.46% | 1.71 | 1.42 | 56 | 69.39% | 6/6 |
| ma60-exit/top1/vol-5 | 434.97% | 41.72% | -26.29% | 1.59 | 1.31 | 51 | 69.22% | 5/6 |
| ma60-exit/top2/vol-6 | 297.41% | 33.23% | -20.99% | 1.58 | 1.43 | 91 | 69.06% | 5/6 |
| ma60-exit/top1/fixed-08 | 426.55% | 41.25% | -26.29% | 1.57 | 1.32 | 57 | 69.64% | 4/6 |
| ma60-block/top2/vol-6 | 514.70% | 45.87% | -29.27% | 1.57 | 1.48 | 50 | 80.98% | 3/6 |
| ma120-exit/top1/vol-5 | 740.93% | 55.70% | -36.38% | 1.53 | 1.46 | 45 | 75.33% | 4/6 |
| ma120-exit/top2/vol-4 | 472.14% | 43.71% | -29.97% | 1.46 | 1.49 | 98 | 74.75% | 4/6 |
| none/top1/fixed-10 | 639.65% | 51.60% | -35.99% | 1.43 | 1.41 | 33 | 98.93% | 4/6 |
| ma60-exit/top1/fixed-12 | 375.66% | 38.30% | -27.61% | 1.39 | 1.23 | 48 | 69.39% | 3/6 |
| ma120-exit/top1/vol-4 | 863.42% | 60.16% | -44.69% | 1.35 | 1.49 | 51 | 75.33% | 4/6 |
| ma60-exit/top2/fixed-08 | 243.57% | 29.26% | -22.00% | 1.33 | 1.29 | 107 | 68.98% | 5/6 |
| ma60-block/top1/vol-5 | 817.62% | 58.55% | -44.03% | 1.33 | 1.55 | 35 | 77.56% | 4/6 |

## Half-sample stability

A configuration that only works in one half of the window is not a strategy.

Split at 2024-05-03.

| Config | H1 return | H1 excess | H2 return | H2 excess |
|---|---:|---:|---:|---:|
| ma60-exit/top2/vol-3 | 53.43% | 34.32% | 263.67% | 141.28% |
| ma60-exit/top2/vol-4 | 48.68% | 29.57% | 260.60% | 138.21% |
| ma60-exit/top1/vol-3 | 97.06% | 77.95% | 417.52% | 295.13% |
| ma60-exit/top1/vol-4 | 51.87% | 32.75% | 363.61% | 241.22% |
| ma60-exit/top1/vol-5 | 45.25% | 26.14% | 265.10% | 142.71% |
| ma60-exit/top2/vol-6 | 28.11% | 9.00% | 192.49% | 70.10% |
| ma60-exit/top1/fixed-08 | 22.88% | 3.77% | 324.76% | 202.37% |
| ma60-block/top2/vol-6 | 26.88% | 7.77% | 359.35% | 236.96% |
| ma120-exit/top1/vol-5 | -8.28% | -27.39% | 821.41% | 699.02% |
| ma120-exit/top2/vol-4 | 57.92% | 38.81% | 244.59% | 122.21% |
| none/top1/fixed-10 | 163.15% | 144.03% | 197.59% | 75.21% |
| ma60-exit/top1/fixed-12 | 27.16% | 8.05% | 270.78% | 148.40% |
| ma120-exit/top1/vol-4 | 30.20% | 11.09% | 643.73% | 521.35% |
| ma60-exit/top2/fixed-08 | 17.18% | -1.93% | 182.32% | 59.94% |
| ma60-block/top1/vol-5 | 121.55% | 102.44% | 310.57% | 188.19% |

## v0.4 incumbents, same measurement

| Config | Net return | CAGR | Max DD | Calmar | Years > TAIEX |
|---|---:|---:|---:|---:|---:|
| v0.4 fixed 20/20 | 622.59% | 50.86% | -36.65% | 1.39 | 2/6 |
| v0.4 TP20 + trail 8% | 575.37% | 48.76% | -61.93% | 0.79 | 3/6 |
| v0.4 TP20 + trail 10% | 639.65% | 51.60% | -35.99% | 1.43 | 4/6 |

## Promotion decision

**Shadow candidate:** `ma60-exit/top2/vol-6` (family `ma60-exit/top2/vol-scaled`).

Selected as the median parameter of the most robust family. This is a forward-shadow candidate, not an approved champion; promotion still requires matured out-of-sample evidence.

### Families rejected by the gate

| Family | Reasons |
|---|---|
| ma60-block/top1/vol-scaled | CAGR spread 40.4pp exceeds 35pp; worst-member Calmar below 0.5 |
| none/top1/fixed-pct | CAGR spread 37.3pp exceeds 35pp; worst-member Calmar below 0.5; median Calmar below 0.8 |
| none/top2/fixed-pct | median Calmar below 0.8 |
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

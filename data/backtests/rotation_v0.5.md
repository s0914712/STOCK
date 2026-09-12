# Sector Rotation v0.5 — parameter robustness sweep

Generated: 2026-09-12T05:30:30.537Z
Data snapshot: 2026-09-12T05:30:01.876Z (cached TWSE snapshot)

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
| ma60-exit/top2/vol-scaled | 4 | 36.27% | 30.63% | 42.75% | 12.12% | 1.83 | 1.20 | -25.53% | yes |
| ma60-exit/top1/vol-scaled | 4 | 44.26% | 33.31% | 60.38% | 27.07% | 1.58 | 1.11 | -30.03% | yes |
| ma60-exit/top1/fixed-pct | 3 | 37.36% | 36.65% | 39.56% | 2.91% | 1.33 | 1.25 | -29.84% | yes |
| ma120-exit/top2/vol-scaled | 4 | 38.17% | 28.25% | 45.39% | 17.14% | 1.23 | 1.04 | -33.94% | no |
| ma60-exit/top2/fixed-pct | 3 | 30.29% | 27.98% | 30.52% | 2.54% | 1.17 | 1.14 | -26.89% | yes |
| ma60-block/top2/vol-scaled | 4 | 38.36% | 32.46% | 43.63% | 11.17% | 1.13 | 0.93 | -36.23% | yes |
| ma120-exit/top1/vol-scaled | 4 | 43.26% | 40.01% | 67.43% | 27.42% | 1.11 | 0.78 | -51.26% | no |
| ma60-block/top1/vol-scaled | 4 | 41.08% | 21.02% | 51.73% | 30.71% | 0.98 | 0.50 | -49.55% | no |
| none/top1/fixed-pct | 3 | 46.80% | 10.81% | 50.45% | 39.63% | 0.92 | 0.22 | -55.11% | no |
| none/top2/vol-scaled | 4 | 34.65% | 25.73% | 42.78% | 17.06% | 0.80 | 0.57 | -45.80% | no |
| ma120-exit/top2/fixed-pct | 3 | 22.49% | 20.49% | 32.59% | 12.10% | 0.74 | 0.70 | -30.30% | no |
| none/top2/fixed-pct | 3 | 30.67% | 22.39% | 42.55% | 20.16% | 0.74 | 0.49 | -45.41% | no |
| ma60-block/top2/fixed-pct | 3 | 29.53% | 23.57% | 29.82% | 6.26% | 0.73 | 0.67 | -40.99% | yes |
| ma120-exit/top1/fixed-pct | 3 | 27.99% | 16.40% | 48.12% | 31.71% | 0.69 | 0.39 | -41.64% | no |
| ma60-block/top1/fixed-pct | 3 | 28.34% | 14.47% | 39.99% | 25.52% | 0.58 | 0.29 | -50.71% | yes |
| none/top1/vol-scaled | 4 | 29.42% | 21.18% | 39.10% | 17.91% | 0.55 | 0.38 | -66.34% | no |

## Best fifteen configurations by Calmar

| Config | Net return | CAGR | Max DD | Calmar | Sharpe | Trades | Exposure | Years > TAIEX |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ma60-exit/top2/vol-3 | 455.47% | 42.75% | -19.17% | 2.23 | 1.67 | 118 | 66.60% | 5/6 |
| ma60-exit/top1/vol-3 | 873.39% | 60.38% | -27.58% | 2.19 | 1.69 | 63 | 67.30% | 5/6 |
| ma60-exit/top2/vol-4 | 428.80% | 41.30% | -19.06% | 2.17 | 1.63 | 104 | 66.60% | 6/6 |
| ma120-exit/top1/vol-4 | 1097.72% | 67.43% | -37.22% | 1.81 | 1.64 | 52 | 75.37% | 3/6 |
| ma60-exit/top1/vol-4 | 572.00% | 48.51% | -29.46% | 1.65 | 1.40 | 57 | 67.38% | 6/6 |
| ma120-exit/top2/vol-4 | 506.72% | 45.39% | -29.21% | 1.55 | 1.55 | 94 | 74.67% | 4/6 |
| ma60-exit/top1/vol-5 | 406.16% | 40.02% | -26.29% | 1.52 | 1.28 | 52 | 67.22% | 4/6 |
| ma60-exit/top1/fixed-08 | 398.18% | 39.56% | -26.29% | 1.51 | 1.29 | 58 | 67.63% | 4/6 |
| ma60-exit/top2/vol-6 | 270.42% | 31.23% | -20.99% | 1.49 | 1.38 | 91 | 66.97% | 5/6 |
| ma120-exit/top2/vol-5 | 384.74% | 38.77% | -28.67% | 1.35 | 1.42 | 85 | 74.30% | 4/6 |
| ma60-block/top2/vol-6 | 472.10% | 43.63% | -32.30% | 1.35 | 1.48 | 48 | 82.13% | 3/6 |
| ma120-exit/top2/fixed-08 | 289.15% | 32.59% | -24.17% | 1.35 | 1.32 | 86 | 74.01% | 3/6 |
| none/top1/fixed-10 | 535.58% | 46.80% | -34.81% | 1.34 | 1.35 | 31 | 99.01% | 4/6 |
| ma60-exit/top1/fixed-12 | 350.04% | 36.65% | -27.61% | 1.33 | 1.20 | 49 | 67.38% | 3/6 |
| ma120-exit/top1/fixed-08 | 563.53% | 48.12% | -37.46% | 1.28 | 1.34 | 49 | 75.29% | 3/6 |

## Half-sample stability

A configuration that only works in one half of the window is not a strategy.

Split at 2024-03-18.

| Config | H1 return | H1 excess | H2 return | H2 excess |
|---|---:|---:|---:|---:|
| ma60-exit/top2/vol-3 | 47.72% | 33.77% | 284.98% | 152.66% |
| ma60-exit/top1/vol-3 | 92.01% | 78.06% | 426.58% | 294.26% |
| ma60-exit/top2/vol-4 | 44.88% | 30.93% | 265.20% | 132.88% |
| ma120-exit/top1/vol-4 | 46.99% | 33.04% | 708.09% | 575.77% |
| ma60-exit/top1/vol-4 | 47.97% | 34.03% | 366.06% | 233.74% |
| ma120-exit/top2/vol-4 | 44.36% | 30.41% | 335.58% | 203.26% |
| ma60-exit/top1/vol-5 | 37.54% | 23.59% | 267.03% | 134.71% |
| ma60-exit/top1/fixed-08 | 27.37% | 13.42% | 332.20% | 199.88% |
| ma60-exit/top2/vol-6 | 29.20% | 15.25% | 190.98% | 58.66% |
| ma120-exit/top2/vol-5 | -2.52% | -16.47% | 388.33% | 256.01% |
| ma60-block/top2/vol-6 | 14.79% | 0.84% | 394.58% | 262.26% |
| ma120-exit/top2/fixed-08 | 40.55% | 26.60% | 187.48% | 55.16% |
| none/top1/fixed-10 | 121.16% | 107.21% | 223.35% | 91.03% |
| ma60-exit/top1/fixed-12 | 20.42% | 6.47% | 272.74% | 140.42% |
| ma120-exit/top1/fixed-08 | 68.19% | 54.24% | 295.97% | 163.65% |

## v0.4 incumbents, same measurement

| Config | Net return | CAGR | Max DD | Calmar | Years > TAIEX |
|---|---:|---:|---:|---:|---:|
| v0.4 fixed 20/20 | 179.57% | 23.79% | -60.30% | 0.39 | 2/6 |
| v0.4 TP20 + trail 8% | 615.36% | 50.45% | -55.11% | 0.92 | 3/6 |
| v0.4 TP20 + trail 10% | 535.58% | 46.80% | -34.81% | 1.34 | 4/6 |

## Promotion decision

**Shadow candidate:** `ma60-exit/top2/vol-6` (family `ma60-exit/top2/vol-scaled`).

Selected as the median parameter of the most robust family. This is a forward-shadow candidate, not an approved champion; promotion still requires matured out-of-sample evidence.

### Families rejected by the gate

| Family | Reasons |
|---|---|
| ma60-block/top1/vol-scaled | worst-member Calmar below 0.5 |
| none/top1/fixed-pct | CAGR spread 39.6pp exceeds 35pp; worst-member Calmar below 0.5 |
| ma120-exit/top2/fixed-pct | median Calmar below 0.8 |
| none/top2/fixed-pct | worst-member Calmar below 0.5; median Calmar below 0.8 |
| ma60-block/top2/fixed-pct | median Calmar below 0.8 |
| ma120-exit/top1/fixed-pct | worst-member Calmar below 0.5; median Calmar below 0.8 |
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

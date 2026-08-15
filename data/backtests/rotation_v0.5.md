# Sector Rotation v0.5 — parameter robustness sweep

Generated: 2026-08-15T02:25:40.810Z
Data snapshot: 2026-08-15T02:25:12.425Z (cached TWSE snapshot)

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
| ma60-exit/top2/vol-scaled | 4 | 34.53% | 28.96% | 40.92% | 11.97% | 1.74 | 1.13 | -25.53% | no |
| ma60-exit/top1/vol-scaled | 4 | 39.68% | 29.07% | 55.28% | 26.21% | 1.42 | 0.97 | -30.03% | no |
| ma60-exit/top1/fixed-pct | 3 | 32.99% | 32.30% | 35.12% | 2.82% | 1.17 | 1.11 | -29.84% | no |
| ma60-exit/top2/fixed-pct | 3 | 28.63% | 27.60% | 28.85% | 1.26% | 1.11 | 1.07 | -26.89% | no |
| ma120-exit/top2/vol-scaled | 4 | 34.25% | 24.41% | 40.52% | 16.12% | 1.04 | 0.90 | -33.44% | no |
| ma60-block/top2/vol-scaled | 4 | 34.11% | 28.11% | 38.57% | 10.46% | 1.00 | 0.84 | -36.01% | no |
| ma60-block/top1/vol-scaled | 4 | 35.74% | 15.17% | 45.08% | 29.91% | 0.82 | 0.36 | -53.35% | no |
| none/top2/vol-scaled | 4 | 32.37% | 22.63% | 42.09% | 19.45% | 0.77 | 0.49 | -47.20% | no |
| none/top2/fixed-pct | 3 | 30.31% | 17.88% | 38.82% | 20.94% | 0.75 | 0.37 | -48.81% | no |
| ma120-exit/top2/fixed-pct | 3 | 19.51% | 17.57% | 25.14% | 7.57% | 0.70 | 0.59 | -32.65% | no |
| none/top1/fixed-pct | 3 | 40.59% | 7.44% | 43.32% | 35.88% | 0.69 | 0.15 | -62.46% | no |
| ma60-block/top2/fixed-pct | 3 | 24.91% | 18.18% | 24.92% | 6.74% | 0.64 | 0.51 | -38.98% | no |
| ma120-exit/top1/vol-scaled | 4 | 33.58% | 29.30% | 48.13% | 18.83% | 0.62 | 0.56 | -57.54% | no |
| ma60-block/top1/fixed-pct | 3 | 20.31% | 8.47% | 32.91% | 24.44% | 0.41 | 0.17 | -50.71% | no |
| ma120-exit/top1/fixed-pct | 3 | 18.74% | 7.60% | 35.20% | 27.60% | 0.38 | 0.14 | -54.37% | no |
| none/top1/vol-scaled | 4 | 19.54% | 14.36% | 30.81% | 16.44% | 0.33 | 0.23 | -73.55% | no |

## Best fifteen configurations by Calmar

| Config | Net return | CAGR | Max DD | Calmar | Sharpe | Trades | Exposure | Years > TAIEX |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ma60-exit/top2/vol-3 | 422.09% | 40.92% | -19.17% | 2.14 | 1.62 | 119 | 65.77% | 5/6 |
| ma60-exit/top2/vol-4 | 397.02% | 39.49% | -19.06% | 2.07 | 1.57 | 105 | 65.77% | 6/6 |
| ma60-exit/top1/vol-3 | 733.09% | 55.28% | -27.58% | 2.00 | 1.60 | 63 | 66.39% | 4/6 |
| ma60-exit/top1/vol-4 | 475.15% | 43.78% | -29.46% | 1.49 | 1.31 | 57 | 66.47% | 4/6 |
| ma60-exit/top2/vol-6 | 248.16% | 29.56% | -20.99% | 1.41 | 1.33 | 92 | 66.14% | 5/6 |
| ma60-exit/top1/vol-5 | 333.20% | 35.57% | -26.29% | 1.35 | 1.18 | 52 | 66.31% | 3/6 |
| ma60-exit/top1/fixed-08 | 326.38% | 35.12% | -26.29% | 1.34 | 1.19 | 58 | 66.72% | 3/6 |
| ma120-exit/top2/vol-4 | 414.94% | 40.52% | -31.21% | 1.30 | 1.41 | 96 | 72.86% | 3/6 |
| ma60-exit/top2/fixed-08 | 223.49% | 27.60% | -22.00% | 1.25 | 1.26 | 107 | 66.06% | 5/6 |
| ma60-block/top2/vol-6 | 373.46% | 38.09% | -32.31% | 1.18 | 1.34 | 49 | 81.43% | 2/6 |
| ma60-exit/top1/fixed-12 | 285.17% | 32.30% | -27.61% | 1.17 | 1.10 | 49 | 66.47% | 2/6 |
| ma60-exit/top2/vol-5 | 240.45% | 28.96% | -25.53% | 1.13 | 1.29 | 96 | 65.90% | 5/6 |
| ma60-block/top2/vol-4 | 381.38% | 38.57% | -34.32% | 1.12 | 1.39 | 69 | 77.64% | 3/6 |
| ma60-exit/top2/fixed-12 | 236.27% | 28.63% | -25.84% | 1.11 | 1.26 | 92 | 66.14% | 4/6 |
| ma60-exit/top1/fixed-10 | 294.93% | 32.99% | -29.84% | 1.11 | 1.14 | 52 | 66.23% | 2/6 |

## Half-sample stability

A configuration that only works in one half of the window is not a strategy.

Split at 2024-02-16.

| Config | H1 return | H1 excess | H2 return | H2 excess |
|---|---:|---:|---:|---:|
| ma60-exit/top2/vol-3 | 31.96% | 21.59% | 311.99% | 165.79% |
| ma60-exit/top2/vol-4 | 31.37% | 21.00% | 284.17% | 137.97% |
| ma60-exit/top1/vol-3 | 71.06% | 60.69% | 342.96% | 196.76% |
| ma60-exit/top1/vol-4 | 31.83% | 21.45% | 278.76% | 132.56% |
| ma60-exit/top2/vol-6 | 7.04% | -3.33% | 193.58% | 47.38% |
| ma60-exit/top1/vol-5 | 12.30% | 1.93% | 217.26% | 71.06% |
| ma60-exit/top1/fixed-08 | 13.47% | 3.09% | 226.27% | 80.07% |
| ma120-exit/top2/vol-4 | 26.79% | 16.42% | 331.08% | 184.88% |
| ma60-exit/top2/fixed-08 | 4.21% | -6.16% | 212.02% | 65.82% |
| ma60-block/top2/vol-6 | -3.01% | -13.38% | 379.11% | 232.91% |
| ma60-exit/top1/fixed-12 | -1.68% | -12.06% | 208.30% | 62.10% |
| ma60-exit/top2/vol-5 | -2.90% | -13.27% | 217.78% | 71.58% |
| ma60-block/top2/vol-4 | 47.85% | 37.48% | 261.60% | 115.40% |
| ma60-exit/top2/fixed-12 | -4.31% | -14.68% | 208.80% | 62.60% |
| ma60-exit/top1/fixed-10 | -4.71% | -15.08% | 212.52% | 66.32% |

## v0.4 incumbents, same measurement

| Config | Net return | CAGR | Max DD | Calmar | Years > TAIEX |
|---|---:|---:|---:|---:|---:|
| v0.4 fixed 20/20 | 398.80% | 39.60% | -34.95% | 1.13 | 1/6 |
| v0.4 TP20 + trail 8% | 466.19% | 43.32% | -62.46% | 0.69 | 2/6 |
| v0.4 TP20 + trail 10% | 416.22% | 40.59% | -38.77% | 1.05 | 3/6 |

## Promotion decision

**Shadow candidate:** `ma60-exit/top2/vol-6` (family `ma60-exit/top2/vol-scaled`).

Selected as the median parameter of the most robust family. This is a forward-shadow candidate, not an approved champion; promotion still requires matured out-of-sample evidence.

### Families rejected by the gate

| Family | Reasons |
|---|---|
| ma60-block/top1/vol-scaled | worst-member Calmar below 0.5 |
| none/top2/vol-scaled | worst-member Calmar below 0.5; median Calmar below 0.8 |
| none/top2/fixed-pct | worst-member Calmar below 0.5; median Calmar below 0.8 |
| ma120-exit/top2/fixed-pct | median Calmar below 0.8 |
| none/top1/fixed-pct | CAGR spread 35.9pp exceeds 35pp; worst-member Calmar below 0.5; median Calmar below 0.8 |
| ma60-block/top2/fixed-pct | median Calmar below 0.8 |
| ma120-exit/top1/vol-scaled | median Calmar below 0.8 |
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

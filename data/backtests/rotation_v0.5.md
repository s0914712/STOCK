# Sector Rotation v0.5 — parameter robustness sweep

Generated: 2026-11-14T07:24:58.278Z
Data snapshot: 2026-11-14T07:24:36.476Z (cached TWSE snapshot)

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
| ma60-exit/top2/vol-scaled | 4 | 35.14% | 31.08% | 40.54% | 9.46% | 1.89 | 1.50 | -20.69% | yes |
| ma60-exit/top1/vol-scaled | 4 | 46.10% | 32.50% | 65.25% | 32.75% | 1.75 | 1.10 | -29.62% | yes |
| ma60-exit/top2/fixed-pct | 3 | 30.27% | 27.98% | 31.13% | 3.14% | 1.40 | 1.32 | -22.87% | yes |
| ma60-exit/top1/fixed-pct | 3 | 36.53% | 35.82% | 38.72% | 2.90% | 1.32 | 1.24 | -29.42% | yes |
| ma120-exit/top2/vol-scaled | 4 | 35.60% | 24.38% | 40.81% | 16.43% | 1.21 | 0.79 | -30.96% | yes |
| ma60-block/top2/vol-scaled | 4 | 32.43% | 27.10% | 40.71% | 13.61% | 1.08 | 0.77 | -36.69% | yes |
| ma120-exit/top1/vol-scaled | 4 | 42.37% | 37.66% | 66.16% | 28.50% | 1.08 | 0.76 | -51.45% | no |
| ma60-block/top1/vol-scaled | 4 | 37.81% | 20.92% | 50.36% | 29.44% | 0.91 | 0.49 | -49.75% | no |
| none/top1/fixed-pct | 3 | 48.65% | 12.21% | 49.14% | 36.93% | 0.89 | 0.25 | -55.07% | no |
| ma120-exit/top2/fixed-pct | 3 | 24.25% | 20.77% | 35.51% | 14.74% | 0.87 | 0.86 | -28.11% | yes |
| none/top2/fixed-pct | 3 | 31.86% | 25.10% | 42.30% | 17.20% | 0.79 | 0.66 | -40.16% | yes |
| ma120-exit/top1/fixed-pct | 3 | 30.07% | 14.36% | 50.11% | 35.75% | 0.74 | 0.34 | -41.87% | no |
| none/top2/vol-scaled | 4 | 32.17% | 21.73% | 36.87% | 15.13% | 0.74 | 0.51 | -44.19% | yes |
| ma60-block/top2/fixed-pct | 3 | 25.65% | 25.11% | 29.42% | 4.32% | 0.71 | 0.69 | -37.50% | yes |
| ma60-block/top1/fixed-pct | 3 | 26.93% | 9.98% | 38.40% | 28.41% | 0.55 | 0.20 | -50.71% | yes |
| none/top1/vol-scaled | 4 | 29.07% | 23.33% | 34.17% | 10.84% | 0.54 | 0.43 | -66.48% | no |

## Best fifteen configurations by Calmar

| Config | Net return | CAGR | Max DD | Calmar | Sharpe | Trades | Exposure | Years > TAIEX |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ma60-exit/top2/vol-4 | 413.81% | 40.54% | -16.31% | 2.49 | 1.61 | 103 | 67.86% | 6/6 |
| ma60-exit/top1/vol-3 | 1019.91% | 65.25% | -27.58% | 2.37 | 1.78 | 62 | 68.48% | 5/6 |
| ma60-exit/top2/vol-3 | 390.29% | 39.17% | -19.17% | 2.04 | 1.57 | 116 | 67.82% | 5/6 |
| ma60-exit/top1/vol-4 | 673.48% | 53.01% | -26.29% | 2.02 | 1.49 | 56 | 68.56% | 5/6 |
| ma120-exit/top1/vol-4 | 1049.79% | 66.16% | -37.22% | 1.78 | 1.59 | 53 | 74.50% | 3/6 |
| ma60-exit/top2/vol-6 | 267.48% | 31.08% | -17.81% | 1.75 | 1.38 | 89 | 68.23% | 5/6 |
| ma120-exit/top2/fixed-08 | 331.24% | 35.51% | -23.16% | 1.53 | 1.39 | 87 | 73.27% | 3/6 |
| ma60-exit/top2/vol-5 | 267.85% | 31.10% | -20.69% | 1.50 | 1.36 | 93 | 67.99% | 5/6 |
| ma60-exit/top1/vol-5 | 390.42% | 39.18% | -26.29% | 1.49 | 1.25 | 51 | 68.40% | 5/6 |
| ma60-exit/top1/fixed-08 | 382.69% | 38.72% | -26.29% | 1.47 | 1.26 | 57 | 68.81% | 4/6 |
| ma60-exit/top2/fixed-08 | 227.60% | 27.98% | -19.59% | 1.43 | 1.27 | 103 | 68.15% | 5/6 |
| ma60-exit/top2/fixed-10 | 268.17% | 31.13% | -22.17% | 1.40 | 1.37 | 91 | 67.74% | 5/6 |
| ma120-exit/top2/vol-4 | 418.67% | 40.81% | -29.21% | 1.40 | 1.43 | 97 | 73.93% | 4/6 |
| ma60-block/top2/vol-6 | 416.89% | 40.71% | -29.27% | 1.39 | 1.35 | 48 | 82.55% | 3/6 |
| none/top1/fixed-10 | 573.06% | 48.65% | -35.06% | 1.39 | 1.35 | 33 | 98.84% | 4/6 |

## Half-sample stability

A configuration that only works in one half of the window is not a strategy.

Split at 2024-05-17.

| Config | H1 return | H1 excess | H2 return | H2 excess |
|---|---:|---:|---:|---:|
| ma60-exit/top2/vol-4 | 64.15% | 43.59% | 220.68% | 115.23% |
| ma60-exit/top1/vol-3 | 185.12% | 164.57% | 417.55% | 312.10% |
| ma60-exit/top2/vol-3 | 59.13% | 38.58% | 265.05% | 159.60% |
| ma60-exit/top1/vol-4 | 119.82% | 99.27% | 242.73% | 137.28% |
| ma120-exit/top1/vol-4 | 108.47% | 87.92% | 494.81% | 389.36% |
| ma60-exit/top2/vol-6 | 44.45% | 23.90% | 159.70% | 54.25% |
| ma120-exit/top2/fixed-08 | 74.17% | 53.62% | 184.11% | 78.66% |
| ma60-exit/top2/vol-5 | 34.88% | 14.33% | 177.97% | 72.52% |
| ma60-exit/top1/vol-5 | 76.98% | 56.43% | 183.68% | 78.23% |
| ma60-exit/top1/fixed-08 | 49.73% | 29.18% | 287.17% | 181.72% |
| ma60-exit/top2/fixed-08 | 35.22% | 14.67% | 181.37% | 75.92% |
| ma60-exit/top2/fixed-10 | 31.66% | 11.11% | 223.35% | 117.90% |
| ma120-exit/top2/vol-4 | 72.93% | 52.38% | 219.34% | 113.89% |
| ma60-block/top2/vol-6 | 39.56% | 19.01% | 297.07% | 191.62% |
| none/top1/fixed-10 | 137.20% | 116.65% | 193.76% | 88.31% |

## v0.4 incumbents, same measurement

| Config | Net return | CAGR | Max DD | Calmar | Years > TAIEX |
|---|---:|---:|---:|---:|---:|
| v0.4 fixed 20/20 | 202.07% | 25.84% | -60.31% | 0.43 | 2/6 |
| v0.4 TP20 + trail 8% | 583.75% | 49.14% | -55.07% | 0.89 | 3/6 |
| v0.4 TP20 + trail 10% | 573.06% | 48.65% | -35.06% | 1.39 | 4/6 |

## Promotion decision

**Shadow candidate:** `ma60-exit/top2/vol-5` (family `ma60-exit/top2/vol-scaled`).

Selected as the median parameter of the most robust family. This is a forward-shadow candidate, not an approved champion; promotion still requires matured out-of-sample evidence.

### Families rejected by the gate

| Family | Reasons |
|---|---|
| ma60-block/top1/vol-scaled | worst-member Calmar below 0.5 |
| none/top1/fixed-pct | CAGR spread 36.9pp exceeds 35pp; worst-member Calmar below 0.5 |
| none/top2/fixed-pct | median Calmar below 0.8 |
| ma120-exit/top1/fixed-pct | CAGR spread 35.8pp exceeds 35pp; worst-member Calmar below 0.5; median Calmar below 0.8 |
| none/top2/vol-scaled | median Calmar below 0.8 |
| ma60-block/top2/fixed-pct | median Calmar below 0.8 |
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

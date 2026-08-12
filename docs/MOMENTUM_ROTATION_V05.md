# Momentum Rotation Challenger v0.5 — Walk-forward Backtest

Period: **2021-08-11 → 2026-08-12**

All ML rows are produced by monthly expanding walk-forward retraining. A training row is eligible only when its full 10-trading-day label matured before the forecast month.

| Layer | Net return | CAGR | Max DD | Sharpe | Turnover | Precision@K | Excess vs TAIEX | Excess vs 0050 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| momentum_only | 92.63% | 14.57% | -54.15% | 0.53 | 184.77x | 38.60% | -71.59% | 114.32% |
| momentum_trend | -16.77% | -3.74% | -57.77% | 0.10 | 260.87x | 38.83% | -181.00% | 4.92% |
| baseline | 0.00% | 0.00% | 0.00% | — | 0.00x | — | -164.22% | 21.70% |
| lightgbm | 0.00% | 0.00% | 0.00% | — | 0.00x | — | -164.22% | 21.70% |
| xgboost | 0.00% | 0.00% | 0.00% | — | 0.00x | — | -164.22% | 21.70% |
| ensemble | 0.00% | 0.00% | 0.00% | — | 0.00x | — | -164.22% | 21.70% |
| full_portfolio | 0.00% | 0.00% | 0.00% | — | 0.00x | — | -164.22% | 21.70% |

## Interpretation gate

The ML layer is not promoted merely for higher AUC. It must beat `momentum_trend` after costs on portfolio return / drawdown / Sharpe / turnover / Precision@K and remain superior in forward Shadow data.

`full_portfolio` adds the v0.5 decision layer: Top-5 entry, Top-10 hysteresis, probability 0.60 entry / 0.50 exit, trend-failure exit, +20% take-profit and -20% stop-loss.

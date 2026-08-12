# Sector Rotation Challenger v0.3

Generated: 2026-08-12T05:12:58.756Z

## Test definition

- Period: 2024-08-12 to 2026-08-11 (485 TAIEX trading days)
- Universe: 半導體, AI伺服器, PCB, 金融, 航運, 電子零組件
- Signal: trailing 10-trading-day equal-weight return of the three representative stocks in each sector
- Primary strategy: only enter when the strongest sector has a **positive** 10-day return; signal after close, enter next session open; hold until +20% take-profit or -20% stop-loss is observed at a close; exit/reselect at the next session open
- Costs: buy commission 0.1425%, sell commission 0.1425%, stock transaction tax 0.300%
- Price-return test only; dividends are not included

## Primary: positive 10d leader, hold to +20% / -20%

| Metric | Result |
|---|---:|
| Net total return | 400.67% |
| Annualized return | 130.93% |
| TAIEX price return | 107.23% |
| Excess vs TAIEX | 293.44% |
| Max drawdown | -31.81% |
| Trades | 14 |
| Win rate | 78.57% |
| Avg trade | 13.71% |
| Median holding days | 24.5 |
| Exposure | 98.56% |
| Take-profit exits | 11 |
| Stop-loss exits | 2 |

## Critical baselines

| Strategy | Net return | Excess vs TAIEX | Max DD | Trades |
|---|---:|---:|---:|---:|
| Primary positive-gate 10d / 20-20 | 400.67% | 293.44% | -31.81% | 14 |
| Ungated (buy least-bad even if all negative) | 254.35% | 147.12% | -29.61% | 10 |
| Active 10d leader switching | 129.58% | 22.35% | -26.43% | 122 |
| Same 18 stocks equal-weight buy & hold | 124.39% | N/A | -29.46% | 1 |
| TAIEX price index | 107.23% | 0.00% | N/A | 1 |

Rotation alpha vs the curated 18-stock buy-and-hold proxy: **276.28%**.

## Robustness grid (positive-momentum gate)

| Lookback | TP/SL | Net return | Excess vs TAIEX | Max DD | Trades |
|---:|---:|---:|---:|---:|---:|
| 5 | 15% | 213.63% | 106.40% | -29.20% | 11 |
| 5 | 20% | 39.15% | -68.08% | -25.51% | 3 |
| 5 | 25% | 67.41% | -39.82% | -39.04% | 5 |
| 10 | 15% | 203.71% | 96.48% | -31.92% | 15 |
| 10 | 20% | 400.67% | 293.44% | -31.81% | 14 |
| 10 | 25% | 176.29% | 69.06% | -39.77% | 9 |
| 20 | 15% | 311.25% | 204.02% | -30.35% | 15 |
| 20 | 20% | 103.22% | -4.01% | -32.22% | 11 |
| 20 | 25% | 492.35% | 385.12% | -30.94% | 9 |

Robustness: 6/9 parameter combinations beat TAIEX; 9/9 were net positive.

## Primary trades

| Entry | Sector | Signal momentum | Exit | Reason | Net return | Hold days |
|---|---|---:|---|---|---:|---:|
| 2024-08-13 | 航運 | 10.04% | 2024-09-30 | take_profit | 19.52% | 33 |
| 2024-09-30 | 航運 | 23.61% | 2025-04-09 | stop_loss | -24.30% | 122 |
| 2025-04-17 | 航運 | 0.19% | 2025-05-19 | take_profit | 24.66% | 21 |
| 2025-05-19 | 航運 | 25.37% | 2025-07-10 | stop_loss | -22.43% | 37 |
| 2025-07-10 | PCB | 10.11% | 2025-08-11 | take_profit | 23.15% | 22 |
| 2025-08-11 | PCB | 13.70% | 2025-11-14 | take_profit | 18.21% | 65 |
| 2025-11-14 | PCB | 12.99% | 2026-01-13 | take_profit | 21.29% | 40 |
| 2026-01-13 | 半導體 | 8.99% | 2026-01-28 | take_profit | 21.99% | 11 |
| 2026-01-28 | PCB | 22.53% | 2026-03-16 | take_profit | 25.98% | 25 |
| 2026-03-16 | PCB | 5.42% | 2026-04-21 | take_profit | 24.33% | 24 |
| 2026-04-21 | 電子零組件 | 29.79% | 2026-05-15 | take_profit | 23.74% | 17 |
| 2026-05-15 | 半導體 | 27.11% | 2026-05-28 | take_profit | 21.32% | 9 |
| 2026-05-28 | 電子零組件 | 35.43% | 2026-06-17 | take_profit | 21.24% | 14 |
| 2026-06-17 | 金融 | 16.50% | 2026-08-11 | end_of_test | -6.79% | 37 |

## Interpretation guardrails

This is still a **curated proxy-universe** backtest: today's six sector definitions and representative stocks are applied backward for two years. That can create survivorship / hindsight selection bias, especially for thematic groups such as AI servers and PCB. The equal-weight 18-stock buy-and-hold comparison helps reveal whether returns come from rotation or simply from having selected strong stocks, but it does not eliminate the bias. Before treating this as investable evidence, v0.4 should repeat the test on point-in-time industry membership or official investable sector/index series.

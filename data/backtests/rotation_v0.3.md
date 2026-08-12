# Sector Rotation Challenger v0.3

Generated: 2026-08-12T05:08:02.034Z

## Test definition

- Period: 2024-08-12 to 2026-08-11 (485 TAIEX trading days)
- Universe: 半導體, AI伺服器, PCB, 金融, 航運, 電子零組件
- Signal: trailing 10-trading-day equal-weight return of the three representative stocks in each sector
- Exact strategy: when flat, select the strongest sector after the close; enter at the next session open; hold until +20% take-profit or -20% stop-loss is observed at a close; exit/reselect at the next session open
- Costs: buy commission 0.1425%, sell commission 0.1425%, stock transaction tax 0.300%
- Price-return test only; dividends are not included

## Primary: 10d leader, hold to +20% / -20%

| Metric | Result |
|---|---:|
| Net total return | 254.35% |
| Annualized return | 92.96% |
| TAIEX price return | 107.23% |
| Excess vs TAIEX | 147.12% |
| Max drawdown | -29.61% |
| Trades | 10 |
| Win rate | 80.00% |
| Avg trade | 14.81% |
| Median holding days | 35 |
| Exposure | 99.79% |
| Take-profit exits | 8 |
| Stop-loss exits | 1 |

## Active comparison: switch whenever the 10d leader changes

| Metric | Hold-to-20/20 | Active leader rotation |
|---|---:|---:|
| Net total return | 254.35% | 116.76% |
| Excess vs TAIEX | 147.12% | 9.53% |
| Max drawdown | -29.61% | -41.02% |
| Trades | 10 | 123 |
| Win rate | 80.00% | 48.78% |

## Robustness grid

| Lookback | TP/SL | Net return | Excess vs TAIEX | Max DD | Trades |
|---:|---:|---:|---:|---:|---:|
| 5 | 15% | 222.85% | 115.62% | -29.31% | 11 |
| 5 | 20% | 39.15% | -68.08% | -25.51% | 3 |
| 5 | 25% | 67.41% | -39.82% | -39.04% | 5 |
| 10 | 15% | 201.60% | 94.37% | -32.40% | 15 |
| 10 | 20% | 254.35% | 147.12% | -29.61% | 10 |
| 10 | 25% | 176.29% | 69.06% | -39.77% | 9 |
| 20 | 15% | 321.97% | 214.74% | -29.72% | 15 |
| 20 | 20% | 193.57% | 86.34% | -29.61% | 11 |
| 20 | 25% | 492.35% | 385.12% | -30.94% | 9 |

Robustness: 7/9 parameter combinations beat TAIEX; 9/9 were net positive.

## Primary trades

| Entry | Sector | 10d momentum | Exit | Reason | Net return | Hold days |
|---|---|---:|---|---|---:|---:|
| 2024-08-13 | 航運 | 10.04% | 2024-09-30 | take_profit | 19.52% | 33 |
| 2024-09-30 | 航運 | 23.61% | 2025-04-09 | stop_loss | -24.30% | 122 |
| 2025-04-09 | 半導體 | -12.75% | 2025-07-21 | take_profit | 20.05% | 71 |
| 2025-07-21 | 電子零組件 | 8.09% | 2026-01-07 | take_profit | 21.75% | 116 |
| 2026-01-07 | 電子零組件 | 18.15% | 2026-04-13 | take_profit | 21.39% | 58 |
| 2026-04-13 | PCB | 16.45% | 2026-04-27 | take_profit | 30.14% | 10 |
| 2026-04-27 | 半導體 | 28.00% | 2026-05-08 | take_profit | 20.05% | 8 |
| 2026-05-08 | 半導體 | 28.16% | 2026-05-27 | take_profit | 25.85% | 13 |
| 2026-05-27 | 電子零組件 | 31.92% | 2026-06-17 | take_profit | 20.45% | 15 |
| 2026-06-17 | 金融 | 16.50% | 2026-08-11 | end_of_test | -6.79% | 37 |

## Interpretation guardrails

This is a historical simulation over a small six-sector proxy universe. It is not a calibrated forecast and does not include dividends, market impact, slippage beyond next-open execution, constituent changes, or TPEx names. A strategy that works only at one parameter choice should be treated as fragile rather than validated.

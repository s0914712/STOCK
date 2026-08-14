# Leverage 50/50 Challenger v6 — Rolling-Window Confirmation

Fixed method: **asym35_77_5_t50**. Cash assumption: **50% of the one-month-lagged CBC five-bank average 1Y fixed deposit rate**. No strategy parameter is changed from the v5 accepted primary.

Confirmation gate registered before this run: among complete 3-year rolling windows, return must beat Taiwan 50 Total Return in at least 5/9, Sharpe in at least 5/9, and drawdown must stay within 5 percentage points in at least 7/9. This is an additional confirmation layer; it does not replace the v5 full/holdout/regime gate.

| Window | Strategy return | Taiwan50 TR | Relative | Strategy Sharpe | TR Sharpe | Strategy DD | TR DD |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2015-2017 | 32.69% | 34.23% | -1.53% | 0.779 | 0.765 | -22.35% | -21.29% |
| 2016-2018 | 38.72% | 39.58% | -0.86% | 0.777 | 0.864 | -19.20% | -16.41% |
| 2017-2019 | 57.31% | 51.31% | 6.01% | 1.123 | 1.098 | -17.78% | -17.96% |
| 2018-2020 | 78.90% | 67.95% | 10.95% | 1.133 | 1.069 | -31.76% | -27.63% |
| 2019-2021 | 160.44% | 121.43% | 39.01% | 1.715 | 1.571 | -33.64% | -27.63% |
| 2020-2022 | 66.69% | 25.83% | 40.86% | 0.884 | 0.473 | -30.77% | -33.96% |
| 2021-2023 | 34.47% | 22.85% | 11.62% | 0.592 | 0.467 | -32.04% | -33.96% |
| 2022-2024 | 61.15% | 50.02% | 11.13% | 0.939 | 0.754 | -26.57% | -33.96% |
| 2023-2025 | 140.39% | 162.90% | -22.51% | 1.250 | 1.570 | -41.37% | -27.52% |

## Confirmation verdict

- 3Y return wins: **6/9**
- 3Y Sharpe wins: **7/9**
- 3Y DD within 5pp: **7/9**
- Confirmation gate: **PASS**

**The v5 method survives the fixed rolling-window confirmation.** It remains a research challenger rather than a production mandate; live Shadow evidence is still required.

Calendar-year comparisons are retained in JSON as diagnostics, not used to tune or redefine the method.

Research only, not investment advice.

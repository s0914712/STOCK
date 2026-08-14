# Leverage 50/50 Challenger v4 — Common-Calendar Validation

Period: **2014-10-31 → 2026-08-13**

This run changes no strategy parameter. It re-evaluates the pre-registered v3 asymmetric-band grid after sampling the Taiwan 50 Total Return Index on exactly the same tradable common dates used by 00631L/0050. This avoids comparing a leveraged ETF return series with suspended/missing sessions against an index Sharpe calculated on extra dates.

Aligned Taiwan 50 Total Return: 879.80%, DD -33.96%, Sharpe 1.0863, observations 2865.

| Strategy | Return | Max DD | Sharpe | Holdout return | Holdout Sharpe | Regime wins | Gate |
|---|---:|---:|---:|---:|---:|---:|---|
| asym35_75_t52_5 | 1088.01% | -35.13% | 1.0850 | 187.33% | 1.0451 | 2/3 | — |
| asym37_5_75_t52_5 | 1088.01% | -35.13% | 1.0850 | 225.61% | 1.1759 | 2/3 | — |
| asym35_77_5_t50 | 1057.18% | -38.27% | 1.0813 | 279.88% | 1.3581 | 2/3 | — |
| asym35_72_5_t50 | 972.53% | -34.02% | 1.0763 | 211.34% | 1.1740 | 2/3 | — |
| asym32_5_75_t52_5 | 939.19% | -37.13% | 1.0440 | 187.33% | 1.0451 | 2/3 | — |
| asym35_75_t55 | 1012.68% | -40.71% | 1.0415 | 197.81% | 1.0417 | 2/3 | — |
| asym32_5_75_t55 | 1012.68% | -40.71% | 1.0415 | 197.81% | 1.0417 | 2/3 | — |
| asym37_5_75_t55 | 1012.68% | -40.71% | 1.0415 | 197.81% | 1.0417 | 2/3 | — |
| asym35_72_5_t55 | 945.93% | -34.02% | 1.0352 | 192.72% | 1.0620 | 2/3 | — |
| asym35_77_5_t52_5 | 1016.47% | -39.16% | 1.0339 | 191.13% | 1.0684 | 2/3 | — |
| asym35_72_5_t52_5 | 899.99% | -39.89% | 1.0250 | 189.33% | 1.0889 | 2/3 | — |
| asym35_75_t50 | 894.53% | -38.27% | 1.0000 | 245.63% | 1.2773 | 2/3 | — |
| asym32_5_75_t50 | 894.53% | -38.27% | 1.0000 | 180.10% | 1.0648 | 2/3 | — |
| asym37_5_75_t50 | 894.53% | -38.27% | 1.0000 | 247.53% | 1.2783 | 2/3 | — |
| asym35_77_5_t55 | 1043.02% | -40.12% | 0.9950 | 199.47% | 1.0531 | 2/3 | — |

## Verdict

No candidate passes after common-calendar alignment.

No strategy rule or threshold was changed in v4. Research only, not investment advice.

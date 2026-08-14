# Leverage 50/50 Challenger v5 — Official CBC Cash Yield

Period: **2014-10-31 → 2026-08-13**

No signal parameter from prior rounds is rescued ex post. The pre-registered primary is `asym35_77_5_t50` (rebalance 00631L back to 50% only when its portfolio weight falls below 35% or rises above 77.5%). v5 evaluates a 3×3×3 local neighborhood and applies the official five-bank average 1-year fixed term-deposit rate with a one-month information lag.

Cash-rate robustness: 50%, 75%, and 100% of the lagged official rate are tested. The 50% haircut is the acceptance case, to reflect that a fully liquid cash sleeve may not continuously earn the headline one-year fixed-deposit rate.

Aligned Taiwan 50 Total Return benchmark: 879.80%, DD -33.96%, Sharpe 1.0863.

## Primary candidate by cash-yield assumption

| CBC rate factor | Return | Max DD | Sharpe | Holdout return | Holdout Sharpe | Regime wins | Gate | Passing neighbors |
|---:|---:|---:|---:|---:|---:|---:|---|---:|
| 50% | 1088.31% | -37.95% | 1.0980 | 288.84% | 1.3851 | 2/3 | PASS | 7/27 |
| 75% | 1171.95% | -37.80% | 1.1256 | 291.23% | 1.3915 | 2/3 | PASS | 7/27 |
| 100% | 1183.64% | -37.64% | 1.1311 | 293.62% | 1.3979 | 2/3 | PASS | 9/27 |

## Acceptance verdict

**Robust method found under the pre-registered gate.**

The primary passes even with only 50% of the official lagged deposit rate, and 7 / 27 local neighbors pass the same strict Total Return gate. The primary also passes at 75% and 100% cash-rate assumptions.

CBC rate coverage used: 2001-01 → 2026-07; mean annual five-bank 1Y fixed rate over available months 1.52%.

External ETF costs and split adjustments are unchanged. Cash interest is modeled pre-tax. Research only, not investment advice.

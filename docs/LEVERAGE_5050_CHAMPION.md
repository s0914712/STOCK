# Leverage 50/50 Research Champion

## Status

**Research Champion / Shadow only. Not a production mandate.**

Accepted fixed method: `asym35_77_5_t50`.

## Exact rule

1. Start with approximately **50% 00631L + 50% cash / deposit sleeve**.
2. At every market close, compute the 00631L portfolio weight using the modeled portfolio state.
3. If the 00631L weight is **below 35%**, emit `BUY_TO_50`; execute at the next available session open and rebalance toward 50%.
4. If the 00631L weight is **above 77.5%**, emit `SELL_TO_50`; execute at the next available session open and rebalance toward 50%.
5. Otherwise emit `HOLD`; do not rebalance.
6. The cash sleeve earns a conservative **50% haircut of the one-month-lagged CBC five-leading-bank average 1-year fixed term-deposit rate** in the acceptance test.

This is deliberately asymmetric: after a crash, the strategy restores leverage relatively early; during a long bull run, it lets the leveraged sleeve drift much farther before trimming.

## Execution and costs

- Signals: after close.
- Trades: next-session open.
- Buy commission: 0.1425%.
- Sell commission: 0.1425%.
- ETF sell securities transaction tax: 0.10%.
- Slippage: 0.10% each side.
- 00631L fund-level expenses / financing / tracking effects are already embedded in its realized market-price history and are not deducted a second time.
- Cash interest is modeled pre-tax.

Corporate-action corrections used by the research runner:

- 0050: 4:1 split effective 2025-06-18.
- 00631L: 22:1 split effective 2026-03-31.

## Acceptance evidence

Historical product period: **2014-10-31 → 2026-08-13**.

### Conservative cash case: 50% of lagged CBC deposit rate

| Metric | `asym35_77_5_t50` | Taiwan 50 Total Return |
|---|---:|---:|
| Cumulative return | **+1088.31%** | +879.80% |
| Max drawdown | -37.95% | **-33.96%** |
| Sharpe | **1.0980** | 1.0863 |
| 2022+ holdout return | **+288.84%** | lower than strategy |
| 2022+ holdout Sharpe | **1.3851** | lower than strategy |
| Regime return wins | **2 / 3** | benchmark |

The pre-registered strict gate required full-period return and Sharpe to beat Taiwan 50 Total Return, Max Drawdown to stay within 5 percentage points, 2022+ holdout return and Sharpe to beat the same benchmark, and at least two of three regime blocks to win by return. The method passed all gates.

Parameter-neighborhood confirmation: under the conservative 50% cash-yield haircut, **7 / 27** pre-registered local neighbors also passed. The primary also passed with 75% and 100% of the official lagged cash rate.

## Rolling-window confirmation

No parameter was changed after v5 acceptance. On nine complete overlapping three-year windows:

- Return wins vs Taiwan 50 Total Return: **6 / 9**.
- Sharpe wins: **7 / 9**.
- Max Drawdown within 5 percentage points: **7 / 9**.
- Pre-registered rolling confirmation gate: **PASS**.

The weak recent window is important: 2023–2025 returned +140.39% versus +162.90% for Taiwan 50 Total Return and had a worse drawdown. The method is therefore not universally superior in every bull regime.

## Why this currently outranks the Momentum / ML challengers

The current stock-level Momentum research found useful ranking information but did not beat 0050 consistently and had drawdowns around the mid-50% range. Trend and ML probability overlays generally reduced portfolio performance in the current experiments. The leverage-band method is simpler, trades infrequently, uses an actual listed instrument history, and passed the stricter total-return / holdout / regime / neighborhood / rolling-window gates.

This does **not** prove that leverage is inherently superior. It establishes a stronger research benchmark that any future Momentum / ML portfolio should beat after comparable costs and risk controls.

## Remaining risks

- Historical Max Drawdown is still roughly **-38%**; this is a high-risk strategy.
- 00631L uses daily leverage reset; path dependence, volatility drag, financing conditions and tracking behavior can change future outcomes.
- Cash-rate modeling uses a conservative haircut but still assumes the cash sleeve can accrue deposit-like yield while remaining operationally available for rebalancing.
- Cash interest is pre-tax; individual investor tax and actual deposit liquidity can differ.
- Repeated research on the same historical era creates data-snooping risk even with pre-registration, holdout, neighborhood and rolling checks.
- Live forward Shadow evidence is required before any production promotion.

## Promotion policy

Keep this method in **Shadow**. A future production decision requires meaningful live forward history, stable execution/cost behavior, and no material degradation in drawdown or relative performance. Future Momentum / ML challengers should use this leverage-band method, Taiwan 50 Total Return and 0050 as benchmarks rather than comparing only against cash or TAIEX.

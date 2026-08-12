# Sector Rotation v0.4 — 5Y + trailing-stop validation

Generated: 2026-08-12T05:31:34.088Z

## Scope

- Five-year window: 2021-08-11 to 2026-08-11
- Same six-sector / eighteen-stock proxy universe for comparability with v0.3
- Positive momentum gate, next-session-open execution, commissions and stock tax retained
- Trailing stop is measured from the highest observed basket close since entry; exit executes next session open
- Official TWSE proxy checks use EFTRI_HIST where a one-to-one official index exists

## Strategy comparison

| Strategy | Net return | CAGR | Excess vs TAIEX | Max DD | Trades | Win rate |
|---|---:|---:|---:|---:|---:|---:|
| fixed 20/20 | 185.48% | 24.33% | 23.56% | -59.09% | 18 | 66.67% |
| TP20 + trail 8% | 683.64% | 53.32% | 521.73% | -47.81% | 43 | 60.47% |
| TP20 + trail 10% | 334.10% | 35.63% | 172.18% | -29.92% | 32 | 53.13% |
| TP20 + trail 12% | -27.96% | -6.58% | -189.88% | -38.72% | 24 | 37.50% |

## Calendar-year primary results

| Year | Net return | TAIEX | Excess | Max DD | Trades |
|---:|---:|---:|---:|---:|---:|
| 2021 | 13.22% | 5.76% | 7.47% | -12.02% | 1 |
| 2022 | -30.32% | -22.62% | -7.70% | -42.60% | 4 |
| 2023 | -12.31% | 26.06% | -38.37% | -28.43% | 3 |
| 2024 | -3.31% | 29.02% | -32.33% | -39.26% | 5 |
| 2025 | 7.68% | 26.85% | -19.18% | -38.99% | 6 |
| 2026 | 180.00% | 53.73% | 126.27% | -14.55% | 6 |

## Proxy vs official TWSE industry index

| Proxy sector | Daily observations | Return correlation |
|---|---:|---:|
| 半導體 | 1213 | 0.864 |
| 電子零組件 | 1213 | 0.838 |
| 金融 | 1213 | 0.938 |

AI伺服器 and PCB remain thematic proxies because there is no one-to-one TWSE industry sub-index with those labels in this validation path.

## Guardrails

The official-index correlation check reduces, but does not eliminate, the curated-universe / hindsight-selection concern. It validates whether selected proxies track three official sector indices; it does not reconstruct historical point-in-time constituents for thematic groups.

# TWSE OpenAPI official data layer

The project fetches seven official datasets from `https://openapi.twse.com.tw/v1`:

| Internal key | Official endpoint | Normalized use |
|---|---|---|
| `stockDay` | `/exchangeReport/STOCK_DAY_ALL` | Daily listed-security OHLCV |
| `marketIndex` | `/exchangeReport/MI_INDEX` | Market and sector index close |
| `taiexTotalReturn` | `/indicesReport/MFI94U` | Recent TAIEX total-return index |
| `valuation` | `/exchangeReport/BWIBBU_ALL` | PE, PB and dividend yield |
| `revenue` | `/opendata/t187ap05_L` | Monthly revenue and growth |
| `materialEvents` | `/opendata/t187ap04_L` | Material disclosures and event alerts |
| `exRights` | `/exchangeReport/TWT48U_ALL` | Upcoming ex-rights/ex-dividend events |

## Runtime API

All endpoints return normalized English field names, provenance, `asOf`, `fetchedAt`, and a `stale` flag.

```text
GET /api/openapi/status
GET /api/openapi/stock-day?symbols=2330,2454
GET /api/openapi/market-index?index=發行量加權
GET /api/openapi/taiex-total-return
GET /api/openapi/valuation?symbols=2330
GET /api/openapi/revenue?symbols=2330
GET /api/openapi/material-events?symbols=2330&limit=10
GET /api/openapi/material-events?symbols=2330&details=1
GET /api/openapi/ex-rights?symbols=2330&from=2026-08-01
GET /api/investor-snapshot?stock=2330
```

Large datasets default to 100 rows. Use `limit=N` (maximum 2,000) or `all=1`. Symbol queries accept at most 50 symbols.

## Daily snapshots

Run:

```bash
npm run snapshot:openapi
```

This writes:

- `data/dashboard/market_latest.json`: full normalized current snapshot for runtime fallback and audit.
- `data/dashboard/openapi_forward.jsonl`: append-only point-in-time rows for the 18-stock research universe plus 0050.

The forward ledger is idempotent by `tradingDate:twse-openapi-v1`. It records the exact price, valuation, revenue, recent-event and next-corporate-action inputs that were observable on that date, plus source hashes. It must not be rewritten after a prediction is made.

The weekday GitHub Actions workflow runs after market close, executes tests, builds the snapshot, and commits both files to its current/default branch.

To avoid triggering upstream rate or bot protection, the seven datasets are fetched sequentially by default. Every response must report a JSON content type and contain a JSON array. HTML, malformed JSON, timeouts, and HTTP errors are retried with exponential backoff. The retry count and base delay can be adjusted with `TWSE_OPENAPI_MAX_ATTEMPTS` and `TWSE_OPENAPI_RETRY_DELAY_MS`.

## Data semantics and guardrails

- Most OpenAPI endpoints are current snapshots, not arbitrary five-year historical queries. The daily ledger accumulates trustworthy forward history; the existing monthly TWSE fetch remains necessary for older backtests.
- `MFI94U` currently returns a short recent window. It is a TAIEX total-return benchmark, not the realized return of ETF 0050.
- Empty valuation fields stay `null`; the application never asks an LLM to invent them.
- Material-event severity is a keyword triage aid, not a legal or investment conclusion. The full official description is available only with `details=1` to keep default payloads small.
- A failed live request may fall back to `market_latest.json`, but every such response is marked `stale: true` with `fallbackReason`.
- Any stale dataset prevents a new forward OOS row. If every live request fails, the last trusted `market_latest.json` is kept byte-for-byte unchanged and the workflow exits without inventing a new observation date.

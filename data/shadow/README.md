# Sector Shadow Ledger

This directory is maintained by `.github/workflows/sector-shadow.yml`.

- `predictions.jsonl`: one append-only prediction snapshot per TWSE trading-day `asOf`.
- `scores.jsonl`: one append-only maturity result after the fifth subsequent TAIEX trading day is available.
- `latest.json`: deterministic convenience view containing the newest prediction, newest score, and aggregate shadow metrics.

The runner is idempotent. Re-running on a weekend, holiday, or the same trading day does not append a duplicate prediction. A snapshot is scored only once.

The v0.1 radar score remains a relative-strength score, **not** a calibrated probability. v0.2 exists to collect leak-free out-of-sample labels for the later LightGBM/XGBoost challenger.

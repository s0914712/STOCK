# Sector Radar v0.2 Shadow Prediction

## Purpose

Create a leak-free, explainable Taiwan sector-rotation baseline and continuously collect true out-of-sample labels before introducing LightGBM/XGBoost.

v0.1 provides the sector ranking. v0.2 adds an append-only shadow ledger, a five-trading-day maturity scorer, and a scheduled GitHub Actions runner.

## Current universe

Each sector uses three liquid TWSE-listed representative stocks:

- 半導體: 2330, 2454, 2303
- AI伺服器: 2317, 2382, 3231
- PCB: 3037, 2368, 3044
- 金融: 2881, 2882, 2891
- 航運: 2603, 2609, 2615
- 電子零組件: 2308, 2327, 3008

The universe is intentionally small for the MVP. Later versions should use a maintained industry membership table and include TPEx data.

## v0.1 features

Per stock:

- 5-day momentum
- 20-day momentum
- 5-day / 20-day average volume ratio
- close above MA20
- 20-day annualized realized volatility

Per sector, stock-level features are averaged and transformed to cross-sectional z-scores. The score is:

`0.40*z(mom5) + 0.30*z(mom20) + 0.15*z(volume ratio) + 0.15*z(breadth) - 0.10*z(volatility)`

The linear score is mapped to 0-100 with a sigmoid only for readability.

**Important:** the score is not a calibrated probability.

## v0.2 shadow lifecycle

For each new TWSE trading-day `asOf`:

1. Build the radar using only data available through `asOf`.
2. Save one prediction snapshot to `data/shadow/predictions.jsonl`.
3. Capture each sector member's anchor close so future labels do not change the prediction record.
4. On every subsequent run, inspect all unscored snapshots.
5. Determine maturity from the TAIEX trading calendar, not calendar days.
6. When the fifth subsequent trading day exists, calculate equal-weight sector member return and TAIEX return.
7. Save the immutable result to `data/shadow/scores.jsonl`.

A snapshot ID is `YYYY-MM-DD:model-name`, making reruns idempotent.

## Shadow metrics

Until a calibrated classifier exists, v0.2 reports metrics that match the current ranking semantics:

- direction accuracy using score >= 50 as predicted relative outperformance
- Top-3 overlap hit rate
- per-sector 5-trading-day return
- per-sector return relative to TAIEX
- prediction rank vs actual rank

Brier score is intentionally deferred because the current 0-100 score is not a calibrated probability.

## Scheduled runner

`.github/workflows/sector-shadow.yml` runs at 15:30 Asia/Taipei on weekdays and can also be triggered manually.

The workflow:

1. installs dependencies
2. runs unit tests
3. runs `npm run shadow`
4. commits `data/shadow` only when the ledger changed

Weekend/holiday reruns do not create duplicate snapshots.

Note: GitHub scheduled workflows execute from the repository default branch, so the daily schedule becomes active after this PR is merged into the default branch. `workflow_dispatch` can be used to run it manually from the feature branch before merge.

## Intended learned-model target

The first challenger should predict:

`P(5-trading-day sector return > 5-trading-day TAIEX return)`

Use walk-forward evaluation only. Do not use random train/test split.

## Planned challenger evaluation

- ROC-AUC / PR-AUC
- Brier score and calibration
- Top-1 and Top-3 sector hit rate
- Information coefficient
- Top-minus-bottom portfolio spread
- Sharpe, max drawdown, turnover

## Architecture

The dashboard backend exposes `GET /api/sector-radar`. `sectorRadar.js` owns feature construction/ranking, `shadowPrediction.js` owns pure maturity/scoring logic, and `scripts/shadowRunner.js` owns the network + append-only ledger workflow. This keeps the future learned model replaceable without changing the shadow-label contract.

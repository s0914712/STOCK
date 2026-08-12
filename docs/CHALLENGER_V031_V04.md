# Sector Challenger v0.3.1 + Rotation Validation v0.4

## v0.3.1 — Baseline vs LightGBM vs XGBoost

### Target

`P(5-trading-day sector return > 5-trading-day TAIEX return)`

### Leakage rule

A historical row is eligible for training only after its full five-trading-day forward label is observable. The newest five trading days are therefore never used as labeled training observations at prediction time.

### Models

1. **Baseline** — the existing v0.1 heuristic score, calibrated to probability with logistic regression on mature historical labels.
2. **LightGBM** — gradient-boosted decision trees.
3. **XGBoost** — gradient-boosted decision trees with a separate implementation and parameterization.

### Features

- 5-day sector momentum
- 10-day sector momentum
- 20-day sector momentum
- 5d / 20d volume ratio
- breadth above MA20
- 20-day annualized realized volatility
- 5-day relative return vs TAIEX
- 20-day relative return vs TAIEX
- original baseline linear score
- sector one-hot flags

### Training cadence

- Weekly model retraining on Sunday.
- Long-history TWSE fetch happens only in the weekly trainer.
- Daily shadow inference uses only recent history plus the already-trained models.
- Model metadata records `trainedThrough`, `labelThrough`, validation split and validation Brier/log-loss/ROC-AUC.

### OOS shadow ledgers

- `data/shadow/challenger_predictions.jsonl`
- `data/shadow/challenger_scores.jsonl`
- `data/shadow/challenger_latest.json`

Each prediction is keyed by the same `asOf` date as the baseline shadow ledger. After five subsequent TAIEX trading days mature, the scorer records:

- Brier score
- log loss
- ROC-AUC when both classes are present
- Top-1 hit
- Top-3 hit rate
- winner by Brier

This creates a true forward-only comparison instead of selecting the best model from the same backtest used for development.

## v0.4 — Five-year strategy validation

v0.4 extends the v0.3 momentum rotation test to five years while retaining:

- positive momentum gate
- signal after close / execution next session open
- buy and sell commissions
- sell-side stock transaction tax

It compares:

- fixed +20% take-profit / -20% stop-loss
- fixed +20% / -20% plus 8% trailing stop
- fixed +20% / -20% plus 10% trailing stop
- fixed +20% / -20% plus 12% trailing stop

The trailing stop is measured from the highest observed basket close after entry; execution remains next-session open so the simulation does not assume impossible intraday fills.

### Official-index cross-check

For sectors with a direct free TWSE historical sub-index in `EFTRI_HIST`, v0.4 compares daily proxy returns with the official index:

- 半導體 ↔ 半導體類指數
- 電子零組件 ↔ 電子零組件類指數
- 金融 ↔ 金融保險類指數

AI伺服器 and PCB remain thematic proxies rather than official TWSE industries. This check reduces proxy-selection concern but does not reconstruct historical point-in-time constituents.

## Decision gates

Do not promote a challenger to production only because of a higher backtest return. A model or strategy should remain in shadow until it has enough matured OOS observations to compare calibration and ranking performance across different market regimes.

# Sector Radar v0.1

## Purpose

Create a leak-free, explainable baseline for Taiwan sector rotation before introducing LightGBM/XGBoost. The baseline ranks sectors using only information available as of the scoring date.

## Current universe

Each sector uses three liquid TWSE-listed representative stocks:

- 半導體: 2330, 2454, 2303
- AI伺服器: 2317, 2382, 3231
- PCB: 3037, 2368, 3044
- 金融: 2881, 2882, 2891
- 航運: 2603, 2609, 2615
- 電子零組件: 2308, 2327, 3008

The universe is intentionally small for the MVP. Later versions should use a maintained industry membership table and include TPEx data.

## Features

Per stock:

- 5-day momentum
- 20-day momentum
- 5-day / 20-day average volume ratio
- close above MA20
- 20-day annualized realized volatility

Per sector, stock-level features are averaged and transformed to cross-sectional z-scores. The score is:

`0.40*z(mom5) + 0.30*z(mom20) + 0.15*z(volume ratio) + 0.15*z(breadth) - 0.10*z(volatility)`

The linear score is mapped to 0-100 with a sigmoid only for readability.

**Important:** v0.1 score is not a calibrated probability.

## Intended ML target

The next learned model should predict:

`P(5-trading-day sector return > 5-trading-day TAIEX return)`

Use walk-forward evaluation only. Do not use random train/test split.

## Planned evaluation

- ROC-AUC / PR-AUC
- Brier score and calibration
- Top-1 and Top-3 sector hit rate
- Information coefficient
- Top-minus-bottom portfolio spread
- Sharpe, max drawdown, turnover

## Architecture

The backend exposes `GET /api/sector-radar`. TWSE history requests are cached for 15 minutes to limit repeated traffic. The ranking module is isolated in `sectorRadar.js`, so a learned model can replace the baseline without changing the UI/API contract.

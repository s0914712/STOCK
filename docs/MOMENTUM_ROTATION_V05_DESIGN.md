# v0.5 Momentum Rotation Challenger

v0.5 把既有 Sector Shadow / ML Challenger 往下延伸成 **stock-level portfolio decision layer**。它不是取代 v0.3.1 / v0.4，而是將它們保留為研究基準，再檢驗「追隨強勢、確認趨勢、用 ML 判斷續航、最後轉成組合輪動」是否真的增加扣成本後的投資價值。

> **Momentum ranking → Trend confirmation → ML continuation probability → Portfolio rotation**

## 1. Research universe

第一版使用目前專案既有 6 個研究群組 × 3 檔代表股，共 18 檔股票。這是 **curated research universe**，不是完整台股 universe；因此任何回測結論都必須保留 hindsight / survivorship bias 警告。下一階段才擴展到 point-in-time 全市場成分。

## 2. Momentum ranking

每個交易日對股票做 cross-sectional ranking：

- 5D momentum：15%
- 10D momentum：25%
- 20D momentum：30%
- 60D momentum：30%

先對各 horizon 做當日橫斷面 z-score，再加權為 `momentum_score`，最後得到 `momentum_rank`。

這一層只回答：**誰是目前相對強勢股？** 不把 momentum 本身假裝成未來機率。

## 3. Trend confirmation

第一版 `trend_pass`：

- `Close > MA20 > MA60`
- MA20 的 5D slope > 0
- 5D / 20D volume ratio ≥ 0.80
- `0 < distance_to_MA20 ≤ 20%`

最後一項用來排除已經離均線過遠的極端短期暴衝。

## 4. ML continuation target

v0.5 不學「明天會不會漲」。Label 定義為：

```text
future_10d_stock_return > future_10d_TAIEX_return + 1.0% cost buffer
AND
forward_10d_max_drawdown >= -10%
```

即模型要找的是：**未來十個交易日有足夠超額報酬、而且中途風險沒有惡化到不可接受的趨勢續航。**

### Leakage rule

任何歷史 row 只有在完整 10-trading-day forward path 已經成熟後才能進 training set。Walk-forward 回測中，某月第一個預測日為 D，training rows 必須滿足 `targetDate < D`。

## 5. Models

- **Baseline probability**：Logistic Regression，使用 momentum / relative strength / slope / distance / volume 的簡單特徵。
- **LightGBM**：完整 v0.5 feature vector。
- **XGBoost**：完整 v0.5 feature vector。
- **OOS ensemble**：第一版為三模型 probability 等權平均；本身仍是 Challenger，不宣稱已校準勝出。

LightGBM / XGBoost 使用 chronological calibration block 做 sigmoid probability calibration，再以所有已成熟資料重訓 base learner。

## 6. Portfolio rotation rules

- 每週一次新增部位機會；使用該週第一個實際交易日收盤訊號，下一交易日開盤模擬成交。
- 新買入：`momentum_rank <= 5`、`trend_pass = true`、`continuation_probability >= 0.60`。
- 最多 5 檔，等權配置；無合格標的則保留現金。
- Hysteresis：已持有股票可留到 rank > 10 才因 ranking 退出。
- Probability hysteresis：entry ≥ 0.60，exit < 0.50。
- Daily early exits：trend failure / probability drop / rank drop。
- Hard boundary：+20% take-profit / -20% stop-loss。
- 所有訊號收盤後確認，實際模擬成交在下一交易日 open，避免同收盤價偷吃未來資訊。

## 7. Transaction costs

第一版回測：

- Buy commission: 0.1425%
- Sell commission: 0.1425%
- Sell stock transaction tax: 0.30%
- Slippage: 0.10% per side
- ML label 額外使用 1.0% cost buffer

成本直接進入組合績效與 turnover 計算，避免頻繁輪動被高估。

## 8. Walk-forward ablation

同一批 OOS predictions 依序比較：

1. `momentum_only`
2. `momentum_trend`
3. `baseline`
4. `lightgbm`
5. `xgboost`
6. `ensemble`
7. `full_portfolio`

前六層每週依當層條件等權重平衡；第七層才加入 hysteresis、daily early exits 與 hard TP/SL，藉此分離「訊號品質」與「portfolio decision layer」的增益。

## 9. Promotion metrics

主要判定不是單看 AUC：

- net return after costs
- excess return vs TAIEX
- excess return vs 0050
- max drawdown
- Sharpe
- turnover
- Precision@K
- Brier / Log loss / ROC-AUC（只作 prediction quality 補充）

**ML 只有在 portfolio metrics 也持續勝過 `momentum_trend` 時才有資格升級。** 否則 Baseline / ML 繼續待在 Shadow。

## 10. Shadow ledger schema

每日 v0.5 snapshot 保存：

```text
momentum_score
momentum_rank
trend_pass
baseline_probability
lightgbm_probability
xgboost_probability
calibrated_probability
portfolio_action
 target_weight
exit_reason
estimated_cost
realized_return
```

`realized_return` 在 prediction 當下為 `null`；完整 10D label 成熟後由 scorer 寫入 score ledger，不回頭竄改原 prediction snapshot。

相關檔案：

- `momentumV05Features.py`
- `momentumV05Models.py`
- `momentumV05Backtest.py`
- `scripts/trainMomentumV05.py`
- `scripts/runMomentumV05Backtest.py`
- `scripts/runMomentumV05Shadow.py`
- `data/models/v05/`
- `data/backtests/momentum_v05_ml_validation.json`
- `data/backtests/momentum_rotation_v0.5.json`
- `data/shadow/momentum_v05_predictions.jsonl`
- `data/shadow/momentum_v05_scores.jsonl`
- `data/shadow/momentum_v05_latest.json`

# 時間序列分析科普文章 — 內容架構 v0.2

公開頁面：`public/time-series-guide.html`

## 受眾與目的

- 主要受眾：會看財經資訊，但不一定有統計背景的一般投資人。
- 次要受眾：想理解本站研究方法與限制的初學量化研究者。
- 閱讀後應能：區分價格與報酬、時間序列與橫斷面、歷史回測與 Forward OOS；並依問題選擇基本方法。
- 不做的事：不提供個股目標價、不用單一圖形暗示保證獲利、不以尚未成熟的本站資料宣稱方法有效。

## 文章順序

1. **什麼是時間序列**：先建立「順序不能打亂」的核心直覺。
2. **四個分析層次**：趨勢、季節性、短期依賴、波動／regime。
3. **資料準備**：公布時間、交易日、除權息、缺值、survivorship。
4. **方法地圖**：從 naive baseline 到 ARIMA、GARCH、boosting、深度學習與 Rank IC。
5. **可信研究流程**：問題定義 → point-in-time → chronological split → walk-forward → 成本 → live OOS。
6. **本站 5D 實例**：訊號日固定、下一收盤作 entry proxy、完整 5D 成熟後才評分。
7. **結果閱讀**：Rank IC、五分位差、turnover、Max Drawdown、預測區間與 regime stability。
8. **常見陷阱**：lookahead、survivorship、random split、overlap、multiple testing、成本、non-stationarity、metric shopping。
9. **方法選擇表**：依趨勢、季節性、風險、股票排序與資料量選擇工具。
10. **名詞快速查找**：補充 stationarity、lag、ACF／PACF、regime、universe 與 snapshot。

閱讀動線刻意從直覺走向方法，再回到研究驗證。公式只保留簡單報酬與對數報酬，其他方法先解釋能回答的問題與限制。

v0.2 經三輪無背景讀者測試後，新增 historical holdout／walk-forward／live forward OOS 的區分、反覆調參會污染 holdout 的警告、Entry proxy 的不可成交性警告、缺價樣本的固定排除規則，以及 5D 報酬與三股票 Rank IC 數值例子；同時補充 Prediction interval 的校準風險，並明確說明非重疊 Max Drawdown 不是保守損失界線。

## 方法介紹層級

| 層級 | 方法 | 文章要回答的問題 |
|---|---|---|
| 必備基準 | Naive、SMA、EMA、rolling statistics | 複雜模型是否真的比簡單規則好？ |
| 統計診斷 | stationarity、ACF、PACF、分解 | 序列有什麼結構？是否需要差分？ |
| 平均／趨勢 | Holt-Winters、ARIMA、SARIMA | 線性趨勢與季節性是否可預測？ |
| 風險 | rolling volatility、GARCH | 波動是否群聚？未來風險可能多大？ |
| 多序列 | VAR、cointegration | 指數、產業與總體變數是否共同移動？ |
| 非線性 | boosting、LSTM、Transformer | 大量 lag／rolling 特徵是否有額外訊號？ |
| 因子研究 | percentile、Rank IC、quantile spread | 今日高分股票之後是否相對較強？ |

## 本站對應

- `factorResearch.js`：橫斷面因子排名與 5D／20D Forward OOS。
- `mlChallenger.py`：chronological validation 與成熟標籤訓練。
- `rotationBacktest.js`：交易成本、drawdown 與 rotation 策略驗證。
- `data/dashboard/factor_forward.jsonl`：不可回寫的 point-in-time observations。

## 下一版候選內容

- 用 TWSE 真實資料加入「價格 vs 報酬」與 rolling volatility 圖。
- 加入互動式 ACF／rolling window 圖例。
- 分開說明月營收季節性與日價格噪音的資料頻率差異。
- 加入一個故意含 lookahead 的錯誤範例，與正確 walk-forward 結果對照。
- 讀者測試後補充術語表與常見問題。

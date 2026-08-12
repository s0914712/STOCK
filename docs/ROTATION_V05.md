# v0.5 — 策略改善與 parameter robustness

## 1. 為什麼要改

v0.4 的結論是「TP20 + trail 8% 五年淨報酬 +683.64%」。但同一份報告裡有三個數字說明這個結論不可靠：

| 參數 | 五年淨報酬 | CAGR | Max DD |
|---|---:|---:|---:|
| TP20 + trail 8% | +683.64% | 53.32% | -47.81% |
| TP20 + trail 10% | +334.10% | 35.63% | -29.92% |
| TP20 + trail 12% | **-27.96%** | -6.58% | -38.72% |

只把 trailing stop 從 8% 移到 12%，五年結果從「翻七倍」變成「虧錢」。這個敏感度說明排名反映的是**參數運氣**，不是市場結構。

另外兩個結構性問題：

1. **只有進場有 gate，出場沒有。** `minMomentum: 0` 只擋進場；`switchOnLeaderChange` 在主要設定是 `false`。結果是部位可以一路抱到 ±20% 才出場。v0.4 第一筆交易抱半導體 **210 個交易日**，從 peak +14.7% 一路抱到 -24.0%。這是 2022 年 -30.32%、五年 Max DD -59.09% 的直接來源。
2. **固定百分比停損套用在波動度差很大的籃子上。** 航運與金融的日波動差好幾倍，卻共用同一個 8% 門檻。同一個數字對一個籃子是雜訊、對另一個籃子是趨勢反轉。

## 2. 三個引擎改動

全部加在 `rotationBacktest.js`，預設值維持關閉，`topK: 1` + 無 regime filter 時與 v0.4 引擎**逐筆交易、逐日淨值完全相同**（見 §4）。

### 2.1 Market regime gate — `regimeFilter`

```js
regimeFilter: { lookback: 60, mode: 'exit-and-block' }
```

TAIEX 收盤價與自己的 N 日移動平均比較：

- `block-entry`：regime off 時不開新倉，既有部位續抱。
- `exit-and-block`：regime off 時同時強制出場（`exitReason: 'regime_off'`），出場一樣在下一個交易日開盤執行。

移動平均只吃到訊號日（含）為止的收盤價，沒有前視。歷史不足以計算 MA 時 gate 回傳 `null`，視為 risk-on，避免視窗開頭被無聲跳過。

### 2.2 波動度調整 trailing stop — `trailingStopVolMultiple`

```js
trailingStopVolMultiple: 5, trailingStopVolWindow: 20
```

停損距離 = `k × 籃子自身 20 日已實現日波動`，並夾在 `trailingStopBounds`（預設 3%–30%）之間，每日重算。高波動籃子自動拿到較寬的停損，低波動籃子拿到較緊的。目的不是提高報酬，而是讓**同一個參數在不同籃子上代表同一件事**。

`trailingStop`（固定百分比）與 `trailingStopVolMultiple` 互斥，後者優先。

### 2.3 分散持倉 — `topK`

`topK: 2` 時同時持有動能排名前二的類股，資金平均分配到各個 sleeve，每個 sleeve 獨立計算進場價、峰值、TP/SL/trailing。`exposure` 改為「已填滿的 slot 比例」，在 `topK: 1` 時與舊定義相同。

### 2.4 新增指標

`calmarRatio`、`annualizedVolatility`、`sharpeRatio`（rf=0）、`regimeOffCount`。Calmar 是後續排名的主要依據，因為它同時懲罰回撤。

## 3. Robustness harness — `rotationRobustness.js`

這是這一版真正的重點：**不再用單一設定的報酬排名決定升級。**

### 3.1 Sweep grid

4 regime × 2 topK × 7 trailing = **56 個設定**，每個設定都跑：

- 完整五年視窗
- 前半段 / 後半段（half-sample）
- 每個日曆年

### 3.2 Family 分組

只差一個 trailing 參數的設定歸為同一個 **family**。Family 的分數看的是鄰域行為，不是最佳成員：

| 欄位 | 意義 |
|---|---|
| `medianCagr` / `medianCalmar` | 鄰域中位數表現 |
| `cagrSpread` | **脆弱度**：family 內 CAGR 最大值減最小值 |
| `worstCalmar` | 最差成員的 Calmar |
| `allHalvesPositive` | 每個成員在前後半段是否都為正 |

以 v0.4 的固定百分比 family 為例，`cagrSpread` ≈ 60 個百分點，直接判定為脆弱。

### 3.3 Promotion gate

一個 family 必須**同時**通過：

1. 沒有任何成員虧掉一半以上資金
2. `cagrSpread` ≤ 35 個百分點
3. `worstCalmar` ≥ 0.5
4. `medianCalmar` ≥ 0.8
5. 沒有任何成員在後半段為負

通過後，選的是 family 內的**中位數參數**（偶數成員取下中位數），不是表現最好的那個 —— 表現最好的成員正是最可能被這段視窗擬合的那一個。

沒有任何 family 通過時，輸出是 `no-promotion`，不是「挑一個比較不爛的」。

### 3.4 輸出

`node scripts/runRotationV05.js` 產生 `data/backtests/rotation_v0.5.json` 與 `rotation_v0.5.md`，內含 family 排名表、Calmar 前 15 名設定、half-sample 穩定度、v0.4 incumbent 在同一套量尺下的表現，以及被 gate 擋下的 family 與原因。

## 4. 回溯相容性驗證

新引擎在 `topK: 1` 且沒有 regime filter 時，與 v0.4 引擎在 **40 組隨機合成資料 × 6 種設定（共 240 個情境）** 下比對：

- 每一筆交易的類股、進出場日、出場原因、淨報酬、持有天數完全相同
- 每一日的淨值曲線完全相同（10 位小數）
- `finalCapital` / `maxDrawdown` / `winRate` / `exposure` 等 13 個指標完全相同

因此 v0.3 / v0.4 已發佈的數字仍然可重現，沒有被這次改動污染。

## 5. 資料快取

`scripts/twseData.js` 集中 TWSE 抓取邏輯（v0.4 與 v0.5 共用），並把結果寫到 `data/cache/twse_prices.json`（已 gitignore）。

- 沒有快取時：正常下載並寫入快取
- 有快取時：直接重用，sweep 不需要重打 TWSE
- `--refresh`：強制重新下載
- `--offline`：沒有快取就直接失敗，不碰網路

56 個設定的 sweep 因此只需要一次下載。

## 6. 目前還不知道的事

- **v0.5 的真實五年數字尚未產生。** 開發環境的 network egress 不允許連 `www.twse.com.tw`，本次只用合成資料驗證程式路徑（56 設定 / 16 family / gate / 報告輸出全部跑通）。真實數字要等 `Rotation Robustness v0.5` workflow 在 GitHub Actions 上跑過才有。合成資料的數字沒有任何市場意義，也刻意沒有 commit。
- **Regime gate 的 lookback 是在同一段視窗上挑的**，本身就有擬合風險。它的 out-of-sample 價值要等 forward shadow 成熟才算數。
- Universe 仍是 curated 的六類股 / 十八檔，hindsight-selection 風險與 v0.3 / v0.4 相同。
- 一段五年視窗仍然只是一個樣本。half-sample 與逐年欄位只能界定過度擬合的風險，不能消除它。
- 以上皆為研究用途，不構成投資建議。

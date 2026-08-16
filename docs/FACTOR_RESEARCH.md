# TWSE 官方因子研究層 v1

## 目標

把每日 TWSE OpenAPI 快照轉成可追溯的股票橫斷面排名，並從上線日起累積真正 forward OOS 證據。這一層是研究工具，不輸出買進／賣出指令，也不回填上線前的「假 OOS」。

## 資料與時間對齊

| 用途 | 官方資料 |
|---|---|
| 收盤、漲跌、成交金額 | `STOCK_DAY_ALL` |
| PE、PB、殖利率 | `BWIBBU_ALL` |
| 月營收 YoY、MoM、YTD | `t187ap05_L` |
| 事件風險 | `t187ap04_L` |
| 30 日內除權息 | `TWT48U_ALL` |

- 只接受七端點皆為 fresh 的 `market_latest.json`；任一 stale 時不新增因子日期。
- 估值日期不可晚於交易日，營收公布日不可晚於快照實際記錄日。
- 訊號在官方快照記錄後成立。績效從下一個已觀察交易日的收盤價開始計算，不假設能用訊號日收盤成交。
- 5D outcome 需要訊號後第 1 個收盤作為 entry，再等待完整 5 個交易日；因此至少要有 6 個後續快照才成熟。

## Universe

- 上市、四碼數字且不以 0 開頭的普通股 proxy（排除 `00xx` ETF／ETN）。
- 收盤價必須大於零。
- 因子候選預設要求單日成交金額至少新台幣 2,000 萬元。
- 缺值保留為 `null`，不以 AI、零或橫斷面平均補值。

## 因子

所有分數都是當日橫斷面百分位，範圍 0–1，越高越符合該因子。

| 因子 | 定義 |
|---|---|
| Value | 低 PE、低 PB、高殖利率的等權平均 |
| Growth | 月營收 YoY、MoM、YTD 成長百分位的等權平均 |
| Momentum | 由收盤價與當日漲跌推導的一日報酬百分位 |
| Liquidity | `log(1 + 成交金額)` 百分位，主要作可交易性控制 |
| Composite | Value 35% + Growth 35% + Momentum 20% + Liquidity 10% |

Composite 必須同時具備 Value、Growth，且四大類至少三類有值；缺少第四類時，現有權重會重新正規化。重大事件與除權息只作風險提示，不偷偷改動因子分數。

## Forward OOS

每日 observation 追加到 `data/dashboard/factor_forward.jsonl`，成熟結果追加到 `factor_outcomes.jsonl`。同一模型版本與交易日的 ID 唯一，重跑不會重複寫入。

5D 與 20D 各自累積：

- Spearman Rank IC
- Rank IC 大於零比率
- Top／Bottom 五分位平均報酬與差值
- Top 五分位勝率
- Top 五分位換手率
- 扣除 0.585% × 換手率的保守淨報酬估計
- 非重疊持有期的 Max Drawdown

未滿 20 個 matured 5D snapshots 時，狀態固定為 `collecting-forward-oos`。達門檻只代表可進一步研究，仍需跨市場狀態、產業與交易可行性檢查。

## 執行

```bash
npm run snapshot:openapi
npm run research:factors
npm test
```

每日 Action 會依序更新官方快照、因子 observation、成熟 outcomes 與 `factor_research_latest.json`。唯一的 Pages workflow 會在 16:40（台北時間）重新部署；GitHub Pages 只讀 latest 報告，不在瀏覽器內重新計算。

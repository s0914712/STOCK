/**
 * Multi-Agent Trading Suggestion System
 * Inspired by TradingAgents (https://github.com/TauricResearch/TradingAgents)
 *
 * Agent Roles:
 * 1. Fundamental Analyst (Claude) - Financial metrics analysis
 * 2. Technical Analyst (Gemini) - Technical indicators analysis
 * 3. Sentiment Analyst (Claude) - Market sentiment analysis
 * 4. News Analyst (Gemini) - Macro trends analysis
 * 5. Bull Researcher (Claude) - Bullish case
 * 6. Bear Researcher (Gemini) - Bearish case
 * 7. Trader/Decision Maker (Claude) - Final recommendation
 */

// --- LLM Clients ---

async function callClaude(apiKey, systemPrompt, userMessage) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });
  return response.content[0].text;
}

async function callGemini(apiKey, systemPrompt, userMessage) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
  });
  const result = await model.generateContent(userMessage);
  return result.response.text();
}

// Pick available LLM based on keys
function getLLM(preferred, anthropicKey, geminiKey) {
  if (preferred === 'claude' && anthropicKey) return (sys, msg) => callClaude(anthropicKey, sys, msg);
  if (preferred === 'gemini' && geminiKey) return (sys, msg) => callGemini(geminiKey, sys, msg);
  // Fallback
  if (anthropicKey) return (sys, msg) => callClaude(anthropicKey, sys, msg);
  if (geminiKey) return (sys, msg) => callGemini(geminiKey, sys, msg);
  throw new Error('No API key available');
}

// --- Format stock data for prompts ---
function formatStockContext(data) {
  const { stock, stockName, stockData, historicalData } = data;
  let ctx = `股票代碼: ${stock}\n股票名稱: ${stockName || stock}\n`;

  if (stockData) {
    ctx += `\n即時報價:\n`;
    ctx += `  現價: ${stockData.price || 'N/A'}\n`;
    ctx += `  開盤: ${stockData.open || 'N/A'}\n`;
    ctx += `  最高: ${stockData.high || 'N/A'}\n`;
    ctx += `  最低: ${stockData.low || 'N/A'}\n`;
    ctx += `  昨收: ${stockData.yesterday || 'N/A'}\n`;
    ctx += `  漲跌: ${stockData.change || 'N/A'} (${stockData.changePercent || 'N/A'}%)\n`;
    ctx += `  成交量: ${stockData.volume || 'N/A'} 張\n`;
  }

  if (historicalData && historicalData.length > 0) {
    ctx += `\n最近 ${historicalData.length} 個交易日歷史資料:\n`;
    ctx += `日期        | 開盤    | 最高    | 最低    | 收盤    | 成交量\n`;
    ctx += `----------- | ------- | ------- | ------- | ------- | --------\n`;
    for (const d of historicalData.slice(-30)) {
      ctx += `${d.date} | ${d.open} | ${d.high} | ${d.low} | ${d.close} | ${d.volume}\n`;
    }

    // Compute basic technical indicators
    const closes = historicalData.map(d => d.close);
    if (closes.length >= 14) {
      const rsi = computeRSI(closes, 14);
      ctx += `\nRSI(14): ${rsi.toFixed(2)}\n`;
    }
    if (closes.length >= 5) {
      ctx += `SMA(5): ${computeSMA(closes, 5).toFixed(2)}\n`;
    }
    if (closes.length >= 10) {
      ctx += `SMA(10): ${computeSMA(closes, 10).toFixed(2)}\n`;
    }
    if (closes.length >= 20) {
      ctx += `SMA(20): ${computeSMA(closes, 20).toFixed(2)}\n`;
    }
  }

  return ctx;
}

function computeRSI(closes, period) {
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function computeSMA(closes, period) {
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// --- Agent Definitions ---

const AGENTS = {
  fundamentalAnalyst: {
    llm: 'claude',
    system: `你是一位專業的基本面分析師。你的任務是分析台灣股票的基本面。
請根據提供的股票數據，從以下角度分析：
1. 股價位階（相對高低）
2. 成交量變化趨勢
3. 近期漲跌幅度
4. 價量關係

請用繁體中文回答，簡潔專業，200字以內。`,
  },
  technicalAnalyst: {
    llm: 'gemini',
    system: `你是一位專業的技術分析師。你的任務是分析台灣股票的技術指標。
請根據提供的數據（包括RSI、SMA等），從以下角度分析：
1. RSI 超買超賣訊號
2. 移動平均線趨勢（5日、10日、20日MA的排列）
3. K線形態（如有明顯形態）
4. 支撐壓力位

請用繁體中文回答，簡潔專業，200字以內。`,
  },
  sentimentAnalyst: {
    llm: 'claude',
    system: `你是一位市場情緒分析師。你的任務是根據股票數據推測市場情緒。
請分析：
1. 近期量價變化所反映的市場情緒
2. 投資人信心指標
3. 可能的市場預期

請用繁體中文回答，簡潔專業，150字以內。`,
  },
  newsAnalyst: {
    llm: 'gemini',
    system: `你是一位總經分析師。你的任務是從宏觀角度分析股票。
請根據你的知識分析：
1. 該公司所屬產業近期趨勢
2. 可能影響股價的宏觀因素
3. 產業供需狀況

請用繁體中文回答，簡潔專業，150字以內。`,
  },
};

// --- Main Multi-Agent Analysis ---

async function runMultiAgentAnalysis({ stock, stockName, stockData, historicalData, anthropicKey, geminiKey }) {
  const context = formatStockContext({ stock, stockName, stockData, historicalData });
  const steps = [];

  // Step 1: Run 4 analysts in parallel
  const analystPromises = Object.entries(AGENTS).map(async ([name, agent]) => {
    try {
      const llm = getLLM(agent.llm, anthropicKey, geminiKey);
      const result = await llm(agent.system, context);
      return { name, result, llm: agent.llm };
    } catch (err) {
      return { name, result: `分析失敗: ${err.message}`, llm: agent.llm };
    }
  });

  const analystResults = await Promise.all(analystPromises);
  const analysisMap = {};
  for (const r of analystResults) {
    analysisMap[r.name] = r.result;
    steps.push({
      agent: r.name,
      llm: r.llm,
      role: 'analyst',
      content: r.result,
    });
  }

  // Step 2: Bull vs Bear researchers
  const researchContext = `${context}\n\n--- 分析師報告 ---\n`
    + `基本面分析:\n${analysisMap.fundamentalAnalyst}\n\n`
    + `技術面分析:\n${analysisMap.technicalAnalyst}\n\n`
    + `情緒分析:\n${analysisMap.sentimentAnalyst}\n\n`
    + `總經分析:\n${analysisMap.newsAnalyst}\n`;

  const bullSystem = `你是一位看多研究員。根據分析師報告，請提出看多的論點。
列出3個最強的做多理由，並評估上漲空間。
請用繁體中文回答，200字以內。`;

  const bearSystem = `你是一位看空研究員。根據分析師報告，請提出看空的論點。
列出3個最大的風險因素，並評估下跌風險。
請用繁體中文回答，200字以內。`;

  const [bullResult, bearResult] = await Promise.all([
    (async () => {
      try {
        const llm = getLLM('claude', anthropicKey, geminiKey);
        return await llm(bullSystem, researchContext);
      } catch (err) { return `分析失敗: ${err.message}`; }
    })(),
    (async () => {
      try {
        const llm = getLLM('gemini', anthropicKey, geminiKey);
        return await llm(bearSystem, researchContext);
      } catch (err) { return `分析失敗: ${err.message}`; }
    })(),
  ]);

  steps.push({ agent: 'bullResearcher', llm: 'claude', role: 'researcher', content: bullResult });
  steps.push({ agent: 'bearResearcher', llm: 'gemini', role: 'researcher', content: bearResult });

  // Step 3: Trader makes final decision
  const traderContext = `${researchContext}\n`
    + `--- 看多論點 ---\n${bullResult}\n\n`
    + `--- 看空論點 ---\n${bearResult}\n`;

  const traderSystem = `你是一位資深交易員。根據所有分析師和研究員的報告，做出最終交易建議。

請以以下格式回答（繁體中文）：

📊 建議: [買入/持有/賣出]
💯 信心度: [0-100]%
📈 目標價: [價格]
📉 停損價: [價格]

📝 理由:
[簡述3個主要理由，每個30字以內]

⚠️ 風險提示:
[列出2個主要風險]

⏰ 建議持有期間: [短線/中線/長線]`;

  let traderResult;
  try {
    const llm = getLLM('claude', anthropicKey, geminiKey);
    traderResult = await llm(traderSystem, traderContext);
  } catch (err) {
    traderResult = `決策失敗: ${err.message}`;
  }

  steps.push({ agent: 'trader', llm: 'claude', role: 'decision', content: traderResult });

  return {
    stock,
    stockName,
    recommendation: traderResult,
    steps,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { runMultiAgentAnalysis };

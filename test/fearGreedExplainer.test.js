const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const signals = [...html.matchAll(/data-sentiment-signal="([^"]+)"/g)].map(match => match[1]);

assert.strictEqual(signals.length, 9, 'fear/greed methodology must expose exactly nine signals');
assert.strictEqual(new Set(signals).size, 9, 'fear/greed signal identifiers must be unique');

for (const label of [
  '選擇權波動率',
  '賣權／買權比率',
  '美元／新台幣匯率',
  '融資維持率代理值',
  '境外機構期貨持倉',
  '市場廣度',
  '融券／融資餘額比',
  '指數動量',
  '有效交易帳戶',
]) {
  assert(html.includes(label), `missing fear/greed signal label: ${label}`);
}

assert(html.includes('關注極端情況，而非日常波動'));
assert(html.includes('資料未齊時不發布綜合分數'));
assert(html.includes('id="fear-greed-live"'));
assert(html.includes('<script src="fear-greed.js"></script>'));
assert(!html.includes('當比數'), 'score wording should use 分數, not 比數');

console.log('fear/greed explainer tests passed');

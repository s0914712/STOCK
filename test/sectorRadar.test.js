const assert = require('assert');
const {
  computeStockFeatures,
  rankSectors,
  buildSectorRadar,
} = require('../sectorRadar');

function makeRows({ start = 100, daily = 1, volume = 1000, days = 30 }) {
  return Array.from({ length: days }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    close: start + daily * i,
    volume: volume + i * 10,
  }));
}

async function main() {
  const features = computeStockFeatures(makeRows({ daily: 1 }));
  assert(features, 'features should be computed with >= 21 rows');
  assert(features.momentum5 > 0, 'positive trend should have positive 5d momentum');
  assert(features.momentum20 > 0, 'positive trend should have positive 20d momentum');
  assert.strictEqual(features.aboveMA20, 1, 'uptrend close should be above MA20');

  const ranked = rankSectors([
    { sector: '強', momentum5: 0.08, momentum20: 0.20, volumeRatio: 1.5, breadthAboveMA20: 1, volatility20: 0.20, coverage: 1 },
    { sector: '中', momentum5: 0.01, momentum20: 0.03, volumeRatio: 1.0, breadthAboveMA20: 0.5, volatility20: 0.25, coverage: 1 },
    { sector: '弱', momentum5: -0.06, momentum20: -0.15, volumeRatio: 0.7, breadthAboveMA20: 0, volatility20: 0.40, coverage: 1 },
  ]);
  assert.strictEqual(ranked[0].sector, '強');
  assert.strictEqual(ranked[2].sector, '弱');
  assert(ranked[0].score > ranked[2].score);

  const radar = await buildSectorRadar({
    sectors: { A: ['1000', '1001'], B: ['2000', '2001'] },
    concurrency: 2,
    fetchHistory: async symbol => makeRows({ daily: symbol.startsWith('1') ? 1 : -0.5 }),
  });
  assert.strictEqual(radar.data.length, 2);
  assert.strictEqual(radar.data[0].sector, 'A');
  assert.strictEqual(radar.model, 'sector-radar-baseline-v0.1');

  console.log('sectorRadar tests passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

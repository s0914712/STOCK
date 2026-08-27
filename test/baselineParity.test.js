/**
 * Champion baseline parity — JavaScript side.
 *
 * The baseline formula is implemented twice, once per language: `sectorRadar.js`
 * serves the live radar, `baselineScore.py` feeds the ML challenger's
 * `baseline_linear` feature. Nothing in the runtime compares them, so a weight
 * changed on one side would silently make the challenger's benchmark a
 * different model from the one actually being served.
 *
 * This test and its Python twin (`test/baselineParity.test.py`) both assert
 * against `test/fixtures/baseline_golden.json`. Editing one implementation
 * without the other fails CI here.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  BASELINE_WEIGHTS,
  BASELINE_SIGMOID_SLOPE,
  baselineColumns,
  baselineLinear,
  baselineScore01,
  rankSectors,
} = require('../sectorRadar');

const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'baseline_golden.json'), 'utf8'));
const TOLERANCE = golden.tolerance;

function close(actual, expected, message) {
  assert.ok(
    Number.isFinite(actual),
    `${message}: expected a finite number, got ${actual}`,
  );
  assert.ok(
    Math.abs(actual - expected) <= TOLERANCE,
    `${message}: got ${actual}, expected ${expected} (diff ${Math.abs(actual - expected)} > ${TOLERANCE})`,
  );
}

// The fixture pins the constants too. Without this, changing a weight in both
// the code and the fixture would pass while silently redefining the champion.
assert.deepStrictEqual(
  BASELINE_WEIGHTS,
  golden.weights,
  'sectorRadar.js weights drifted from test/fixtures/baseline_golden.json',
);
assert.strictEqual(
  BASELINE_SIGMOID_SLOPE,
  golden.sigmoidSlope,
  'sectorRadar.js sigmoid slope drifted from the golden fixture',
);

for (const testCase of golden.cases) {
  const columns = baselineColumns(testCase.rows);
  testCase.rows.forEach((row, index) => {
    const linear = baselineLinear(row, columns);
    const expected = testCase.expected[index];
    close(linear, expected.linear, `${testCase.name}[${index}] linear`);
    close(baselineScore01(linear), expected.score01, `${testCase.name}[${index}] score01`);
  });
}

// The radar's own path maps display names onto the canonical feature keys. A
// typo in that mapping would not show up above, so drive rankSectors directly
// and check it lands on the same numbers.
const sixSector = golden.cases.find(c => c.name === 'typical-six-sector');
const ranked = rankSectors(sixSector.rows.map(row => ({
  sector: row.sector,
  momentum5: row.momentum5,
  momentum20: row.momentum20,
  volumeRatio: row.volume_ratio,
  breadthAboveMA20: row.breadth_ma20,
  volatility20: row.volatility20,
})));

assert.strictEqual(ranked.length, sixSector.rows.length, 'rankSectors dropped rows');
for (const scored of ranked) {
  const index = sixSector.rows.findIndex(row => row.sector === scored.sector);
  assert.ok(index >= 0, `rankSectors returned unknown sector ${scored.sector}`);
  const expectedScore = Number((100 * sixSector.expected[index].score01).toFixed(1));
  assert.strictEqual(
    scored.score,
    expectedScore,
    `rankSectors ${scored.sector}: got ${scored.score}, expected ${expectedScore}`,
  );
}

// Ranking must be by descending score, and the display components must remain
// under the legacy names already written into data/shadow/*.jsonl.
for (let i = 1; i < ranked.length; i += 1) {
  assert.ok(ranked[i - 1].score >= ranked[i].score, 'rankSectors is not sorted by descending score');
  assert.strictEqual(ranked[i].rank, i + 1, 'rankSectors rank is not 1-based contiguous');
}
assert.deepStrictEqual(
  Object.keys(ranked[0].components).sort(),
  ['breadth', 'momentum20', 'momentum5', 'volatility', 'volumeRatio'],
  'emitted component names changed; the shadow ledgers already use the old ones',
);

console.log(`baseline parity (js) passed: ${golden.cases.length} golden cases + rankSectors end-to-end`);

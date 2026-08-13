const assert = require('assert');
const {
  adjustForCorporateActions,
  assertNoUnadjustedGaps,
} = require('../scripts/twseData');

function makeDates(n, from = '2024-01-02') {
  const out = [];
  const d = new Date(`${from}T00:00:00Z`);
  while (out.length < n) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function seeded(seed) {
  return function next() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A clean series that respects Taiwan's +/-10% daily limit. */
function makeSeries(dates, drift, seed, start = 100) {
  const rnd = seeded(seed);
  let close = start;
  return dates.map(date => {
    const open = close;
    close = close * (1 + drift + (rnd() - 0.5) * 0.04);
    return { date, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 10000 };
  });
}

function applySplit(rows, atIndex, divisor) {
  return rows.map((row, i) => (i < atIndex ? row : {
    ...row,
    open: row.open / divisor,
    high: row.high / divisor,
    low: row.low / divisor,
    close: row.close / divisor,
    volume: row.volume * divisor,
  }));
}

function totalReturn(rows) {
  return rows.at(-1).close / rows[0].close - 1;
}

/**
 * The exact defect that invalidated the first live 0050 report: TWSE serves raw
 * prices, 0050 split 1:4 in 2025, and the benchmark printed a -75% cliff that
 * no Taiwan-listed instrument can produce in one session.
 */
function testDetectsAndReversesSplit() {
  const dates = makeDates(300);
  const clean = makeSeries(dates, 0.0008, 7);
  const truth = totalReturn(clean);

  const raw = applySplit(clean, 180, 4);
  assert(totalReturn(raw) < truth - 0.5, 'the raw series should look catastrophically worse');

  const { rows, events } = adjustForCorporateActions(raw, { symbol: '0050' });
  assert.strictEqual(events.length, 1, 'exactly one corporate action should be detected');
  assert.strictEqual(events[0].date, dates[180]);
  assert(Math.abs(events[0].ratio - 0.25) < 1e-9, 'the detected ratio should be 1/4');
  assert.strictEqual(events[0].impliedSplit, '1:4.00');

  assert(Math.abs(totalReturn(rows) - truth) < 1e-9,
    `adjusted total return should match the underlying: ${totalReturn(rows)} vs ${truth}`);
  assert.doesNotThrow(() => assertNoUnadjustedGaps(rows, { symbol: '0050' }),
    'no limit-breaking move should survive adjustment');

  // OHLC must stay internally consistent, and volume scales inversely.
  for (const row of rows) {
    assert(row.high >= row.low - 1e-9, 'high must not fall below low');
    assert(row.high >= row.close - 1e-9 && row.low <= row.close + 1e-9, 'close must sit inside the range');
    assert(row.volume > 0, 'volume must stay positive');
  }
}

function testHandlesMultipleAndReverseSplits() {
  const dates = makeDates(400);
  const clean = makeSeries(dates, 0.0005, 11);
  const truth = totalReturn(clean);

  let raw = applySplit(clean, 120, 4);
  raw = applySplit(raw, 260, 2);
  const { rows, events } = adjustForCorporateActions(raw, { symbol: 'MULTI' });
  assert.strictEqual(events.length, 2, 'both actions should be detected');
  assert(Math.abs(totalReturn(rows) - truth) < 1e-9, 'compounded adjustment should recover the truth');

  // Reverse split: price multiplies instead of divides.
  const reverse = applySplit(clean, 200, 1 / 5);
  const out = adjustForCorporateActions(reverse, { symbol: 'REV' });
  assert.strictEqual(out.events.length, 1);
  assert(out.events[0].impliedSplit.endsWith(':1'), 'a reverse split should be labelled n:1');
  assert(Math.abs(totalReturn(out.rows) - truth) < 1e-9, 'reverse splits must adjust too');
}

function testLeavesCleanSeriesUntouched() {
  const dates = makeDates(250);
  const clean = makeSeries(dates, 0.0006, 21);
  const { rows, events } = adjustForCorporateActions(clean, { symbol: 'CLEAN' });
  assert.strictEqual(events.length, 0, 'a limit-respecting series has no corporate actions');
  assert.deepStrictEqual(rows, clean, 'a clean series must pass through unchanged');
}

function testTripwireRejectsImpossibleMove() {
  const dates = makeDates(50);
  const rows = makeSeries(dates, 0, 31);
  rows[25] = { ...rows[25], close: rows[24].close * 0.5 };
  assert.throws(
    () => assertNoUnadjustedGaps(rows, { symbol: 'BROKEN' }),
    /beyond Taiwan's .* limit/,
    'a surviving impossible move must stop the run',
  );
}

function testSortsBeforeAdjusting() {
  const dates = makeDates(120);
  const clean = makeSeries(dates, 0.0007, 41);
  const raw = applySplit(clean, 60, 4);
  const shuffled = [raw[10], ...raw.slice(0, 10), ...raw.slice(11)];
  const { rows, events } = adjustForCorporateActions(shuffled, { symbol: 'UNSORTED' });
  assert.strictEqual(events.length, 1, 'out-of-order input must still yield one event');
  assert(rows.every((row, i) => i === 0 || rows[i - 1].date <= row.date), 'output must be date-sorted');
}

testDetectsAndReversesSplit();
testHandlesMultipleAndReverseSplits();
testLeavesCleanSeriesUntouched();
testTripwireRejectsImpossibleMove();
testSortsBeforeAdjusting();
console.log('twseData corporate-action tests passed');

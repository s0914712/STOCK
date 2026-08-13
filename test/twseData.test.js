const assert = require('assert');
const http = require('http');
const {
  adjustForCorporateActions,
  assertNoUnadjustedGaps,
  fetchJSON,
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

function withServer(handler, run) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      try {
        await run(base);
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        server.close();
      }
    });
  });
}

/**
 * TWSE moved its endpoints under /rwd/ and answers the old paths with a 307.
 * node's https.get does not follow redirects, so a live run failed every
 * request until this was handled.
 */
async function testFollowsRedirects() {
  let hops = 0;
  let landedOn = null;
  await withServer((req, res) => {
    if (req.url.startsWith('/old')) {
      hops += 1;
      // Location without a query, exactly how TWSE points at the new path.
      res.writeHead(307, { Location: '/rwd/new' });
      res.end();
      return;
    }
    if (req.url.startsWith('/rwd/new')) {
      landedOn = req.url;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ stat: 'OK', data: [['115/01/02', '1', '2', '3', '4', '5', '6']] }));
      return;
    }
    res.writeHead(404);
    res.end();
  }, async base => {
    const json = await fetchJSON(`${base}/old?date=20260101`);
    assert.strictEqual(json.stat, 'OK', 'a 307 must be followed to the new endpoint');
    assert.strictEqual(json.data.length, 1);
    assert.strictEqual(hops, 1, 'the redirect should be followed once, not retried in a loop');
    assert.strictEqual(landedOn, '/rwd/new?date=20260101',
      'a Location without a query must inherit the original parameters, or every month would return the same data');
  });
}

async function testRelativeAndPermanentRedirects() {
  for (const code of [301, 302, 303, 308]) {
    await withServer((req, res) => {
      if (req.url === '/a') {
        res.writeHead(code, { Location: '/b' });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: code }));
    }, async base => {
      const json = await fetchJSON(`${base}/a`);
      assert.strictEqual(json.ok, code, `HTTP ${code} should be followed`);
    });
  }
}

async function testRedirectLoopGivesUp() {
  await withServer((req, res) => {
    res.writeHead(307, { Location: '/loop' });
    res.end();
  }, async base => {
    await assert.rejects(
      () => fetchJSON(`${base}/loop`, 1),
      /too many redirects/,
      'an endless redirect must terminate rather than hang',
    );
  });
}

/**
 * The mapping is learned once so the remaining ~1200 calls skip the hop, and
 * the original query must survive the rewrite or every month would return the
 * same data.
 */
async function testMemoizesRedirectAndKeepsQuery() {
  let redirects = 0;
  const seen = [];
  await withServer((req, res) => {
    if (req.url.startsWith('/exchangeReport/STOCK_DAY')) {
      redirects += 1;
      res.writeHead(307, { Location: '/rwd/zh/afterTrading/STOCK_DAY' });
      res.end();
      return;
    }
    seen.push(req.url);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ stat: 'OK' }));
  }, async base => {
    await fetchJSON(`${base}/exchangeReport/STOCK_DAY?date=20260101&stockNo=0050`);
    await fetchJSON(`${base}/exchangeReport/STOCK_DAY?date=20260201&stockNo=0050`);
    await fetchJSON(`${base}/exchangeReport/STOCK_DAY?date=20260301&stockNo=0050`);

    assert.strictEqual(redirects, 1, `only the first call should pay a redirect, saw ${redirects}`);
    assert.strictEqual(seen.length, 3, 'every call must still reach the data endpoint');
    assert(seen[0].includes('date=20260101'), 'the query must survive the redirect');
    assert(seen[1].includes('date=20260201'), 'the memoized rewrite must keep each call distinct');
    assert(seen[2].includes('date=20260301'));
    assert(seen.every(u => u.startsWith('/rwd/zh/afterTrading/STOCK_DAY')), 'later calls should go straight to the new path');
  });
}

async function testRetriesThenSucceeds() {
  let calls = 0;
  await withServer((req, res) => {
    calls += 1;
    if (calls < 3) {
      res.writeHead(429);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ recovered: true }));
  }, async base => {
    const json = await fetchJSON(`${base}/throttled`, 4);
    assert.strictEqual(json.recovered, true, 'transient throttling should be retried through');
    assert.strictEqual(calls, 3);
  });
}

async function main() {
  testDetectsAndReversesSplit();
  testHandlesMultipleAndReverseSplits();
  testLeavesCleanSeriesUntouched();
  testTripwireRejectsImpossibleMove();
  testSortsBeforeAdjusting();
  await testFollowsRedirects();
  await testRelativeAndPermanentRedirects();
  await testRedirectLoopGivesUp();
  await testMemoizesRedirectAndKeepsQuery();
  await testRetriesThenSucceeds();
  console.log('twseData tests passed');
}

main().catch(error => { console.error(error); process.exit(1); });

import { test } from "node:test";
import assert from "node:assert/strict";
import { fineBuckets, fineDaySummaries, finePeak } from "../js/rainfine.js";

const STEP = 600;
const START = Date.UTC(2026, 8, 21, 6) / 1000; // 2026-09-21 00:00 local (UTC-6)
const doc = (rows, slots = 4) => {
  const rain = new Array(slots).fill(null);
  const solar = new Array(slots).fill(null);
  const p = new Array(slots).fill(null);
  const rh = new Array(slots).fill(null);
  const tc = new Array(slots).fill(null);
  for (const [i, r, s, pr, h = null, tt = null] of rows) {
    rain[i] = r;
    solar[i] = s;
    p[i] = pr;
    rh[i] = h;
    tc[i] = tt;
  }
  return { step: STEP, start: START, slots, cols: { rain, solar, p, rh, t: tc } };
};

test("fineBuckets carries local date/hour/minute and converts rain to a mm/h rate", () => {
  const b = fineBuckets(doc([[0, 0.5, 100, 1000], [1, 1, 200, 1001]]));
  assert.equal(b.length, 4);
  assert.deepEqual([b[0].date, b[0].hour, b[0].minute], ["2026-09-21", 0, 0]);
  assert.deepEqual([b[1].date, b[1].hour, b[1].minute], ["2026-09-21", 0, 10]);
  assert.equal(b[0].rate, 3); // 0.5 mm in 10 min = 3 mm/h
  assert.equal(b[1].rate, 6);
  assert.equal(b[2].rate, null); // no reading, not zero
  assert.equal(b[0].solar, 100);
  assert.equal(b[1].p, 1001);
});

test("fineDaySummaries totals rain and finds the peak bucket per day", () => {
  const b = fineBuckets(doc([[0, 0.5, 100, 1000], [1, 2, 100, 1002], [2, 0.1, 100, 998]], 3));
  const [day] = fineDaySummaries(b);
  assert.equal(day.date, "2026-09-21");
  assert.equal(day.rain, 2.6);
  assert.equal(day.peak, 12); // the 2 mm bucket -> 12 mm/h
  assert.equal(day.peakHour, 0);
  assert.equal(day.peakMinute, 10);
  assert.equal(day.pMin, 998);
  assert.equal(day.pMax, 1002);
});

test("humidity is carried per bucket and its daily range summarised; older documents without it read as null", () => {
  const d = doc([[0, 0, 0, 1000, 88], [1, 0.5, 0, 1000, 97]], 3);
  const [day] = fineDaySummaries(fineBuckets(d));
  assert.deepEqual([day.rhMin, day.rhMax], [88, 97]);
  delete d.cols.rh;
  const b = fineBuckets(d);
  assert.equal(b[0].rh, null);
  assert.deepEqual([fineDaySummaries(b)[0].rhMin, fineDaySummaries(b)[0].rhMax], [null, null]);
});

test("temperature is carried per bucket, with the daily temperature range and brightest sun; older documents without it read as null", () => {
  const d = doc([[0, 0, 150, 1000, 88, 24.5], [1, 0, 620, 1000, 80, 29.1]], 3);
  const [day] = fineDaySummaries(fineBuckets(d));
  assert.deepEqual([day.tMin, day.tMax, day.solarMax], [24.5, 29.1, 620]);
  delete d.cols.t;
  const b = fineBuckets(d);
  assert.equal(b[0].temp, null);
  assert.deepEqual([fineDaySummaries(b)[0].tMin, fineDaySummaries(b)[0].tMax], [null, null]);
});

test("a day with no readings at all is left out", () => {
  const b = fineBuckets(doc([], 2));
  assert.deepEqual(fineDaySummaries(b), []);
});

test("finePeak finds the single highest-rate bucket, or null with no rain", () => {
  const b = fineBuckets(doc([[0, 0.5, 100, 1000], [1, 2, 100, 1000]], 3));
  assert.equal(finePeak(b).rate, 12);
  assert.equal(finePeak(fineBuckets(doc([], 2))), null);
});

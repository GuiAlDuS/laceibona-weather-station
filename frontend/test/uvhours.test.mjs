import { test } from "node:test";
import assert from "node:assert/strict";
import { uvLevel, monthlyUvHours } from "../js/uvhours.js";
import { fixUvMonth } from "../js/sensor-fix.js";

// A `uv:` month document: 72 ten-minute slots a day from 06:00 local; value(day, slot) fills each one.
const mk = (month, days, value) => {
  const [y, m] = month.split("-").map(Number);
  return { month, start: Date.UTC(y, m - 1, 1, 6) / 1000, step: 600, fromHour: 6, perDay: 72, uv: Array.from({ length: days * 72 }, (_, i) => value(Math.floor(i / 72), i % 72)) };
};

test("levels follow the rounded index", () => {
  assert.equal(uvLevel(2.4), null);
  assert.equal(uvLevel(2.5), "moderate");
  assert.equal(uvLevel(5.5), "high");
  assert.equal(uvLevel(7.4), "high");
  assert.equal(uvLevel(10.4), "veryHigh");
  assert.equal(uvLevel(10.5), "extreme");
});

test("mean hours per day at each level, counted in 10-minute steps", () => {
  // Every day: 3 slots moderate, 6 high, 9 very high, 12 extreme; the rest low.
  const at = (k) => (k < 3 ? 4 : k < 9 ? 6 : k < 18 ? 9 : k < 30 ? 12 : 0.2);
  const [m] = monthlyUvHours([mk("2026-03", 31, (_, k) => at(k))]);
  assert.equal(m.key, "2026-03");
  assert.equal(m.days, 31);
  assert.equal(m.partial, false);
  assert.deepEqual(Object.fromEntries(Object.entries(m.hours).map(([k, v]) => [k, Math.round(v * 100) / 100])), { moderate: 0.5, high: 1, veryHigh: 1.5, extreme: 2 });
});

test("days missing more than an hour of readings, or with no UV at all, are left out", () => {
  const doc = mk("2026-04", 30, (d, k) => {
    if (d === 0 && k < 7) return null; // 70 minutes missing: day dropped
    if (d === 1) return 0; // dead sensor: day dropped
    if (d === 2 && k < 6) return null; // an hour missing: still counts
    return k >= 36 && k < 42 ? 11 : 0.1;
  });
  const [m] = monthlyUvHours([doc]);
  assert.equal(m.days, 28);
  assert.equal(Math.round(m.hours.extreme * 100), 100);
  assert.equal(m.partial, false);
});

test("a month with few valid days is partial; one with none is dropped; months come oldest first", () => {
  const months = monthlyUvHours([mk("2026-06", 30, (d) => (d < 10 ? 7 : null)), mk("2026-05", 31, () => null), mk("2026-04", 30, () => 7)]);
  assert.deepEqual(months.map((m) => m.key), ["2026-04", "2026-06"]);
  assert.equal(months[1].partial, true);
  assert.equal(Math.round(months[1].hours.high), 12);
});

test("the sensor correction divides the affected days only", () => {
  const doc = fixUvMonth(mk("2026-08", 31, () => 13.5));
  assert.equal(doc.uv[23 * 72], 13.5); // 24 Aug
  assert.equal(doc.uv[24 * 72], 10); // 25 Aug
  assert.equal(doc.uv.at(-1), 10);
  assert.equal(fixUvMonth(mk("2026-10", 31, () => 13.5)).uv[0], 13.5);
  assert.equal(fixUvMonth(mk("2026-09", 30, () => null)).uv[0], null);
});

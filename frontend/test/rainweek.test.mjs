import { test } from "node:test";
import assert from "node:assert/strict";
import { lastRainDays, weekTotals } from "../js/rainweek.js";

const d = (date, o = {}) => ({ date, rain_mm: 0, rain_min: 0, eto: 5, complete: true, ...o });

test("takes the last n days; duration is minutes in hours; an unfinished day has no ETo", () => {
  const rows = lastRainDays([d("2026-09-18"), d("2026-09-19", { rain_mm: 34, rain_min: 183 }), d("2026-09-20", { rain_mm: 11, rain_min: 90, eto: null, complete: false })], 2);
  assert.deepEqual(rows.map((r) => r.date), ["2026-09-19", "2026-09-20"]);
  assert.equal(rows[0].hours, 3.05);
  assert.equal(rows[1].eto, null);
  assert.equal(rows[1].inProgress, true);
});

test("missing values stay null rather than becoming zero", () => {
  const [r] = lastRainDays([d("2026-09-18", { rain_mm: null, rain_min: undefined, eto: null })]);
  assert.deepEqual([r.rain, r.hours, r.eto], [null, null, null]);
});

test("weekTotals compares rain with ETo only over finished days that have both", () => {
  const rows = lastRainDays([d("2026-09-18", { rain_mm: 10, rain_min: 60 }), d("2026-09-19", { rain_mm: 20, rain_min: 120, eto: 4 }), d("2026-09-20", { rain_mm: 6, rain_min: 30, eto: null, complete: false })]);
  const t = weekTotals(rows);
  assert.equal(t.rain, 36);
  assert.equal(t.hours, 3.5);
  assert.equal(t.rainOnEtoDays, 30);
  assert.equal(t.eto, 9);
  assert.equal(t.etoDays, 2);
  assert.equal(t.rainDays, 3);
});

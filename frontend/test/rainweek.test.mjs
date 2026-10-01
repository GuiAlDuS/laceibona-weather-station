import { test } from "node:test";
import assert from "node:assert/strict";
import { lastRainDays, weekTotals, withLiveToday } from "../js/rainweek.js";

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

test("withLiveToday overlays current's rain and duration onto today's in-progress row only", () => {
  const rows = lastRainDays([d("2026-09-18", { rain_mm: 5, rain_min: 30 }), d("2026-09-19", { rain_mm: 11, rain_min: 90, eto: null, complete: false })]);
  const patched = withLiveToday(rows, { local_date: "2026-09-19", today: { rain_mm: 14.8, rain_min: 200 } });
  assert.equal(patched[0].rain, 5); // finished day untouched
  assert.equal(patched[1].rain, 14.8);
  assert.equal(patched[1].hours, 200 / 60);
  assert.equal(patched[1].eto, null); // current has no ETo, so it stays as-is
});

test("withLiveToday adds a today row when the daily data has none yet, keeping the length", () => {
  const rows = lastRainDays([d("2026-09-29"), d("2026-09-30", { rain_mm: 0.2, rain_min: 30 })]);
  const live = withLiveToday(rows, { local_date: "2026-10-01", today: { rain_mm: 3.5, rain_min: 45 } });
  assert.deepEqual(live.map((r) => r.date), ["2026-09-30", "2026-10-01"]);
  assert.deepEqual(live[1], { date: "2026-10-01", rain: 3.5, eto: null, hours: 0.75, inProgress: true });
});

test("withLiveToday does not put today's totals on yesterday's unfinished row", () => {
  const rows = lastRainDays([d("2026-09-30", { rain_mm: 8, rain_min: 60, eto: null, complete: false })]);
  const live = withLiveToday(rows, { local_date: "2026-10-01", today: { rain_mm: 1, rain_min: 6 } });
  assert.deepEqual(live.map((r) => [r.date, r.rain]), [["2026-10-01", 1]]);
});

test("withLiveToday leaves rows unchanged when today is finished, current is older, or current is missing", () => {
  const finished = lastRainDays([d("2026-09-18")]);
  assert.deepEqual(withLiveToday(finished, { local_date: "2026-09-18", today: { rain_mm: 99, rain_min: 60 } }), finished);
  assert.deepEqual(withLiveToday(finished, { local_date: "2026-09-17", today: { rain_mm: 99, rain_min: 60 } }), finished);
  const inProgress = lastRainDays([d("2026-09-19", { eto: null, complete: false })]);
  assert.deepEqual(withLiveToday(inProgress, null), inProgress);
  assert.deepEqual(withLiveToday(inProgress, {}), inProgress);
  assert.deepEqual(withLiveToday(inProgress, { today: { rain_mm: 1, rain_min: 1 } }), inProgress);
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

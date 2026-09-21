import { test } from "node:test";
import assert from "node:assert/strict";
import { lastDays } from "../js/tempdaily.js";

const START = Date.UTC(2026, 8, 1, 6) / 1000; // local midnight, 1 Sep 2026
const doc = (temps) => {
  const t = new Array(720).fill(null);
  for (const [i, v] of Object.entries(temps)) t[i] = v;
  return { start: START, cols: { t, tmin: t.map((v) => v && v - 1), tmax: t.map((v) => v && v + 1) } };
};

test("groups hourly values by local day and hour", () => {
  const days = lastDays([doc({ 0: 24, 13: 31, 24: 25 })]);
  assert.deepEqual(days.map((d) => d.date), ["2026-09-01", "2026-09-02"]);
  assert.deepEqual(days[0].points.map((p) => [p.hour, p.t]), [[0, 24], [13, 31]]);
  assert.equal(days[1].points[0].tmax, 26);
});

test("keeps the last n calendar days ending at the latest day with data, skipping empty days", () => {
  const days = lastDays([doc({ 0: 20, 120: 21, 216: 22, 240: 23 })], 7);
  assert.deepEqual(days.map((d) => d.date), ["2026-09-06", "2026-09-10", "2026-09-11"]);
});

test("spans months and returns nothing without data", () => {
  const aug = { start: START - 31 * 86400, cols: { t: [...new Array(743).fill(null), 27], tmin: new Array(744).fill(null), tmax: new Array(744).fill(null) } };
  assert.deepEqual(lastDays([aug, doc({ 1: 25 })]).map((d) => d.date), ["2026-08-31", "2026-09-01"]);
  assert.deepEqual(lastDays([]), []);
});

test("live hours fill what the monthly documents lack, without overriding stored hours", () => {
  const live = [[START + 3600, 99, 98, 100, 60], [START + 2 * 3600, 28, 27, 29, 12], [START + 86400 * 3, 22, 21, 23, 60]];
  const days = lastDays([doc({ 1: 25 })], 7, live);
  assert.deepEqual(days[0].points.map((p) => [p.hour, p.t]), [[1, 25], [2, 28]]); // hour 1 keeps the stored value
  assert.equal(days[0].points[1].partial, true);
  assert.equal(days.at(-1).date, "2026-09-04");
});

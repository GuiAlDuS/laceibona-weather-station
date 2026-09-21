import { test } from "node:test";
import assert from "node:assert/strict";
import { windY, recentHours, daySummaries } from "../js/winddaily.js";

test("windY wraps with south at both ends and north in the middle", () => {
  assert.equal(windY(180), 0);
  assert.equal(windY(0), 8);
  assert.equal(windY(90), 12); // E
  assert.equal(windY(270), 4); // W
  assert.ok(windY(179.9) > 15.9); // just east of south is the top edge
});

const START = Date.UTC(2026, 8, 1, 6) / 1000;
const doc = (rows) => {
  const ws = new Array(720).fill(null);
  const wd = new Array(720).fill(null);
  for (const [i, s, d] of rows) [ws[i], wd[i]] = [s, d];
  return { start: START, cols: { ws, wd } };
};

test("recentHours keeps non-calm hours of the last n days with local date and hour", () => {
  const h = recentHours([doc([[0, 1, 90], [1, 0.2, 90], [5, 2, 45], [24 * 20, 1, 10]])], 30);
  assert.deepEqual(h.slice(0, 2).map((x) => [x.date, x.hour]), [["2026-09-01", 0], ["2026-09-01", 5]]);
  assert.equal(h.length, 3); // calm hour dropped
  assert.equal(h.at(-1).date, "2026-09-21");
});

test("nothing in, nothing out", () => {
  assert.deepEqual(recentHours([doc([])]), []);
  assert.deepEqual(recentHours([]), []);
});

test("daySummaries gives the most common sector, mean and peak per day", () => {
  const [d] = daySummaries(recentHours([doc([[0, 1, 88], [1, 3, 92], [2, 2, 200]])]));
  assert.equal(d.direction, "E");
  assert.equal(d.mean, 2);
  assert.equal(d.peak, 3);
  assert.equal(d.hours, 3);
});

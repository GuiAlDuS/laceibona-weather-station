import { test } from "node:test";
import assert from "node:assert/strict";
import { quantile, boxStats, monthlyBoxes, yearlyBoxes } from "../js/tempbox.js";

test("quantiles interpolate linearly", () => {
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([1, 2, 3, 4, 5], 0.25), 2);
});

test("boxStats gives quartiles, range and mean; nothing for no data", () => {
  const s = boxStats([5, 1, 3, 2, 4]);
  assert.deepEqual([s.min, s.q1, s.median, s.q3, s.max, s.mean, s.n], [1, 2, 3, 4, 5, 3, 5]);
  assert.equal(boxStats([]), null);
});

const mk = (month, start, values) => ({ month, start: Date.UTC(...start) / 1000, cols: { t: values } });

test("monthlyBoxes sorts oldest first, skips empty months and flags sparse ones", () => {
  const boxes = monthlyBoxes([mk("2026-02", [2026, 1, 1, 6], [30, 30]), mk("2026-01", [2026, 0, 1, 6], [20, 22, null, null]), mk("2026-03", [2026, 2, 1, 6], [null, null])]);
  assert.deepEqual(boxes.map((b) => b.key), ["2026-01", "2026-02"]);
  assert.equal(boxes[0].partial, true);
  assert.equal(boxes[1].partial, false);
  assert.equal(boxes[0].stats.median, 21);
});

const days = (y, m, d, n, v) => mk(`${y}-${String(m).padStart(2, "0")}`, [y, m - 1, d, 6], Array.from({ length: n * 24 }, () => v));

test("yearlyBoxes compares the same 1 Jan to latest-date window and drops thin years", () => {
  const docs = [
    days(2024, 12, 21, 11, 99), // 11 days only: dropped
    days(2025, 1, 1, 60, 20), // 1 Jan - 1 Mar, inside the window
    days(2025, 6, 1, 30, 40), // June is after the cutoff, so excluded
    days(2026, 1, 1, 60, 30), // 1 Jan - 1 Mar; latest date is 1 Mar
  ];
  const y = yearlyBoxes(docs);
  assert.deepEqual(y.map((b) => b.year), ["2025", "2026"]);
  assert.equal(y[0].through, "03-01");
  assert.equal(y[0].stats.max, 20);
  assert.equal(y[1].stats.median, 30);
  assert.deepEqual(yearlyBoxes([]), []);
});

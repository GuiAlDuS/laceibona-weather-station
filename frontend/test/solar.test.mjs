import { test } from "node:test";
import assert from "node:assert/strict";
import { annualSolarTotals } from "../js/solar.js";

const mk = (start, values) => ({ start: Date.UTC(...start) / 1000, cols: { solar: values } });
const days = (y, m, d, n, v) => mk([y, m - 1, d, 6], Array.from({ length: n * 24 }, () => v));

test("sums hourly W/m² means into kWh/m², over the same 1 Jan to latest-date window, dropping thin years", () => {
  const docs = [
    days(2024, 12, 21, 11, 500), // 11 days only: dropped
    days(2025, 1, 1, 60, 100), // 1 Jan - 1 Mar, inside the window; 100 W/m2 * 24h/1000 = 2.4 kWh/m2/day
    days(2025, 6, 1, 30, 900), // June is after the cutoff, so excluded
    days(2026, 1, 1, 60, 200), // 1 Jan - 1 Mar; latest date is 1 Mar
  ];
  const years = annualSolarTotals(docs);
  assert.deepEqual(years.map((y) => y.year), ["2025", "2026"]);
  assert.equal(years[0].through, "03-01");
  assert.equal(years[0].days, 60);
  assert.equal(Math.round(years[0].total), Math.round(60 * 24 * 0.1));
  assert.equal(Math.round(years[1].total), Math.round(60 * 24 * 0.2));
});

test("null/non-numeric hourly readings are skipped, not coerced to zero", () => {
  const n = 30; // meets MIN_DAYS so the year isn't dropped
  const values = new Array(n * 24).fill(null);
  for (let d = 0; d < n; d++) values[d * 24] = 100; // one valid hour per day: 100 W/m2 -> 0.1 kWh/m2
  values[1] = "not a number"; // junk in day 0, must not count
  values[2] = 50; // a second valid hour in day 0, must count
  const years = annualSolarTotals([mk([2026, 0, 1, 6], values)]);
  assert.equal(years[0].days, n);
  // day 0: 100 + 50 = 150 W/m2-hours -> 0.15 kWh/m2; the other 29 days: 100 each -> 2.9 kWh/m2; total 3.05
  assert.equal(Math.round(years[0].total * 100), 305);
});

test("no data at all yields an empty list", () => {
  assert.deepEqual(annualSolarTotals([]), []);
});

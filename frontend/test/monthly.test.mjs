import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyTotals, summarizeMonths, peak } from "../js/monthly.js";

const day = (date, rain, eto, complete = true) => ({ date, rain_mm: rain, eto, complete });

function month(key, n, rain, eto) {
  return Array.from({ length: n }, (_, i) => day(`${key}-${String(i + 1).padStart(2, "0")}`, rain, eto));
}

test("sums rain and ETo over usable days and reports coverage", () => {
  const m = monthlyTotals([...month("2026-01", 31, 2, 4), ...month("2026-02", 20, 1, 3)]);
  assert.equal(m[0].rain, 62);
  assert.equal(m[0].eto, 124);
  assert.equal(m[0].days, 31);
  assert.equal(m[0].partial, false);
  assert.equal(m[1].days, 20);
  assert.equal(m[1].daysInMonth, 28);
  assert.equal(m[1].partial, true);
});

test("unusable days add to neither term", () => {
  const m = monthlyTotals([...month("2026-03", 29, 1, 2), day("2026-03-30", 90, null, true), day("2026-03-31", 50, 4, false)]);
  assert.equal(m[0].days, 29);
  assert.equal(m[0].rain, 29);
  assert.equal(m[0].eto, 58);
});

test("month with no usable days has null totals", () => {
  const m = monthlyTotals([day("2025-07-12", null, null, false)]);
  assert.equal(m[0].rain, null);
  assert.equal(m[0].eto, null);
  assert.equal(m[0].days, 0);
});

test("keeps only the last N months, in order", () => {
  const days = [];
  for (let i = 1; i <= 15; i++) days.push(...month(`2025-${String((i - 1) % 12 + 1).padStart(2, "0")}`.replace(/^2025/, i > 12 ? "2026" : "2025"), 2, 1, 1));
  const m = monthlyTotals(days, { months: 13 });
  assert.equal(m.length, 13);
  assert.equal(m[0].month, "2025-03");
  assert.equal(m.at(-1).month, "2026-03");
});

test("leap-year February has 29 days", () => {
  assert.equal(monthlyTotals(month("2024-02", 3, 1, 1))[0].daysInMonth, 29);
});

test("summarizeMonths and peak", () => {
  const m = monthlyTotals([...month("2026-01", 30, 0, 4), ...month("2026-02", 20, 9, 3), day("2026-03-01", null, null, false)]);
  assert.deepEqual(summarizeMonths(m), { total: 2, rainAboveEto: 1 });
  assert.equal(peak(m, "rain"), 1);
  assert.equal(peak(m, "eto"), 0);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { cumulativeByYear, balanceAt, monthEnds, summarize, sharedAxisDate } from "../js/balance.js";

const day = (date, rain, eto, complete = true) => ({ date, rain_mm: rain, eto, complete });

function year(y, n, rain, eto) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(+y, 0, 1 + i)).toISOString().slice(0, 10);
    out.push(day(d, rain, eto));
  }
  return out;
}

test("cumulates rain minus ETo and skips unusable days", () => {
  const days = [...year("2025", 40, 5, 3), day("2025-02-10", 100, null, false), day("2025-02-11", null, null, false)];
  const [y] = cumulativeByYear(days);
  assert.equal(y.points.length, 40);
  assert.equal(y.skipped, 2);
  assert.ok(Math.abs(y.points.at(-1).balance - 80) < 1e-9);
});

test("a day with rain but no ETo is excluded from both terms", () => {
  const days = [...year("2025", 40, 5, 3), day("2025-02-10", 50, null, true)];
  const [y] = cumulativeByYear(days);
  assert.equal(y.rain, 200);
});

test("drops years with fewer than 30 usable days", () => {
  const days = [...year("2024", 10, 1, 1), ...year("2025", 40, 1, 1)];
  assert.deepEqual(cumulativeByYear(days).map((y) => y.year), ["2025"]);
});

test("shared axis maps every year onto the same calendar", () => {
  assert.equal(sharedAxisDate("2026-02-29"), "2000-02-29");
  assert.equal(sharedAxisDate("2025-09-21"), "2000-09-21");
});

test("balanceAt finds the last usable day on or before a month-day", () => {
  const [y] = cumulativeByYear(year("2025", 60, 2, 1));
  assert.equal(balanceAt(y, "01-10").date, "2025-01-10");
  assert.equal(balanceAt(y, "12-31").date, "2025-03-01");
  assert.equal(balanceAt(y, "00-01"), null);
});

test("monthEnds and summarize", () => {
  const series = cumulativeByYear([...year("2025", 90, 2, 1), ...year("2026", 45, 1, 3)]);
  assert.equal(monthEnds(series[0])["01"].date, "2025-01-31");
  const s = summarize(series);
  assert.equal(s.year, "2026");
  assert.equal(s.throughDate, "2026-02-14");
  assert.equal(s.prevYear, "2025");
  assert.equal(s.prev.date, "2025-02-14");
  assert.ok(s.balance < 0 && s.prev.balance > 0);
});

test("summarize with no data is null", () => {
  assert.equal(summarize([]), null);
});

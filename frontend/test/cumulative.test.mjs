import { test } from "node:test";
import assert from "node:assert/strict";
import { cumulativeRainByYear, cumulativeLightningByYear, cumulativeSeries, summarizeCumulative as summarizeRain, monthEndsCumulative as monthEndsRain } from "../js/cumulative.js";

const day = (date, rain, complete = true) => ({ date, rain_mm: rain, eto: null, complete });

function year(y, n, rain) {
  return Array.from({ length: n }, (_, i) => day(new Date(Date.UTC(+y, 0, 1 + i)).toISOString().slice(0, 10), rain));
}

test("counts every day with a rain reading, complete or not, without needing ETo", () => {
  const days = [...year("2025", 40, 2), day("2025-02-10", 30, false)];
  const [y] = cumulativeRainByYear(days);
  assert.equal(y.points.length, 41);
  assert.equal(y.total, 110);
  assert.equal(y.missing, 0);
});

test("days without a rain reading are counted as missing, not zero", () => {
  const [y] = cumulativeRainByYear([...year("2025", 40, 1), day("2025-02-15", null, false)]);
  assert.equal(y.missing, 1);
  assert.equal(y.points.length, 40);
});

test("cumulative values never decrease and end at the total", () => {
  const [y] = cumulativeRainByYear(year("2025", 60, 1.5));
  for (let i = 1; i < y.points.length; i++) assert.ok(y.points[i].cum >= y.points[i - 1].cum);
  assert.equal(y.points.at(-1).cum, y.total);
});

test("drops years with fewer than 30 readings", () => {
  const s = cumulativeRainByYear([...year("2024", 10, 1), ...year("2025", 40, 1)]);
  assert.deepEqual(s.map((y) => y.year), ["2025"]);
});

test("summarizeRain compares with the previous year at the same date", () => {
  const s = cumulativeRainByYear([...year("2025", 90, 4), ...year("2026", 45, 1)]);
  const r = summarizeRain(s);
  assert.equal(r.year, "2026");
  assert.equal(r.throughDate, "2026-02-14");
  assert.equal(r.total, 45);
  assert.equal(r.prevYear, "2025");
  assert.equal(r.prevTotal, 180);
  assert.equal(Math.round(r.percentOfPrev), 25);
});

test("summarizeRain with no data, and month ends", () => {
  assert.equal(summarizeRain([]), null);
  const [y] = cumulativeRainByYear(year("2025", 60, 1));
  assert.equal(monthEndsRain(y)["01"].date, "2025-01-31");
});

test("lightning uses the lightning field and handles null", () => {
  const days = Array.from({ length: 40 }, (_, i) => ({
    date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
    rain_mm: 0,
    lightning: i === 5 ? null : 10,
  }));
  const [y] = cumulativeLightningByYear(days);
  assert.equal(y.total, 390);
  assert.equal(y.missing, 1);
  assert.equal(cumulativeSeries(days, "rain_mm")[0].total, 0);
});

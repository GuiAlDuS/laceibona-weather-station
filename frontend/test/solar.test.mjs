import { test } from "node:test";
import assert from "node:assert/strict";
import { kwhPerDay, monthlyIrradiation } from "../js/solar.js";
import { sameWindowSummary } from "../js/annual.js";

const day = (date, o = {}) => ({ date, complete: true, solar_avg: 250, t_avg: 27, eto: 4, rain_mm: 1, ...o });
const run = (start, n, o) => Array.from({ length: n }, (_, i) => day(new Date(Date.UTC(start[0], start[1], start[2] + i)).toISOString().slice(0, 10), o));

test("kWh/m2/day from mean irradiance", () => {
  assert.equal(kwhPerDay(250), 6);
  assert.equal(kwhPerDay(0), 0);
  assert.ok(Math.abs(kwhPerDay(283) - 6.792) < 1e-9);
});

test("monthly totals, coverage and mean per day", () => {
  const days = [...run([2026, 0, 1], 31, { solar_avg: 250 }), ...run([2026, 1, 1], 14, { solar_avg: 125 })];
  const m = monthlyIrradiation(days);
  assert.equal(m[0].total, 186);
  assert.equal(m[0].partial, false);
  assert.equal(m[1].days, 14);
  assert.equal(m[1].daysInMonth, 28);
  assert.equal(m[1].partial, true);
  assert.equal(m[1].meanDaily, 3);
});

test("a month with no usable days has null totals", () => {
  const m = monthlyIrradiation([day("2025-07-12", { complete: false, solar_avg: null })]);
  assert.equal(m[0].total, null);
  assert.equal(m[0].meanDaily, null);
});

test("sameWindowSummary compares years over the same 1 Jan to latest date window", () => {
  const y25 = run([2025, 0, 1], 365, { t_avg: 26, solar_avg: 200, eto: 3 });
  const y26 = run([2026, 0, 1], 100, { t_avg: 28, solar_avg: 250, eto: 4 });
  const s = sameWindowSummary([...y25, ...y26]);
  assert.equal(s.latestYear, "2026");
  assert.equal(s.throughDate, "2026-04-10");
  const [a, b] = s.years;
  assert.equal(a.year, "2025");
  assert.equal(a.tempDays, 100);
  assert.equal(a.tempMean, 26);
  assert.equal(b.tempMean, 28);
  assert.ok(Math.abs(a.kwhMean - 4.8) < 1e-9);
  assert.ok(Math.abs(b.kwhMean - 6) < 1e-9);
  assert.equal(a.etoTotal, 300);
});

test("sameWindowSummary drops years with fewer than 30 days in the window and handles no data", () => {
  const s = sameWindowSummary([...run([2024, 11, 20], 11, {}), ...run([2025, 0, 1], 60, {}), ...run([2026, 0, 1], 60, {})]);
  assert.deepEqual(s.years.map((y) => y.year), ["2025", "2026"]);
  assert.equal(sameWindowSummary([]), null);
});

test("means ignore missing values without biasing", () => {
  const days = [...run([2026, 0, 1], 40, { t_avg: 20 }), day("2026-02-10", { t_avg: null, eto: null })];
  const s = sameWindowSummary(days);
  assert.equal(s.years[0].tempMean, 20);
  assert.equal(s.years[0].etoDays, 40);
});

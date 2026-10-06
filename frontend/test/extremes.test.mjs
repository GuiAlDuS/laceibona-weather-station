import { test } from "node:test";
import assert from "node:assert/strict";
import { dayStats, longestSpells, extremes, SUN_FROM } from "../js/extremes.js";
import { monthsSince } from "../js/obs-data.js";

const COLS = ["tmax", "tmin", "rain", "solar", "ltn", "rh", "ws", "gust", "n"];
// A document starting at local midnight (06:00 UTC) of the given day; hours: one object per hour, missing keys null.
// An hour counts as 60 readings unless it says otherwise; a null hour has no readings at all.
function doc(y, m, d, hours) {
  const cols = Object.fromEntries(COLS.map((c) => [c, hours.map((h) => (h === null ? null : c === "n" ? (h.n ?? 60) : (h[c] ?? null)))]));
  return { start: Date.UTC(y, m - 1, d, 6) / 1000, cols };
}
const flat = (over = {}) => Array.from({ length: 24 }, () => ({ tmax: 25, tmin: 24, rain: 0, solar: 100, ltn: 0, rh: 70, ws: 1, gust: 2, ...over }));
const withHour = (day, hour, over) => day.map((h, i) => (i === hour ? { ...h, ...over } : h));

test("a day's extremes carry the local hour they fell in, and its totals add up", () => {
  let day = flat();
  day = withHour(day, 13, { tmax: 36.2, rain: 12.5, ltn: 4, rh: 40 });
  day = withHour(day, 5, { tmin: 19.8, rain: 2.5, ltn: 1 });
  const [d] = dayStats([doc(2025, 3, 10, day)]);
  assert.equal(d.date, "2025-03-10");
  assert.deepEqual([d.tmax, d.tmaxHour, d.tmin, d.tminHour], [36.2, 13, 19.8, 5]);
  assert.deepEqual([d.rain, d.wetHourMm, d.wetHour], [15, 12.5, 13]);
  assert.deepEqual([d.ltn, d.rhLow, d.rhLowHour], [5, 40, 13]);
  assert.equal(d.solarWh, 2400);
  assert.equal(d.whole, true);
});

test("a day with missing hours is not whole, and is covered only with enough readings", () => {
  const short = flat();
  short[2] = null; // 23 hours, 1380 readings
  const thin = flat().map((h, i) => (i < 8 ? h : null)); // 8 hours
  const stats = dayStats([doc(2025, 3, 10, [...short, ...thin])]);
  assert.deepEqual(stats.map((d) => [d.hours, d.whole, d.covered]), [[23, false, true], [8, false, false]]);
});

test("spells: a wet day counts whatever its coverage; a day without data ends a wet run", () => {
  const dry = flat();
  const wet = flat({ rain: 0.1 }); // 2.4 mm
  const thin = flat().map((h, i) => (i < 8 ? h : null));
  const thinWet = thin.map((h, i) => (i === 0 ? { ...h, rain: 5 } : h));
  const days = [wet, thinWet, wet, thin, wet, wet, dry];
  const spells = longestSpells(dayStats([doc(2025, 1, 1, days.flat())]));
  assert.deepEqual(spells.wet, { days: 3, from: "2025-01-01", to: "2025-01-03", noData: 0 });
  assert.deepEqual(spells.dry, { days: 1, from: "2025-01-07", to: "2025-01-07", noData: 0 });
});

test("spells: days without data between dry days are counted as dry, but never at either end of the run", () => {
  const dry = flat();
  const wet = flat({ rain: 0.1 });
  const thin = flat().map((h, i) => (i < 8 ? h : null));
  // thin, 2 dry, thin, [2 missing days between the documents], 3 dry, thin, wet
  const stats = dayStats([doc(2025, 1, 1, [thin, dry, dry, thin].flat()), doc(2025, 1, 7, [dry, dry, dry, thin, wet].flat())]);
  assert.deepEqual(longestSpells(stats).dry, { days: 8, from: "2025-01-02", to: "2025-01-09", noData: 3 });
  assert.deepEqual(longestSpells([]), { wet: null, dry: null });
});

test("extremes: records come from the right days, the earliest winning a tie", () => {
  const hot = withHour(flat(), 12, { tmax: 38.3 });
  const cold = withHour(flat(), 5, { tmin: 19.3 });
  const soaked = withHour(withHour(flat({ solar: 20 }), 17, { rain: 80, ltn: 30 }), 18, { rain: 20 });
  const partial = withHour(flat(), 3, { tmin: 10 }).map((h, i) => (i < 6 ? h : null)); // lowest reading, but not a whole day
  const docs = [doc(2025, 3, 1, [hot, cold, soaked, hot, partial].flat())];
  const daily = [
    { date: "2025-03-01", complete: true, eto: 6.1, rain_min: 0, rh_min: 35 },
    { date: "2025-03-02", complete: true, eto: 6.1, rain_min: 0, rh_min: 31 },
    { date: "2025-03-03", complete: true, eto: 1.2, rain_min: 240, rh_min: 80 },
    { date: "2025-03-05", complete: true, eto: 9.9, rain_min: null, rh_min: null }, // complete by its count, but hours are missing
  ];
  const x = extremes(docs, daily);
  assert.deepEqual([x.from, x.to], ["2025-03-01", "2025-03-05"]);
  assert.deepEqual(x.temperature.highest, { value: 38.3, date: "2025-03-01", hour: 12 });
  assert.deepEqual(x.temperature.lowest, { value: 10, date: "2025-03-05", hour: 3 });
  assert.deepEqual(x.temperature.widestRange, { value: 14.3, date: "2025-03-01", tmin: 24, tmax: 38.3 });
  assert.deepEqual(x.temperature.narrowestRange, { value: 1, date: "2025-03-03", tmin: 24, tmax: 25 });
  assert.deepEqual(x.temperature.warmestNight, { value: 24, date: "2025-03-01" });
  assert.deepEqual(x.temperature.coolestDay, { value: 25, date: "2025-03-02" });
  assert.deepEqual(x.rain.wettestDay, { value: 100, date: "2025-03-03" });
  assert.deepEqual(x.rain.wettestHour, { value: 80, date: "2025-03-03", hour: 17 });
  assert.deepEqual(x.rain.wettestMonth, { value: 100, month: "2025-03" });
  assert.deepEqual(x.rain.longestRain, { value: 240, date: "2025-03-03" });
  assert.deepEqual(x.rain.wetSpell, { days: 1, from: "2025-03-03", to: "2025-03-03", noData: 0 });
  assert.deepEqual(x.sunAir.mostSun, { value: 2.4, date: "2025-03-01" });
  assert.deepEqual(x.sunAir.leastSun, { value: 0.48, date: "2025-03-03" });
  assert.deepEqual(x.sunAir.highestEto, { value: 6.1, date: "2025-03-01" });
  assert.deepEqual(x.sunAir.lowestHumidity, { value: 31, date: "2025-03-02", hour: 0 });
  assert.deepEqual(x.sunAir.mostLightning, { value: 30, date: "2025-03-03" });
});

test("extremes: sunshine and ETo ignore the days before SUN_FROM; nothing to go on gives nulls", () => {
  assert.equal(SUN_FROM, "2025-01-01");
  const docs = [doc(2024, 12, 31, [flat({ solar: 900 }), flat({ solar: 200 })].flat())];
  const daily = [{ date: "2024-12-31", complete: true, eto: 9 }, { date: "2025-01-01", complete: true, eto: 4 }];
  const x = extremes(docs, daily);
  assert.equal(x.sunAir.mostSun.date, "2025-01-01");
  assert.deepEqual(x.sunAir.highestEto, { value: 4, date: "2025-01-01" });
  assert.equal(x.sunAir.mostLightning, null); // no strikes at all is no record
  const empty = extremes([], []);
  assert.equal(empty.from, null);
  assert.equal(empty.temperature.highest, null);
  assert.equal(empty.rain.wettestMonth, null);
  assert.equal(empty.rain.drySpell, null);
});

test("wind: rainy days count; days with a faulty gust count for neither record, short days only for the gust", () => {
  const calm = flat();
  const rainy = withHour(flat({ ws: 2, rain: 3 }), 17, { gust: 15 }); // mean 2 m/s = 7.2 km/h, with a 54 km/h gust
  const faulty = withHour(withHour(flat({ ws: 4 }), 20, { gust: 40 }), 3, { gust: 20 }); // 144 km/h: a sensor fault
  const short = withHour(flat({ ws: 9 }), 2, { gust: 18 }).map((h, i) => (i < 20 ? h : null));
  const x = extremes([doc(2025, 7, 9, [calm, rainy, faulty, short].flat())], []);
  assert.equal(x.wind.windiestDay.date, "2025-07-10");
  assert.ok(Math.abs(x.wind.windiestDay.value - 7.2) < 1e-9);
  assert.equal(x.wind.strongestGust.date, "2025-07-12");
  assert.equal(x.wind.strongestGust.hour, 2);
  assert.ok(Math.abs(x.wind.strongestGust.value - 64.8) < 1e-9);
});

test("monthsSince counts both ends, in local time", () => {
  assert.equal(monthsSince("2024-12", Date.UTC(2026, 9, 6, 12)), 23);
  assert.equal(monthsSince("2024-12", Date.UTC(2024, 11, 25)), 1);
  assert.equal(monthsSince("2024-12", Date.UTC(2027, 0, 1, 3)), 25); // 21:00 on 31 Dec 2026 in Costa Rica
});

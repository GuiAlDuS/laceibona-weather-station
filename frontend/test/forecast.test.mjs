import { test } from "node:test";
import assert from "node:assert/strict";
import { localDate, forecastDays, forecastHours, isRainLikely, isStormHour, contiguousRanges } from "../js/forecast.js";

// day_start_local lands at 06:00 UTC for local (UTC-6) midnight, verified against production data.
test("localDate converts a local-midnight timestamp to its calendar date", () => {
  assert.equal(localDate(1790056800), "2026-09-22");
});

test("forecastDays adds a date field and drops rows with no timestamp", () => {
  const doc = { days: [{ day_start_local: 1790056800, temp_high: 31 }, { conditions: "no timestamp" }] };
  const days = forecastDays(doc);
  assert.equal(days.length, 1);
  assert.equal(days[0].date, "2026-09-22");
  assert.equal(days[0].temp_high, 31);
});

test("a missing or malformed document yields an empty list", () => {
  assert.deepEqual(forecastDays({}), []);
  assert.deepEqual(forecastDays(null), []);
  assert.deepEqual(forecastDays({ days: "nope" }), []);
});

const h = (hour, o = {}) => ({ hour, date: o.date, precip_probability: o.precip ?? 0, precip_type: o.ptype ?? null, icon: o.icon ?? "clear-day" });

// 1790056800 = local midnight 2026-09-22; hour n of that day starts at TODAY + n * 3600.
const TODAY = 1790056800;
const fh = (n) => ({ time: TODAY + n * 3600, hour: n % 24, precip_probability: 0 });

test("forecastHours keeps 24 hours from the current one, in time order across midnight, and tags each date", () => {
  const doc = { next_hours: Array.from({ length: 30 }, (_, i) => fh(18 + i)).reverse() };
  const hours = forecastHours(doc, (TODAY + 20.5 * 3600) * 1000); // 20:30 local, so the 18:00 and 19:00 hours are over
  assert.equal(hours.length, 24);
  assert.equal(hours[0].hour, 20);
  assert.equal(hours[0].date, "2026-09-22");
  assert.deepEqual(hours.slice(3, 5).map((r) => [r.hour, r.date]), [[23, "2026-09-22"], [0, "2026-09-23"]]);
  assert.equal(hours.at(-1).hour, 19);
});

test("forecastHours falls back to the today-only list and drops rows with no time or hour", () => {
  const doc = { hours: [fh(5), fh(3), { precip_probability: 10 }, { ...fh(12), hour: undefined }] };
  assert.deepEqual(forecastHours(doc, TODAY * 1000).map((r) => r.hour), [3, 5]);
});

test("forecastHours on a missing or malformed document yields an empty list", () => {
  assert.deepEqual(forecastHours({}), []);
  assert.deepEqual(forecastHours(null), []);
});

test("isRainLikely is true at or above the threshold", () => {
  assert.equal(isRainLikely(h(0, { precip: 49 })), false);
  assert.equal(isRainLikely(h(0, { precip: 50 })), true);
  assert.equal(isRainLikely(h(0, {})), false);
});

test("isStormHour matches only on a thunderstorm icon, not precip_type (which is a whole-day flag)", () => {
  assert.equal(isStormHour(h(0, { icon: "thunderstorm" })), true);
  assert.equal(isStormHour(h(0, { icon: "possibly-thunderstorm-night" })), true);
  assert.equal(isStormHour(h(0, { ptype: "storm", icon: "clear-day" })), false);
  assert.equal(isStormHour(h(0, { ptype: "rain", icon: "rainy" })), false);
});

test("contiguousRanges groups matching hours and keeps separate runs apart", () => {
  const hours = [h(0), h(1), h(2), h(3), h(4)];
  const ranges = contiguousRanges(hours, (r) => r.hour === 1 || r.hour === 2 || r.hour === 4);
  assert.deepEqual(ranges, [{ start: 1, end: 2, date: undefined }, { start: 4, end: 4, date: undefined }]);
});

test("contiguousRanges keeps a run going across midnight and dates it by its first hour", () => {
  const hours = [h(22, { date: "d1" }), h(23, { date: "d1" }), h(0, { date: "d2" }), h(1, { date: "d2" }), h(2, { date: "d2" })];
  assert.deepEqual(contiguousRanges(hours, (r) => r.hour !== 22 && r.hour !== 2), [{ start: 23, end: 1, date: "d1" }]);
  assert.deepEqual(contiguousRanges(hours, (r) => r.hour >= 1 && r.hour < 22), [{ start: 1, end: 2, date: "d2" }]);
});

test("contiguousRanges returns nothing when no hour matches", () => {
  assert.deepEqual(contiguousRanges([h(0), h(1)], () => false), []);
});

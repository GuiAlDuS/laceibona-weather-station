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

const h = (hour, o = {}) => ({ hour, precip_probability: o.precip ?? 0, precip_type: o.ptype ?? null, icon: o.icon ?? "clear-day" });

test("forecastHours sorts by hour and drops rows with no hour", () => {
  const doc = { hours: [h(5), h(0), { precip_probability: 10 }, h(12)] };
  assert.deepEqual(forecastHours(doc).map((r) => r.hour), [0, 5, 12]);
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
  assert.deepEqual(ranges, [{ start: 1, end: 2 }, { start: 4, end: 4 }]);
});

test("contiguousRanges returns nothing when no hour matches", () => {
  assert.deepEqual(contiguousRanges([h(0), h(1)], () => false), []);
});

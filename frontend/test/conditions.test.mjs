import { test } from "node:test";
import assert from "node:assert/strict";
import { cardinal, kmh, ageMinutes, formatAge, isStale, uvBand, pressureTrend, lastStrikeText, rainNowText, stationTime } from "../js/conditions.js";

test("cardinal points", () => {
  assert.equal(cardinal(0), "N");
  assert.equal(cardinal(90), "E");
  assert.equal(cardinal(200), "SSW");
  assert.equal(cardinal(359), "N");
  assert.equal(cardinal(-10), "N");
  assert.equal(cardinal(null), null);
});

test("wind converts from m/s to km/h with one decimal", () => {
  assert.equal(kmh(1), 3.6);
  assert.equal(kmh(0.4), 1.4);
  assert.equal(kmh(null), null);
});

test("age, formatting and staleness", () => {
  const now = Date.parse("2026-09-21T20:00:00Z");
  assert.equal(ageMinutes("2026-09-21T19:57:30Z", now), 2);
  assert.equal(ageMinutes("2026-09-21T20:05:00Z", now), 0);
  assert.equal(formatAge(0), "just now");
  assert.equal(formatAge(7), "7 min ago");
  assert.equal(formatAge(135), "2 h 15 min ago");
  assert.equal(formatAge(3000), "2 d ago");
  assert.equal(isStale(15), false);
  assert.equal(isStale(16), true);
});

test("UV bands", () => {
  assert.equal(uvBand(2.9), "Low");
  assert.equal(uvBand(3), "Moderate");
  assert.equal(uvBand(7.9), "High");
  assert.equal(uvBand(10), "Very high");
  assert.equal(uvBand(12), "Extreme");
  assert.equal(uvBand(null), null);
});

test("pressure trend text", () => {
  assert.equal(pressureTrend(0.3), "Steady over 3 h");
  assert.equal(pressureTrend(-1.54), "Falling 1.5 hPa in 3 h");
  assert.equal(pressureTrend(2), "Rising 2.0 hPa in 3 h");
  assert.equal(pressureTrend(null), null);
});

test("lightning and rain text", () => {
  const now = Date.parse("2026-09-21T20:00:00Z");
  assert.equal(lastStrikeText(null, now), "No strikes today");
  assert.equal(lastStrikeText({ at: "2026-09-21T19:35:00Z", distance_km: 12 }, now), "Last: 12 km, 25 min ago");
  assert.equal(lastStrikeText({ at: "2026-09-21T19:35:00Z", distance_km: null }, now), "Last: 25 min ago");
  assert.equal(rainNowText(0), "Not raining");
  assert.equal(rainNowText(null), "Not raining");
  assert.equal(rainNowText(1.8), "Raining now: 1.8 mm/h");
});

test("station time is UTC-6", () => {
  assert.equal(stationTime("2026-09-21T20:05:00Z"), "14:05");
  assert.equal(stationTime("2026-09-21T05:59:00Z"), "23:59");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildForecast } from "../src/forecast.js";

const day = (o = {}) => ({
  day_start_local: o.ts ?? 1758427200,
  conditions: o.conditions ?? "Partly Cloudy",
  icon: o.icon ?? "partly-cloudy-day",
  air_temp_high: o.high ?? 30,
  air_temp_low: o.low ?? 21,
  precip_probability: o.precip ?? 20,
  precip_type: o.ptype ?? "rain",
});

const now = new Date("2026-09-22T12:00:00Z");

test("keeps today plus the next 6 days by default", () => {
  const daily = Array.from({ length: 10 }, (_, i) => day({ ts: 1758427200 + i * 86400 }));
  const doc = buildForecast({ forecast: { daily } }, { now });
  assert.equal(doc.days.length, 7);
  assert.equal(doc.generated_at, now.toISOString());
});

test("maps the named fields through", () => {
  const doc = buildForecast({ forecast: { daily: [day({ high: 32.1, low: 19.4, precip: 60, conditions: "Rain", ptype: "rain" })] } }, { now });
  assert.deepEqual(doc.days[0], {
    day_start_local: 1758427200,
    conditions: "Rain",
    icon: "partly-cloudy-day",
    temp_high: 32.1,
    temp_low: 19.4,
    precip_probability: 60,
    precip_type: "rain",
  });
});

test("a missing or malformed forecast object yields an empty day list, not a throw", () => {
  assert.deepEqual(buildForecast({}, { now }).days, []);
  assert.deepEqual(buildForecast({ forecast: {} }, { now }).days, []);
  assert.deepEqual(buildForecast(null, { now }).days, []);
});

test("null/non-numeric fields stay null instead of coercing", () => {
  const doc = buildForecast({ forecast: { daily: [{ ...day(), air_temp_high: "N/A" }] } }, { now });
  assert.equal(doc.days[0].temp_high, null);
});

// 1790056800 = 06:00 UTC on 2026-09-22, i.e. local (UTC-6) midnight that day (verified against real data).
const TODAY_START = 1790056800;
const hour = (h, o = {}) => ({
  time: TODAY_START + h * 3600,
  conditions: o.conditions ?? "Clear",
  icon: o.icon ?? "clear-day",
  air_temperature: o.temp ?? 25,
  precip_probability: o.precip ?? 0,
  precip_type: o.ptype ?? null,
});

test("keeps only today's hours (0-23 local) and tags each with its local hour", () => {
  const hourly = [hour(0), hour(12), hour(23), { ...hour(0), time: TODAY_START - 3600 }, { ...hour(0), time: TODAY_START + 24 * 3600 }];
  const doc = buildForecast({ forecast: { daily: [{ day_start_local: TODAY_START }], hourly } }, { now });
  assert.deepEqual(doc.hours.map((h) => h.hour), [0, 12, 23]);
});

test("maps the named hourly fields through", () => {
  const hourly = [hour(14, { temp: 31.5, precip: 80, ptype: "storm", conditions: "Thunderstorms Likely", icon: "thunderstorm" })];
  const doc = buildForecast({ forecast: { daily: [{ day_start_local: TODAY_START }], hourly } }, { now });
  assert.deepEqual(doc.hours[0], { time: TODAY_START + 14 * 3600, hour: 14, conditions: "Thunderstorms Likely", icon: "thunderstorm", temp: 31.5, precip_probability: 80, precip_type: "storm" });
});

test("no daily entry (so no 'today' to filter by) or no hourly array yields an empty hour list", () => {
  assert.deepEqual(buildForecast({ forecast: { daily: [], hourly: [hour(0)] } }, { now }).hours, []);
  assert.deepEqual(buildForecast({ forecast: { daily: [{ day_start_local: TODAY_START }] } }, { now }).hours, []);
});

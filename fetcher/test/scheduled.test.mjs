import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const STATS = {
  status: { status_code: 0 },
  station_id: 1,
  first_ob_day_local: "2026-01-01",
  last_ob_day_local: "2026-01-02",
  stats_day: [],
};
const OBS = { status: { status_code: 0 }, obs: [[1790000000, 0, 0.5, 1, 90, 3, 1000, 27, 80, 30000, 3, 250, 0, 0, 0, 0, 2.6, 1]] };
const FORECAST = { status: { status_code: 0 }, forecast: { daily: [{ day_start_local: 1790000000, conditions: "Clear", icon: "clear-day", air_temp_high: 30, air_temp_low: 21, precip_probability: 10, precip_type: "rain" }] } };

function setup({ failCurrent = false, stored = {} } = {}) {
  const writes = {};
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/stats/station/")) return Response.json(STATS);
    if (failCurrent) return new Response("nope", { status: 500 });
    if (String(url).includes("/better_forecast")) return Response.json(FORECAST);
    return Response.json(OBS);
  };
  const env = {
    STATION_ID: "1",
    DEVICE_ID: "2",
    TEMPEST_TOKEN: "t",
    WEATHER_DATA: { put: async (k, v) => void (writes[k] = v), get: async (k) => (stored[k] ? JSON.parse(stored[k]) : null) },
  };
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p) };
  return { env, ctx, writes, calls, done: () => Promise.allSettled(pending) };
}

const at = (iso) => ({ scheduledTime: Date.parse(iso), cron: "*/5 * * * *" });

test("an ordinary tick refreshes only `current`", async () => {
  const s = setup();
  await worker.scheduled(at("2026-09-21T16:35:00Z"), s.env, s.ctx);
  await s.done();
  assert.deepEqual(Object.keys(s.writes).sort(), ["current", "wind24h"]);
  assert.ok(s.calls.every((u) => u.includes("/observations/device/2")));
});

test("the 07:00 UTC tick also rebuilds daily:all and forecast", async () => {
  const s = setup();
  await worker.scheduled(at("2026-09-22T07:00:11Z"), s.env, s.ctx);
  await s.done();
  assert.deepEqual(Object.keys(s.writes).sort(), ["current", "daily:all", "fine7d", "forecast", "obs:2026-09", "wind24h"]);
});

test("the 07:05 tick and the 06:55 tick do not rebuild daily:all", async () => {
  for (const iso of ["2026-09-22T07:05:11Z", "2026-09-22T06:55:11Z"]) {
    const s = setup();
    await worker.scheduled(at(iso), s.env, s.ctx);
    await s.done();
    assert.deepEqual(Object.keys(s.writes).sort(), ["current", "wind24h"], iso);
  }
});

test("a failing job records status:last_error and leaves `current` and `wind24h` untouched", async () => {
  const s = setup({ failCurrent: true });
  await worker.scheduled(at("2026-09-21T16:35:00Z"), s.env, s.ctx);
  await s.done();
  assert.deepEqual(Object.keys(s.writes), ["status:last_error"]);
  const err = JSON.parse(s.writes["status:last_error"]);
  assert.ok(["refreshCurrent", "refreshWind"].includes(err.job));
  assert.match(err.error, /HTTP 500/);
});

test("the Tempest token goes in a header, never in the URL", async () => {
  const s = setup();
  await worker.scheduled(at("2026-09-22T07:00:11Z"), s.env, s.ctx);
  await s.done();
  assert.ok(s.calls.every((u) => !u.includes("token=")));
});

test("the first tick of an hour appends the finished hours to obs:YYYY-MM, starting after the last stored hour", async () => {
  const hourStart = Date.parse("2026-09-21T16:00:00Z") / 1000;
  const start = Date.UTC(2026, 8, 1, 6) / 1000;
  const cols = Object.fromEntries(["t", "tmin", "tmax", "rh", "p", "ws", "gust", "wd", "rain", "solar", "uv", "ltn", "n"].map((c) => [c, new Array(720).fill(null)]));
  cols.n[(hourStart - 2 * 3600 - start) / 3600] = 60; // 14:00Z is the last stored hour
  const stored = { "obs:2026-09": JSON.stringify({ month: "2026-09", start, hours: 720, cols }) };
  const s = setup({ stored });
  await worker.scheduled(at("2026-09-21T16:00:11Z"), s.env, s.ctx);
  await s.done();
  assert.deepEqual(Object.keys(s.writes).sort(), ["current", "fine7d", "forecast", "obs:2026-09", "wind24h"]);
  const call = s.calls.find((u) => u.includes("time_end=" + (hourStart - 1)));
  assert.ok(call.includes(`time_start=${hourStart - 3600}`), call); // resumes right after the stored hour
});

test("fine7d is refreshed every second tick (:00, :10, ...) and only with finished buckets", async () => {
  const s = setup();
  await worker.scheduled(at("2026-09-21T16:10:11Z"), s.env, s.ctx);
  await s.done();
  assert.deepEqual(Object.keys(s.writes).sort(), ["current", "fine7d", "wind24h"]);
  const end = Date.parse("2026-09-21T16:10:00Z") / 1000;
  assert.ok(s.calls.some((u) => u.includes(`time_start=${end - 6 * 3600}&time_end=${end - 1}`)), s.calls.join("\n")); // empty store: 6 h back
  const doc = JSON.parse(s.writes.fine7d);
  assert.equal(doc.start + doc.slots * doc.step, end);
});

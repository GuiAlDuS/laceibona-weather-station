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

function setup({ failCurrent = false } = {}) {
  const writes = {};
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/stats/station/")) return Response.json(STATS);
    if (failCurrent) return new Response("nope", { status: 500 });
    return Response.json(OBS);
  };
  const env = {
    STATION_ID: "1",
    DEVICE_ID: "2",
    TEMPEST_TOKEN: "t",
    WEATHER_DATA: { put: async (k, v) => void (writes[k] = v) },
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
  assert.deepEqual(Object.keys(s.writes), ["current"]);
  assert.ok(s.calls.every((u) => u.includes("/observations/device/2")));
});

test("the 07:00 UTC tick also rebuilds daily:all", async () => {
  const s = setup();
  await worker.scheduled(at("2026-09-22T07:00:11Z"), s.env, s.ctx);
  await s.done();
  assert.deepEqual(Object.keys(s.writes).sort(), ["current", "daily:all"]);
});

test("the 07:05 tick and the 06:55 tick do not rebuild daily:all", async () => {
  for (const iso of ["2026-09-22T07:05:11Z", "2026-09-22T06:55:11Z"]) {
    const s = setup();
    await worker.scheduled(at(iso), s.env, s.ctx);
    await s.done();
    assert.deepEqual(Object.keys(s.writes), ["current"], iso);
  }
});

test("a failing job records status:last_error and leaves `current` untouched", async () => {
  const s = setup({ failCurrent: true });
  await worker.scheduled(at("2026-09-21T16:35:00Z"), s.env, s.ctx);
  await s.done();
  assert.deepEqual(Object.keys(s.writes), ["status:last_error"]);
  const err = JSON.parse(s.writes["status:last_error"]);
  assert.equal(err.job, "refreshCurrent");
  assert.match(err.error, /HTTP 500/);
});

test("the Tempest token goes in a header, never in the URL", async () => {
  const s = setup();
  await worker.scheduled(at("2026-09-22T07:00:11Z"), s.env, s.ctx);
  await s.done();
  assert.ok(s.calls.every((u) => !u.includes("token=")));
});

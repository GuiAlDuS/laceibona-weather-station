import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateHours, buildMonth, lightningEvents, monthKeyLocal, monthStartSec, yearKeyLocal, COLS } from "../src/hourly.js";

// obs_st row: [ts, lull, avg, gust, dir, interval, pressure, temp, rh, lux, uv, solar, rain, ptype, ldist, lcount, battery, report]
const row = (ts, o = {}) => [
  ts, 0, o.avg ?? 1, o.gust ?? 2, o.dir ?? 90, 3,
  o.p ?? 1000, o.temp ?? 27, o.rh ?? 80, 0, o.uv ?? 1, o.solar ?? 200,
  o.rain ?? 0, 0, o.ldist ?? 0, o.lcount ?? 0, 2.6, 1,
];
const T = Date.UTC(2026, 8, 21, 20, 0, 0) / 1000; // 14:00 local

test("groups 1-minute rows into hours and aggregates each column", () => {
  const rows = [row(T, { temp: 26, rain: 0.2, gust: 3 }), row(T + 60, { temp: 28, rain: 0.3, gust: 5 }), row(T + 3600, { temp: 30 })];
  const h = aggregateHours(rows);
  assert.equal(h.size, 2);
  const a = h.get(T);
  assert.equal(a.t, 27);
  assert.equal(a.tmin, 26);
  assert.equal(a.tmax, 28);
  assert.equal(a.rain, 0.5);
  assert.equal(a.gust, 5);
  assert.equal(a.n, 2);
  assert.equal(h.get(T + 3600).t, 30);
});

test("rain is null when no reading exists and lightning sums counts", () => {
  const r = row(T, { lcount: 4 });
  r[12] = null;
  const a = aggregateHours([r, row(T + 60, { lcount: 3 })]).get(T);
  assert.equal(a.ltn, 7);
  assert.equal(a.rain, 0);
  const only = row(T);
  only[12] = null;
  assert.equal(aggregateHours([only]).get(T).rain, null);
});

test("wind direction is a speed-weighted circular mean", () => {
  // 350 and 10 degrees average to north, not 180
  const north = aggregateHours([row(T, { dir: 350 }), row(T + 60, { dir: 10 })]).get(T);
  assert.ok(north.wd === 0 || north.wd === 360 - 0);
  // a strong east wind outweighs a light west wind
  const east = aggregateHours([row(T, { dir: 90, avg: 5 }), row(T + 60, { dir: 270, avg: 1 })]).get(T);
  assert.equal(east.wd, 90);
});

test("calm hours fall back to an unweighted mean; no direction gives null", () => {
  const calm = aggregateHours([row(T, { dir: 100, avg: 0 }), row(T + 60, { dir: 100, avg: 0 })]).get(T);
  assert.equal(calm.wd, 100);
  const r = row(T);
  r[4] = null;
  assert.equal(aggregateHours([r]).get(T).wd, null);
});

test("ignores malformed rows", () => {
  const h = aggregateHours([[], null, ["x"], row(T)]);
  assert.equal(h.size, 1);
});

test("month keys and starts use local time (UTC-6)", () => {
  assert.equal(monthKeyLocal(Date.UTC(2026, 8, 1, 5, 59) / 1000), "2026-08");
  assert.equal(monthKeyLocal(Date.UTC(2026, 8, 1, 6, 0) / 1000), "2026-09");
  assert.equal(monthStartSec("2026-09"), Date.UTC(2026, 8, 1, 6) / 1000);
  assert.equal(yearKeyLocal(Date.UTC(2026, 0, 1, 5, 0) / 1000), "2025");
});

test("buildMonth lays hourly records into columns by local hour, null where missing", () => {
  const hours = aggregateHours([row(Date.UTC(2026, 8, 1, 6, 0) / 1000, { temp: 24 }), row(Date.UTC(2026, 8, 1, 8, 30) / 1000, { temp: 25 })]);
  const m = buildMonth(hours, "2026-09");
  assert.equal(m.month, "2026-09");
  assert.equal(m.hours, 720);
  assert.equal(Object.keys(m.cols).length, COLS.length);
  assert.equal(m.cols.t.length, 720);
  assert.equal(m.cols.t[0], 24);
  assert.equal(m.cols.t[1], null);
  assert.equal(m.cols.t[2], 25);
});

test("buildMonth keeps only the requested month and handles leap February", () => {
  const hours = aggregateHours([row(Date.UTC(2026, 8, 1, 5, 0) / 1000), row(Date.UTC(2026, 8, 1, 6, 0) / 1000)]);
  assert.equal(buildMonth(hours, "2026-09").cols.n.filter((v) => v !== null).length, 1);
  assert.equal(buildMonth(hours, "2026-08").cols.n.filter((v) => v !== null).length, 1);
  assert.equal(buildMonth(new Map(), "2024-02").hours, 24 * 29);
});

test("lightning events keep minutes with strikes only", () => {
  const noDistance = row(T + 120, { lcount: 1 });
  noDistance[14] = null;
  const ev = lightningEvents([row(T), row(T + 60, { lcount: 3, ldist: 12.34 }), noDistance]);
  assert.deepEqual(ev, [[T + 60, 12.3, 3], [T + 120, null, 1]]);
});

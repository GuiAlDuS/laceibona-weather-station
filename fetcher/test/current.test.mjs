import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCurrent, localDate, localMidnightSec } from "../src/current.js";

// obs_st row: [ts, lull, avg, gust, dir, interval, pressure, temp, rh, lux, uv, solar, rain, ptype, ldist, lcount, battery, report]
const row = (ts, o = {}) => [
  ts, o.lull ?? 0.1, o.avg ?? 0.5, o.gust ?? 1.2, o.dir ?? 90, 3,
  o.pressure ?? 1000, o.temp ?? 27, o.rh ?? 80, o.lux ?? 30000, o.uv ?? 3, o.solar ?? 250,
  o.rain ?? 0, 0, o.ldist ?? 0, o.lcount ?? 0, 2.6, 1,
];

const T0 = Date.UTC(2026, 8, 21, 20, 0, 0) / 1000; // 14:00 local
const now = (T0 + 60) * 1000;

test("local date and midnight use UTC-6", () => {
  assert.equal(localDate(Date.UTC(2026, 8, 21, 5, 59) ), "2026-09-20");
  assert.equal(localDate(Date.UTC(2026, 8, 21, 6, 0)), "2026-09-21");
  assert.equal(localMidnightSec(Date.UTC(2026, 8, 21, 20)), Date.UTC(2026, 8, 21, 6) / 1000);
});

test("latest row supplies the current values", () => {
  const c = buildCurrent([row(T0 - 60, { temp: 20 }), row(T0, { temp: 28.4, rh: 71, pressure: 1001.2, dir: 200 })], now);
  assert.equal(c.temp, 28.4);
  assert.equal(c.humidity, 71);
  assert.equal(c.pressure, 1001.2);
  assert.equal(c.wind_dir, 200);
  assert.equal(c.updated_at, new Date(T0 * 1000).toISOString());
  assert.equal(c.local_date, "2026-09-21");
});

test("rows are sorted by time before choosing the latest", () => {
  const c = buildCurrent([row(T0, { temp: 30 }), row(T0 - 120, { temp: 10 })], now);
  assert.equal(c.temp, 30);
});

test("today's extremes, rain total and lightning", () => {
  const rows = [row(T0 - 300, { temp: 22, gust: 5, rain: 0.5, lcount: 3, ldist: 12, uv: 8 }), row(T0 - 120, { temp: 33, gust: 2, rain: 1.5 }), row(T0, { temp: 30 })];
  const c = buildCurrent(rows, now);
  assert.equal(c.today.temp_min, 22);
  assert.equal(c.today.temp_max, 33);
  assert.equal(c.today.gust_max, 5);
  assert.equal(c.today.uv_max, 8);
  assert.equal(c.today.rain_mm, 2);
  assert.equal(c.today.lightning, 3);
  assert.deepEqual(c.last_lightning, { at: new Date((T0 - 300) * 1000).toISOString(), distance_km: 12 });
});

test("rain rate extrapolates the last 10 minutes to mm/h", () => {
  const rows = [row(T0 - 1200, { rain: 5 }), row(T0 - 300, { rain: 0.2 }), row(T0, { rain: 0.1 })];
  assert.equal(buildCurrent(rows, now).rain_rate, 1.8);
});

test("no rain and no lightning give zero rate and null last strike", () => {
  const c = buildCurrent([row(T0)], now);
  assert.equal(c.rain_rate, 0);
  assert.equal(c.last_lightning, null);
  assert.equal(c.today.lightning, 0);
});

test("3-hour pressure change needs a row about 3 hours earlier", () => {
  const rows = [row(T0 - 3 * 3600, { pressure: 1003 }), row(T0, { pressure: 1001.5 })];
  assert.equal(buildCurrent(rows, now).pressure_change_3h, -1.5);
  assert.equal(buildCurrent([row(T0 - 600, { pressure: 1003 }), row(T0)], now).pressure_change_3h, null);
});

test("null sensor values stay null, and empty input throws", () => {
  const r = row(T0);
  r[7] = null;
  assert.equal(buildCurrent([r], now).temp, null);
  assert.throws(() => buildCurrent([], now));
  assert.throws(() => buildCurrent([[]], now));
});

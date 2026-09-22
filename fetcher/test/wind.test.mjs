import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWind24h } from "../src/wind.js";

test("keeps the last 24 hours in time order as ws/wd columns, with non-numbers as null", () => {
  const now = Date.parse("2026-09-21T12:00:00Z");
  const t = now / 1000;
  const rows = [[t - 60, 0, 2, 3, 90], [t - 90000, 0, 9, 9, 9], [t - 120, 0, null, 3, 180], "junk"];
  const d = buildWind24h(rows, now);
  assert.deepEqual(d.cols, { ts: [t - 120, t - 60], ws: [null, 2], wd: [180, 90] });
  assert.equal(d.hourly.length, 0); // these rows carry no temperature
  assert.equal(d.to, new Date((t - 60) * 1000).toISOString());
});

test("hourly carries the mean, min, max and minute count of temperature per hour, including a partial one", () => {
  const now = Date.parse("2026-09-21T12:20:00Z");
  const h = Date.parse("2026-09-21T12:00:00Z") / 1000;
  const row = (ts, temp) => [ts, 0, 1, 2, 90, 3, 1000, temp, 80];
  const d = buildWind24h([row(h - 60, 26), row(h, 30), row(h + 60, 32)], now);
  assert.deepEqual(d.hourly, [[h - 3600, 26, 26, 26, 1], [h, 31, 30, 32, 2]]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { dayRecord, buildDaily } from "../src/daily.js";

const good = ["2026-09-18", 1000.7, 1001.8, 999.5, 27.6, 35.5, 23.7, 87, 98, 64, 33928, 187269, 2, 3.6, 19.7, 0, 283, 1560, 0, 0.4, 3.05, 0, 83, 15, 110, 1, 1379, 2.6, 10.5396, null, 160, null, 2, 0];
const gap = ["2025-07-12", ...Array(33).fill(null)];

test("maps fields and computes ETo for a complete day", () => {
  const r = dayRecord(good, { today: "2026-09-21" });
  assert.equal(r.date, "2026-09-18");
  assert.equal(r.rain_mm, 10.5396);
  assert.equal(r.lightning, 110);
  assert.equal(r.wind_avg, 0.4);
  assert.equal(r.complete, true);
  assert.ok(r.eto > 2 && r.eto < 7);
});

test("gap rows keep the date with nulls and no ETo", () => {
  const r = dayRecord(gap, { today: "2026-09-21" });
  assert.equal(r.date, "2025-07-12");
  assert.equal(r.eto, null);
  assert.equal(r.complete, false);
  assert.equal(r.rain_mm, null);
});

test("today's partial row is flagged incomplete", () => {
  const r = dayRecord(good, { today: "2026-09-18" });
  assert.equal(r.complete, false);
  assert.equal(r.eto, null);
});

test("buildDaily uses local UTC-6 date for 'today'", () => {
  const body = { station_id: 1, first_ob_day_local: "2026-09-18", last_ob_day_local: "2026-09-18", stats_day: [good] };
  // 03:00 UTC on 09-19 is still 09-18 locally
  const doc = buildDaily(body, { now: new Date("2026-09-19T03:00:00Z") });
  assert.equal(doc.days[0].complete, false);
  const doc2 = buildDaily(body, { now: new Date("2026-09-19T07:00:00Z") });
  assert.equal(doc2.days[0].complete, true);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { SENSOR_FIX, sensorFixed, fixObsMonth, fixFine, fixDaily } from "../js/sensor-fix.js";
import { dayRecord } from "../../fetcher/src/daily.js";

const F = SENSOR_FIX.factor;
const localMidnight = (y, m, d) => Date.UTC(y, m - 1, d, 6) / 1000; // UTC-6

test("the affected days are whole local days, both ends included", () => {
  assert.equal(sensorFixed("2026-08-24"), false);
  assert.equal(sensorFixed("2026-08-25"), true);
  assert.equal(sensorFixed("2026-09-30"), true);
  assert.equal(sensorFixed("2026-10-01"), false);
  assert.equal(sensorFixed("2025-09-10"), false);
});

test("hourly solar is divided from local midnight of 25 Aug; other columns and days are untouched", () => {
  const hours = 31 * 24;
  const doc = { month: "2026-08", start: localMidnight(2026, 8, 1), hours, cols: { t: new Array(hours).fill(27.3), solar: new Array(hours).fill(1350) } };
  doc.cols.solar[0] = null;
  const out = fixObsMonth(doc);
  const first = 24 * 24; // 00:00 on 25 Aug
  assert.equal(out.cols.solar[first - 1], 1350);
  assert.equal(out.cols.solar[first], Math.round(1350 / F));
  assert.equal(out.cols.solar[0], null);
  assert.deepEqual(out.cols.t, doc.cols.t);
  assert.equal(doc.cols.solar[first], 1350, "the loaded document is not changed in place");
});

test("the last affected hour is 23:00 on 30 Sep", () => {
  const hours = 2 * 24;
  const out = fixObsMonth({ start: localMidnight(2026, 9, 30), hours, cols: { solar: new Array(hours).fill(1350) } });
  assert.equal(out.cols.solar[23], 1000);
  assert.equal(out.cols.solar[24], 1350);
});

test("a month outside the period comes back unchanged", () => {
  const doc = { start: localMidnight(2025, 9, 1), hours: 24, cols: { solar: new Array(24).fill(900) } };
  assert.deepEqual(fixObsMonth(doc), doc);
});

test("10-minute solar is divided, rain is not", () => {
  const slots = 2 * 144;
  const doc = { step: 600, start: localMidnight(2026, 9, 30), slots, cols: { rain: new Array(slots).fill(0.2), solar: new Array(slots).fill(675) } };
  const out = fixFine(doc);
  assert.equal(out.cols.solar[143], 500);
  assert.equal(out.cols.solar[144], 675);
  assert.deepEqual(out.cols.rain, doc.cols.rain);
});

// A stats_day row (PROJECT.md §2) with the fields ETo needs.
function statsRow(date, solarAvg) {
  const row = new Array(34).fill(null);
  Object.assign(row, { 0: date, 1: 1001.2, 4: 26.1, 5: 32.4, 6: 22.3, 7: 78, 8: 96, 9: 52, 10: solarAvg * 120, 13: 3.1, 14: 15.5, 16: solarAvg, 17: 1480, 19: 1.4, 26: 1380, 28: 3.2 });
  return row;
}

test("daily light readings are divided and ETo is what the fetcher gives for the corrected solar radiation", () => {
  const before = dayRecord(statsRow("2026-08-24", 270));
  const during = dayRecord(statsRow("2026-09-10", 270));
  const out = fixDaily({ days: [before, during] }).days;
  assert.deepEqual(out[0], before);
  assert.equal(out[1].solar_avg, 200);
  assert.equal(out[1].uv_max, Math.round((15.5 / F) * 100) / 100);
  assert.equal(out[1].eto, dayRecord(statsRow("2026-09-10", 200)).eto);
  assert.ok(out[1].eto < during.eto);
  assert.equal(out[1].rain_mm, 3.2);
});

test("a day without ETo stays without one", () => {
  const row = statsRow("2026-09-10", 270);
  row[26] = 400; // too few samples: incomplete
  const day = dayRecord(row);
  assert.equal(day.eto, null);
  assert.equal(fixDaily({ days: [day] }).days[0].eto, null);
});

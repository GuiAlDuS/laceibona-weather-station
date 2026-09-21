import { test } from "node:test";
import assert from "node:assert/strict";
import { eto, dayOfYear, etoFromStatsRow } from "../src/eto.js";

test("dayOfYear", () => {
  assert.equal(dayOfYear("2026-01-01"), 1);
  assert.equal(dayOfYear("2026-12-31"), 365);
  assert.equal(dayOfYear("2024-12-31"), 366);
  assert.equal(dayOfYear("2026-07-06"), 187);
});

// FAO-56 Example 18 (Allen et al. 1998): Uccle, Brussels, 6 July.
// Tmax 21.5, Tmin 12.3, RHmax 84, RHmin 63, u2 2.078 m/s, Rs 22.07 MJ/m²/d,
// lat 50.80°, z 100 m -> ETo = 3.9 mm/day. windHeightM=2 makes the height factor 1.
test("FAO-56 Example 18", () => {
  const et = eto({
    tmax: 21.5, tmin: 12.3, rhmax: 84, rhmin: 63, u: 2.078, rsMJ: 22.07,
    doy: 187, latDeg: 50.8, elevationM: 100, windHeightM: 2,
  });
  assert.ok(Math.abs(et - 3.9) < 0.1, `got ${et}`);
});

test("wind height factor at 4 m", () => {
  const factor = 4.87 / Math.log(67.8 * 4 - 5.42);
  assert.ok(Math.abs(factor - 0.872) < 0.001);
});

test("null / incomplete rows return null", () => {
  const nulls = ["2025-07-12", ...Array(33).fill(null)];
  assert.equal(etoFromStatsRow(nulls), null);
  const partial = ["2026-09-21", 1001, 1002, 1000, 24.4, 27, 23.9, 98, 99, 92, 1, 1, 1, 1, 1, 1, 283, 1, 1, 0.4, 1, 0, 1, 15, 0, null, 522];
  assert.equal(etoFromStatsRow(partial), null);
});

test("real Tempest day gives a plausible tropical ETo", () => {
  const row = ["2026-09-18", 1000.7, 1001.8, 999.5, 27.6, 35.5, 23.7, 87, 98, 64, 33928, 187269, 2, 3.6, 19.7, 0, 283, 1560, 0, 0.4, 3.05, 0, 83, 15, 110, 1, 1379, 2.6, 10.5396, null, 160, null, 2, 0];
  const et = etoFromStatsRow(row);
  assert.ok(et > 2 && et < 7, `got ${et}`);
});

test("measured pressure is used when plausible, ignored when faulty", () => {
  const base = { tmax: 30, tmin: 22, rhmax: 95, rhmin: 60, u: 1, rsMJ: 18, doy: 100, latDeg: 9.98, elevationM: 88, windHeightM: 4 };
  const est = eto(base);
  assert.equal(eto({ ...base, pressureHPa: 896 }), est);
  assert.equal(eto({ ...base, pressureHPa: undefined }), est);
  assert.notEqual(eto({ ...base, pressureHPa: 1010 }), est);
});

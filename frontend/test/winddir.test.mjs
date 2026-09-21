import { test } from "node:test";
import assert from "node:assert/strict";
import { monthDirectionFrequency, prevailing, ROW_SECTORS } from "../js/winddir.js";

const doc = (month, ws, wd) => ({ month, cols: { ws, wd } });

test("rows run S..W..N..E..S with south at both ends", () => {
  assert.equal(ROW_SECTORS.length, 17);
  assert.equal(ROW_SECTORS[0], 8);
  assert.equal(ROW_SECTORS[16], 8);
  assert.equal(ROW_SECTORS[8], 0); // N in the middle
});

test("percentages are of non-calm hours; south is repeated in both rows", () => {
  const hm = monthDirectionFrequency([doc("2026-01", [1, 1, 1, 2, 0.1], [45, 45, 180, 181, 90])]);
  const at = (row) => hm.z[row][0];
  assert.equal(at(10), 50); // NE (sector 2) is row 10
  assert.equal(at(0), 50); // S, bottom (180 and 181 both round to S)
  assert.equal(at(16), 50); // S, top
  assert.equal(hm.z[12][0], 0);
});

test("a month with no usable hours is null, missing values are skipped, months sort oldest first", () => {
  const hm = monthDirectionFrequency([doc("2026-02", [0.1], [10]), doc("2026-01", [null, 2], [90, null])]);
  assert.deepEqual(hm.months.map((m) => m.key), ["2026-01", "2026-02"]);
  assert.equal(hm.z[0][0], null);
  assert.equal(hm.z[0][1], null);
});

test("prevailing picks the direction with the highest average share", () => {
  const hm = monthDirectionFrequency([doc("2026-01", [1, 1, 1], [45, 45, 180]), doc("2026-02", [1, 1], [50, 200])]);
  const p = prevailing(hm);
  assert.equal(p.name, "NE");
  assert.ok(Math.abs(p.percent - (200 / 3 + 50) / 2) < 1e-9);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { windRose, sliceWindow } from "../js/windrose.js";

const doc = (ws, wd) => ({ cols: { ws, wd } });
const tsDoc = (ts, ws, wd) => ({ cols: { ts, ws, wd } });

test("directions round to 16 sectors (350° and 5° are both N) and speeds are binned", () => {
  const r = windRose([doc([1.5, 0.7, 4], [350, 5, 90])]);
  const by = Object.fromEntries(r.sectors.map((s) => [s.name, s]));
  assert.equal(r.hours, 3);
  assert.ok(Math.abs(by.N.percent - 200 / 3) < 1e-9);
  assert.deepEqual(by.N.bins.map((p) => Math.round(p)), [33, 33, 0, 0]);
  assert.ok(Math.abs(by.E.bins[3] - 100 / 3) < 1e-9);
});

test("hours missing speed or direction are skipped", () => {
  const r = windRose([doc([0.2, null, 2, 1], [null, 90, 180, null])]);
  assert.equal(r.hours, 1); // only the S hour has both values
  assert.equal(r.sectors.find((s) => s.name === "S").percent, 100);
});

test("calm hours with a direction are reported separately", () => {
  const r = windRose([doc([0.1, 2], [10, 10])]);
  assert.equal(r.calmPercent, 50);
  assert.equal(r.sectors[0].percent, 50);
});

test("sliceWindow keeps samples within `hours` of the doc's own last timestamp", () => {
  const H = 3600;
  const d = tsDoc([0, 6 * H, 12 * H, 18 * H, 24 * H], [1, 2, 3, 4, 5], [10, 20, 30, 40, 50]);
  const six = sliceWindow(d, 6);
  assert.deepEqual(six, { cols: { ws: [4, 5], wd: [40, 50] } });
  const twelve = sliceWindow(d, 12);
  assert.deepEqual(twelve, { cols: { ws: [3, 4, 5], wd: [30, 40, 50] } });
});

test("sliceWindow on an empty doc returns empty columns", () => {
  assert.deepEqual(sliceWindow(tsDoc([], [], []), 6), { cols: { ws: [], wd: [] } });
});

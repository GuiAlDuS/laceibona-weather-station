import { test } from "node:test";
import assert from "node:assert/strict";
import { monthHourMeans, extremes } from "../js/heatmap.js";

const doc = (month, days, fn) => ({ month, hours: days * 24, cols: { t: Array.from({ length: days * 24 }, (_, i) => fn(i)) } });

test("averages each local hour over the month; months come back oldest first", () => {
  const hm = monthHourMeans([doc("2026-02", 28, (i) => 20 + (i % 24)), doc("2026-01", 31, (i) => 10)], "t");
  assert.deepEqual(hm.months.map((m) => m.key), ["2026-01", "2026-02"]);
  assert.equal(hm.z.length, 24);
  assert.equal(hm.z[5][0], 10);
  assert.equal(hm.z[5][1], 25);
});

test("null slots are skipped, an hour with no data is null, and sparse months are partial", () => {
  const d = doc("2026-03", 2, (i) => (i % 24 === 0 ? null : i < 24 ? 30 : 32));
  const hm = monthHourMeans([d], "t");
  assert.equal(hm.z[0][0], null);
  assert.equal(hm.z[1][0], 31);
  const sparse = monthHourMeans([doc("2026-04", 30, (i) => (i < 100 ? 1 : null))], "t");
  assert.equal(sparse.months[0].partial, true);
  assert.equal(hm.months[0].partial, false);
});

test("extremes finds the hottest and coldest cells", () => {
  const hm = monthHourMeans([doc("2026-01", 31, (i) => i % 24), doc("2026-02", 28, (i) => (i % 24) + 5)], "t");
  const { hi, lo } = extremes(hm);
  assert.deepEqual([hi.month, hi.hour, hi.value], ["2026-02", 23, 28]);
  assert.deepEqual([lo.month, lo.hour, lo.value], ["2026-01", 0, 0]);
});

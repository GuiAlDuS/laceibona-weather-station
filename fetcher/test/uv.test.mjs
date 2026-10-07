import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateUv, mergeUv, lastFilledDay, PER_DAY } from "../src/uv.js";

// Local (UTC-6) time -> unix seconds.
const local = (y, m, d, h = 0, min = 0) => Date.UTC(y, m - 1, d, h + 6, min) / 1000;
const row = (ts, uv) => {
  const r = new Array(18).fill(0);
  r[0] = ts;
  r[10] = uv;
  return r;
};

test("10-minute means, daylight hours only", () => {
  const buckets = aggregateUv([
    row(local(2026, 3, 1, 12, 0), 10),
    row(local(2026, 3, 1, 12, 1), 11),
    row(local(2026, 3, 1, 12, 9), 12.01),
    row(local(2026, 3, 1, 12, 10), 4),
    row(local(2026, 3, 1, 5, 59), 0.3), // before 06:00
    row(local(2026, 3, 1, 18, 0), 0.2), // from 18:00 on
    row(local(2026, 3, 1, 13, 0), null),
    "junk",
  ]);
  assert.deepEqual([...buckets], [[local(2026, 3, 1, 12, 0), 11], [local(2026, 3, 1, 12, 10), 4]]);
});

test("a month document has 72 slots a day; buckets land in their day and time", () => {
  const buckets = new Map([
    [local(2026, 2, 1, 6, 0), 0.1],
    [local(2026, 2, 3, 12, 30), 9.5],
    [local(2026, 2, 28, 17, 50), 0.4],
    [local(2026, 3, 1, 12, 0), 7], // another month: ignored
  ]);
  const doc = mergeUv(null, buckets, "2026-02");
  assert.equal(PER_DAY, 72);
  assert.equal(doc.uv.length, 28 * 72);
  assert.equal(doc.start, local(2026, 2, 1));
  assert.equal(doc.uv[0], 0.1);
  assert.equal(doc.uv[2 * 72 + 39], 9.5);
  assert.equal(doc.uv.at(-1), 0.4);
  assert.equal(doc.uv.filter((v) => v !== null).length, 3);
});

test("merging keeps what is stored and replaces a slot that comes again", () => {
  const doc = mergeUv(null, new Map([[local(2026, 2, 3, 12, 30), 9.5], [local(2026, 2, 3, 12, 40), 9]]), "2026-02");
  const again = mergeUv(doc, new Map([[local(2026, 2, 3, 12, 40), 8], [local(2026, 2, 4, 9, 0), 5]]), "2026-02");
  assert.equal(again.uv[2 * 72 + 39], 9.5);
  assert.equal(again.uv[2 * 72 + 40], 8);
  assert.equal(again.uv[3 * 72 + 18], 5);
});

test("the last day with data", () => {
  assert.equal(lastFilledDay(mergeUv(null, new Map(), "2026-02")), null);
  assert.equal(lastFilledDay(mergeUv(null, new Map([[local(2026, 2, 3, 12, 30), 9.5], [local(2026, 2, 2, 8, 0), 1]]), "2026-02")), local(2026, 2, 3));
});

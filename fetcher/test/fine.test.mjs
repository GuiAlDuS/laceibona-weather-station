import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateFine, mergeFine, lastFilledBucket, windowEnd, STEP, SLOTS } from "../src/fine.js";

// obs_st row: [ts, lull, avg, gust, dir, interval, pressure, temp, rh, lux, uv, solar, rain, ...]
const row = (ts, o = {}) => [ts, 0, 1, 2, 90, 3, o.p ?? 1000, 27, o.rh ?? 80, 0, 1, o.solar ?? 200, o.rain ?? 0, 0, 0, 0, 2.6, 1];
const T = Date.UTC(2026, 8, 21, 20, 0, 0) / 1000; // 14:00 local, on a bucket boundary

test("groups minutes into 10-minute buckets: rain sums, solar, pressure and humidity average", () => {
  const rows = [row(T, { rain: 0.2, solar: 100, p: 1000, rh: 90 }), row(T + 540, { rain: 0.3, solar: 300, p: 1001, rh: 95 }), row(T + 600, { rain: 1 })];
  const b = aggregateFine(rows);
  assert.equal(b.size, 2);
  assert.deepEqual(b.get(T), { rain: 0.5, solar: 200, p: 1000.5, rh: 93, n: 2 });
  assert.equal(b.get(T + 600).rain, 1);
});

test("rain is null with no reading, not zero", () => {
  const r = row(T);
  r[12] = null;
  assert.equal(aggregateFine([r]).get(T).rain, null);
});

test("windowEnd is the start of the bucket in progress", () => {
  assert.equal(windowEnd(T + 599), T);
  assert.equal(windowEnd(T + 600), T + 600);
});

test("a new document spans SLOTS buckets ending at the window end, and ignores unfinished or old buckets", () => {
  const end = T + 600;
  const doc = mergeFine(null, new Map([[T, { rain: 2, solar: 1, p: 1000, n: 10 }], [end, { rain: 9, solar: 9, p: 9, n: 1 }], [end - SLOTS * STEP - STEP, { rain: 9, solar: 9, p: 9, n: 1 }]]), end);
  assert.equal(doc.cols.rain.length, SLOTS);
  assert.equal(doc.start, end - SLOTS * STEP);
  assert.equal(doc.cols.rain.at(-1), 2);
  assert.equal(doc.cols.rain.filter((v) => v !== null).length, 1);
  assert.equal(lastFilledBucket(doc), T);
});

test("merging slides the window: old slots keep their time, expired ones drop, the newest bucket wins", () => {
  const end = T + 600;
  const first = mergeFine(null, new Map([[T - 600, { rain: 1, solar: 1, p: 1, n: 10 }], [T, { rain: 2, solar: 2, p: 2, n: 5 }]]), end);
  const second = mergeFine(first, new Map([[T, { rain: 3, solar: 3, p: 3, n: 10 }], [end, { rain: 4, solar: 4, p: 4, n: 10 }]]), end + 1200);
  const at = (doc, t) => doc.cols.rain[(t - doc.start) / STEP];
  assert.equal(at(second, T - 600), 1);
  assert.equal(at(second, T), 3); // replaced by the fuller bucket
  assert.equal(at(second, end), 4);
  assert.equal(second.cols.rain.length, SLOTS);
  const later = mergeFine(second, new Map(), end + 1200 + SLOTS * STEP); // everything slid out
  assert.equal(later.cols.n.filter((v) => v).length, 0);
});

test("a stored document from before a column existed merges, with that column empty until filled", () => {
  const end = T + 600;
  const old = mergeFine(null, new Map([[T - 600, { rain: 1, solar: 1, p: 1, rh: 50, n: 10 }]]), end);
  delete old.cols.rh;
  const doc = mergeFine(old, new Map([[T, { rain: 2, solar: 2, p: 2, rh: 70, n: 10 }]]), end);
  const at = (c, t) => doc.cols[c][(t - doc.start) / STEP];
  assert.equal(at("rain", T - 600), 1);
  assert.equal(at("rh", T - 600), null);
  assert.equal(at("rh", T), 70);
  assert.equal(doc.cols.rh.length, SLOTS);
});

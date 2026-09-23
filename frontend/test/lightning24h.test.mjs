import { test } from "node:test";
import assert from "node:assert/strict";
import { recentStrikes } from "../js/lightning24h.js";

const now = Date.parse("2026-09-22T20:00:00Z");
const t = now / 1000;

test("keeps only the last 24 hours, oldest first, and totals the strikes", () => {
  const doc = { lightning: [[t - 60, 12, 2], [t - 90000, 5, 9], [t - 3600, 17, 1], "junk", [t - 30, 8, 0]] };
  const s = recentStrikes(doc, now);
  assert.deepEqual(s.events.map((e) => e.ts), [t - 3600, t - 60]);
  assert.equal(s.total, 3);
});

test("the closest strike ignores minutes with no distance, which still count toward the total", () => {
  const s = recentStrikes({ lightning: [[t - 100, null, 4], [t - 50, 14, 1], [t - 20, 10, 1]] }, now);
  assert.equal(s.total, 6);
  assert.deepEqual(s.closest, { ts: t - 20, dist: 10, count: 1 });
  assert.equal(s.events[0].dist, null);
});

test("a document without lightning (older fetcher) or with none detected yields an empty result", () => {
  for (const doc of [{}, null, { lightning: [] }]) {
    const s = recentStrikes(doc, now);
    assert.equal(s.events.length, 0);
    assert.equal(s.total, 0);
    assert.equal(s.closest, null);
  }
});

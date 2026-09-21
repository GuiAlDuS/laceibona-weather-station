import { test } from "node:test";
import assert from "node:assert/strict";
import { dayBounds, daysBetween, processDay, assemble, verify } from "../scripts/backfill.mjs";

const row = (ts, o = {}) => [ts, 0, 1, o.gust ?? 2, 90, 3, 1000, o.temp ?? 27, 80, 0, 1, 200, o.rain ?? 0, 0, o.ldist ?? 0, o.lcount ?? 0, 2.6, 1];
const midnight = (date) => dayBounds(date).start;

test("local day bounds start at 06:00 UTC and cover 24 hours", () => {
  const { start, end } = dayBounds("2026-09-18");
  assert.equal(start, Date.UTC(2026, 8, 18, 6) / 1000);
  assert.equal(end - start, 86399);
});

test("daysBetween is inclusive and crosses month and year boundaries", () => {
  assert.deepEqual([...daysBetween("2024-12-30", "2025-01-02")], ["2024-12-30", "2024-12-31", "2025-01-01", "2025-01-02"]);
  assert.equal([...daysBetween("2024-02-28", "2024-03-01")].length, 3);
});

test("processDay requests exactly that local day and aggregates it", async () => {
  const day = "2026-09-18";
  const t = midnight(day);
  let asked = "";
  const getJson = async (p) => {
    asked = p;
    return { obs: [row(t, { temp: 24, rain: 0.5 }), row(t + 60, { temp: 26, rain: 0.5, lcount: 2, ldist: 8 }), row(t + 3600, { temp: 30 })] };
  };
  const doc = await processDay(day, "391086", getJson);
  assert.match(asked, /observations\/device\/391086\?time_start=\d+&time_end=\d+/);
  assert.ok(asked.includes(`time_start=${t}`) && asked.includes(`time_end=${t + 86399}`));
  assert.equal(doc.rows, 3);
  assert.equal(doc.hours.length, 2);
  assert.equal(doc.hours[0][1].rain, 1);
  assert.deepEqual(doc.strikes, [[t + 60, 8, 2]]);
});

test("a day with no observations gives an empty document", async () => {
  const doc = await processDay("2025-07-12", "1", async () => ({ obs: null }));
  assert.deepEqual([doc.rows, doc.hours.length, doc.strikes.length], [0, 0, 0]);
});

test("assemble builds monthly keys, lightning years and meta", async () => {
  const d1 = await processDay("2026-08-31", "1", async () => ({ obs: [row(midnight("2026-08-31") + 600, { lcount: 1, ldist: 5 })] }));
  const d2 = await processDay("2026-09-01", "1", async () => ({ obs: [row(midnight("2026-09-01") + 600)] }));
  const kv = assemble([d1, d2], new Date("2026-09-22T00:00:00Z"));
  assert.deepEqual(kv.map((e) => e.key), ["obs:2026-08", "obs:2026-09", "lightning:2026", "obs:meta"]);
  const aug = JSON.parse(kv[0].value);
  assert.equal(aug.hours, 744);
  assert.equal(aug.cols.n[30 * 24], 1);
  assert.deepEqual(JSON.parse(kv[2].value).events, [[midnight("2026-08-31") + 600, 5, 1]]);
  const meta = JSON.parse(kv[3].value);
  assert.equal(meta.first, "2026-08");
  assert.equal(meta.last, "2026-09");
});

test("verify counts matches and reports mismatches against daily stats", async () => {
  const t = midnight("2026-09-18");
  const doc = await processDay("2026-09-18", "1", async () => ({ obs: [row(t, { temp: 20, rain: 1 }), row(t + 3600, { temp: 32, rain: 2, lcount: 5, ldist: 9 })] }));
  const ok = verify([doc], [{ date: "2026-09-18", rain_mm: 3, t_max: 32, t_min: 20, lightning: 5 }]);
  assert.deepEqual(Object.values(ok.checks).map(([n, bad]) => [n, bad]), [[1, 0], [1, 0], [1, 0], [1, 0]]);
  const bad = verify([doc], [{ date: "2026-09-18", rain_mm: 9, t_max: 32, t_min: 20, lightning: 5 }]);
  assert.equal(bad.checks.rain[1], 1);
  assert.match(bad.examples[0], /2026-09-18 rain/);
  const skipped = verify([doc], [{ date: "2026-09-18", rain_mm: null, t_max: null, t_min: null, lightning: null }]);
  assert.equal(skipped.checks.rain[0], 0);
});

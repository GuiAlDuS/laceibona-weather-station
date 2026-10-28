import { test } from "node:test";
import assert from "node:assert/strict";
import { monthHourWind, speedClass, windiest, directionDuring, MIN_WINDY_HOURS } from "../js/windarrows.js";

// A month of `days` days where every hour h has speed ws(h, day) m/s and direction wd(h, day).
const doc = (month, days, ws, wd) => {
  const cols = { ws: [], wd: [] };
  for (let d = 0; d < days; d++)
    for (let h = 0; h < 24; h++) {
      cols.ws.push(ws(h, d));
      cols.wd.push(wd(h, d));
    }
  return { month, cols };
};
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("the prevailing direction is the most frequent 8-sector, not the mean between two winds", () => {
  // 6 days of NE trade wind, 4 of W sea breeze: the vector mean would point NNW, which never blew
  const hm = monthHourWind([doc("2026-02", 10, () => 2, (h, d) => (d < 6 ? 40 : 275))]);
  const c = hm.cells[13][0];
  assert.equal(c.dir, 45);
  near(c.share, 0.6);
  assert.deepEqual(c.counts, [0, 6, 0, 0, 0, 0, 4, 0]);
  near(c.speed, 7.2);
});

test("directions round to the nearest of 8 sectors; 350 and 10 are both north", () => {
  const hm = monthHourWind([doc("2026-01", 10, () => 2, (h, d) => (d % 2 ? 350 : 10))]);
  assert.equal(hm.cells[0][0].dir, 0);
  near(hm.cells[0][0].share, 1);
});

test("calm hours count toward speed and calm share but not direction; few windy hours give no direction", () => {
  // hour 0: 6 windy hours from the east, 4 calm ones from the west
  const hm = monthHourWind([doc("2026-01", 10, (h, d) => (d < 6 ? 1 : 0.1), (h, d) => (d < 6 ? 90 : 270))]);
  const c = hm.cells[0][0];
  assert.equal(c.dir, 90);
  near(c.share, 1);
  near(c.calm, 0.4);
  near(c.speed, ((6 * 1 + 4 * 0.1) / 10) * 3.6);
  assert.equal(c.windy, 6);
  const few = monthHourWind([doc("2026-01", 10, (h, d) => (d < MIN_WINDY_HOURS - 1 ? 1 : 0.1), () => 90)]).cells[0][0];
  assert.equal(few.dir, null);
  assert.equal(few.share, null);
});

test("missing hours give null cells; months sort oldest first", () => {
  const hm = monthHourWind([doc("2026-02", 6, () => 2, () => 90), doc("2026-01", 2, (h) => (h === 5 ? null : 2), () => 0)]);
  assert.deepEqual(hm.months.map((m) => m.key), ["2026-01", "2026-02"]);
  assert.equal(hm.cells[5][0], null);
  assert.equal(hm.months[0].partial, false); // 46 of 48 hours
});

test("speed classes: under 1.5, 1.5-2.5, 2.5-4, 4 and over", () => {
  assert.deepEqual([0.4, 1.49, 1.5, 2.49, 2.5, 3.99, 4, 9].map(speedClass), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test("windiest cell, and the prevailing direction over given hours of every month", () => {
  const hm = monthHourWind([doc("2026-01", 6, (h) => (h === 14 ? 2 : 1), (h) => (h < 6 ? 45 : 270)), doc("2026-02", 6, () => 1, (h) => (h < 6 ? 90 : 270))]);
  const w = windiest(hm);
  assert.equal(w.hour, 14);
  assert.equal(w.month, "2026-01");
  assert.equal(directionDuring(hm, [12, 13, 14]), 270);
  assert.equal(directionDuring(hm, [0, 1, 2]), 45); // a 6-6 tie between NE and E goes to NE, first from north
});

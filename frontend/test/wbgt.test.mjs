import { test } from "node:test";
import assert from "node:assert/strict";
import { wbgtTempest, wetBulb, sunPosition } from "../js/wbgt.js";
import { heatLevel, hourWbgt, monthlyWbgtHours, HEAT_LEVELS } from "../js/wbgthours.js";

const POS = { lat: 9.98302, lon: -84.7007 };
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

test("the sun is overhead at local solar noon in April and below the horizon at night", () => {
  const noon = sunPosition(Date.UTC(2026, 3, 7, 17, 40) / 1000, POS.lat, POS.lon);
  near(noon.cza, 1, 0.01);
  near(noon.distFactor, 1, 0.01);
  assert.ok(sunPosition(Date.UTC(2026, 3, 7, 6) / 1000, POS.lat, POS.lon).cza < -0.9);
  near(sunPosition(Date.UTC(2026, 3, 7, 12) / 1000, POS.lat, POS.lon).cza, 0.1, 0.05); // 06:00 local, just after sunrise
});

test("the psychrometric wet bulb: saturated air is at its wet bulb, drier air below it", () => {
  near(wetBulb(25, 100, 1000), 25, 0.01);
  near(wetBulb(30, 50, 1013), 22.3, 0.3);
});

test("Tempest's WBGT: readings taken from the station with the figure Tempest reported", () => {
  // 7 Oct 2026, 10:43 local: 34.2 °C, 73%, 0.4 m/s, 888 W/m², 1000.9 hPa -> Tempest said 36.8 (wet bulb 29.9)
  const r = wbgtTempest({ tempC: 34.2, rh: 73, windMs: 0.4, solar: 888, pressureHPa: 1000.9, cza: 0.901 });
  near(r.wetBulb, 29.9, 0.1);
  near(r.wbgt, 36.8, 0.15);
});

test("Tempest's WBGT at night is 0.7 wet bulb + 0.3 air; calm air counts as the minimum wind", () => {
  const night = wbgtTempest({ tempC: 24, rh: 92, windMs: 0.3, solar: 0, pressureHPa: 1000, cza: -0.5 });
  near(night.wbgt, 0.7 * night.wetBulb + 0.3 * 24, 1e-9);
  const sun = { tempC: 33, rh: 55, solar: 900, pressureHPa: 1000, cza: 0.95 };
  assert.equal(wbgtTempest({ ...sun, windMs: 0 }).wbgt, wbgtTempest({ ...sun, windMs: 0.45 }).wbgt);
  assert.ok(wbgtTempest({ ...sun, windMs: 2 }).wbgt < wbgtTempest({ ...sun, windMs: 0.5 }).wbgt);
  assert.equal(wbgtTempest({ ...sun, windMs: null }), null);
});

test("heat categories start at 78, 82, 85, 88 and 90 °F", () => {
  assert.deepEqual(HEAT_LEVELS.map((l) => Math.round(l.from * 10) / 10), [25.6, 27.8, 29.4, 31.1, 32.2]);
  assert.equal(heatLevel(25.5), null);
  assert.equal(heatLevel(25.6), "caution");
  assert.equal(heatLevel(29.5), "high");
  assert.equal(heatLevel(32.3), "extreme");
});

// A month document from local midnight; every day repeats the same 24 hours.
const mk = (month, days, hour) => {
  const [y, m] = month.split("-").map(Number);
  const col = (k) => Array.from({ length: days * 24 }, (_, i) => hour(Math.floor(i / 24), i % 24)?.[k] ?? null);
  return { month, start: Date.UTC(y, m - 1, 1, 6) / 1000, cols: { t: col("t"), rh: col("rh"), ws: col("ws"), solar: col("solar"), p: col("p") } };
};
const cool = { t: 22, rh: 80, ws: 2, solar: 0, p: 1000 };
const hot = { t: 34, rh: 60, ws: 1, solar: 900, p: 1000 };

test("hours per category, a day at a time", () => {
  const doc = mk("2026-04", 30, (_, h) => (h >= 10 && h < 14 ? hot : cool));
  assert.ok(hourWbgt(doc, 11, POS) > 32.3);
  assert.ok(hourWbgt(doc, 2, POS) < 25);
  const [m] = monthlyWbgtHours([doc], POS);
  assert.equal(m.days, 30);
  assert.equal(m.partial, false);
  assert.equal(m.hours.extreme, 4);
  assert.equal(m.hours.caution + m.hours.moderate + m.hours.high + m.hours.veryHigh, 0);
});

test("days missing more than an hour are left out; a month with none is dropped", () => {
  const doc = mk("2026-04", 30, (d, h) => {
    if (d === 0 && h < 2) return null; // two hours missing: day dropped
    if (d === 1 && h === 5) return null; // one hour missing: still counts
    return h === 12 ? hot : cool;
  });
  const months = monthlyWbgtHours([mk("2026-05", 31, () => null), doc], POS);
  assert.deepEqual(months.map((m) => m.key), ["2026-04"]);
  assert.equal(months[0].days, 29);
  assert.equal(months[0].hours.extreme, 1);
});

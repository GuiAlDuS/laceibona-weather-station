// Checks the dashboard's WBGT formula (frontend/js/wbgt.js) against the WBGT Tempest itself reports, as recorded by
// Home Assistant, and compares both with Liljegren's model (liljegren.mjs). Tempest keeps no history of its WBGT and
// does not publish the formula, so the Home Assistant record is the only reference. See README.md for the exports.
//
//   node data_review/wbgt_compare.mjs [--fit]
//
// Reads data/ha/states_recent.csv (raw readings: entity, unix time, value), data/ha/wbgt_hourly.csv (hourly
// statistics: unix time, mean, min, max) and data/obs/YYYY-MM.json (our hourly documents, from /api/obs/YYYY-MM).
// --fit searches again for the four constants of the globe formula from the raw readings and prints them.
import fs from "node:fs";
import { wbgtTempest, wetBulb, sunPosition } from "../frontend/js/wbgt.js";
import { wbgtLiljegren, windAt2m } from "./liljegren.mjs";
import { heatLevel, HEAT_LEVELS } from "../frontend/js/wbgthours.js";
import { fixObsMonth, sensorFixed } from "../frontend/js/sensor-fix.js";
import { STATION_POSITION as POS } from "../frontend/js/config.js";

const DATA = new URL("./data/", import.meta.url).pathname;
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const stat = (d) => `n ${String(d.length).padStart(5)}  bias ${mean(d).toFixed(2).padStart(5)}  mean abs. error ${mean(d.map(Math.abs)).toFixed(2)}`;
const sun = (ts) => sunPosition(ts, POS.lat, POS.lon);

// Raw readings -> one row per poll: every sensor's value at that moment (a sensor is only written when it changes).
function polls() {
  const cur = {};
  const out = [];
  let batch = null;
  for (const line of fs.readFileSync(`${DATA}ha/states_recent.csv`, "utf8").trim().split("\n")) {
    const [k, ts, v] = line.split(",");
    if (batch !== null && +ts - batch > 5 && Object.keys(cur).length === 8) out.push({ ts: batch, ta: cur.temperature, rh: cur.humidity, sol: cur.solar_radiation, ws: cur.wind_speed / 3.6, p: cur.station_pressure, tw: cur.wet_bulb_temperature, wbgt: cur.wet_bulb_globe_temperature });
    if (batch === null || +ts - batch > 5) batch = +ts;
    if (Number.isFinite(Number(v))) cur[k] = Number(v);
    else delete cur[k];
  }
  return out;
}

const raw = polls();
console.log(`Raw readings: ${raw.length} polls, ${new Date(raw[0].ts * 1000).toISOString().slice(0, 10)} to ${new Date(raw.at(-1).ts * 1000).toISOString().slice(0, 10)}`);
const night = raw.filter((r) => r.sol === 0);
console.log("  at night, Tempest WBGT - (0.7 wet bulb + 0.3 air):", stat(night.map((r) => r.wbgt - (0.7 * r.tw + 0.3 * r.ta))));
console.log("  our wet bulb - Tempest's:                         ", stat(raw.map((r) => wetBulb(r.ta, r.rh, r.p) - r.tw)));
const ours = (r) => wbgtTempest({ tempC: r.ta, rh: r.rh, windMs: r.ws, solar: r.sol, pressureHPa: r.p, cza: sun(r.ts).cza }).wbgt;
console.log("  dashboard formula - Tempest WBGT:                 ", stat(raw.map((r) => ours(r) - r.wbgt)));
console.log("  Liljegren - Tempest WBGT, sun over 400 W/m²:      ", stat(raw.filter((r) => r.sol > 400).map((r) => wbgtLiljegren({ tempC: r.ta, rh: r.rh, windMs: windAt2m(r.ws), solar: r.sol, pressureHPa: r.p, ...sun(r.ts) }).wbgt - r.wbgt)));

if (process.argv.includes("--fit")) {
  // The globe temperature Tempest must have used, then a random search for the constants of the Dimiceli form.
  const SIG = 5.67e-8;
  const es = (t) => 6.112 * Math.exp((17.67 * t) / (t + 243.5));
  const day = raw.filter((r) => r.sol > 0).map((r) => ({ ...r, cza: sun(r.ts).cza, tg: (r.wbgt - 0.7 * r.tw - 0.1 * r.ta) / 0.2 })).filter((r) => r.cza > 0);
  const globe = (r, o) => {
    const b = r.sol * (o.directShare / (4 * SIG * Math.max(r.cza, 0.00873)) + (1.2 / SIG) * (1 - o.directShare)) + 0.575 * Math.pow((r.rh / 100) * es(r.ta), 1 / 7) * r.ta ** 4;
    const c = (o.h * Math.pow(Math.max(r.ws, o.minWindMs) * 3600, o.windExp)) / 5.3865e-8;
    return (b + c * r.ta + 7680000) / (c + 256000);
  };
  const loss = (o) => mean(day.map((r) => Math.abs(globe(r, o) - r.tg)));
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let best = { o: { h: 0.315, directShare: 0.5, minWindMs: 0.5, windExp: 0.58 } };
  best.l = loss(best.o);
  for (let i = 0; i < 12000; i++) {
    const s = i < 6000 ? 0.6 : 0.06;
    const o = { h: best.o.h * (1 + (rnd() - 0.5) * s), directShare: Math.min(1, Math.max(0, best.o.directShare + (rnd() - 0.5) * s * 0.5)), minWindMs: Math.max(0, best.o.minWindMs * (1 + (rnd() - 0.5) * s)), windExp: best.o.windExp * (1 + (rnd() - 0.5) * s) };
    const l = loss(o);
    if (l < best.l) best = { o, l };
  }
  console.log("  refit constants:", JSON.stringify(best.o, (k, v) => (typeof v === "number" ? +v.toFixed(3) : v)), `(globe mean abs. error ${best.l.toFixed(2)} °C)`);
}

// Hourly: our documents against Home Assistant's hourly means. Tempest saw the light readings as reported, so the
// check uses them uncorrected; the monthly table uses the corrected ones, as the dashboard does.
const ha = new Map(fs.readFileSync(`${DATA}ha/wbgt_hourly.csv`, "utf8").trim().split("\n").map((l) => l.split(",").map(Number)).map(([ts, m]) => [ts, m]));
const hours = [];
for (const f of fs.readdirSync(`${DATA}obs/`).sort()) {
  const doc = JSON.parse(fs.readFileSync(`${DATA}obs/${f}`));
  const fixed = fixObsMonth(doc);
  const c = doc.cols;
  for (let i = 0; i < c.t.length; i++) {
    const ts = doc.start + i * 3600;
    const s = sun(ts + 1800);
    const base = { tempC: c.t[i], rh: c.rh[i], pressureHPa: c.p[i] };
    const asSeen = wbgtTempest({ ...base, windMs: c.ws[i], solar: c.solar[i], cza: s.cza });
    if (!asSeen) continue;
    hours.push({
      month: doc.month, ha: ha.get(ts) ?? null, sol: c.solar[i], asSeen: asSeen.wbgt,
      anomaly: sensorFixed(new Date((ts - 6 * 3600) * 1000).toISOString().slice(0, 10)),
      tempest: wbgtTempest({ ...base, windMs: c.ws[i], solar: fixed.cols.solar[i], cza: s.cza }).wbgt,
      liljegren: wbgtLiljegren({ ...base, windMs: windAt2m(c.ws[i]), solar: fixed.cols.solar[i], ...s })?.wbgt ?? null,
    });
  }
}
const both = hours.filter((h) => h.ha !== null);
console.log(`\nHourly means against Home Assistant: ${both.length} hours, ${both[0].month} to ${both.at(-1).month}`);
console.log("  dashboard formula, all hours:        ", stat(both.map((h) => h.asSeen - h.ha)));
console.log("  dashboard formula, sun over 400 W/m²:", stat(both.filter((h) => h.sol > 400).map((h) => h.asSeen - h.ha)));
console.log("  dashboard formula, night:            ", stat(both.filter((h) => h.sol === 0).map((h) => h.asSeen - h.ha)));
console.log("  Liljegren, sun over 400 W/m²:        ", stat(both.filter((h) => h.sol > 400 && !h.anomaly && h.liljegren !== null).map((h) => h.liljegren - h.ha)));

console.log("\nHours a day in the top category (WBGT 32.2 °C or more), every hour we have, corrected light readings:");
console.log("  month     Home Assistant*  dashboard  Liljegren      * over the hours it recorded only");
const top = HEAT_LEVELS.at(-1).key;
const share = (hs, k) => ((hs.filter((h) => h[k] !== null && heatLevel(h[k]) === top).length / hs.filter((h) => h[k] !== null).length) * 24).toFixed(1).padStart(9);
for (const m of [...new Set(hours.map((h) => h.month))]) {
  const hs = hours.filter((h) => h.month === m);
  const rec = hs.filter((h) => h.ha !== null);
  console.log(`  ${m} ${rec.length ? share(rec, "ha") : "        -"}       ${share(hs, "tempest")}  ${share(hs, "liljegren")}`);
}

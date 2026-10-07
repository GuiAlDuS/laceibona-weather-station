// Hours per day at each heat category, month by month: the wet-bulb globe temperature (WBGT) of every hour, worked
// out the way Tempest does (wbgt.js) from the hourly means of the monthly `obs:` documents, counted against the US
// Army heat categories. Hourly means are enough here: counted from 1-minute readings instead, each category moves by
// under half an hour a day (PROJECT.md). Pure functions; no DOM.
import { wbgtTempest, sunPosition } from "./wbgt.js";
import { STATION_POSITION } from "./config.js";

const PARTIAL_BELOW = 0.9;
// A day counts when no more than this many of its hours are missing.
const MAX_MISSING = 1;
const fToC = (f) => ((f - 32) * 5) / 9;
// US Army heat categories 1 to 5 (TB MED 507, in °F as published: 78, 82, 85, 88, 90), lowest first.
export const HEAT_LEVELS = [
  { key: "caution", from: fToC(78) },
  { key: "moderate", from: fToC(82) },
  { key: "high", from: fToC(85) },
  { key: "veryHigh", from: fToC(88) },
  { key: "extreme", from: fToC(90) },
];

export const heatLevel = (wbgt) => HEAT_LEVELS.findLast((l) => wbgt >= l.from)?.key ?? null;

// WBGT (°C) of slot i of an `obs:` document, with the sun where it stood at the middle of the hour; null when a
// reading is missing.
export function hourWbgt(doc, i, position = STATION_POSITION) {
  const { t, rh, ws, solar, p } = doc.cols;
  const r = wbgtTempest({ tempC: t[i], rh: rh[i], windMs: ws[i], solar: solar[i], pressureHPa: p[i], cza: sunPosition(doc.start + i * 3600 + 1800, position.lat, position.lon).cza });
  return r ? r.wbgt : null;
}

// One entry per month, oldest first: the mean hours per day at each heat category. Days missing more than an hour
// (an outage, or the day in progress) are left out; months with no full day are dropped.
export function monthlyWbgtHours(docs, position = STATION_POSITION) {
  return [...docs]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((doc) => {
      const valid = [];
      for (let i = 0; i < doc.cols.t.length; i += 24) {
        const hours = Array.from({ length: 24 }, (_, h) => hourWbgt(doc, i + h, position)).filter((v) => v !== null);
        if (hours.length < 24 - MAX_MISSING) continue;
        const counts = Object.fromEntries(HEAT_LEVELS.map((l) => [l.key, 0]));
        for (const v of hours) {
          const level = heatLevel(v);
          if (level) counts[level]++;
        }
        valid.push(counts);
      }
      const hours = Object.fromEntries(HEAT_LEVELS.map((l) => [l.key, valid.length ? valid.reduce((s, d) => s + d[l.key], 0) / valid.length : 0]));
      return { key: doc.month, days: valid.length, partial: valid.length < (doc.cols.t.length / 24) * PARTIAL_BELOW, hours };
    })
    .filter((m) => m.days > 0);
}

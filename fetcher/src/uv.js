// 10-minute UV index means over the daylight hours of each local day: the monthly `uv:YYYY-MM` KV documents.
// Pure functions; no I/O. Hourly values are too coarse to say how long the UV index stays at a risk level (one
// bright minute between clouds would count for the whole hour), and outside 06:00-18:00 local it is always low,
// so only those 12 hours are kept: slot d * PER_DAY + k covers local day d of the month (0-based), from
// 06:00 + k * 10 minutes.
import { monthKeyLocal, monthStartSec } from "./hourly.js";

const F = { ts: 0, uv: 10 };
export const STEP = 600;
export const FROM_H = 6;
export const TO_H = 18;
export const PER_DAY = ((TO_H - FROM_H) * 3600) / STEP;

const num = (v) => typeof v === "number" && Number.isFinite(v);
const daysInMonth = (key) => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 0)).getUTCDate();

// Slot of the bucket starting at `b` (unix seconds) in the month starting at `start`, or null outside daylight.
function slot(b, start) {
  const day = Math.floor((b - start) / 86400);
  const k = ((b - start) % 86400) / STEP - (FROM_H * 3600) / STEP;
  return k >= 0 && k < PER_DAY ? day * PER_DAY + k : null;
}

// rows -> Map(bucket start in unix seconds -> mean UV index of its minutes), daylight buckets only.
export function aggregateUv(rows) {
  const buckets = new Map();
  for (const row of rows) {
    if (!Array.isArray(row) || !num(row[F.ts]) || !num(row[F.uv])) continue;
    const b = Math.floor(row[F.ts] / STEP) * STEP;
    if (slot(b, monthStartSec(monthKeyLocal(b))) === null) continue;
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b).push(row[F.uv]);
  }
  const out = new Map();
  for (const [b, vs] of buckets) out.set(b, Math.round((vs.reduce((s, v) => s + v, 0) / vs.length) * 100) / 100);
  return out;
}

// Adds buckets to a monthly document (or a new one when `doc` is null). Buckets of other months are ignored; a
// bucket replaces whatever its slot held.
export function mergeUv(doc, buckets, key) {
  const start = monthStartSec(key);
  const out = doc ?? { month: key, start, step: STEP, fromHour: FROM_H, perDay: PER_DAY, uv: new Array(daysInMonth(key) * PER_DAY).fill(null) };
  for (const [b, v] of buckets) {
    if (monthKeyLocal(b) !== key) continue;
    const i = slot(b, start);
    if (i !== null) out.uv[i] = v;
  }
  return out;
}

// Local midnight (unix seconds) of the last day in the document that has data, or null.
export function lastFilledDay(doc) {
  for (let i = doc.uv.length - 1; i >= 0; i--) if (doc.uv[i] !== null) return doc.start + Math.floor(i / doc.perDay) * 86400;
  return null;
}

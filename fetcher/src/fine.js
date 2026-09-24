// 10-minute rain, solar, pressure, humidity and temperature for the last 7 days: the `fine7d` KV document. Pure functions; no I/O.
// Same column idea as `obs:YYYY-MM`, but a rolling window instead of a calendar month: slot i covers
// [start + i * STEP, start + (i + 1) * STEP), and the window always ends at the newest finished bucket.
// Buckets are aligned to local time (UTC-6 is a whole number of 10-minute steps, so UTC alignment is the same).
const F = { ts: 0, pressure: 6, temp: 7, rh: 8, solar: 11, rain: 12 };
export const STEP = 600;
export const SLOTS = 7 * 144;
export const FINE_COLS = ["rain", "solar", "p", "rh", "t", "n"];

const num = (v) => typeof v === "number" && Number.isFinite(v);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const round = (v, d) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

// rows -> Map(bucket start in unix seconds -> { rain (mm in the bucket), solar (W/m2 mean), p (hPa mean), rh (% mean), t (°C mean), n (minutes) })
export function aggregateFine(rows) {
  const buckets = new Map();
  for (const row of rows) {
    if (!Array.isArray(row) || !num(row[F.ts])) continue;
    const b = Math.floor(row[F.ts] / STEP) * STEP;
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b).push(row);
  }
  const out = new Map();
  for (const [b, rs] of buckets) {
    const col = (i) => rs.map((r) => r[i]).filter(num);
    const rains = col(F.rain);
    out.set(b, {
      rain: rains.length ? round(rains.reduce((s, v) => s + v, 0), 2) : null,
      solar: round(mean(col(F.solar)), 0),
      p: round(mean(col(F.pressure)), 1),
      rh: round(mean(col(F.rh)), 0),
      t: round(mean(col(F.temp)), 1),
      n: rs.length,
    });
  }
  return out;
}

// End of the window: the start of the bucket still in progress, so only finished buckets are stored.
export const windowEnd = (nowSec) => Math.floor(nowSec / STEP) * STEP;

// Adds buckets to the stored document (or a new one when `doc` is null) and slides the window so it ends at
// `endSec`. Slots that slide out are dropped; buckets outside the window are ignored; a bucket replaces
// whatever its slot held (the newest aggregate wins, so a late-arriving minute corrects the last bucket).
// A column the stored document predates starts out empty.
export function mergeFine(doc, buckets, endSec) {
  const start = endSec - SLOTS * STEP;
  const cols = Object.fromEntries(FINE_COLS.map((c) => [c, new Array(SLOTS).fill(null)]));
  if (doc) {
    const shift = (start - doc.start) / STEP;
    for (const c of FINE_COLS) {
      for (let i = 0; i < SLOTS; i++) {
        const j = i + shift;
        if (doc.cols[c] && j >= 0 && j < doc.cols[c].length) cols[c][i] = doc.cols[c][j];
      }
    }
  }
  for (const [b, rec] of buckets) {
    if (b < start || b >= endSec) continue;
    const i = (b - start) / STEP;
    for (const c of FINE_COLS) cols[c][i] = rec[c];
  }
  return { step: STEP, start, slots: SLOTS, cols };
}

// Start of the newest bucket that has data, or null.
export function lastFilledBucket(doc) {
  for (let i = doc.cols.n.length - 1; i >= 0; i--) if (doc.cols.n[i]) return doc.start + i * STEP;
  return null;
}

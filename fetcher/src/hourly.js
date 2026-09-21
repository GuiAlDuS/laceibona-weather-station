// Turns raw 1-minute obs_st rows (PROJECT.md §2 layout, metric units) into hourly records,
// monthly columnar KV documents, and lightning strike events. Pure functions; no I/O.

const F = { ts: 0, avg: 2, gust: 3, dir: 4, pressure: 6, temp: 7, rh: 8, uv: 10, solar: 11, rain: 12, lightDist: 14, lightCount: 15 };
const LOCAL_OFFSET_H = -6;

// Column order of an hourly record / monthly document.
export const COLS = ["t", "tmin", "tmax", "rh", "p", "ws", "gust", "wd", "rain", "solar", "uv", "ltn", "n"];

const num = (v) => typeof v === "number" && Number.isFinite(v);
const sum = (a) => a.reduce((s, v) => s + v, 0);
const mean = (a) => (a.length ? sum(a) / a.length : null);
const max = (a) => (a.length ? Math.max(...a) : null);
const min = (a) => (a.length ? Math.min(...a) : null);
const round = (v, d) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

export const monthKeyLocal = (tsSec) => new Date((tsSec + LOCAL_OFFSET_H * 3600) * 1000).toISOString().slice(0, 7);
export const monthStartSec = (key) => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, 1, -LOCAL_OFFSET_H) / 1000;
const daysInMonth = (key) => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 0)).getUTCDate();

// Speed-weighted circular mean of wind direction in degrees (calm hours fall back to unweighted).
function meanDirection(rows) {
  const dirs = rows.filter((r) => num(r[F.dir]));
  if (dirs.length === 0) return null;
  const vector = (weight) => {
    let s = 0;
    let c = 0;
    for (const r of dirs) {
      const w = weight(r);
      const rad = (r[F.dir] * Math.PI) / 180;
      s += w * Math.sin(rad);
      c += w * Math.cos(rad);
    }
    return { s, c };
  };
  let v = vector((r) => (num(r[F.avg]) ? r[F.avg] : 0));
  if (Math.hypot(v.s, v.c) < 1e-9) v = vector(() => 1);
  if (Math.hypot(v.s, v.c) < 1e-9) return null;
  return Math.round(((Math.atan2(v.s, v.c) * 180) / Math.PI + 360) % 360) % 360;
}

function hourRecord(rows) {
  const col = (i) => rows.map((r) => r[i]).filter(num);
  const temps = col(F.temp);
  const rains = col(F.rain);
  return {
    t: round(mean(temps), 1),
    tmin: round(min(temps), 1),
    tmax: round(max(temps), 1),
    rh: round(mean(col(F.rh)), 0),
    p: round(mean(col(F.pressure)), 1),
    ws: round(mean(col(F.avg)), 2),
    gust: round(max(col(F.gust)), 1),
    wd: meanDirection(rows),
    rain: rains.length ? round(sum(rains), 2) : null,
    solar: round(mean(col(F.solar)), 0),
    uv: round(max(col(F.uv)), 1),
    ltn: sum(col(F.lightCount)),
    n: rows.length,
  };
}

// rows -> Map(hour start in unix seconds -> hourly record)
export function aggregateHours(rows) {
  const buckets = new Map();
  for (const row of rows) {
    if (!Array.isArray(row) || !num(row[F.ts])) continue;
    const h = Math.floor(row[F.ts] / 3600) * 3600;
    if (!buckets.has(h)) buckets.set(h, []);
    buckets.get(h).push(row);
  }
  const out = new Map();
  for (const [h, rs] of buckets) out.set(h, hourRecord(rs));
  return out;
}

// One monthly KV document: one array per column, one slot per local hour of the month (null = no data).
export function buildMonth(hours, key) {
  const start = monthStartSec(key);
  const size = 24 * daysInMonth(key);
  const cols = Object.fromEntries(COLS.map((c) => [c, new Array(size).fill(null)]));
  for (const [h, rec] of hours) {
    if (monthKeyLocal(h) !== key) continue;
    const i = (h - start) / 3600;
    for (const c of COLS) cols[c][i] = rec[c];
  }
  return { month: key, start, hours: size, cols };
}

// Minutes with at least one strike: [unix seconds, mean distance km or null, strike count].
export function lightningEvents(rows) {
  const out = [];
  for (const r of rows) {
    if (!Array.isArray(r) || !num(r[F.ts]) || !num(r[F.lightCount]) || r[F.lightCount] <= 0) continue;
    out.push([r[F.ts], num(r[F.lightDist]) ? round(r[F.lightDist], 1) : null, r[F.lightCount]]);
  }
  return out;
}

export const yearKeyLocal = (tsSec) => monthKeyLocal(tsSec).slice(0, 4);

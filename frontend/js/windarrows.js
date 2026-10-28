// Month x hour-of-day wind: the average direction and speed of each cell, for the arrow chart. Pure functions; no DOM.
import { CALM_BELOW, MS_TO_KMH } from "./windrose.js";
import { sectorLabel } from "./i18n.js";

const PARTIAL_BELOW = 0.9; // a month with less of its hours than this is marked partial
export const MIN_WINDY_HOURS = 5; // fewer hours with wind than this and the cell gets no arrow
export const STEADY_FROM = 0.5; // steadiness below this: the direction varies too much, the arrow is faded
// Upper bounds (km/h) of the speed classes, lowest first; the last class is open-ended.
export const SPEED_CLASSES = [1.5, 2.5, 4];

export const speedClass = (kmh) => {
  const i = SPEED_CLASSES.findIndex((max) => kmh < max);
  return i === -1 ? SPEED_CLASSES.length : i;
};
export const sectorName = (deg) => sectorLabel(Math.round(deg / 22.5) % 16);

// Adds up unit vectors of the directions the wind came from; dir is their average (degrees, from), steadiness the
// length of the average vector (1 = always the same direction, 0 = spread evenly all round).
function vectorMean(dirs) {
  let x = 0;
  let y = 0;
  for (const d of dirs) {
    x += Math.sin((d * Math.PI) / 180);
    y += Math.cos((d * Math.PI) / 180);
  }
  x /= dirs.length;
  y /= dirs.length;
  return { dir: ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360, steadiness: Math.hypot(x, y) };
}

// docs: obs:YYYY-MM documents. Returns { months: [{ key, partial }], cells } where cells[hour][monthIndex] is null
// with no data, else { speed (km/h, the mean over every hour, calm ones too), calm (share of calm hours, 0-1),
// windy (hours with wind), dir and steadiness (from the windy hours; null under MIN_WINDY_HOURS) }.
export function monthHourWind(docs) {
  const sorted = [...docs].sort((a, b) => a.month.localeCompare(b.month));
  const months = [];
  const cells = Array.from({ length: 24 }, () => []);
  for (const doc of sorted) {
    const { ws, wd } = doc.cols;
    const speeds = Array.from({ length: 24 }, () => []);
    const dirs = Array.from({ length: 24 }, () => []);
    let filled = 0;
    ws.forEach((v, i) => {
      if (typeof v !== "number") return;
      filled++;
      speeds[i % 24].push(v);
      if (v >= CALM_BELOW && typeof wd[i] === "number") dirs[i % 24].push(wd[i]);
    });
    months.push({ key: doc.month, partial: filled < ws.length * PARTIAL_BELOW });
    for (let h = 0; h < 24; h++) {
      const s = speeds[h];
      if (s.length === 0) {
        cells[h].push(null);
        continue;
      }
      const windy = dirs[h].length;
      const mean = windy >= MIN_WINDY_HOURS ? vectorMean(dirs[h]) : { dir: null, steadiness: null };
      cells[h].push({ speed: (s.reduce((a, b) => a + b, 0) / s.length) * MS_TO_KMH, calm: s.filter((v) => v < CALM_BELOW).length / s.length, windy, ...mean });
    }
  }
  return { months, cells };
}

// The windiest cell, and the average direction over every windy hour in the given hours of the day (e.g. the night).
export function windiest({ months, cells }) {
  let best = null;
  cells.forEach((row, hour) =>
    row.forEach((c, m) => {
      if (c && (best === null || c.speed > best.speed)) best = { ...c, hour, month: months[m].key };
    }),
  );
  return best;
}

// Averages the cells' directions weighted by their windy hours, so a month with little wind counts for little.
export function directionDuring({ cells }, hours) {
  let x = 0;
  let y = 0;
  for (const h of hours)
    for (const c of cells[h]) {
      if (!c || c.dir === null) continue;
      x += c.windy * c.steadiness * Math.sin((c.dir * Math.PI) / 180);
      y += c.windy * c.steadiness * Math.cos((c.dir * Math.PI) / 180);
    }
  return x === 0 && y === 0 ? null : ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

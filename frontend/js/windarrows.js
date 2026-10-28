// Month x hour-of-day wind: the prevailing direction and average speed of each cell, for the arrow chart. Pure
// functions; no DOM.
import { CALM_BELOW, MS_TO_KMH } from "./windrose.js";
import { sectorLabel } from "./i18n.js";

const PARTIAL_BELOW = 0.9; // a month with less of its hours than this is marked partial
export const MIN_WINDY_HOURS = 5; // fewer hours with wind than this and the cell gets no arrow
// The prevailing direction is the most frequent of 8 compass sectors (the meteorological definition, rather than the
// vector mean, which points between two alternating winds such as the trade wind and the sea breeze, at a direction
// that rarely blows). Below this share of the windy hours no direction clearly prevails and the arrow is gray.
export const SECTORS_8 = 8;
export const CLEAR_FROM = 0.4;
// Upper bounds (km/h) of the speed classes, lowest first; the last class is open-ended.
export const SPEED_CLASSES = [1.5, 2.5, 4];

export const speedClass = (kmh) => {
  const i = SPEED_CLASSES.findIndex((max) => kmh < max);
  return i === -1 ? SPEED_CLASSES.length : i;
};
export const sectorName = (deg) => sectorLabel(Math.round(deg / 22.5) % 16);

const sectorOf = (deg) => Math.round(deg / (360 / SECTORS_8)) % SECTORS_8;

// counts: hours per 8-sector. Returns the most frequent sector as { dir (degrees, from), share (0-1) }; a tie goes to
// the sector first clockwise from north.
function prevailing(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  const best = counts.indexOf(Math.max(...counts));
  return { dir: best * (360 / SECTORS_8), share: counts[best] / total };
}

// docs: obs:YYYY-MM documents. Returns { months: [{ key, partial }], cells } where cells[hour][monthIndex] is null
// with no data, else { speed (km/h, the mean over every hour, calm ones too), calm (share of calm hours, 0-1),
// windy (hours with wind), counts (windy hours per 8-sector), dir and share (the prevailing sector and its share of
// the windy hours; null under MIN_WINDY_HOURS) }.
export function monthHourWind(docs) {
  const sorted = [...docs].sort((a, b) => a.month.localeCompare(b.month));
  const months = [];
  const cells = Array.from({ length: 24 }, () => []);
  for (const doc of sorted) {
    const { ws, wd } = doc.cols;
    const speeds = Array.from({ length: 24 }, () => []);
    const counts = Array.from({ length: 24 }, () => new Array(SECTORS_8).fill(0));
    let filled = 0;
    ws.forEach((v, i) => {
      if (typeof v !== "number") return;
      filled++;
      speeds[i % 24].push(v);
      if (v >= CALM_BELOW && typeof wd[i] === "number") counts[i % 24][sectorOf(wd[i])]++;
    });
    months.push({ key: doc.month, partial: filled < ws.length * PARTIAL_BELOW });
    for (let h = 0; h < 24; h++) {
      const s = speeds[h];
      if (s.length === 0) {
        cells[h].push(null);
        continue;
      }
      const windy = counts[h].reduce((a, b) => a + b, 0);
      const top = windy >= MIN_WINDY_HOURS ? prevailing(counts[h]) : { dir: null, share: null };
      cells[h].push({ speed: (s.reduce((a, b) => a + b, 0) / s.length) * MS_TO_KMH, calm: s.filter((v) => v < CALM_BELOW).length / s.length, windy, counts: counts[h], ...top });
    }
  }
  return { months, cells };
}

// The windiest cell.
export function windiest({ months, cells }) {
  let best = null;
  cells.forEach((row, hour) =>
    row.forEach((c, m) => {
      if (c && (best === null || c.speed > best.speed)) best = { ...c, hour, month: months[m].key };
    }),
  );
  return best;
}

// The prevailing direction over every windy hour in the given hours of the day (e.g. the night), all months
// together; null with no windy hours.
export function directionDuring({ cells }, hours) {
  const counts = new Array(SECTORS_8).fill(0);
  for (const h of hours) for (const c of cells[h]) if (c) c.counts.forEach((n, i) => (counts[i] += n));
  return counts.some((n) => n > 0) ? prevailing(counts).dir : null;
}

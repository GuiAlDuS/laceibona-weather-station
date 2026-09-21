// Hourly wind direction and speed for the most recent days, for the daily scatter. Pure functions; no DOM.
import { SECTORS, CALM_BELOW } from "./windrose.js";

const LOCAL_OFFSET_S = -6 * 3600;

// Vertical position on the wrapped axis used by the direction heatmap: 0 = S at the bottom, 8 = N in the
// middle, 16 = S again at the top (units of one 22.5 degree sector).
export const windY = (deg) => ((deg - 180 + 360) % 360) / 22.5;
export const sectorName = (deg) => SECTORS[Math.round(deg / 22.5) % 16];

// docs: obs:YYYY-MM documents. Returns hours from the last `n` calendar days ending at the latest day with
// data, oldest first: { date, hour, dir, ws, y }. Calm hours (direction is noise) are left out.
export function recentHours(docs, n = 30) {
  const all = [];
  for (const doc of docs) {
    doc.cols.ws.forEach((ws, i) => {
      const dir = doc.cols.wd[i];
      if (typeof ws !== "number" || typeof dir !== "number") return;
      const local = new Date((doc.start + i * 3600 + LOCAL_OFFSET_S) * 1000);
      all.push({ date: local.toISOString().slice(0, 10), hour: local.getUTCHours(), dir, ws, calm: ws < CALM_BELOW });
    });
  }
  if (all.length === 0) return [];
  const latest = all.reduce((m, h) => (h.date > m ? h.date : m), "");
  const first = new Date(Date.parse(latest) - (n - 1) * 86400_000).toISOString().slice(0, 10);
  return all
    .filter((h) => h.date >= first && !h.calm)
    .sort((a, b) => (a.date === b.date ? a.hour - b.hour : a.date < b.date ? -1 : 1))
    .map((h) => ({ date: h.date, hour: h.hour, dir: h.dir, ws: h.ws, y: windY(h.dir) }));
}

// One row per day: most common direction (sector), mean and peak hourly speed.
export function daySummaries(hours) {
  const byDate = new Map();
  for (const h of hours) {
    if (!byDate.has(h.date)) byDate.set(h.date, []);
    byDate.get(h.date).push(h);
  }
  return [...byDate].map(([date, hs]) => {
    const counts = new Array(16).fill(0);
    for (const h of hs) counts[Math.round(h.dir / 22.5) % 16]++;
    return {
      date,
      hours: hs.length,
      direction: SECTORS[counts.indexOf(Math.max(...counts))],
      mean: hs.reduce((a, h) => a + h.ws, 0) / hs.length,
      peak: Math.max(...hs.map((h) => h.ws)),
    };
  });
}

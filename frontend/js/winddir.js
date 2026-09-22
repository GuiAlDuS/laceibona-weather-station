// Wind direction frequency by month. Pure functions; no DOM.
import { SECTORS, CALM_BELOW } from "./windrose.js";
import { sectorLabel } from "./i18n.js";

const PARTIAL_BELOW = 0.9;

// Rows from the bottom up: S ... W ... N ... E ... S. South appears at both ends so the prevailing NE-E
// winds sit together in the middle of the chart instead of being split across the edge.
export const ROW_SECTORS = [8, 9, 10, 11, 12, 13, 14, 15, 0, 1, 2, 3, 4, 5, 6, 7, 8];

// docs: obs:YYYY-MM documents. z[row][monthIndex] is the percent of that month's hours (calm hours,
// below CALM_BELOW m/s, excluded because their direction is noise) from the row's direction; null with no hours.
export function monthDirectionFrequency(docs) {
  const sorted = [...docs].sort((a, b) => a.month.localeCompare(b.month));
  const months = [];
  const perMonth = [];
  for (const doc of sorted) {
    const counts = new Array(16).fill(0);
    let valid = 0;
    let usable = 0;
    doc.cols.ws.forEach((ws, i) => {
      const wd = doc.cols.wd[i];
      if (typeof ws !== "number" || typeof wd !== "number") return;
      valid++;
      if (ws < CALM_BELOW) return;
      usable++;
      counts[Math.round(wd / 22.5) % 16]++;
    });
    months.push({ key: doc.month, partial: valid < doc.cols.ws.length * PARTIAL_BELOW });
    perMonth.push(counts.map((c) => (usable ? (100 * c) / usable : null)));
  }
  return { months, z: ROW_SECTORS.map((s) => perMonth.map((m) => m[s])) };
}

// The direction that blows most often over all the months shown.
export function prevailing({ z }) {
  const totals = SECTORS.map((_, s) => z[ROW_SECTORS.indexOf(s)].reduce((a, v) => a + (v ?? 0), 0));
  const best = totals.indexOf(Math.max(...totals));
  const months = z[0].length;
  return { name: sectorLabel(best), percent: months ? totals[best] / months : 0 };
}

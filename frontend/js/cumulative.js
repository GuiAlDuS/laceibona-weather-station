// Cumulative daily totals (rain, lightning) by day of year. Pure functions; no DOM.
import { sharedAxisDate, balanceAt } from "./balance.js";

const MIN_DAYS_PER_YEAR = 30;

// Unlike the water balance, these do not need ETo: every day with a reading counts, including
// today's partial day, so year totals match the station's own daily sums.
export function cumulativeSeries(days, field) {
  const byYear = new Map();
  for (const d of days) {
    const year = d.date.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, { year, points: [], missing: 0, total: 0 });
    const y = byYear.get(year);
    if (d[field] === null || d[field] === undefined) {
      y.missing++;
      continue;
    }
    y.total += d[field];
    y.points.push({ date: d.date, x: sharedAxisDate(d.date), cum: y.total });
  }
  return [...byYear.values()]
    .filter((y) => y.points.length >= MIN_DAYS_PER_YEAR)
    .sort((a, b) => a.year.localeCompare(b.year));
}

export const cumulativeRainByYear = (days) => cumulativeSeries(days, "rain_mm");
export const cumulativeLightningByYear = (days) => cumulativeSeries(days, "lightning");

// Latest year vs the previous year at the same month-day.
export function summarizeCumulative(series) {
  if (series.length === 0) return null;
  const latest = series[series.length - 1];
  const last = latest.points[latest.points.length - 1];
  const prevSeries = series.length > 1 ? series[series.length - 2] : null;
  const prev = prevSeries ? balanceAt(prevSeries, last.date.slice(5)) : null;
  return {
    year: latest.year,
    throughDate: last.date,
    total: last.cum,
    prevYear: prev ? prevSeries.year : null,
    prevTotal: prev ? prev.cum : null,
    percentOfPrev: prev && prev.cum > 0 ? (last.cum / prev.cum) * 100 : null,
  };
}

export function monthEndsCumulative(yearSeries) {
  const out = {};
  for (const p of yearSeries.points) out[p.date.slice(5, 7)] = p;
  return out;
}

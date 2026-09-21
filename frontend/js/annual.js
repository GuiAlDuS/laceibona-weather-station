// Year-over-year summary over the same calendar window in every year. Pure functions; no DOM.
import { usableDay } from "./balance.js";
import { kwhPerDay } from "./solar.js";

const MIN_DAYS = 30;

// Compare each year over the same window (1 Jan to the latest year's last complete day), so a
// partial current year is not set against full years. Means are per day, so data gaps do not
// bias them; totals and day counts are kept for the table view.
export function sameWindowSummary(days) {
  const complete = days.filter((d) => d.complete);
  if (complete.length === 0) return null;
  const last = complete[complete.length - 1].date;
  const latestYear = last.slice(0, 4);
  const endMonthDay = last.slice(5);

  const byYear = new Map();
  for (const d of complete) {
    const year = d.date.slice(0, 4);
    if (d.date.slice(5) > endMonthDay) continue;
    if (!byYear.has(year)) byYear.set(year, { year, temp: [], eto: [], kwh: [] });
    const y = byYear.get(year);
    if (typeof d.t_avg === "number") y.temp.push(d.t_avg);
    if (usableDay(d)) y.eto.push(d.eto);
    if (typeof d.solar_avg === "number") y.kwh.push(kwhPerDay(d.solar_avg));
  }

  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  const years = [...byYear.values()]
    .filter((y) => y.temp.length >= MIN_DAYS)
    .sort((a, b) => a.year.localeCompare(b.year))
    .map((y) => ({
      year: y.year,
      tempMean: mean(y.temp),
      tempDays: y.temp.length,
      etoMean: mean(y.eto),
      etoTotal: sum(y.eto),
      etoDays: y.eto.length,
      kwhMean: mean(y.kwh),
      kwhTotal: sum(y.kwh),
      kwhDays: y.kwh.length,
    }));
  if (years.length === 0) return null;
  return { latestYear, endMonthDay, throughDate: last, years };
}

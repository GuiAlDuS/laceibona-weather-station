// Monthly rain vs ETo totals. Pure functions; no DOM.
import { usableDay } from "./balance.js";

const daysInMonth = (key) => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 0)).getUTCDate();

// Totals cover only days with complete data (same days for rain and ETo), so a month with
// data gaps has `days < daysInMonth` and reads low; callers surface that as coverage.
export function monthlyTotals(days, { months = 13 } = {}) {
  const byMonth = new Map();
  for (const d of days) {
    const key = d.date.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, { month: key, rain: 0, eto: 0, days: 0, daysInMonth: daysInMonth(key) });
    const m = byMonth.get(key);
    if (!usableDay(d)) continue;
    m.rain += d.rain_mm;
    m.eto += d.eto;
    m.days++;
  }
  return [...byMonth.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-months)
    .map((m) => ({ ...m, rain: m.days ? m.rain : null, eto: m.days ? m.eto : null, partial: m.days < m.daysInMonth }));
}

// How many of the shown months had rain above ETo (months with no data are excluded).
export function summarizeMonths(months) {
  const withData = months.filter((m) => m.days > 0);
  return { total: withData.length, rainAboveEto: withData.filter((m) => m.rain > m.eto).length };
}

export function peak(months, key) {
  let best = -1;
  months.forEach((m, i) => {
    if (m[key] !== null && (best === -1 || m[key] > months[best][key])) best = i;
  });
  return best;
}

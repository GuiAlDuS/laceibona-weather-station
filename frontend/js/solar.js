// Solar irradiation from the daily mean irradiance. Pure functions; no DOM.

// Mean irradiance over 24 h in W/m2 -> energy in kWh/m2/day. The single place a bias
// correction would go (see PROJECT.md: stats solar averages read ~4-5% high since April 2026).
export const kwhPerDay = (solarAvgWm2) => (solarAvgWm2 * 24) / 1000;

const usable = (d) => d.complete && typeof d.solar_avg === "number";

const daysInMonth = (key) => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 0)).getUTCDate();

// Monthly totals over days with complete data; `partial` marks months with missing days
// (or the month in progress), whose totals read low. meanDaily is comparable across months.
export function monthlyIrradiation(days, { months = 13 } = {}) {
  const byMonth = new Map();
  for (const d of days) {
    const key = d.date.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, { month: key, total: 0, days: 0, daysInMonth: daysInMonth(key) });
    if (!usable(d)) continue;
    const m = byMonth.get(key);
    m.total += kwhPerDay(d.solar_avg);
    m.days++;
  }
  return [...byMonth.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-months)
    .map((m) => ({
      ...m,
      total: m.days ? m.total : null,
      meanDaily: m.days ? m.total / m.days : null,
      partial: m.days < m.daysInMonth,
    }));
}

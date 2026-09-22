// Total solar irradiation (kWh/m²) by calendar year, from the raw hourly `obs:` documents rather than
// `daily:all`'s stats-derived `solar_avg` — this sidesteps the solar-bias caveat noted on the water
// balance chart (PROJECT.md §2), which is specific to the stats/station endpoint's sample averaging.
// Pure functions; no DOM.
const LOCAL_OFFSET_S = -6 * 3600;
const MIN_DAYS = 30; // a year needs this many days in the comparison window to be drawn

// One entry per calendar year, over the same window (1 Jan to the latest day with data across all
// years), so a partial year is compared fairly — same convention as tempbox.js's yearlyBoxes.
export function annualSolarTotals(docs) {
  const hours = [];
  for (const doc of docs) {
    doc.cols.solar.forEach((w, i) => {
      if (typeof w !== "number") return;
      hours.push({ date: new Date((doc.start + i * 3600 + LOCAL_OFFSET_S) * 1000).toISOString().slice(0, 10), kwh: w / 1000 }); // 1 h mean W/m² -> kWh/m²
    });
  }
  if (hours.length === 0) return [];
  const through = hours.reduce((m, h) => (h.date > m ? h.date : m), "").slice(5); // "MM-DD"
  const byYear = new Map();
  for (const h of hours) {
    if (h.date.slice(5) > through) continue;
    const y = h.date.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, { total: 0, days: new Set() });
    const v = byYear.get(y);
    v.total += h.kwh;
    v.days.add(h.date);
  }
  return [...byYear]
    .filter(([, v]) => v.days.size >= MIN_DAYS)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, v]) => ({ year, days: v.days.size, through, total: v.total }));
}

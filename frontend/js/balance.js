// Cumulative water balance (rain − ETo) by day of year. Pure functions; no DOM.

const MIN_DAYS_PER_YEAR = 30;

// Only days with complete data, a rain value and an ETo contribute, so both terms cover the same days.
export function usableDay(d) {
  return d.complete && d.rain_mm !== null && d.eto !== null;
}

// Plot every year on one shared calendar year (leap, so 29 Feb exists).
export function sharedAxisDate(date) {
  return `2000-${date.slice(5)}`;
}

export function cumulativeByYear(days) {
  const byYear = new Map();
  for (const d of days) {
    const year = d.date.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, { year, points: [], skipped: 0, rain: 0, eto: 0 });
    const y = byYear.get(year);
    if (!usableDay(d)) {
      y.skipped++;
      continue;
    }
    y.rain += d.rain_mm;
    y.eto += d.eto;
    y.points.push({ date: d.date, x: sharedAxisDate(d.date), balance: y.rain - y.eto, rain: y.rain, eto: y.eto });
  }
  return [...byYear.values()]
    .filter((y) => y.points.length >= MIN_DAYS_PER_YEAR)
    .sort((a, b) => a.year.localeCompare(b.year));
}

// Cumulative balance at the last usable day on or before a month-day ("MM-DD"), or null.
export function balanceAt(yearSeries, monthDay) {
  let last = null;
  for (const p of yearSeries.points) {
    if (p.date.slice(5) <= monthDay) last = p;
    else break;
  }
  return last;
}

// Month-end cumulative balance for the table view: { "01": p, ... } (last usable day of each month).
export function monthEnds(yearSeries) {
  const out = {};
  for (const p of yearSeries.points) out[p.date.slice(5, 7)] = p;
  return out;
}

export function summarize(series) {
  if (series.length === 0) return null;
  const latest = series[series.length - 1];
  const last = latest.points[latest.points.length - 1];
  const monthDay = last.date.slice(5);
  const prev = series.length > 1 ? balanceAt(series[series.length - 2], monthDay) : null;
  return { year: latest.year, throughDate: last.date, balance: last.balance, rain: last.rain, eto: last.eto, prevYear: prev ? series[series.length - 2].year : null, prev };
}

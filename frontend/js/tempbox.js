// Distributions (temperature `t`, wind speed `ws`, ...) from an hourly column of the monthly `obs:` documents. Pure functions; no DOM.
const LOCAL_OFFSET_S = -6 * 3600;
const PARTIAL_BELOW = 0.9;
const MIN_DAYS = 30; // a year needs this many days in the comparison window to be drawn

// Linear-interpolated quantile of an ascending array.
export function quantile(sorted, p) {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Box = quartiles, whiskers = the full range (hourly temperatures have no wild outliers worth hiding).
export function boxStats(values) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return { n: s.length, min: s[0], q1: quantile(s, 0.25), median: quantile(s, 0.5), q3: quantile(s, 0.75), max: s.at(-1), mean: s.reduce((a, v) => a + v, 0) / s.length };
}

const nums = (a) => a.filter((v) => typeof v === "number");

// One box per month, oldest first. Months with no data are left out.
export function monthlyBoxes(docs, col = "t", scale = 1) {
  return [...docs]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((doc) => {
      const v = nums(doc.cols[col]).map((x) => x * scale);
      return { key: doc.month, partial: v.length < doc.cols[col].length * PARTIAL_BELOW, stats: boxStats(v) };
    })
    .filter((m) => m.stats);
}

// One box per calendar year over the same window (1 Jan to the latest day with data), so a partial
// year is compared fairly. Years with fewer than MIN_DAYS days in the window are dropped.
export function yearlyBoxes(docs) {
  const hours = [];
  for (const doc of docs) {
    doc.cols.t.forEach((t, i) => {
      if (typeof t !== "number") return;
      hours.push({ date: new Date((doc.start + i * 3600 + LOCAL_OFFSET_S) * 1000).toISOString().slice(0, 10), t });
    });
  }
  if (hours.length === 0) return [];
  const through = hours.reduce((m, h) => (h.date > m ? h.date : m), "").slice(5); // "MM-DD"
  const byYear = new Map();
  for (const h of hours) {
    if (h.date.slice(5) > through) continue;
    const y = h.date.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, { values: [], days: new Set() });
    byYear.get(y).values.push(h.t);
    byYear.get(y).days.add(h.date);
  }
  return [...byYear]
    .filter(([, v]) => v.days.size >= MIN_DAYS)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, v]) => ({ year, days: v.days.size, through, stats: boxStats(v.values) }));
}

// One box per month of each local day's highest hourly value (e.g. `uv`, stored as each hour's maximum), oldest
// first. A day counts once, so a month's box shows its days rather than the shape of the daily cycle. Days with
// no reading, or a peak of exactly 0 (a sensor outage: daylight always gives some UV), are skipped; months with
// none are left out.
export function monthlyDailyMaxBoxes(docs, col) {
  return [...docs]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((doc) => {
      const days = new Map();
      doc.cols[col].forEach((v, i) => {
        if (typeof v !== "number") return;
        const date = new Date((doc.start + i * 3600 + LOCAL_OFFSET_S) * 1000).toISOString().slice(0, 10);
        days.set(date, Math.max(days.get(date) ?? -Infinity, v));
      });
      const v = [...days.values()].filter((x) => x > 0);
      return { key: doc.month, partial: v.length < (doc.cols[col].length / 24) * PARTIAL_BELOW, stats: boxStats(v) };
    })
    .filter((m) => m.stats);
}

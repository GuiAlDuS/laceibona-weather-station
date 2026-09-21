// Month x hour-of-day means from the monthly `obs:` documents. Pure functions; no DOM.
const PARTIAL_BELOW = 0.9; // a month with less of its hours than this is marked partial

// docs: obs:YYYY-MM documents; col: column name (e.g. "t", "ws").
// Returns { months: [{ key, partial }], z } where z[hour][monthIndex] is the mean, or null with no data.
export function monthHourMeans(docs, col) {
  const sorted = [...docs].sort((a, b) => a.month.localeCompare(b.month));
  const months = [];
  const z = Array.from({ length: 24 }, () => []);
  for (const doc of sorted) {
    const values = doc.cols[col];
    const sum = new Array(24).fill(0);
    const n = new Array(24).fill(0);
    values.forEach((v, i) => {
      if (typeof v !== "number") return;
      sum[i % 24] += v;
      n[i % 24]++;
    });
    const filled = n.reduce((a, b) => a + b, 0);
    months.push({ key: doc.month, partial: filled < values.length * PARTIAL_BELOW });
    for (let h = 0; h < 24; h++) z[h].push(n[h] ? sum[h] / n[h] : null);
  }
  return { months, z };
}

// Warmest/coldest (or fastest/slowest) cell.
export function extremes({ months, z }) {
  let hi = null;
  let lo = null;
  z.forEach((row, hour) =>
    row.forEach((v, m) => {
      if (v === null) return;
      if (hi === null || v > hi.value) hi = { value: v, hour, month: months[m].key };
      if (lo === null || v < lo.value) lo = { value: v, hour, month: months[m].key };
    }),
  );
  return { hi, lo };
}

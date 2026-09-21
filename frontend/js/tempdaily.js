// Hourly temperature for the most recent days. Pure functions; no DOM.
const LOCAL_OFFSET_S = -6 * 3600;

// docs: obs:YYYY-MM documents. `live` is the optional `hourly` list of the wind24h feed, [hour start (unix s),
// mean, min, max, minutes]; it fills hours the monthly documents do not have yet, including the hour in progress,
// so today is up to date. Returns the last `n` calendar days ending at the latest day with data
// (not "today", so a stalled feed still shows something), oldest first; days with no data are left out.
// Each day: { date, points: [{ hour, t, tmin, tmax }] } with hour 0-23 local.
export function lastDays(docs, n = 7, live = []) {
  const byDate = new Map();
  for (const doc of docs) {
    doc.cols.t.forEach((t, i) => {
      if (typeof t !== "number") return;
      const local = new Date((doc.start + i * 3600 + LOCAL_OFFSET_S) * 1000);
      const date = local.toISOString().slice(0, 10);
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push({ hour: local.getUTCHours(), t, tmin: doc.cols.tmin[i], tmax: doc.cols.tmax[i] });
    });
  }
  const have = new Set([...byDate].flatMap(([date, ps]) => ps.map((p) => `${date}/${p.hour}`)));
  for (const [ts, t, tmin, tmax, minutes] of live) {
    const local = new Date((ts + LOCAL_OFFSET_S) * 1000);
    const date = local.toISOString().slice(0, 10);
    const hour = local.getUTCHours();
    if (typeof t !== "number" || have.has(`${date}/${hour}`)) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({ hour, t, tmin, tmax, partial: minutes < 60 });
  }
  const latest = [...byDate.keys()].sort().at(-1);
  if (!latest) return [];
  const first = new Date(Date.parse(latest) - (n - 1) * 86400_000).toISOString().slice(0, 10);
  return [...byDate.keys()]
    .filter((d) => d >= first)
    .sort()
    .map((date) => ({ date, points: byDate.get(date).sort((a, b) => a.hour - b.hour) }));
}

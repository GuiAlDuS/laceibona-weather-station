// Rain, ETo and rain duration for the most recent days. Pure functions; no DOM.
const num = (v) => (typeof v === "number" ? v : null);

// days: daily:all records, oldest first. Returns the last `n`, each { date, rain, eto, hours, inProgress }.
// ETo is only known for a finished day, so an unfinished day has eto null. Duration is the day's
// minutes with rain, in hours.
export function lastRainDays(days, n = 7) {
  return days.slice(-n).map((d) => ({
    date: d.date,
    rain: num(d.rain_mm),
    eto: d.complete ? num(d.eto) : null,
    hours: num(d.rain_min) === null ? null : d.rain_min / 60,
    inProgress: !d.complete,
  }));
}

// Overlays today's running totals from the `current` document onto the last row, but only when
// that row is still the in-progress day. `current` has no ETo (only worked out for finished days),
// so eto is left as-is.
export function withLiveToday(rows, current) {
  const last = rows.at(-1);
  if (!last?.inProgress || !current?.today) return rows;
  const { rain_mm, rain_min } = current.today;
  const patched = { ...last };
  if (typeof rain_mm === "number") patched.rain = rain_mm;
  if (typeof rain_min === "number") patched.hours = rain_min / 60;
  return [...rows.slice(0, -1), patched];
}

export function weekTotals(rows) {
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  const withEto = rows.filter((r) => r.eto !== null && r.rain !== null);
  return {
    rain: sum(rows.map((r) => r.rain ?? 0)),
    hours: sum(rows.map((r) => r.hours ?? 0)),
    rainOnEtoDays: sum(withEto.map((r) => r.rain)),
    eto: sum(withEto.map((r) => r.eto)),
    etoDays: withEto.length,
    rainDays: rows.filter((r) => (r.rain ?? 0) > 0).length,
  };
}

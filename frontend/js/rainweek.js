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

// Brings the last row up to date with today's running totals from the `current` document. If that row is today
// (still in progress), its rain and duration are replaced; if `daily:all` has no row for today yet (it is rebuilt
// once a day, at 01:00 local, and Tempest's daily stats may not have started the new day by then), a today row is
// added and the oldest dropped, so the chart keeps its length. `current` has no ETo (only worked out for finished
// days), so today's eto is null. A `current` from an earlier day than the last row changes nothing.
export function withLiveToday(rows, current) {
  const last = rows.at(-1);
  const date = current?.local_date;
  if (!last || !current?.today || !date) return rows;
  const { rain_mm, rain_min } = current.today;
  const rain = typeof rain_mm === "number" ? rain_mm : null;
  const hours = typeof rain_min === "number" ? rain_min / 60 : null;
  if (date === last.date) {
    if (!last.inProgress) return rows;
    return [...rows.slice(0, -1), { ...last, rain: rain ?? last.rain, hours: hours ?? last.hours }];
  }
  if (date < last.date) return rows;
  return [...rows.slice(1), { date, rain, eto: null, hours, inProgress: true }];
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

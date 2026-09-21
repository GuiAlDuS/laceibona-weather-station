import { etoFromStatsRow } from "./eto.js";

const MIN_SAMPLES = 1200;

// One stats_day positional row (PROJECT.md §2) -> named record. Missing values stay null.
export function dayRecord(row, { today } = {}) {
  const r = (i) => (row[i] === undefined ? null : row[i]);
  const samples = r(26);
  const complete = row[0] !== today && samples !== null && samples >= MIN_SAMPLES;
  const eto = complete ? etoFromStatsRow(row, { minSamples: MIN_SAMPLES }) : null;
  return {
    date: row[0],
    p_avg: r(1), p_max: r(2), p_min: r(3),
    t_avg: r(4), t_max: r(5), t_min: r(6),
    rh_avg: r(7), rh_max: r(8), rh_min: r(9),
    lux_avg: r(10), uv_avg: r(13), uv_max: r(14),
    solar_avg: r(16), solar_max: r(17),
    wind_avg: r(19), wind_gust: r(20), wind_dir: r(22),
    lightning: r(24), samples,
    rain_mm: r(28), rain_min: r(30),
    eto: eto === null ? null : Math.round(eto * 100) / 100,
    complete,
  };
}

// Full stats/station response -> the `daily:all` document.
export function buildDaily(body, { now = new Date() } = {}) {
  const today = new Date(now.getTime() - 6 * 3600_000).toISOString().slice(0, 10); // local date, UTC-6
  return {
    generated_at: now.toISOString(),
    station_id: body.station_id,
    first_day: body.first_ob_day_local,
    last_day: body.last_ob_day_local,
    days: body.stats_day.map((row) => dayRecord(row, { today })),
  };
}

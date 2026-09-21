// Builds the `current` KV document from today's raw obs_st rows (PROJECT.md §2 layout, metric units).

const F = { ts: 0, lull: 1, avg: 2, gust: 3, dir: 4, pressure: 6, temp: 7, rh: 8, lux: 9, uv: 10, solar: 11, rain: 12, lightDist: 14, lightCount: 15 };
const LOCAL_OFFSET_H = -6;

const nums = (rows, i) => rows.map((r) => r[i]).filter((v) => typeof v === "number");
const sum = (a) => a.reduce((s, v) => s + v, 0);
const round = (v, d = 1) => (v === null ? null : Math.round(v * 10 ** d) / 10 ** d);

export function localDate(ms) {
  return new Date(ms + LOCAL_OFFSET_H * 3600_000).toISOString().slice(0, 10);
}

// Unix seconds of local midnight for the date containing `ms`.
export function localMidnightSec(ms) {
  const [y, m, d] = localDate(ms).split("-").map(Number);
  return Date.UTC(y, m - 1, d, -LOCAL_OFFSET_H) / 1000;
}

export function buildCurrent(rows, nowMs) {
  const sorted = rows.filter((r) => Array.isArray(r) && typeof r[F.ts] === "number").sort((a, b) => a[F.ts] - b[F.ts]);
  if (sorted.length === 0) throw new Error("no observations to build current from");
  const latest = sorted[sorted.length - 1];
  const at = (i) => (typeof latest[i] === "number" ? latest[i] : null);

  const recent = sorted.filter((r) => r[F.ts] >= latest[F.ts] - 600);
  const rainLast10 = sum(nums(recent, F.rain));

  const target = latest[F.ts] - 3 * 3600;
  const past = sorted.reduce((best, r) => (best === null || Math.abs(r[F.ts] - target) < Math.abs(best[F.ts] - target) ? r : best), null);
  const pastOk = past && Math.abs(past[F.ts] - target) <= 600 && typeof past[F.pressure] === "number" && at(F.pressure) !== null;

  const strikes = sorted.filter((r) => typeof r[F.lightCount] === "number" && r[F.lightCount] > 0);
  const lastStrike = strikes.length ? strikes[strikes.length - 1] : null;

  const temps = nums(sorted, F.temp);
  const gusts = nums(sorted, F.gust);
  const uvs = nums(sorted, F.uv);

  return {
    updated_at: new Date(latest[F.ts] * 1000).toISOString(),
    fetched_at: new Date(nowMs).toISOString(),
    local_date: localDate(latest[F.ts] * 1000),
    temp: at(F.temp),
    humidity: at(F.rh),
    pressure: at(F.pressure),
    wind_avg: at(F.avg),
    wind_gust: at(F.gust),
    wind_lull: at(F.lull),
    wind_dir: at(F.dir),
    uv: at(F.uv),
    solar: at(F.solar),
    lux: at(F.lux),
    rain_rate: round(rainLast10 * 6),
    pressure_change_3h: pastOk ? round(at(F.pressure) - past[F.pressure]) : null,
    today: {
      temp_max: temps.length ? Math.max(...temps) : null,
      temp_min: temps.length ? Math.min(...temps) : null,
      gust_max: gusts.length ? Math.max(...gusts) : null,
      uv_max: uvs.length ? Math.max(...uvs) : null,
      rain_mm: round(sum(nums(sorted, F.rain)), 2),
      lightning: sum(nums(sorted, F.lightCount)),
    },
    last_lightning: lastStrike
      ? { at: new Date(lastStrike[F.ts] * 1000).toISOString(), distance_km: typeof lastStrike[F.lightDist] === "number" ? lastStrike[F.lightDist] : null }
      : null,
  };
}

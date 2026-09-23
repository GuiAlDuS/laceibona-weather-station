import { aggregateHours, lightningEvents } from "./hourly.js";

// Builds the `wind24h` KV document: per-minute wind speed and direction for the last 24 hours, in the same
// column layout as `obs:YYYY-MM` so the frontend's wind rose code can read either. `hourly` carries the same
// window as hourly temperature [hour start (unix s), mean, min, max, minutes], including the hour still in
// progress, so charts can show the present before the hourly `obs:` append has caught up. `lightning` lists the
// minutes with strikes in the same window, [unix seconds, mean distance km or null, strike count], the same rows
// as `lightning:YYYY`.
const F = { ts: 0, avg: 2, dir: 4 };

export function buildWind24h(rows, nowMs) {
  const from = Math.floor(nowMs / 1000) - 86400;
  const sorted = rows.filter((r) => Array.isArray(r) && typeof r[F.ts] === "number" && r[F.ts] >= from).sort((a, b) => a[F.ts] - b[F.ts]);
  const col = (i) => sorted.map((r) => (typeof r[i] === "number" ? r[i] : null));
  return {
    from: new Date(from * 1000).toISOString(),
    to: sorted.length ? new Date(sorted.at(-1)[F.ts] * 1000).toISOString() : null,
    fetched_at: new Date(nowMs).toISOString(),
    // ts (unix seconds) lets the frontend cut shorter windows (12h, 6h) out of this same 24h document
    // without a separate fetch; it is always present and in the same order as ws/wd.
    cols: { ts: sorted.map((r) => r[F.ts]), ws: col(F.avg), wd: col(F.dir) },
    hourly: [...aggregateHours(sorted)].filter(([, r]) => r.t !== null).map(([h, r]) => [h, r.t, r.tmin, r.tmax, r.n]),
    lightning: lightningEvents(sorted),
  };
}

// Lightning strikes in the last 24 hours, from the `lightning` rows of the `wind24h` document
// ([unix seconds, mean distance km or null, strike count], one per minute with strikes). Pure functions; no DOM.

export const WINDOW_S = 86400;

// Strike minutes inside the 24 hours up to `nowMs`, oldest first, plus the total and the closest one.
// A minute with no distance still counts toward the total; it just has no place on the distance axis.
export function recentStrikes(doc, nowMs = Date.now()) {
  const rows = Array.isArray(doc?.lightning) ? doc.lightning : [];
  const from = nowMs / 1000 - WINDOW_S;
  const events = rows
    .filter((r) => Array.isArray(r) && typeof r[0] === "number" && r[0] >= from && typeof r[2] === "number" && r[2] > 0)
    .map(([ts, dist, count]) => ({ ts, dist: typeof dist === "number" ? dist : null, count }))
    .sort((a, b) => a.ts - b.ts);
  const total = events.reduce((s, e) => s + e.count, 0);
  const closest = events.reduce((c, e) => (e.dist !== null && (c === null || e.dist < c.dist) ? e : c), null);
  return { events, total, closest, from, to: nowMs / 1000 };
}

// Hours per day at each UV risk level, month by month, from the monthly `uv:` documents: 10-minute means of the UV
// index over each day's daylight hours (fetcher/src/uv.js). Pure functions; no DOM.
const PARTIAL_BELOW = 0.9;
// A day counts when no more than this many of its 10-minute slots are missing (an hour in all).
const MAX_MISSING = 6;

// Standard UV index risk levels, lowest first. Edges sit between whole numbers because the index is reported
// rounded (5.6 reads as 6, "high"). Low (0-2) is not counted.
export const UV_LEVELS = [
  { key: "moderate", from: 2.5 },
  { key: "high", from: 5.5 },
  { key: "veryHigh", from: 7.5 },
  { key: "extreme", from: 10.5 },
];

export const uvLevel = (uv) => UV_LEVELS.findLast((l) => uv >= l.from)?.key ?? null;

// One entry per month, oldest first: the mean hours per day the UV index spent at each level. A day counts only
// if its daylight slots are nearly all there and it saw some UV (an all-zero day is a sensor outage), so an outage
// or the day in progress doesn't pull the month down; months with no such day are left out.
export function monthlyUvHours(docs) {
  return [...docs]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((doc) => {
      const perHour = 3600 / doc.step;
      const valid = [];
      for (let i = 0; i < doc.uv.length; i += doc.perDay) {
        const slots = doc.uv.slice(i, i + doc.perDay).filter((v) => typeof v === "number");
        if (slots.length < doc.perDay - MAX_MISSING || !slots.some((v) => v > 0)) continue;
        const counts = Object.fromEntries(UV_LEVELS.map((l) => [l.key, 0]));
        for (const v of slots) {
          const level = uvLevel(v);
          if (level) counts[level] += 1 / perHour;
        }
        valid.push(counts);
      }
      const hours = Object.fromEntries(UV_LEVELS.map((l) => [l.key, valid.length ? valid.reduce((s, d) => s + d[l.key], 0) / valid.length : 0]));
      return { key: doc.month, days: valid.length, partial: valid.length < (doc.uv.length / doc.perDay) * PARTIAL_BELOW, hours };
    })
    .filter((m) => m.days > 0);
}

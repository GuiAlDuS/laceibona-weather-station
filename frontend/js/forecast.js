// Shapes the `/api/forecast` document into display-ready daily rows. Pure functions; no DOM.
// `day_start_local` is a real unix timestamp at local midnight (verified against production data:
// it lands at 06:00 UTC, i.e. UTC-6), the same convention as every other "local" timestamp in this project.
const LOCAL_OFFSET_S = -6 * 3600;

export const localDate = (tsSec) => new Date((tsSec + LOCAL_OFFSET_S) * 1000).toISOString().slice(0, 10);

// "YYYY-MM-DD HH:MM" in station-local time, which Plotly reads as a zone-less date (so the browser's zone never shifts it).
export const localStamp = (tsSec) => new Date((tsSec + LOCAL_OFFSET_S) * 1000).toISOString().slice(0, 16).replace("T", " ");

// Adds a `date` (YYYY-MM-DD, local) field to each day; drops rows with no timestamp to key off.
export function forecastDays(doc) {
  const days = Array.isArray(doc?.days) ? doc.days : [];
  return days.filter((d) => typeof d?.day_start_local === "number").map((d) => ({ ...d, date: localDate(d.day_start_local) }));
}

export const WINDOW_HOURS = 24;

// The next 24 hours, oldest first, each with its local `date`. Hours that already ended are dropped, since the
// document can be up to ~40 minutes old (30-minute refresh plus the API cache). Falls back to the older
// today-only `hours` list if the document predates `next_hours`.
export function forecastHours(doc, nowMs = Date.now()) {
  const hours = Array.isArray(doc?.next_hours) ? doc.next_hours : Array.isArray(doc?.hours) ? doc.hours : [];
  return hours
    .filter((h) => typeof h?.time === "number" && typeof h?.hour === "number" && (h.time + 3600) * 1000 > nowMs)
    .sort((a, b) => a.time - b.time)
    .slice(0, WINDOW_HOURS)
    .map((h) => ({ ...h, date: localDate(h.time) }));
}

export const RAIN_LIKELY = 50; // precip_probability (%) at or above this counts as "likely" in the outlook

export const isRainLikely = (h) => typeof h?.precip_probability === "number" && h.precip_probability >= RAIN_LIKELY;

// `precip_type` is a whole-day flag, not per-hour: verified against real data, it stays "storm" for every hour
// of a thunderstorm-forecast day, including a 10%-probability "Partly Cloudy" hour late at night. `icon` is the
// only field that actually varies hour to hour, so it is the sole signal here.
export const isStormHour = (h) => typeof h?.icon === "string" && h.icon.includes("thunderstorm");

// Groups the hours matching `predicate` into contiguous local-hour ranges: [{ start, end, date }] (hours
// inclusive; `date` is the local date the range starts on, so a run can be placed on today or tomorrow).
export function contiguousRanges(hours, predicate) {
  const ranges = [];
  let start = null;
  for (let i = 0; i <= hours.length; i++) {
    const match = i < hours.length && predicate(hours[i]);
    if (match && start === null) start = i;
    if (!match && start !== null) {
      ranges.push({ start: hours[start].hour, end: hours[i - 1].hour, date: hours[start].date });
      start = null;
    }
  }
  return ranges;
}

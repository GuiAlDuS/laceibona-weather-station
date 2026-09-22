// Shapes the `/api/forecast` document into display-ready daily rows. Pure functions; no DOM.
// `day_start_local` is a real unix timestamp at local midnight (verified against production data:
// it lands at 06:00 UTC, i.e. UTC-6), the same convention as every other "local" timestamp in this project.
const LOCAL_OFFSET_S = -6 * 3600;

export const localDate = (tsSec) => new Date((tsSec + LOCAL_OFFSET_S) * 1000).toISOString().slice(0, 10);

// Adds a `date` (YYYY-MM-DD, local) field to each day; drops rows with no timestamp to key off.
export function forecastDays(doc) {
  const days = Array.isArray(doc?.days) ? doc.days : [];
  return days.filter((d) => typeof d?.day_start_local === "number").map((d) => ({ ...d, date: localDate(d.day_start_local) }));
}

// Today's hourly forecast (the fetcher already filters to today), sorted 0-23.
export function forecastHours(doc) {
  const hours = Array.isArray(doc?.hours) ? doc.hours : [];
  return hours.filter((h) => typeof h?.hour === "number").sort((a, b) => a.hour - b.hour);
}

export const RAIN_LIKELY = 50; // precip_probability (%) at or above this counts as "likely" in the outlook

export const isRainLikely = (h) => typeof h?.precip_probability === "number" && h.precip_probability >= RAIN_LIKELY;

// `precip_type` is a whole-day flag, not per-hour: verified against real data, it stays "storm" for every hour
// of a thunderstorm-forecast day, including a 10%-probability "Partly Cloudy" hour late at night. `icon` is the
// only field that actually varies hour to hour, so it is the sole signal here.
export const isStormHour = (h) => typeof h?.icon === "string" && h.icon.includes("thunderstorm");

// Groups the hours matching `predicate` into contiguous local-hour ranges: [{ start, end }] (both inclusive).
export function contiguousRanges(hours, predicate) {
  const ranges = [];
  let start = null;
  for (let i = 0; i <= hours.length; i++) {
    const match = i < hours.length && predicate(hours[i]);
    if (match && start === null) start = hours[i].hour;
    if (!match && start !== null) {
      ranges.push({ start, end: hours[i - 1].hour });
      start = null;
    }
  }
  return ranges;
}

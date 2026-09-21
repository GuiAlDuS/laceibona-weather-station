// Formatting helpers for the current-conditions panel. Pure functions; no DOM.

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export const STALE_AFTER_MIN = 15;

export const cardinal = (deg) => (typeof deg === "number" ? COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16] : null);

// Tempest reports wind in m/s; the station app is set to km/h.
export const kmh = (ms) => (typeof ms === "number" ? Math.round(ms * 3.6 * 10) / 10 : null);

export const ageMinutes = (iso, nowMs) => Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60000));

export function formatAge(min) {
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h ${min % 60} min ago` : `${Math.floor(h / 24)} d ago`;
}

export const isStale = (min) => min > STALE_AFTER_MIN;

// WHO UV index bands.
export function uvBand(uv) {
  if (typeof uv !== "number") return null;
  if (uv < 3) return "Low";
  if (uv < 6) return "Moderate";
  if (uv < 8) return "High";
  if (uv < 11) return "Very high";
  return "Extreme";
}

// Change over three hours in hPa; small changes read as steady.
export function pressureTrend(delta) {
  if (typeof delta !== "number") return null;
  const abs = Math.abs(delta).toFixed(1);
  if (Math.abs(delta) < 0.5) return "Steady over 3 h";
  return `${delta > 0 ? "Rising" : "Falling"} ${abs} hPa in 3 h`;
}

export function lastStrikeText(strike, nowMs) {
  if (!strike) return "No strikes today";
  const dist = typeof strike.distance_km === "number" ? `${strike.distance_km} km, ` : "";
  return `Last: ${dist}${formatAge(ageMinutes(strike.at, nowMs))}`;
}

export function rainNowText(rate) {
  if (typeof rate !== "number" || rate <= 0) return "Not raining";
  return `Raining now: ${rate.toFixed(1)} mm/h`;
}

// Time of day in station time (UTC-6, no DST), e.g. "14:05".
export const stationTime = (iso) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" });

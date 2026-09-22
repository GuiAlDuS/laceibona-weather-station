// Formatting helpers for the current-conditions panel. Pure functions; no DOM.
import { t, sectorLabel, TIME_LOCALE } from "./i18n.js";

export const STALE_AFTER_MIN = 15;

export const cardinal = (deg) => (typeof deg === "number" ? sectorLabel(Math.round((((deg % 360) + 360) % 360) / 22.5) % 16) : null);

// Tempest reports wind in m/s; the station app is set to km/h.
export const kmh = (ms) => (typeof ms === "number" ? Math.round(ms * 3.6 * 10) / 10 : null);

export const ageMinutes = (iso, nowMs) => Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60000));

export function formatAge(min) {
  if (min < 1) return t("just now", "justo ahora");
  if (min < 60) return t(`${min} min ago`, `hace ${min} min`);
  const h = Math.floor(min / 60);
  return h < 24 ? t(`${h} h ${min % 60} min ago`, `hace ${h} h ${min % 60} min`) : t(`${Math.floor(h / 24)} d ago`, `hace ${Math.floor(h / 24)} d`);
}

export const isStale = (min) => min > STALE_AFTER_MIN;

// WHO UV index bands.
export function uvBand(uv) {
  if (typeof uv !== "number") return null;
  if (uv < 3) return t("Low", "Bajo");
  if (uv < 6) return t("Moderate", "Moderado");
  if (uv < 8) return t("High", "Alto");
  if (uv < 11) return t("Very high", "Muy alto");
  return t("Extreme", "Extremo");
}

// Change over three hours in hPa; small changes read as steady.
export function pressureTrend(delta) {
  if (typeof delta !== "number") return null;
  const abs = Math.abs(delta).toFixed(1);
  if (Math.abs(delta) < 0.5) return t("Steady over 3 h", "Estable en 3 h");
  return delta > 0 ? t(`Rising ${abs} hPa in 3 h`, `Subiendo ${abs} hPa en 3 h`) : t(`Falling ${abs} hPa in 3 h`, `Bajando ${abs} hPa en 3 h`);
}

export function lastStrikeText(strike, nowMs) {
  if (!strike) return t("No strikes today", "Sin rayos hoy");
  const dist = typeof strike.distance_km === "number" ? `${strike.distance_km} km, ` : "";
  return t(`Last: ${dist}${formatAge(ageMinutes(strike.at, nowMs))}`, `Último: ${dist}${formatAge(ageMinutes(strike.at, nowMs))}`);
}

export function rainNowText(rate) {
  if (typeof rate !== "number" || rate <= 0) return t("Not raining", "No está lloviendo");
  return t(`Raining now: ${rate.toFixed(1)} mm/h`, `Lloviendo ahora: ${rate.toFixed(1)} mm/h`);
}

// Time of day in station time (UTC-6, no DST), e.g. "14:05".
export const stationTime = (iso) => new Date(iso).toLocaleTimeString(TIME_LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" });

import { $, el, num, tile } from "./common.js";
import { t } from "./i18n.js";
import { cardinal, kmh, ageMinutes, formatAge, isStale, uvBand, pressureTrend, lastStrikeText, rainNowText, stationTime, STALE_AFTER_MIN } from "./conditions.js";

export function renderCurrent(doc, nowMs) {
  const age = ageMinutes(doc.updated_at, nowMs);
  $("cc-updated").textContent = t(`Updated ${stationTime(doc.updated_at)} (${formatAge(age)})`, `Actualizado ${stationTime(doc.updated_at)} (${formatAge(age)})`);

  const stale = $("cc-stale");
  stale.hidden = !isStale(age);
  stale.replaceChildren();
  if (isStale(age)) {
    const lead = el("strong", null, t("Stale data — ", "Datos desactualizados — "));
    stale.append(
      lead,
      t(
        `No new data for ${formatAge(age).replace(" ago", "")} (normally every few minutes). The station or its connection may be offline; these are the last values received.`,
        `Sin datos nuevos desde hace ${formatAge(age).replace("hace ", "")} (normalmente llegan cada pocos minutos). Es posible que la estación o su conexión estén sin servicio; estos son los últimos valores recibidos.`,
      ),
    );
  }

  const body = $("cc-body");
  body.replaceChildren();

  const today = doc.today ?? {};
  const hero = el("div", "cc-hero");
  const big = el("div", "hero-value", num(doc.temp));
  big.append(el("span", "hero-unit", "°C"));
  hero.append(el("div", "tile-label", t("Temperature", "Temperatura")), big);
  hero.append(el("div", "tile-sub", t(`High ${num(today.temp_max)}° · Low ${num(today.temp_min)}° today`, `Máxima ${num(today.temp_max)}° · Mínima ${num(today.temp_min)}° hoy`)));

  const dir = cardinal(doc.wind_dir);
  const grid = el("div", "cc-grid");
  grid.append(
    tile(t("Humidity", "Humedad"), num(doc.humidity, 0), "%"),
    tile(t("Wind", "Viento"), num(kmh(doc.wind_avg)), "km/h", [t(`Gust ${num(kmh(doc.wind_gust))} km/h`, `Ráfaga ${num(kmh(doc.wind_gust))} km/h`), dir ? t(`From ${dir} (${Math.round(doc.wind_dir)}°)`, `Desde ${dir} (${Math.round(doc.wind_dir)}°)`) : null]),
    tile(t("Pressure (station)", "Presión (estación)"), num(doc.pressure), "hPa", [pressureTrend(doc.pressure_change_3h)]),
    tile(t("Rain today", "Lluvia hoy"), num(today.rain_mm), "mm", [rainNowText(doc.rain_rate)]),
    tile(t("UV index", "Índice UV"), num(doc.uv), "", [uvBand(doc.uv), t(`Max today ${num(today.uv_max)}`, `Máximo hoy ${num(today.uv_max)}`)]),
    tile(t("Solar radiation", "Radiación solar"), num(doc.solar, 0), "W/m²"),
    tile(t("Lightning today", "Rayos hoy"), typeof today.lightning === "number" ? String(today.lightning) : "—", t("strikes", "rayos"), [lastStrikeText(doc.last_lightning, nowMs)]),
  );
  body.append(hero, grid);
}

export function renderCurrentUnavailable(message) {
  $("cc-updated").textContent = "";
  $("cc-stale").hidden = true;
  $("cc-body").replaceChildren(el("p", "muted", message));
}

export { STALE_AFTER_MIN };

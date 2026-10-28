import { $, el, num, nf, tile } from "./common.js";
import { t, MONTHS } from "./i18n.js";
import { WET_DAY_MM } from "./extremes.js";
import { cardinal, kmh, ageMinutes, formatAge, isStale, uvBand, heatBand, pressureTrend, lastStrikeText, rainNowText, stationTime, STALE_AFTER_MIN } from "./conditions.js";

const dayMonth = (iso) => `${+iso.slice(8)} ${MONTHS[+iso.slice(5, 7) - 1]}`;
const days = (n) => (n === 1 ? t("day", "día") : t("days", "días"));

// The rain tile. On a day with less than WET_DAY_MM so far it counts the days without rain instead, the same dry days
// as the Extremes "Longest dry spell" row; dry: { now } (see app.js), or null until the hourly history
// has loaded, which leaves the plain "Rain today" tile.
function rainTile(today, rate, dry) {
  const rain = today.rain_mm;
  const spell = dry?.now;
  if (!spell || spell.days === 0 || (typeof rain === "number" && rain >= WET_DAY_MM)) {
    const ended = spell?.days >= 3 ? t(`Ended a ${spell.days}-day dry spell`, `Terminó una racha seca de ${spell.days} días`) : null;
    return tile(t("Rain today", "Lluvia hoy"), num(rain), "mm", [rainNowText(rate), ended]);
  }
  const box = tile(t("Days without rain", "Días sin lluvia"), nf.format(spell.days), days(spell.days), [
    typeof rate === "number" && rate > 0 ? rainNowText(rate) : null,
    typeof rain === "number" && rain > 0 ? t(`Rain today ${num(rain)} mm`, `Lluvia hoy ${num(rain)} mm`) : null,
    spell.lastWet ? t(`Last rain ${dayMonth(spell.lastWet.date)} (${nf.format(spell.lastWet.rain)} mm)`, `Última lluvia ${dayMonth(spell.lastWet.date)} (${nf.format(spell.lastWet.rain)} mm)`) : null,
  ]);
  box.title = t(`A day with less than ${WET_DAY_MM} mm of rain counts as dry, as in Extremes.`, `Un día con menos de ${WET_DAY_MM} mm de lluvia cuenta como seco, igual que en Extremos.`);
  if (spell.noData) box.title += t(` Includes ${spell.noData} ${days(spell.noData)} without data, taken as dry.`, ` Incluye ${spell.noData} ${days(spell.noData)} sin datos, que se toman como secos.`);
  return box;
}

export function renderCurrent(doc, nowMs, dry = null) {
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
    rainTile(today, doc.rain_rate, dry),
    tile(t("UV index", "Índice UV"), num(doc.uv), "", [uvBand(doc.uv), t(`Max today ${num(today.uv_max)}`, `Máximo hoy ${num(today.uv_max)}`)]),
    tile(t("Heat (WBGT)", "Calor (WBGT)"), num(doc.wbgt), "°C", [heatBand(doc.wbgt)]),
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

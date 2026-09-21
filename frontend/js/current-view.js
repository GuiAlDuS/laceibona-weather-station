import { $ } from "./common.js";
import { cardinal, kmh, ageMinutes, formatAge, isStale, uvBand, pressureTrend, lastStrikeText, rainNowText, stationTime, STALE_AFTER_MIN } from "./conditions.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const num = (v, digits = 1) => (typeof v === "number" ? v.toFixed(digits) : "—");

function tile(label, value, unit, subs = []) {
  const t = el("div", "tile");
  t.append(el("div", "tile-label", label));
  const v = el("div", "tile-value", value);
  if (unit) v.append(el("span", "tile-unit", ` ${unit}`));
  t.append(v);
  for (const s of subs) if (s) t.append(el("div", "tile-sub", s));
  return t;
}

export function renderCurrent(doc, nowMs) {
  const age = ageMinutes(doc.updated_at, nowMs);
  $("cc-updated").textContent = `Updated ${stationTime(doc.updated_at)} (${formatAge(age)})`;

  const stale = $("cc-stale");
  stale.hidden = !isStale(age);
  stale.textContent = isStale(age)
    ? `No new data for ${formatAge(age).replace(" ago", "")} (normally every few minutes). The station or its connection may be offline; these are the last values received.`
    : "";

  const body = $("cc-body");
  body.replaceChildren();

  const t = doc.today ?? {};
  const hero = el("div", "cc-hero");
  const big = el("div", "hero-value", num(doc.temp));
  big.append(el("span", "hero-unit", "°C"));
  hero.append(el("div", "tile-label", "Temperature"), big);
  hero.append(el("div", "tile-sub", `High ${num(t.temp_max)}° · Low ${num(t.temp_min)}° today`));

  const dir = cardinal(doc.wind_dir);
  const grid = el("div", "cc-grid");
  grid.append(
    tile("Humidity", num(doc.humidity, 0), "%"),
    tile("Wind", num(kmh(doc.wind_avg)), "km/h", [`Gust ${num(kmh(doc.wind_gust))} km/h`, dir ? `From ${dir} (${Math.round(doc.wind_dir)}°)` : null]),
    tile("Pressure (station)", num(doc.pressure), "hPa", [pressureTrend(doc.pressure_change_3h)]),
    tile("Rain today", num(t.rain_mm), "mm", [rainNowText(doc.rain_rate)]),
    tile("UV index", num(doc.uv), "", [uvBand(doc.uv), `Max today ${num(t.uv_max)}`]),
    tile("Solar radiation", num(doc.solar, 0), "W/m²"),
    tile("Lightning today", typeof t.lightning === "number" ? String(t.lightning) : "—", "strikes", [lastStrikeText(doc.last_lightning, nowMs)]),
  );
  body.append(hero, grid);
}

export function renderCurrentUnavailable(message) {
  $("cc-updated").textContent = "";
  $("cc-stale").hidden = true;
  $("cc-body").replaceChildren(el("p", "muted", message));
}

export { STALE_AFTER_MIN };

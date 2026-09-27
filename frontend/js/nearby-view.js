import { $, el, num } from "./common.js";
import { t } from "./i18n.js";
import { cardinal, ageMinutes, formatAge, stationTime } from "./conditions.js";
import { isCalm, tailBelow, spreadApart, NEARBY_STALE_MIN } from "./nearby.js";

const NAMES = {
  IESPAR102: t("La Ceibona", "La Ceibona"),
  IESPAR72: t("Esparza", "Esparza"),
  IPUNTA186: t("Puntarenas", "Puntarenas"),
};
const nameOf = (s) => NAMES[s.id] ?? s.id;

// The station glyph, drawn around the station's point (0, 0). The dial's upper half is red and holds the temperature,
// its lower half blue and holds today's rain, the same red/blue as every chart; the drop is filled while it is
// raining. The arrow stands on the side the wind comes from and points in at the station, with the speed at its tail;
// no arrow means calm. The name goes on the side away from the tail so the two never collide.
const R = 25;
const SIZE = 150; // px; the SVG is centred on the station's point
const DROP = "M0,-5 C2.6,-1.6 3.6,0.2 3.6,1.7 A3.6,3.6 0 0 1 -3.6,1.7 C-3.6,0.2 -2.6,-1.6 0,-5 Z";

// When the dial has been pushed off its station (see spreadApart), a thin line back to a dot on the true position.
const leader = (ox, oy) =>
  Math.hypot(ox, oy) < 1 ? "" : `<line x1="0" y1="0" x2="${(-ox).toFixed(1)}" y2="${(-oy).toFixed(1)}" class="nb-leader"/><circle cx="${(-ox).toFixed(1)}" cy="${(-oy).toFixed(1)}" r="3" class="nb-point"/>`;

function glyph(s, stale, [ox, oy]) {
  const raining = typeof s.rain_rate === "number" && s.rain_rate > 0;
  const rain = typeof s.rain_today === "number" ? num(s.rain_today, 1) : "—";
  const temp = typeof s.temp === "number" ? `${num(s.temp, 1)}°` : "—";
  const below = tailBelow(s);
  let wind = "";
  if (!isCalm(s)) {
    const a = (s.wind_dir * Math.PI) / 180;
    const lx = Math.sin(a) * (R + 36);
    const ly = -Math.cos(a) * (R + 36);
    wind = `
      <g transform="rotate(${s.wind_dir})">
        <line x1="0" y1="${-(R + 27)}" x2="0" y2="${-(R + 8)}" class="nb-halo" stroke-width="6"/>
        <line x1="0" y1="${-(R + 27)}" x2="0" y2="${-(R + 9)}" class="nb-arrow"/>
        <path d="M0,${-(R + 3)} L-5,${-(R + 11)} L5,${-(R + 11)} Z" class="nb-arrow-head"/>
      </g>
      <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" class="nb-speed" dominant-baseline="middle">${num(s.wind_speed, 1)} km/h</text>`;
  }
  const nameY = below ? -(R + 14) : R + 22;
  return `
    <svg class="nb-glyph${s.ours ? " ours" : ""}${stale ? " stale" : ""}" width="${SIZE}" height="${SIZE}" viewBox="${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}" aria-hidden="true">
      ${leader(ox, oy)}
      <circle r="${R + 3}" class="nb-halo-fill"/>
      <circle r="${R}" class="nb-face"/>
      <path d="M${-R},0 A${R},${R} 0 0 1 ${R},0" class="nb-ring nb-ring-temp"/>
      <path d="M${R},0 A${R},${R} 0 0 1 ${-R},0" class="nb-ring nb-ring-rain"/>
      <text y="-4" class="nb-temp" dominant-baseline="middle">${temp}</text>
      <g transform="translate(${-4 - rain.length * 3.1},12)"><path d="${DROP}" class="nb-drop${raining ? " raining" : ""}"/></g>
      <text x="${4 - rain.length * 3.1}" y="13" class="nb-rain" dominant-baseline="middle" text-anchor="start">${rain}</text>
      ${wind}
      <text y="${nameY}" class="nb-name" dominant-baseline="middle">${nameOf(s)}</text>
    </svg>`;
}

function details(s, nowMs) {
  const dir = cardinal(s.wind_dir);
  const age = s.obs_time ? ageMinutes(s.obs_time, nowMs) : null;
  const lines = [
    `<strong>${nameOf(s)}</strong> ${s.ours ? t("(our station)", "(nuestra estación)") : `· ${s.id}`}`,
    t(`Temperature ${num(s.temp)} °C`, `Temperatura ${num(s.temp)} °C`),
    t(`Rain now ${num(s.rain_rate)} mm/h, today ${num(s.rain_today)} mm`, `Lluvia ahora ${num(s.rain_rate)} mm/h, hoy ${num(s.rain_today)} mm`),
    isCalm(s)
      ? t("Wind calm", "Viento en calma")
      : t(`Wind ${num(s.wind_speed)} km/h from ${dir} (${Math.round(s.wind_dir)}°), gusts ${num(s.wind_gust)} km/h`, `Viento ${num(s.wind_speed)} km/h desde ${dir} (${Math.round(s.wind_dir)}°), ráfagas ${num(s.wind_gust)} km/h`),
    s.obs_time ? t(`Reported ${stationTime(s.obs_time)} (${formatAge(age)})`, `Reportado ${stationTime(s.obs_time)} (${formatAge(age)})`) : "",
  ];
  return lines.filter(Boolean).join("<br>");
}

let map = null;
let layer = null;

function ensureMap() {
  if (map) return map;
  map = L.map("nb-map", { scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: true, zoomSnap: 0.5 });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 17,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  layer = L.layerGroup().addTo(map);
  return map;
}

let fitted = false;
let shown = [];
let shownAt = 0;
const MIN_APART = 74; // px between dial centres: the dials (50 px) plus room for the halo and a gap

function drawMarkers() {
  layer.clearLayers();
  const offsets = spreadApart(shown.map((s) => { const p = map.latLngToContainerPoint([s.lat, s.lon]); return [p.x, p.y]; }), MIN_APART);
  shown.forEach((s, i) => {
    const stale = s.obs_time ? ageMinutes(s.obs_time, shownAt) > NEARBY_STALE_MIN : true;
    const [ox, oy] = offsets[i];
    const icon = L.divIcon({ className: "nb-icon", html: glyph(s, stale, offsets[i]), iconSize: [SIZE, SIZE], iconAnchor: [SIZE / 2 - ox, SIZE / 2 - oy] });
    const marker = L.marker([s.lat, s.lon], { icon, keyboard: true, title: nameOf(s), zIndexOffset: s.ours ? 1000 : 0 }).addTo(layer);
    marker.bindTooltip(details(s, shownAt), { direction: "top", offset: [ox, oy - R - 6], className: "nb-tip", opacity: 1 });
    marker.on("click", () => marker.openTooltip());
  });
}

export function renderNearbyMap(stations, nowMs) {
  const m = ensureMap();
  shown = stations;
  shownAt = nowMs;
  // Fit once, so a refresh never undoes the reader's own zoom or pan.
  if (!fitted && stations.length) {
    m.fitBounds(L.latLngBounds(stations.map((s) => [s.lat, s.lon])), { padding: [80, 80], maxZoom: 14 });
    m.on("zoomend", drawMarkers);
    fitted = true;
  }
  drawMarkers();
}

export function renderNearbyText(stations, nowMs) {
  const missing = ["IESPAR72", "IPUNTA186"].filter((id) => !stations.some((s) => s.id === id));
  const staleNames = stations.filter((s) => !s.obs_time || ageMinutes(s.obs_time, nowMs) > NEARBY_STALE_MIN).map(nameOf);
  const notes = [];
  if (missing.length) notes.push(t(`Not reporting right now: ${missing.map((id) => NAMES[id]).join(", ")}.`, `Sin reportar en este momento: ${missing.map((id) => NAMES[id]).join(", ")}.`));
  if (staleNames.length) notes.push(t(`Faded: no report for over ${NEARBY_STALE_MIN} minutes (${staleNames.join(", ")}).`, `Atenuada: sin reporte desde hace más de ${NEARBY_STALE_MIN} minutos (${staleNames.join(", ")}).`));
  $("nb-summary").textContent = notes.join(" ");

  $("nb-note").textContent = t(
    "Each station is a dial: the red upper half holds the temperature (°C), the blue lower half today's rain since midnight (mm), and the drop is filled while it is raining. The arrow stands on the side the wind is coming from and points at the station, with the average speed at its tail; no arrow means calm. Hover over or tap a station for its full reading. The neighbours are privately owned stations shown exactly as they report to Weather Underground, with different sensors and siting, so small differences between them are normal. The map refreshes every minute.",
    "Cada estación es un dial: la mitad superior roja lleva la temperatura (°C), la mitad inferior azul la lluvia de hoy desde la medianoche (mm), y la gota se rellena mientras llueve. La flecha está del lado desde donde viene el viento y apunta a la estación, con la velocidad media en su cola; sin flecha, el viento está en calma. Pase el cursor o toque una estación para ver la lectura completa. Las vecinas son estaciones privadas que se muestran tal como reportan a Weather Underground, con otros sensores y ubicaciones, así que es normal que haya pequeñas diferencias entre ellas. El mapa se actualiza cada minuto.",
  );

  const table = $("nb-table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const h of [t("Station", "Estación"), t("Temp (°C)", "Temp (°C)"), t("Rain now (mm/h)", "Lluvia ahora (mm/h)"), t("Rain today (mm)", "Lluvia hoy (mm)"), t("Wind (km/h)", "Viento (km/h)"), t("From", "Desde"), t("Reported", "Reportado")]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  for (const s of stations) {
    const row = body.insertRow();
    for (const c of [`${nameOf(s)} (${s.id})`, num(s.temp), num(s.rain_rate), num(s.rain_today), num(s.wind_speed), isCalm(s) ? t("calm", "calma") : cardinal(s.wind_dir), s.obs_time ? stationTime(s.obs_time) : "—"]) row.insertCell().textContent = c;
  }
}

export function renderNearbyUnavailable(message) {
  $("nb-summary").replaceChildren(el("span", "muted", message));
}

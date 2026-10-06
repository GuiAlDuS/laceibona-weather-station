import { $, token, narrowScreen, chartFont, hoverLabel, dayAxisTicks, WEEK_DAYS, weekMargin, stackDomains, panelTitle, PANEL_GAP_PX, perPanel, weekNightBands, addSensorFixNote, FIX_FACTOR, nowRing } from "./common.js";
import { sensorFixed } from "./sensor-fix.js";
import { t } from "./i18n.js";
import { dayLabel } from "./tempdaily-view.js";
import { fineDaySummaries, finePeak } from "./rainfine.js";

const DAY_MS = 86400_000;
// Whole days since the first bucket shown. Like the wind scatter, the x axis counts days, not dates: Plotly
// formats date-axis ticks in the viewer's timezone, which would shift these local-time labels by a day.
const dayIndex = (iso, first) => Math.round((Date.parse(iso) - Date.parse(first)) / DAY_MS);
const hourLabel = (h, m) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
const rgba = (hex, a) => `rgba(${[1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)).join(",")},${a})`;

// Five panels over one shared day axis, top to bottom: temperature, solar radiation, air humidity, station pressure
// and rain intensity. Each has its own y axis and a name above it, so no scale is shared or doubled up.
const PANEL_WEIGHTS = [1, 1, 1, 1, 1.2];
// The window still shows days with corrected light-sensor readings (sensor-fix.js).
const corrected = (buckets) => buckets.some((b) => sensorFixed(b.date) && b.solar !== null);

// first: the week's first local date (see weekStart); the x axis always spans WEEK_DAYS days from it.
export function renderRainFineChart(buckets, first, now = null) {
  const font = chartFont();
  const muted = token("--text-secondary");
  const span = WEEK_DAYS;
  // On a phone the right margin is widened to hold the current readings, which sit to the right of their rings.
  const margin = { ...weekMargin(), ...(narrowScreen.matches ? { r: 46 } : {}), t: 24, b: 40 };
  const x = buckets.map((b) => dayIndex(b.date, first) + (b.hour * 60 + b.minute) / 1440);
  // Every hover names the day and the 10-minute window it is in.
  const when = buckets.map((b) => `${dayLabel(b.date)} ${hourLabel(b.hour, b.minute)}`);
  const [tempD, solarD, rhD, pD, rainD] = stackDomains(PANEL_WEIGHTS, PANEL_GAP_PX, $("rf-chart").clientHeight - margin.t - margin.b);

  const line = (key, yaxis, color, fmt) => ({
    type: "scatter",
    mode: "lines",
    x,
    y: buckets.map((b) => b[key]),
    yaxis,
    customdata: when,
    line: { color, width: 1.5 },
    hovertemplate: `%{customdata}<br>${fmt}<extra></extra>`,
  });
  const temp = line("temp", "y5", token("--hot"), "%{y:.1f} °C");
  const solar = {
    ...line("solar", "y4", token("--sun"), "%{y:.0f} W/m²"),
    fill: "tozeroy",
    line: { color: token("--sun"), width: 1 },
    fillcolor: rgba(token("--sun"), 0.3),
  };
  const rh = line("rh", "y3", token("--series-6"), "%{y:.0f}%");
  const pressure = line("p", "y2", token("--series-4"), "%{y:.1f} hPa");
  const rain = {
    type: "bar",
    x,
    y: buckets.map((b) => b.rate),
    customdata: when,
    width: (1 / 144) * 0.9, // just under one 10-minute slot, so bars don't touch
    marker: { color: token("--series-1") },
    hovertemplate: "%{customdata}<br>%{y:.1f} mm/h<extra></extra>",
  };
  // Never under 10 mm/h at the top, so a drizzle stays a drizzle instead of filling the panel.
  const peakRate = Math.max(0, ...buckets.map((b) => b.rate ?? 0));
  const rateStep = [5, 10, 15, 20, 25, 50].find((v) => 2 * v >= peakRate) ?? Math.ceil(peakRate / 20) * 10;
  // Both ranges also take in the current reading, so its ring (below) stays inside the panel.
  const maxSolar = Math.max(100, now?.solar ?? 0, ...buckets.map((b) => b.solar ?? 0));
  const minRh = Math.min(100, now?.rh ?? 100, ...buckets.map((b) => b.rh ?? 100));

  // A faint band from 18:00 to 06:00 each day, so night and day are easy to tell apart at a glance; drawn inside
  // each panel, so the white gaps between panels stay clear.
  const nightShapes = perPanel(weekNightBands(span), [tempD, solarD, rhD, pD, rainD]);
  const names = [
    t("Temperature (°C)", "Temperatura (°C)"),
    t("Solar radiation (W/m²)", "Radiación solar (W/m²)"),
    t("Air humidity (%)", "Humedad del aire (%)"),
    t("Station pressure (hPa)", "Presión de la estación (hPa)"),
    t("Rain intensity (mm/h)", "Intensidad de la lluvia (mm/h)"),
  ];
  const annotations = names.map((name, i) => panelTitle(name, [tempD, solarD, rhD, pD, rainD][i][1]));
  // Each line's current reading as a ring (see nowRing), joined to its last 10-minute average.
  const local = now && new Date((now.ts - 6 * 3600) * 1000);
  const nowX = local && dayIndex(local.toISOString().slice(0, 10), first) + (local.getUTCHours() * 60 + local.getUTCMinutes()) / 1440;
  const rings = [
    ["temp", "y5", token("--hot"), 1],
    ["solar", "y4", token("--sun"), 0],
    ["rh", "y3", token("--series-6"), 0],
    ["p", "y2", token("--series-4"), 1],
  ].flatMap(([key, yaxis, color, digits]) => {
    if (now?.[key] == null || nowX > span) return [];
    const i = buckets.findLastIndex((b) => b[key] !== null);
    return [nowRing(nowX, now[key], color, { join: i < 0 ? null : { x: x[i], y: buckets[i][key] }, yaxis, digits, frac: nowX / span, beside: true })];
  });
  annotations.push(...rings.map((r) => r.label));

  const dayTicks = Array.from({ length: span }, (_, i) => i);
  const yBase = { gridcolor: token("--grid"), gridwidth: 1, zeroline: false, tickfont: { color: muted, size: 12 }, fixedrange: true };
  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin,
    showlegend: false,
    shapes: nightShapes,
    annotations,
    hovermode: "closest",
    hoverlabel: hoverLabel(),
    xaxis: {
      range: [0, span],
      ...dayAxisTicks(dayTicks.map((i) => dayLabel(new Date(Date.parse(first) + i * DAY_MS).toISOString().slice(0, 10)))),
      tickangle: 0,
      showline: true,
      linecolor: token("--baseline"),
      tickfont: { color: muted, size: 12 },
      // A hairline through all five panels at the hovered time, so a reading lines up with the others.
      showspikes: true,
      spikemode: "across",
      spikesnap: "cursor",
      spikethickness: 1,
      spikedash: "solid",
      spikecolor: token("--baseline"),
      fixedrange: true,
    },
    yaxis: { ...yBase, domain: rainD, range: [0, rateStep * 2 * 1.05], tickvals: [0, rateStep, 2 * rateStep] },
    yaxis2: { ...yBase, domain: pD, nticks: 4, tickformat: ".0f" },
    // Humidity tops out at 100%; the floor follows the week's driest reading so the swings stay readable.
    yaxis3: { ...yBase, domain: rhD, range: [Math.max(0, Math.floor(minRh / 10) * 10 - 5), 102], nticks: 4 },
    yaxis4: { ...yBase, domain: solarD, range: [0, maxSolar * 1.05], nticks: 3 },
    yaxis5: { ...yBase, domain: tempD, nticks: 4 },
  };
  return Plotly.react($("rf-chart"), [temp, solar, rh, pressure, rain, ...rings.flatMap((r) => r.traces)], layout, { displayModeBar: false, responsive: true });
}

export function renderRainFineText(buckets) {
  const peak = finePeak(buckets);
  const days = fineDaySummaries(buckets);
  const total = days.reduce((s, d) => s + d.rain, 0);
  const temps = days.filter((d) => d.tMin !== null);
  const tempText = temps.length
    ? t(`Temperature ${Math.min(...temps.map((d) => d.tMin)).toFixed(1)}–${Math.max(...temps.map((d) => d.tMax)).toFixed(1)} °C. `, `Temperatura ${Math.min(...temps.map((d) => d.tMin)).toFixed(1)}–${Math.max(...temps.map((d) => d.tMax)).toFixed(1)} °C. `)
    : "";
  const summary = $("rf-summary");
  summary.textContent =
    tempText +
    (peak
      ? t(`${total.toFixed(0)} mm of rain. Heaviest 10 minutes: ${peak.rate.toFixed(1)} mm/h on ${dayLabel(peak.date)} at ${hourLabel(peak.hour, peak.minute)}.`, `${total.toFixed(0)} mm de lluvia. Los 10 minutos más intensos: ${peak.rate.toFixed(1)} mm/h el ${dayLabel(peak.date)} a las ${hourLabel(peak.hour, peak.minute)}.`)
      : t(`${total.toFixed(0)} mm of rain. No rain in this window.`, `${total.toFixed(0)} mm de lluvia. Sin lluvia en este período.`));
  if (corrected(buckets)) {
    addSensorFixNote(summary, t(`, so the solar radiation panel shows those days' readings divided by ${FIX_FACTOR}.`, `, así que el panel de radiación solar muestra las lecturas de esos días divididas entre ${FIX_FACTOR}.`));
  }
  $("rf-note").textContent = t(
    "Five panels over the same 7 days, each with its own scale; every value is a 10-minute average, except the rings at the end of the lines: those are the station's current readings, as in Current conditions, joined to the last average by a dotted line. Station pressure is measured at the station's height, so it reads about 9–10 hPa below the sea-level pressure in forecasts; it rises and falls twice a day on its own, and a sharp drop often comes before a storm. Each rain bar is one 10-minute window, shown as its hourly rate, so a short burst reads at its true intensity instead of being smeared across the hour. Night (18:00–06:00) is shaded.",
    "Cinco paneles sobre los mismos 7 días, cada uno con su propia escala; cada valor es un promedio de 10 minutos, salvo los círculos al final de las líneas: son las lecturas actuales de la estación, como en Condiciones actuales, unidas al último promedio por una línea punteada. La presión de la estación se mide a la altura de la estación, por eso marca unos 9–10 hPa menos que la presión a nivel del mar de los pronósticos; sube y baja dos veces al día por sí sola, y una caída brusca suele anteceder a una tormenta. Cada barra de lluvia es una ventana de 10 minutos, mostrada como su tasa horaria, así que una ráfaga corta se lee con su verdadera intensidad en lugar de diluirse en la hora. La noche (18:00–06:00) está sombreada.",
  );

  const table = $("rf-table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const h of [t("Day", "Día"), t("Temperature range (°C)", "Rango de temperatura (°C)"), t("Peak solar (W/m²)", "Radiación solar máxima (W/m²)"), t("Humidity range (%)", "Rango de humedad (%)"), t("Pressure range (hPa)", "Rango de presión (hPa)"), t("Rain (mm)", "Lluvia (mm)"), t("Peak rate (mm/h)", "Tasa máxima (mm/h)"), t("Peak at", "Máximo a las")]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  for (const d of days) {
    const row = body.insertRow();
    row.insertCell().textContent = dayLabel(d.date);
    row.insertCell().textContent = d.tMin === null ? "" : `${d.tMin.toFixed(1)}–${d.tMax.toFixed(1)}`;
    row.insertCell().textContent = d.solarMax === null ? "" : String(d.solarMax);
    row.insertCell().textContent = d.rhMin === null ? "" : `${d.rhMin}–${d.rhMax}`;
    row.insertCell().textContent = d.pMin === null ? "" : `${d.pMin.toFixed(1)}–${d.pMax.toFixed(1)}`;
    row.insertCell().textContent = d.rain.toFixed(1);
    row.insertCell().textContent = d.peak === null ? "" : d.peak.toFixed(1);
    row.insertCell().textContent = d.peak === null ? "" : hourLabel(d.peakHour, d.peakMinute);
  }
}

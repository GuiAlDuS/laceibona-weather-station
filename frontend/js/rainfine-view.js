import { $, token, chartFont, hoverLabel, dayAxisTicks } from "./common.js";
import { t } from "./i18n.js";
import { dayLabel } from "./tempdaily-view.js";
import { fineDaySummaries, finePeak } from "./rainfine.js";

const DAY_MS = 86400_000;
// Whole days since the first bucket shown. Like the wind scatter, the x axis counts days, not dates: Plotly
// formats date-axis ticks in the viewer's timezone, which would shift these local-time labels by a day.
const dayIndex = (iso, first) => Math.round((Date.parse(iso) - Date.parse(first)) / DAY_MS);
const hourLabel = (h, m) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
const rgba = (hex, a) => `rgba(${[1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)).join(",")},${a})`;

// Which optional layers are shown; module-level so they survive a theme or narrow-screen redraw.
let showSolar = false;
let showRh = false;

export function renderRainFineChart(buckets) {
  const font = chartFont();
  const muted = token("--text-muted");
  const first = buckets[0].date;
  const span = dayIndex(buckets.at(-1).date, first) + 1;
  const x = buckets.map((b) => dayIndex(b.date, first) + (b.hour * 60 + b.minute) / 1440);

  const rain = {
    type: "bar",
    name: t("Rain intensity", "Intensidad de lluvia"),
    x,
    y: buckets.map((b) => b.rate),
    width: (1 / 144) * 0.9, // just under one 10-minute slot, so bars don't touch
    marker: { color: token("--series-1") },
    hovertemplate: "%{y:.1f} mm/h<extra></extra>",
  };
  const pressure = {
    type: "scatter",
    mode: "lines",
    name: t("Station pressure", "Presión de la estación"),
    x,
    y: buckets.map((b) => b.p),
    yaxis: "y2",
    line: { color: token("--series-4"), width: 1.5 },
    hovertemplate: "%{y:.1f} hPa<extra></extra>",
  };
  const maxSolar = Math.max(10, ...buckets.map((b) => b.solar ?? 0));
  const solar = {
    type: "scatter",
    mode: "lines",
    name: t("Solar radiation", "Radiación solar"),
    x,
    y: buckets.map((b) => b.solar),
    yaxis: "y3",
    fill: "tozeroy",
    line: { color: token("--sun"), width: 0 },
    fillcolor: rgba(token("--sun"), 0.25),
    visible: showSolar,
    hovertemplate: "%{y:.0f} W/m²<extra></extra>",
  };
  const rh = {
    type: "scatter",
    mode: "lines",
    name: t("Air humidity", "Humedad del aire"),
    x,
    y: buckets.map((b) => b.rh),
    yaxis: "y4",
    line: { color: token("--series-6"), width: 1.5 },
    visible: showRh,
    hovertemplate: "%{y:.0f}%<extra></extra>",
  };

  // A faint band from 18:00 to 06:00 each day, so night and day are easy to tell apart at a glance.
  const nightShapes = Array.from({ length: span + 2 }, (_, i) => i - 1).map((i) => ({
    type: "rect",
    xref: "x",
    yref: "paper",
    x0: i + 0.75,
    x1: i + 1.25,
    y0: 0,
    y1: 1,
    fillcolor: token("--grid"),
    opacity: 0.5,
    line: { width: 0 },
    layer: "below",
  }));

  const dayTicks = Array.from({ length: span }, (_, i) => i);
  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 48, r: 48, t: 24, b: 40 },
    showlegend: false,
    barmode: "overlay",
    shapes: nightShapes,
    hovermode: "x unified",
    hoverlabel: hoverLabel(),
    xaxis: {
      range: [0, span],
      ...dayAxisTicks(dayTicks.map((i) => dayLabel(new Date(Date.parse(first) + i * DAY_MS).toISOString().slice(0, 10)))),
      tickangle: 0,
      showline: true,
      linecolor: token("--baseline"),
      tickfont: { color: muted, size: 12 },
      fixedrange: true,
    },
    yaxis: {
      title: { text: "mm/h", font: { color: muted, size: 12 }, standoff: 8 },
      rangemode: "tozero",
      gridcolor: token("--grid"),
      gridwidth: 1,
      zeroline: false,
      tickfont: { color: muted, size: 12 },
      fixedrange: true,
    },
    yaxis2: {
      title: { text: "hPa", font: { color: muted, size: 12 }, standoff: 8 },
      overlaying: "y",
      side: "right",
      showgrid: false,
      tickfont: { color: muted, size: 12 },
      fixedrange: true,
    },
    yaxis3: {
      overlaying: "y",
      visible: false,
      range: [0, maxSolar * 1.15],
      fixedrange: true,
    },
    // Humidity on a fixed, unlabelled 0-100% scale (a sliver of headroom so a saturated 100% line isn't clipped).
    yaxis4: {
      overlaying: "y",
      visible: false,
      range: [0, 102],
      fixedrange: true,
    },
  };
  return Plotly.react($("rf-chart"), [rain, pressure, solar, rh], layout, { displayModeBar: false, responsive: true });
}

export function renderRainFineText(buckets) {
  const peak = finePeak(buckets);
  const days = fineDaySummaries(buckets);
  const total = days.reduce((s, d) => s + d.rain, 0);
  $("rf-summary").textContent = peak
    ? t(`${total.toFixed(0)} mm total. Heaviest 10 minutes: ${peak.rate.toFixed(1)} mm/h on ${dayLabel(peak.date)} at ${hourLabel(peak.hour, peak.minute)}.`, `${total.toFixed(0)} mm en total. Los 10 minutos más intensos: ${peak.rate.toFixed(1)} mm/h el ${dayLabel(peak.date)} a las ${hourLabel(peak.hour, peak.minute)}.`)
    : t(`${total.toFixed(0)} mm total. No rain in this window.`, `${total.toFixed(0)} mm en total. Sin lluvia en este período.`);
  $("rf-note").textContent = t(
    "Each bar is one 10-minute window, shown as its hourly rate, so a short burst reads at its true intensity instead of being smeared across the hour. The line is station pressure; the optional green line is air humidity, where the chart's full height is 100%. Night (18:00–06:00) is shaded.",
    "Cada barra es una ventana de 10 minutos, mostrada como su tasa horaria, así que una ráfaga corta se lee con su verdadera intensidad en lugar de diluirse en la hora. La línea es la presión de la estación; la línea verde opcional es la humedad del aire, donde la altura total del gráfico es 100%. La noche (18:00–06:00) está sombreada.",
  );

  const table = $("rf-table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const h of [t("Day", "Día"), t("Rain (mm)", "Lluvia (mm)"), t("Peak rate (mm/h)", "Tasa máxima (mm/h)"), t("Peak at", "Máximo a las"), t("Pressure range (hPa)", "Rango de presión (hPa)"), t("Humidity range (%)", "Rango de humedad (%)")]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  for (const d of days) {
    const row = body.insertRow();
    row.insertCell().textContent = dayLabel(d.date);
    row.insertCell().textContent = d.rain.toFixed(1);
    row.insertCell().textContent = d.peak === null ? "" : d.peak.toFixed(1);
    row.insertCell().textContent = d.peak === null ? "" : hourLabel(d.peakHour, d.peakMinute);
    row.insertCell().textContent = d.pMin === null ? "" : `${d.pMin.toFixed(1)}–${d.pMax.toFixed(1)}`;
    row.insertCell().textContent = d.rhMin === null ? "" : `${d.rhMin}–${d.rhMax}`;
  }
}

// Wires the solar and humidity toggles once. Cheap to call again (it just re-attaches to the same buttons), but
// the buttons themselves are only ever created once in the page markup.
export function initRainFineToggle() {
  wireToggle("rf-solar-toggle", 2, () => (showSolar = !showSolar), ["Show solar radiation", "Mostrar radiación solar"], ["Hide solar radiation", "Ocultar radiación solar"]);
  wireToggle("rf-rh-toggle", 3, () => (showRh = !showRh), ["Show air humidity", "Mostrar humedad del aire"], ["Hide air humidity", "Ocultar humedad del aire"]);
}

// flip() toggles the module-level flag and returns its new value; trace is that layer's index in the chart.
function wireToggle(id, trace, flip, showText, hideText) {
  const btn = $(id);
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = "true";
  btn.addEventListener("click", () => {
    const on = flip();
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? t(...hideText) : t(...showText);
    const el = $("rf-chart");
    if (el.data) Plotly.restyle(el, { visible: on }, [trace]);
  });
}

// The chart and table on sensor-correction.html: each day's peak solar radiation as the station reported it, with
// the corrected values for the affected days (sensor-fix.js) and the year before for comparison.
import { $, token, chartFont, hoverLabel, fillLegend, FIX_FACTOR } from "./common.js";
import { t, MONTHS } from "./i18n.js";
import { SENSOR_FIX, sensorFixed } from "./sensor-fix.js";
import { PEAKS } from "./sensor-peaks.js";

const YEAR = SENSOR_FIX.from.slice(0, 4);
const PREV = String(+YEAR - 1);
const shared = (date) => `2000-${date.slice(5)}`; // both years on one calendar axis
const dayMonth = (md) => `${+md.slice(3)} ${MONTHS[+md.slice(0, 2) - 1]}`;

const days = Object.keys(PEAKS).sort();
const of = (year) => days.filter((d) => d.startsWith(year));
const corrected = (d) => Math.round(PEAKS[d] / SENSOR_FIX.factor);

function render() {
  const font = chartFont();
  const muted = token("--text-muted");
  const series = [
    { name: PREV, days: of(PREV), y: (d) => PEAKS[d], color: token("--series-context"), size: 5 },
    { name: t(`${YEAR}, as reported`, `${YEAR}, como se reportó`), days: of(YEAR), y: (d) => PEAKS[d], color: token("--series-1"), size: 7 },
    { name: t(`${YEAR}, corrected (÷ ${FIX_FACTOR})`, `${YEAR}, corregido (÷ ${FIX_FACTOR})`), days: of(YEAR).filter(sensorFixed), y: corrected, color: token("--series-2"), size: 7 },
  ];
  const traces = series.map((s) => ({
    type: "scatter",
    mode: "markers",
    name: s.name,
    x: s.days.map(shared),
    y: s.days.map(s.y),
    marker: { color: s.color, size: s.size, line: { color: token("--surface"), width: 1 } },
    hovertemplate: `%{y:,.0f} W/m²<extra>${s.name}</extra>`,
    showlegend: false,
  }));
  const months = [...new Set(days.map((d) => d.slice(5, 7)))].sort();
  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 56, r: 12, t: 24, b: 36 },
    hovermode: "x unified",
    hoverlabel: hoverLabel(),
    // The affected days, shaded, with their name above.
    shapes: [{ type: "rect", xref: "x", yref: "paper", x0: shared(SENSOR_FIX.from), x1: `${shared(SENSOR_FIX.to)} 23:59`, y0: 0, y1: 1, fillcolor: token("--grid"), opacity: 0.6, line: { width: 0 }, layer: "below" }],
    annotations: [{ x: shared(SENSOR_FIX.from), xref: "x", y: 1, yref: "paper", xanchor: "left", yanchor: "bottom", showarrow: false, text: t("Sensor reading high", "Sensor leyendo alto"), font: { ...font, color: muted } }],
    xaxis: { type: "date", range: [`2000-${months[0]}-01`, `2000-${months.at(-1)}-31`], tickvals: months.map((m) => `2000-${m}-01`), ticktext: months.map((m) => MONTHS[+m - 1]), hoverformat: "%-d/%-m", showgrid: false, showline: true, linecolor: token("--baseline"), tickfont: { color: muted, size: 12 }, fixedrange: true },
    yaxis: { title: { text: "W/m²", font: { color: muted, size: 12 }, standoff: 8 }, rangemode: "tozero", gridcolor: token("--grid"), gridwidth: 1, zeroline: false, tickfont: { color: muted, size: 12 }, fixedrange: true },
  };
  fillLegend($("sp-legend"), series.map((s) => ({ label: s.name, color: s.color })), "dot");
  return Plotly.react($("sp-chart"), traces, layout, { displayModeBar: false, responsive: true });
}

function table() {
  const el = $("sp-table");
  const head = el.createTHead().insertRow();
  for (const h of [t("Day", "Día"), `${PREV} (W/m²)`, t(`${YEAR}, as reported (W/m²)`, `${YEAR}, como se reportó (W/m²)`), t(`${YEAR}, corrected (W/m²)`, `${YEAR}, corregido (W/m²)`)]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = el.createTBody();
  for (const md of [...new Set(days.map((d) => d.slice(5)))].sort()) {
    const now = `${YEAR}-${md}`;
    const row = body.insertRow();
    row.insertCell().textContent = dayMonth(md);
    row.insertCell().textContent = PEAKS[`${PREV}-${md}`] ?? "";
    row.insertCell().textContent = PEAKS[now] ?? "";
    row.insertCell().textContent = now in PEAKS && sensorFixed(now) ? corrected(now) : "";
  }
}

render();
table();
$("sp-status").remove();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);

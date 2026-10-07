import { $, token, chartFont, hoverLabel, fillLegend, addSensorFixNote, FIX_FACTOR } from "./common.js";
import { SENSOR_FIX } from "./sensor-fix.js";
import { t } from "./i18n.js";
import { monthName, tick } from "./heatmap-view.js";
import { UV_LEVELS } from "./uvhours.js";

// The standard UV index risk levels with their colours and names, strongest first: extreme sits at the bottom of
// each bar, so the hours that matter most share a baseline and compare across months.
const LOOK = {
  moderate: ["--sun", t("Moderate (3–5)", "Moderado (3–5)")],
  high: ["--series-2", t("High (6–7)", "Alto (6–7)")],
  veryHigh: ["--hot", t("Very high (8–10)", "Muy alto (8–10)")],
  extreme: ["--series-7", t("Extreme (11+)", "Extremo (11+)")],
};
const levels = () => UV_LEVELS.map((l) => ({ ...l, color: token(LOOK[l.key][0]), label: LOOK[l.key][1] })).reverse();
const h1 = (v) => v.toFixed(1);
const total = (m) => UV_LEVELS.reduce((s, l) => s + m.hours[l.key], 0);
// Hours a day of very high or extreme UV: what the summary ranks months by.
const strong = (m) => m.hours.veryHigh + m.hours.extreme;

export function renderUvHoursChart(months) {
  const font = chartFont();
  const muted = token("--text-secondary");
  const x = months.map(tick);
  const traces = levels().map((l) => ({
    type: "bar",
    name: l.label,
    x,
    y: months.map((m) => m.hours[l.key]),
    marker: { color: l.color, line: { color: token("--surface"), width: 1 } },
    hovertemplate: "%{y:.1f} h",
  }));
  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 56, r: 12, t: 16, b: 48 },
    showlegend: false,
    barmode: "stack",
    bargap: 0.3,
    hovermode: "x unified",
    hoverlabel: hoverLabel(),
    xaxis: { type: "category", tickangle: 0, automargin: true, showgrid: false, showline: true, linecolor: token("--baseline"), tickfont: { color: muted, size: 12 }, fixedrange: true },
    yaxis: { title: { text: t("hours per day", "horas por día"), font: { color: muted, size: 12 }, standoff: 8 }, rangemode: "tozero", gridcolor: token("--grid"), gridwidth: 1, zeroline: false, tickfont: { color: muted, size: 12 }, fixedrange: true },
  };
  return Plotly.react($("uv-chart"), traces, layout, { displayModeBar: false, responsive: true });
}

export function renderUvHoursText(months) {
  fillLegend($("uv-legend"), levels(), "rect");

  const name = (m) => `${monthName(m.key)} ${m.key.slice(0, 4)}`;
  const most = months.reduce((a, b) => (strong(b) > strong(a) ? b : a));
  const least = months.reduce((a, b) => (strong(b) < strong(a) ? b : a));
  const summary = $("uv-summary");
  summary.textContent = t(
    `Most hours of very high or extreme UV: ${name(most)} (${h1(strong(most))} h a day). Fewest: ${name(least)} (${h1(strong(least))} h a day).`,
    `Más horas de UV muy alto o extremo: ${name(most)} (${h1(strong(most))} h al día). Menos: ${name(least)} (${h1(strong(least))} h al día).`,
  );
  if (months.some((m) => m.key >= SENSOR_FIX.from.slice(0, 7) && m.key <= SENSOR_FIX.to.slice(0, 7))) {
    addSensorFixNote(summary, t(`, so those days' readings are divided by ${FIX_FACTOR}.`, `, así que las lecturas de esos días se dividen entre ${FIX_FACTOR}.`));
  }

  $("uv-note").textContent =
    t(
      "Each bar is an average day of the month: how long the UV index stayed at each risk level, with the strongest level at the bottom. Time at low UV (0–2) and the night are not drawn, so the bar's height is the time with a UV index of 3 or more. Counted from 10-minute averages of the station's readings between 06:00 and 18:00. Days missing more than an hour of those readings, such as sensor outages or today, are left out. ",
      "Cada barra es un día promedio del mes: cuánto tiempo estuvo el índice UV en cada nivel de riesgo, con el nivel más fuerte abajo. El tiempo con UV bajo (0–2) y la noche no se dibujan, así que la altura de la barra es el tiempo con un índice UV de 3 o más. Se cuenta a partir de promedios de 10 minutos de las lecturas de la estación entre las 06:00 y las 18:00. Los días a los que les falta más de una hora de esas lecturas, como cortes del sensor o el día de hoy, se excluyen. ",
    ) + (months.some((m) => m.partial) ? t("† marks a month with missing data (or the month in progress).", "† indica un mes con datos faltantes (o el mes en curso).") : "");

  const table = $("uv-table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const h of [t("Month", "Mes"), ...levels().map((l) => `${l.label}, h`), t("UV 3 or more, h", "UV 3 o más, h"), t("Days counted", "Días contados")]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  for (const m of months) {
    const row = body.insertRow();
    row.insertCell().textContent = `${name(m)}${m.partial ? "†" : ""}`;
    for (const l of levels()) row.insertCell().textContent = h1(m.hours[l.key]);
    row.insertCell().textContent = h1(total(m));
    row.insertCell().textContent = m.days;
  }
}

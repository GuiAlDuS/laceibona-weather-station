import { $, token, chartFont, hoverLabel, dayAxisTicks } from "./common.js";
import { t, sectorLabel } from "./i18n.js";
import { VIRIDIS } from "./heatmap-view.js";
import { dayLabel } from "./tempdaily-view.js";
import { CALM_BELOW, MS_TO_KMH } from "./windrose.js";
import { sectorName, daySummaries } from "./winddaily.js";

const DAY_MS = 86400_000;
const CMIN = CALM_BELOW * MS_TO_KMH; // the calm cut-off (km/h); nothing slower is drawn
// S..N..S, the same wrap as the direction heatmap (indices, not the English array, so they translate).
const ROW_ORDER = [8, 9, 10, 11, 12, 13, 14, 15, 0, 1, 2, 3, 4, 5, 6, 7, 8];

// Whole days since the first date shown. The x axis counts days, not dates: Plotly formats date ticks in the
// viewer's timezone, which would shift these local-time labels by a day.
const dayIndex = (iso, first) => Math.round((Date.parse(iso) - Date.parse(first)) / DAY_MS);

export function renderWindDailyChart(hours) {
  const font = chartFont();
  const muted = token("--text-muted");
  const first = hours[0].date;
  const span = dayIndex(hours.at(-1).date, first) + 1;
  // Top of the colour scale: the fastest hour, rounded up to 2 km/h, and never below 8 so a calm week is not stretched.
  const cmax = Math.max(8, Math.ceil(Math.max(...hours.map((h) => h.ws)) / 2) * 2);
  const cticks = Array.from({ length: cmax / 2 }, (_, i) => (i + 1) * 2);
  const trace = {
    type: "scatter",
    mode: "markers",
    x: hours.map((h) => dayIndex(h.date, first) + (h.hour + 0.5) / 24), // each dot at its own hour, so time runs left to right
    y: hours.map((h) => h.y),
    customdata: hours.map((h) => t(`${dayLabel(h.date)}, ${String(h.hour).padStart(2, "0")}:00<br>from ${sectorName(h.dir)} (${Math.round(h.dir)}°)`, `${dayLabel(h.date)}, ${String(h.hour).padStart(2, "0")}:00<br>desde ${sectorName(h.dir)} (${Math.round(h.dir)}°)`)),
    hovertemplate: "%{customdata}<br>%{marker.color:.1f} km/h<extra></extra>",
    marker: {
      size: 7,
      opacity: 0.85,
      color: hours.map((h) => h.ws),
      cmin: CMIN,
      cmax,
      colorscale: VIRIDIS, // same scale as the wind speed heatmap: the strongest wind is the yellowest
      colorbar: { title: { text: "km/h", font: { color: muted, size: 12 } }, thickness: 12, len: 0.9, outlinewidth: 0, tickfont: { color: muted, size: 12 }, tickvals: cticks, ticktext: cticks.map(String) },
    },
  };
  const names = ROW_ORDER.map(sectorLabel);
  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 56, r: 8, t: 12, b: 40 },
    hovermode: "closest",
    hoverlabel: hoverLabel(),
    xaxis: {
      range: [0, span],
      ...dayAxisTicks(Array.from({ length: span }, (_, i) => dayLabel(new Date(Date.parse(first) + i * DAY_MS).toISOString().slice(0, 10))), { grid: true }),
      tickangle: 0,
      showline: true,
      linecolor: token("--baseline"),
      tickfont: { color: muted, size: 12 },
      fixedrange: true,
    },
    yaxis: {
      tickmode: "array",
      tickvals: names.map((_, i) => i).filter((i) => i % 2 === 0),
      ticktext: names.filter((_, i) => i % 2 === 0),
      range: [-0.5, 16.5],
      gridcolor: token("--grid"),
      gridwidth: 1,
      zeroline: false,
      tickfont: { color: muted, size: 12 },
      fixedrange: true,
    },
  };
  return Plotly.react($("ds-chart"), [trace], layout, { displayModeBar: false, responsive: true });
}

export function renderWindDailyText(hours) {
  const days = daySummaries(hours);
  const top = hours.reduce((m, h) => (h.ws > m.ws ? h : m), hours[0]);
  $("ds-summary").textContent = t(
    `${dayLabel(days[0].date)} to ${dayLabel(days.at(-1).date)}. Strongest hourly wind: ${top.ws.toFixed(1)} km/h from ${sectorName(top.dir)} on ${dayLabel(top.date)}.`,
    `${dayLabel(days[0].date)} a ${dayLabel(days.at(-1).date)}. Viento horario más fuerte: ${top.ws.toFixed(1)} km/h desde ${sectorName(top.dir)} el ${dayLabel(top.date)}.`,
  );
  $("ds-note").textContent = t(
    "Each dot is one hour, placed at its actual time of day (midnight at the left edge of each day), and coloured by the hour's mean speed, so daily patterns such as a sea breeze switching to a land breeze show up as a repeating shape. South is at both top and bottom, so the north and east winds sit in the middle. Calm hours (under 1.8 km/h) are left out.",
    "Cada punto es una hora, ubicada en su momento real del día (la medianoche en el borde izquierdo de cada día), y coloreada según la velocidad media de la hora, así que patrones diarios como el cambio de brisa marina a terral se ven como una forma que se repite. El sur está arriba y abajo, así que los vientos del norte y del este quedan en el medio. Las horas de calma (bajo 1,8 km/h) se excluyen.",
  );

  const table = $("ds-table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const h of [t("Day", "Día"), t("Most common direction", "Dirección más común"), t("Mean speed (km/h)", "Velocidad media (km/h)"), t("Peak hourly speed (km/h)", "Velocidad horaria máxima (km/h)"), t("Hours shown", "Horas mostradas")]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  for (const d of days) {
    const row = body.insertRow();
    row.insertCell().textContent = dayLabel(d.date);
    row.insertCell().textContent = d.direction;
    row.insertCell().textContent = d.mean.toFixed(1);
    row.insertCell().textContent = d.peak.toFixed(1);
    row.insertCell().textContent = d.hours;
  }
}

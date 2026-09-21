import { $, token, narrowScreen, chartFont, hoverLabel } from "./common.js";
import { VIRIDIS } from "./heatmap-view.js";
import { dayLabel } from "./tempdaily-view.js";
import { SECTORS } from "./windrose.js";
import { sectorName, daySummaries } from "./winddaily.js";

const DAY_MS = 86400_000;
const CMIN = 0.5; // the calm cut-off; nothing slower is drawn

// Whole days since the first date shown. The x axis counts days, not dates: Plotly formats date ticks in the
// viewer's timezone, which would shift these local-time labels by a day.
const dayIndex = (iso, first) => Math.round((Date.parse(iso) - Date.parse(first)) / DAY_MS);

export function renderWindDailyChart(hours) {
  const font = chartFont();
  const muted = token("--text-muted");
  const first = hours[0].date;
  const span = dayIndex(hours.at(-1).date, first) + 1;
  // Top of the colour scale: the fastest hour, rounded up to 0.5 m/s, and never below 2 so a calm week is not stretched.
  const cmax = Math.max(2, Math.ceil(Math.max(...hours.map((h) => h.ws)) * 2) / 2);
  const cticks = Array.from({ length: Math.round((cmax - CMIN) / 0.5) + 1 }, (_, i) => CMIN + i * 0.5);
  const trace = {
    type: "scatter",
    mode: "markers",
    x: hours.map((h) => dayIndex(h.date, first) + (h.hour + 0.5) / 24), // each dot at its own hour, so time runs left to right
    y: hours.map((h) => h.y),
    customdata: hours.map((h) => `${dayLabel(h.date)}, ${String(h.hour).padStart(2, "0")}:00<br>from ${sectorName(h.dir)} (${Math.round(h.dir)}°)`),
    hovertemplate: "%{customdata}<br>%{marker.color:.1f} m/s<extra></extra>",
    marker: {
      size: 7,
      opacity: 0.85,
      color: hours.map((h) => h.ws),
      cmin: CMIN,
      cmax,
      colorscale: VIRIDIS, // same scale as the wind speed heatmap: the strongest wind is the yellowest
      colorbar: { title: { text: "m/s", font: { color: muted, size: 12 } }, thickness: 12, len: 0.9, outlinewidth: 0, tickfont: { color: muted, size: 12 }, tickvals: cticks, ticktext: cticks.map(String) },
    },
  };
  const names = [...SECTORS.slice(8), ...SECTORS.slice(0, 9)]; // S..N..S, the same wrap as the direction heatmap
  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 56, r: 8, t: 12, b: 40 },
    hovermode: "closest",
    hoverlabel: hoverLabel(),
    xaxis: {
      range: [0, span],
      tickmode: "array",
      tickvals: Array.from({ length: span }, (_, i) => i).filter((i) => !narrowScreen.matches || i % 2 === 0),
      ticktext: Array.from({ length: span }, (_, i) => dayLabel(new Date(Date.parse(first) + i * DAY_MS).toISOString().slice(0, 10))).filter((_, i) => !narrowScreen.matches || i % 2 === 0),
      tickangle: 0,
      showgrid: true,
      gridcolor: token("--grid"),
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
  $("ds-summary").textContent = `${dayLabel(days[0].date)} to ${dayLabel(days.at(-1).date)}. Strongest hourly wind: ${top.ws.toFixed(1)} m/s from ${sectorName(top.dir)} on ${dayLabel(top.date)}.`;
  $("ds-note").textContent =
    "Each dot is one hour, placed at its actual time of day (midnight at the left edge of each day), and coloured by the hour's mean speed, so daily patterns such as a sea breeze switching to a land breeze show up as a repeating shape. South is at both top and bottom, so the north and east winds sit in the middle. Calm hours (under 0.5 m/s) are left out.";

  const t = $("ds-table");
  t.replaceChildren();
  const head = t.createTHead().insertRow();
  for (const h of ["Day", "Most common direction", "Mean speed (m/s)", "Peak hourly speed (m/s)", "Hours shown"]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = t.createTBody();
  for (const d of days) {
    const row = body.insertRow();
    row.insertCell().textContent = dayLabel(d.date);
    row.insertCell().textContent = d.direction;
    row.insertCell().textContent = d.mean.toFixed(2);
    row.insertCell().textContent = d.peak.toFixed(1);
    row.insertCell().textContent = d.hours;
  }
}

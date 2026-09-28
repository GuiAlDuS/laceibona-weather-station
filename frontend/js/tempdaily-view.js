import { $, token, MONTHS, chartFont, hoverLabel, fillLegend, nowRing } from "./common.js";
import { t, WEEKDAYS } from "./i18n.js";

export const dayLabel = (iso) => {
  const d = new Date(Date.parse(iso));
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

// One categorical colour per day, latest day first (blue), then orange, aqua, yellow, magenta, green, violet.
const dayHex = (i, count) => token(`--series-${count - i}`);

// Older days fade quickly: the latest day is fully opaque and each day back keeps 70% of the one after it
// (1, 0.7, 0.49, 0.34, ...), never below 20%, so the last two or three days clearly stand out.
const FADE = 0.7;
const MIN_ALPHA = 0.2;
export const dayAlpha = (i, count) => Math.max(MIN_ALPHA, FADE ** (count - 1 - i));
const rgba = (hex, a) => `rgba(${[1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)).join(",")},${a.toFixed(2)})`;
export const dayColor = (i, count) => rgba(dayHex(i, count), dayAlpha(i, count));

const hourLabel = (h) => `${String(h).padStart(2, "0")}:00`;

export function renderTempDailyChart(days, now = null) {
  const font = chartFont();
  const muted = token("--text-muted");
  const latestIdx = days.length - 1;
  const traces = days.map((d, i) => ({
    type: "scatter",
    mode: "lines",
    name: dayLabel(d.date),
    x: d.points.map((p) => p.hour),
    y: d.points.map((p) => p.t),
    line: { color: dayColor(i, days.length), width: 2 },
    hovertemplate: "%{y:.1f} °C",
  }));
  // The current temperature as a ring (see nowRing) at its hour and minute, joined to the latest day's last point
  // (the average of the hour so far). Only when the reading is from that same day.
  const last = days[latestIdx].points.at(-1);
  const local = now && new Date((now.ts - 6 * 3600) * 1000);
  const nowHour = local && local.getUTCHours() + local.getUTCMinutes() / 60;
  const ring =
    now?.temp != null && local.toISOString().slice(0, 10) === days[latestIdx].date
      ? nowRing(nowHour, now.temp, dayHex(latestIdx, days.length), { join: { x: last.hour, y: last.t }, frac: nowHour / 23 })
      : null;
  if (ring) traces.push(...ring.traces);
  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 56, r: 24, t: 28, b: 36 },
    showlegend: false,
    hovermode: "x unified",
    hoverlabel: hoverLabel(),
    xaxis: {
      range: [0, Math.max(23, nowHour ?? 0)],
      tickmode: "array",
      tickvals: [0, 3, 6, 9, 12, 15, 18, 21],
      ticktext: [0, 3, 6, 9, 12, 15, 18, 21].map(hourLabel),
      tickangle: 0,
      showgrid: false,
      showspikes: true,
      spikemode: "across",
      spikesnap: "cursor",
      spikecolor: token("--baseline"),
      spikethickness: 1,
      spikedash: "solid",
      showline: true,
      linecolor: token("--baseline"),
      tickfont: { color: muted, size: 12 },
      hoverformat: "",
      fixedrange: true,
    },
    yaxis: {
      title: { text: "°C", font: { color: muted, size: 12 }, standoff: 8 },
      gridcolor: token("--grid"),
      gridwidth: 1,
      zeroline: false,
      tickfont: { color: muted, size: 12 },
      fixedrange: true,
    },
    annotations: ring ? [ring.label] : [],
  };
  return Plotly.react($("td-chart"), traces, layout, { displayModeBar: false, responsive: true });
}

export function renderTempDailyText(days) {
  fillLegend(
    $("td-legend"),
    [...days].reverse().map((d) => ({ label: dayLabel(d.date), color: dayColor(days.indexOf(d), days.length) })),
    "line",
  );
  const latest = days.at(-1);
  const lo = Math.min(...latest.points.map((p) => p.tmin ?? p.t));
  const hi = Math.max(...latest.points.map((p) => p.tmax ?? p.t));
  $("td-summary").textContent = t(
    `${dayLabel(latest.date)}: ${lo.toFixed(1)} to ${hi.toFixed(1)} °C${latest.points.length < 24 ? " so far" : ""}.`,
    `${dayLabel(latest.date)}: ${lo.toFixed(1)} a ${hi.toFixed(1)} °C${latest.points.length < 24 ? " hasta ahora" : ""}.`,
  );
  $("td-note").textContent = t(
    "Hourly mean temperature by local hour (UTC-6), for the last 7 days with data. Each day has its own colour, starting with blue for the most recent day, and older days fade so the recent ones stand out; the legend lists them in that order. The hour in progress is shown as its average so far; the ring is the station's current reading, as in Current conditions, joined to that average by a dotted line.",
    "Temperatura media por hora local (UTC-6), para los últimos 7 días con datos. Cada día tiene su propio color, empezando en azul para el más reciente, y los días anteriores se desvanecen para que los recientes resalten; la leyenda los enumera en ese orden. La hora en curso se muestra con su promedio hasta el momento; el círculo es la lectura actual de la estación, como en Condiciones actuales, unido a ese promedio por una línea punteada.",
  );

  const table = $("td-table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const h of [t("Hour", "Hora"), ...days.map((d) => dayLabel(d.date))]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  for (let h = 0; h < 24; h++) {
    const row = body.insertRow();
    row.insertCell().textContent = hourLabel(h);
    for (const d of days) {
      const p = d.points.find((q) => q.hour === h);
      row.insertCell().textContent = p ? p.t.toFixed(1) : "";
    }
  }
}

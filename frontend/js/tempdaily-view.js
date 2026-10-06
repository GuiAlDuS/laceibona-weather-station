import { $, token, MONTHS, chartFont, hoverLabel, fillLegend, nowRing } from "./common.js";
import { t, WEEKDAYS } from "./i18n.js";

export const dayLabel = (iso) => {
  const d = new Date(Date.parse(iso));
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

// The latest day is red, like temperature on every other chart; the earlier days are context, in one grey.
const dayHex = (i, count) => token(i === count - 1 ? "--hot" : "--series-context");

// The earlier days lighten with age: yesterday is fully opaque and each day back keeps 75% of the one after it
// (1, 0.75, 0.56, 0.42, ...), never below 25%, so how recent a grey line is can be read from how dark it is.
const FADE = 0.75;
const MIN_ALPHA = 0.25;
export const dayAlpha = (i, count) => (i === count - 1 ? 1 : Math.max(MIN_ALPHA, FADE ** (count - 2 - i)));
const rgba = (hex, a) => `rgba(${[1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)).join(",")},${a.toFixed(2)})`;
export const dayColor = (i, count) => rgba(dayHex(i, count), dayAlpha(i, count));

const hourLabel = (h) => `${String(h).padStart(2, "0")}:00`;

export function renderTempDailyChart(days, now = null) {
  const font = chartFont();
  const muted = token("--text-secondary");
  const latestIdx = days.length - 1;
  const traces = days.map((d, i) => ({
    type: "scatter",
    mode: "lines",
    name: dayLabel(d.date),
    x: d.points.map((p) => p.hour),
    y: d.points.map((p) => p.t),
    line: { color: dayColor(i, days.length), width: i === latestIdx ? 2.5 : 1.5 },
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
  // Three entries, not seven: the latest day, the day before, and the rest as a group (told apart by how light they are).
  const n = days.length;
  const entries = [{ label: dayLabel(days[n - 1].date), color: dayColor(n - 1, n) }];
  if (n > 1) entries.push({ label: dayLabel(days[n - 2].date), color: dayColor(n - 2, n) });
  if (n > 2) {
    const older = n > 3 ? t(`${dayLabel(days[0].date)} to ${dayLabel(days[n - 3].date)}`, `${dayLabel(days[0].date)} a ${dayLabel(days[n - 3].date)}`) : dayLabel(days[0].date);
    entries.push({ label: n > 3 ? t(`${older} (lighter the older)`, `${older} (más claro cuanto más antiguo)`) : older, color: dayColor(Math.max(0, n - 4), n) });
  }
  fillLegend($("td-legend"), entries, "line");
  const latest = days.at(-1);
  const lo = Math.min(...latest.points.map((p) => p.tmin ?? p.t));
  const hi = Math.max(...latest.points.map((p) => p.tmax ?? p.t));
  $("td-summary").textContent = t(
    `${dayLabel(latest.date)}: ${lo.toFixed(1)} to ${hi.toFixed(1)} °C${latest.points.length < 24 ? " so far" : ""}.`,
    `${dayLabel(latest.date)}: ${lo.toFixed(1)} a ${hi.toFixed(1)} °C${latest.points.length < 24 ? " hasta ahora" : ""}.`,
  );
  $("td-note").textContent = t(
    "Hourly mean temperature by local hour (UTC-6), for the last 7 days with data. The most recent day is the red line; the earlier days are grey, lighter the older they are, and hovering over the chart names each one. The hour in progress is shown as its average so far; the ring is the station's current reading, as in Current conditions, joined to that average by a dotted line.",
    "Temperatura media por hora local (UTC-6), para los últimos 7 días con datos. El día más reciente es la línea roja; los días anteriores van en gris, más claro cuanto más antiguos, y al pasar el cursor por el gráfico se nombra cada uno. La hora en curso se muestra con su promedio hasta el momento; el círculo es la lectura actual de la estación, como en Condiciones actuales, unido a ese promedio por una línea punteada.",
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

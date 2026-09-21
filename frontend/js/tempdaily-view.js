import { $, token, MONTHS, chartFont, hoverLabel, fillLegend } from "./common.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const dayLabel = (iso) => {
  const d = new Date(Date.parse(iso));
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

// One categorical colour per day, latest day first (blue), then orange, aqua, yellow, magenta, green, violet.
export const dayColor = (i, count) => token(`--series-${count - i}`);

const hourLabel = (h) => `${String(h).padStart(2, "0")}:00`;

export function renderTempDailyChart(days) {
  const font = chartFont();
  const muted = token("--text-muted");
  const surface = token("--surface");
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
  const last = days[latestIdx].points.at(-1);
  traces.push({
    type: "scatter",
    mode: "markers",
    x: [last.hour],
    y: [last.t],
    marker: { size: 9, color: dayColor(latestIdx, days.length), line: { color: surface, width: 2 } },
    hoverinfo: "skip",
    showlegend: false,
  });
  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 56, r: 24, t: 28, b: 36 },
    showlegend: false,
    hovermode: "x unified",
    hoverlabel: hoverLabel(),
    xaxis: {
      range: [0, 23],
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
    annotations: [{ x: last.hour, y: last.t, xanchor: last.hour > 20 ? "right" : "center", yanchor: "bottom", yshift: 10, showarrow: false, text: `${last.t.toFixed(1)}`, font }],
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
  $("td-summary").textContent = `${dayLabel(latest.date)}: ${lo.toFixed(1)} to ${hi.toFixed(1)} °C${latest.points.length < 24 ? " so far" : ""}.`;
  $("td-note").textContent =
    "Hourly mean temperature by local hour (UTC-6), for the last 7 days with data. Each day has its own colour, starting with blue for the most recent day; the legend lists them in that order. The hour in progress is shown as its average so far.";

  const t = $("td-table");
  t.replaceChildren();
  const head = t.createTHead().insertRow();
  for (const h of ["Hour", ...days.map((d) => dayLabel(d.date))]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = t.createTBody();
  for (let h = 0; h < 24; h++) {
    const row = body.insertRow();
    row.insertCell().textContent = hourLabel(h);
    for (const d of days) {
      const p = d.points.find((q) => q.hour === h);
      row.insertCell().textContent = p ? p.t.toFixed(1) : "";
    }
  }
}

import { $, token, nf, chartFont, hoverLabel } from "./common.js";
import { t } from "./i18n.js";
import { localStamp, localDate } from "./forecast.js";

const MAX_KM = 40; // the sensor's detection range; its distance estimates top out here
const hhmm = (ts) => localStamp(ts).slice(11);
const strikes = (n) => (n === 1 ? t("1 strike", "1 rayo") : t(`${nf.format(n)} strikes`, `${nf.format(n)} rayos`));
// Dot area grows with the strikes in that minute: 1 strike is a plain dot, a busy minute is visibly bigger.
const dotSize = (count) => Math.min(24, 7 + 4 * Math.sqrt(count - 1));
// Unix seconds of local midnight on an ISO date (local is UTC-6, as everywhere in this project).
const localMidnight = (iso) => Date.parse(`${iso}T00:00:00Z`) / 1000 + 6 * 3600;

// Distance of each strike minute over the last 24 hours, one dot per minute, sized by its strike count.
// x is a zone-less local timestamp, so the viewer's own timezone never shifts it.
export function renderLightningChart(s) {
  const font = chartFont();
  const muted = token("--text-muted");
  const placed = s.events.filter((e) => e.dist !== null);
  const trace = {
    type: "scatter",
    mode: "markers",
    x: placed.map((e) => localStamp(e.ts)),
    y: placed.map((e) => e.dist),
    customdata: placed.map((e) => `${hhmm(e.ts)} · ${strikes(e.count)}`),
    hovertemplate: t("%{customdata}<br>about %{y} km<extra></extra>", "%{customdata}<br>a unos %{y} km<extra></extra>"),
    marker: { size: placed.map((e) => dotSize(e.count)), color: token("--hot"), opacity: 0.75, line: { color: token("--surface"), width: 1 } },
  };

  // Night bands (18:00-06:00) and a dotted rule at midnight, labelled with the day it starts, as on the forecast chart.
  const shapes = [];
  const annotations = [];
  const firstDay = localDate(s.from);
  for (let m = localMidnight(firstDay) - 86400; m <= s.to; m += 86400) {
    shapes.push({ type: "rect", xref: "x", yref: "paper", x0: localStamp(m + 18 * 3600), x1: localStamp(m + 30 * 3600), y0: 0, y1: 1, fillcolor: token("--grid"), opacity: 0.5, line: { width: 0 }, layer: "below" });
    const midnight = m + 86400;
    if (midnight > s.from && midnight < s.to) {
      const xm = localStamp(midnight);
      shapes.push({ type: "line", xref: "x", yref: "paper", x0: xm, x1: xm, y0: 0, y1: 1, line: { color: token("--baseline"), width: 1, dash: "dot" } });
      annotations.push({ x: xm, xref: "x", y: 1, yref: "paper", yanchor: "bottom", xanchor: "left", xshift: 4, showarrow: false, text: t("Today", "Hoy"), font: { color: muted, size: 12 } });
    }
  }
  if (s.events.length === 0) {
    annotations.push({ xref: "paper", yref: "paper", x: 0.5, y: 0.5, showarrow: false, text: t("No lightning detected in the last 24 hours", "No se detectaron rayos en las últimas 24 horas"), font: { color: token("--text-secondary"), size: 14 } });
  }

  // A tick every 3 local hours.
  const ticks = [];
  for (let h = Math.ceil(s.from / 10800) * 10800; h <= s.to; h += 3600) if (new Date((h - 6 * 3600) * 1000).getUTCHours() % 3 === 0) ticks.push(h);

  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 48, r: 16, t: 24, b: 36 },
    showlegend: false,
    shapes,
    annotations,
    hovermode: "closest",
    hoverlabel: hoverLabel(),
    xaxis: {
      type: "date",
      range: [localStamp(s.from), localStamp(s.to)],
      tickmode: "array",
      tickvals: ticks.map(localStamp),
      ticktext: ticks.map(hhmm),
      tickangle: 0,
      showgrid: false,
      showline: true,
      linecolor: token("--baseline"),
      tickfont: { color: muted, size: 12 },
      fixedrange: true,
    },
    yaxis: {
      title: { text: "km", font: { color: muted, size: 12 }, standoff: 8 },
      range: [0, MAX_KM + 2],
      tickvals: [0, 10, 20, 30, 40],
      gridcolor: token("--grid"),
      gridwidth: 1,
      zeroline: false,
      tickfont: { color: muted, size: 12 },
      fixedrange: true,
    },
  };
  return Plotly.react($("lg-chart"), [trace], layout, { displayModeBar: false, responsive: true });
}

export function renderLightningText(s) {
  $("lg-summary").textContent =
    s.total === 0
      ? t("No lightning detected in the last 24 hours.", "No se detectaron rayos en las últimas 24 horas.")
      : s.closest
        ? t(
            `${strikes(s.total)} in the last 24 hours. Closest: about ${s.closest.dist} km, at ${hhmm(s.closest.ts)}.`,
            `${strikes(s.total)} en las últimas 24 horas. El más cercano: a unos ${s.closest.dist} km, a las ${hhmm(s.closest.ts)}.`,
          )
        : t(`${strikes(s.total)} in the last 24 hours.`, `${strikes(s.total)} en las últimas 24 horas.`);

  $("lg-note").textContent = t(
    "Each dot is one minute with strikes, at the station's estimate of their average distance; bigger dots mean more strikes in that minute. The sensor reports distance in fixed steps (1, 5, 8, 10, 12, 14, 17, 20, 24, 27, 31, 34, 37, 40 km), so dots line up in rows, and it only detects lightning within about 40 km. Night (18:00–06:00) is shaded.",
    "Cada punto es un minuto con rayos, a la distancia promedio estimada por la estación; los puntos más grandes indican más rayos en ese minuto. El sensor reporta la distancia en pasos fijos (1, 5, 8, 10, 12, 14, 17, 20, 24, 27, 31, 34, 37, 40 km), por eso los puntos se alinean en filas, y solo detecta rayos a unos 40 km. La noche (18:00–06:00) está sombreada.",
  );

  const table = $("lg-table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const h of [t("Time", "Hora"), t("Strikes", "Rayos"), t("Distance (km)", "Distancia (km)")]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  for (const e of s.events) {
    const row = body.insertRow();
    row.insertCell().textContent = hhmm(e.ts);
    row.insertCell().textContent = String(e.count);
    row.insertCell().textContent = e.dist === null ? "" : String(e.dist);
  }
}

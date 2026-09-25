import { $, token, nf, chartFont, hoverLabel, stackDomains, panelTitle, PANEL_GAP_PX, perPanel } from "./common.js";
import { t } from "./i18n.js";
import { localStamp, localDate } from "./forecast.js";
import { RATE_PER_BUCKET } from "./rainfine.js";

const MAX_KM = 40; // the sensor's detection range; its distance estimates top out here
const hhmm = (ts) => localStamp(ts).slice(11);
const strikes = (n) => (n === 1 ? t("1 strike", "1 rayo") : t(`${nf.format(n)} strikes`, `${nf.format(n)} rayos`));
// Dot area grows with the strikes in that minute: 1 strike is a plain dot, a busy minute is visibly bigger.
const dotSize = (count) => Math.min(24, 7 + 4 * Math.sqrt(count - 1));
const rgba = (hex, a) => `rgba(${[1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)).join(",")},${a})`;
// Unix seconds of local midnight on an ISO date (local is UTC-6, as everywhere in this project).
const localMidnight = (iso) => Date.parse(`${iso}T00:00:00Z`) / 1000 + 6 * 3600;
const BUCKET_S = 600;
const span = (b) => `${hhmm(b.t)}–${hhmm(b.t + BUCKET_S)}`;

// The 10-minute buckets (from the `fine7d` document, see rainfine.js) that fall inside the lightning window.
export function bucketsInWindow(s, buckets) {
  return (buckets ?? []).filter((b) => b.t + BUCKET_S > s.from && b.t <= s.to);
}

// The buckets in the window that had rain. Null or missing buckets just draw nothing.
export function rainInWindow(s, buckets) {
  return bucketsInWindow(s, buckets).filter((b) => b.rate !== null && b.rate > 0);
}

// Min and max of one bucket field over the window, or null with no readings.
function range(bs, key) {
  const v = bs.map((b) => b[key]).filter((x) => x !== null);
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
}

// Three panels over one shared time axis, top to bottom: temperature, rain intensity and lightning distance. Each
// panel has its own y axis and a name above it, so no scale is shared or doubled up. x is a zone-less local
// timestamp, so the viewer's own timezone never shifts it.
const MARGIN = { l: 48, r: 16, t: 24, b: 36 };
const PANEL_WEIGHTS = [1, 1, 1.3]; // lightning a little taller: its dots need room to spread out
const panelNames = () => [t("Temperature (°C)", "Temperatura (°C)"), t("Rain intensity (mm/h)", "Intensidad de la lluvia (mm/h)"), t("Lightning: distance of the strikes (km)", "Rayos: distancia de las descargas (km)")];

export function renderLightningChart(s, buckets) {
  const font = chartFont();
  const muted = token("--text-muted");
  const inWindow = bucketsInWindow(s, buckets);
  // Lines through the middle of each 10-minute bucket; a missing bucket leaves a gap rather than a made-up line.
  const mid = inWindow.map((b) => localStamp(b.t + BUCKET_S / 2));
  const line = (key, yaxis, color, hover) => ({
    type: "scatter",
    mode: "lines",
    x: mid,
    y: inWindow.map((b) => b[key]),
    yaxis,
    line: { color, width: 2 },
    hovertemplate: hover,
  });
  const temp = line("temp", "y3", token("--hot"), t("temperature %{y:.1f} °C<extra></extra>", "temperatura %{y:.1f} °C<extra></extra>"));

  // Bars centred on their 10-minute window.
  const wet = rainInWindow(s, buckets);
  const rain = {
    type: "bar",
    x: wet.map((b) => localStamp(b.t + BUCKET_S / 2)),
    y: wet.map((b) => b.rate),
    width: BUCKET_S * 1000 * 0.9,
    yaxis: "y2",
    marker: { color: token("--series-1") },
    hovertemplate: t("rain %{y:.1f} mm/h<extra></extra>", "lluvia %{y:.1f} mm/h<extra></extra>"),
  };
  // Never under 10 mm/h at the top, so a drizzle stays a drizzle instead of filling the panel.
  const peakRate = Math.max(0, ...wet.map((b) => b.rate));
  const rateStep = [5, 10, 15, 20, 25, 50].find((v) => 2 * v >= peakRate) ?? Math.ceil(peakRate / 20) * 10;

  const placed = s.events.filter((e) => e.dist !== null);
  const lightning = {
    type: "scatter",
    mode: "markers",
    x: placed.map((e) => localStamp(e.ts)),
    y: placed.map((e) => e.dist),
    customdata: placed.map((e) => `${hhmm(e.ts)} · ${strikes(e.count)}`),
    hovertemplate: t("%{customdata}, about %{y} km<extra></extra>", "%{customdata}, a unos %{y} km<extra></extra>"),
    // See-through fill with a solid outline in the same colour: overlapping dots darken and each stays visible.
    marker: { size: placed.map((e) => dotSize(e.count)), color: rgba(token("--series-7"), 0.3), line: { color: token("--series-7"), width: 1 } },
  };

  // Night bands (18:00-06:00) and a dotted rule at midnight in every panel, as on the forecast chart; each is drawn
  // inside the panels (see perPanel below), so the gaps between them stay clear.
  const shapes = [];
  const annotations = [];
  let today = null;
  const firstDay = localDate(s.from);
  for (let m = localMidnight(firstDay) - 86400; m <= s.to; m += 86400) {
    shapes.push({ type: "rect", xref: "x", yref: "paper", x0: localStamp(m + 18 * 3600), x1: localStamp(m + 30 * 3600), y0: 0, y1: 1, fillcolor: token("--grid"), opacity: 0.5, line: { width: 0 }, layer: "below" });
    const midnight = m + 86400;
    if (midnight > s.from && midnight < s.to) {
      today = midnight;
      const xm = localStamp(midnight);
      shapes.push({ type: "line", xref: "x", yref: "paper", x0: xm, x1: xm, y0: 0, y1: 1, line: { color: token("--baseline"), width: 1, dash: "dot" } });
    }
  }
  const [tempD, rainD, lightD] = stackDomains(PANEL_WEIGHTS, PANEL_GAP_PX, $("lg-chart").clientHeight - MARGIN.t - MARGIN.b);
  panelNames().forEach((name, i) => annotations.push(panelTitle(name, [tempD, rainD, lightD][i][1])));
  if (today) {
    // "Today" goes on the top panel's label row, unless midnight is so early in the window that it would run into
    // the temperature label; then it drops to the bottom of the top panel.
    const early = (today - s.from) / (s.to - s.from) < 0.25;
    annotations.push({ x: localStamp(today), xref: "x", y: early ? tempD[0] : 1, yref: "paper", yanchor: "bottom", xanchor: "left", xshift: 4, showarrow: false, text: t("Today", "Hoy"), font: { color: muted, size: 12 } });
  }
  const empty = (d, text) => annotations.push({ xref: "paper", yref: "paper", x: 0.5, y: (d[0] + d[1]) / 2, showarrow: false, text, font: { color: muted, size: 12 } });
  if (s.events.length === 0) empty(lightD, t("No lightning detected in the last 24 hours", "No se detectaron rayos en las últimas 24 horas"));
  if (buckets && wet.length === 0) empty(rainD, t("No rain in the last 24 hours", "Sin lluvia en las últimas 24 horas"));
  if (buckets && !inWindow.some((b) => b.temp !== null)) empty(tempD, t("No temperature readings yet", "Todavía no hay lecturas de temperatura"));

  // A tick every 3 local hours.
  const ticks = [];
  for (let h = Math.ceil(s.from / 10800) * 10800; h <= s.to; h += 3600) if (new Date((h - 6 * 3600) * 1000).getUTCHours() % 3 === 0) ticks.push(h);

  const yBase = { gridcolor: token("--grid"), gridwidth: 1, zeroline: false, tickfont: { color: muted, size: 12 }, fixedrange: true };
  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: MARGIN,
    showlegend: false,
    shapes: perPanel(shapes, [tempD, rainD, lightD]),
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
      // A hairline through all three panels at the hovered time, so a reading lines up with the others.
      showspikes: true,
      spikemode: "across",
      spikesnap: "cursor",
      spikethickness: 1,
      spikedash: "solid",
      spikecolor: token("--baseline"),
      fixedrange: true,
    },
    yaxis: { ...yBase, domain: lightD, range: [0, MAX_KM + 2], tickvals: [0, 20, 40] },
    yaxis2: { ...yBase, domain: rainD, range: [0, rateStep * 2 * 1.05], tickvals: [0, rateStep, 2 * rateStep] },
    yaxis3: { ...yBase, domain: tempD, nticks: 4 },
  };
  return Plotly.react($("lg-chart"), [temp, rain, lightning], layout, { displayModeBar: false, responsive: true });
}

export function renderLightningText(s, buckets) {
  const inWindow = bucketsInWindow(s, buckets);
  const wet = rainInWindow(s, buckets);
  const mm = wet.reduce((sum, b) => sum + b.rate / RATE_PER_BUCKET, 0);
  const peak = wet.reduce((m, b) => (m === null || b.rate > m.rate ? b : m), null);
  const temp = range(inWindow, "temp");
  const tempText = temp ? t(`Temperature ${temp.min.toFixed(1)}–${temp.max.toFixed(1)} °C. `, `Temperatura ${temp.min.toFixed(1)}–${temp.max.toFixed(1)} °C. `) : "";
  const rainText = !buckets
    ? ""
    : peak
      ? t(`Rain: ${mm.toFixed(1)} mm, heaviest ${peak.rate.toFixed(1)} mm/h at ${hhmm(peak.t)}. `, `Lluvia: ${mm.toFixed(1)} mm, máximo ${peak.rate.toFixed(1)} mm/h a las ${hhmm(peak.t)}. `)
      : t("No rain. ", "Sin lluvia. ");
  const lightningText =
    s.total === 0
      ? t("No lightning.", "Sin rayos.")
      : s.closest
        ? t(`${strikes(s.total)}, the closest about ${s.closest.dist} km away at ${hhmm(s.closest.ts)}.`, `${strikes(s.total)}, el más cercano a unos ${s.closest.dist} km a las ${hhmm(s.closest.ts)}.`)
        : `${strikes(s.total)}.`;
  $("lg-summary").textContent = tempText + rainText + lightningText;

  $("lg-note").textContent = t(
    "Three panels over the same 24 hours, each with its own scale. Temperature is the 10-minute average. The blue bars are rain intensity, each one 10-minute window shown as its hourly rate, as on the 7-day rain chart. Each lightning dot is one minute with strikes, at the station's estimate of their average distance; bigger dots mean more strikes in that minute. The sensor reports distance in fixed steps (1, 5, 8, 10, 12, 14, 17, 20, 24, 27, 31, 34, 37, 40 km), so dots line up in rows, and it only detects lightning within about 40 km. Night (18:00–06:00) is shaded.",
    "Tres paneles sobre las mismas 24 horas, cada uno con su propia escala. La temperatura es el promedio de 10 minutos. Las barras azules son la intensidad de la lluvia, cada una una ventana de 10 minutos mostrada como su tasa horaria, como en el gráfico de lluvia de 7 días. Cada punto de rayos es un minuto con descargas, a la distancia promedio estimada por la estación; los puntos más grandes indican más rayos en ese minuto. El sensor reporta la distancia en pasos fijos (1, 5, 8, 10, 12, 14, 17, 20, 24, 27, 31, 34, 37, 40 km), por eso los puntos se alinean en filas, y solo detecta rayos a unos 40 km. La noche (18:00–06:00) está sombreada.",
  );

  const table = $("lg-table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const h of [t("Time", "Hora"), t("Temperature (°C)", "Temperatura (°C)"), t("Rain (mm/h)", "Lluvia (mm/h)"), t("Strikes", "Rayos"), t("Distance (km)", "Distancia (km)")]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  // Every 10-minute window and every strike minute in one list, by time, columns in the panels' order.
  const cell = (v, d) => (v === null ? "" : v.toFixed(d));
  const rows = [
    ...inWindow.map((b) => ({ ts: b.t, cells: [span(b), cell(b.temp, 1), b.rate ? b.rate.toFixed(1) : "", "", ""] })),
    ...s.events.map((e) => ({ ts: e.ts, cells: [hhmm(e.ts), "", "", String(e.count), e.dist === null ? "" : String(e.dist)] })),
  ].sort((a, b) => a.ts - b.ts);
  const body = table.createTBody();
  for (const r of rows) {
    const row = body.insertRow();
    for (const c of r.cells) row.insertCell().textContent = c;
  }
}

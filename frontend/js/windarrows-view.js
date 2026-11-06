import { $, token, chartFont, hoverLabel, monthTicks, fillLegend } from "./common.js";
import { t } from "./i18n.js";
import { mix, monthName, longMonth, tick, WIND_SPEED_TOKEN } from "./heatmap-view.js";
import { CALM_BELOW_KMH_TEXT } from "./windrose.js";
import { SPEED_CLASSES, MIN_WINDY_HOURS, SECTORS_8, speedClass, sectorName, windiest, directionDuring } from "./windarrows.js";

// One arrow per month x hour cell, pointing downwind from the prevailing direction (as on the neighbours map). Every
// arrow has the same length; its thickness and colour both give the average speed class. Where two directions tied for
// most frequent the cell gets a gray ring instead (thickness still the speed): an arrow would point to a direction
// that blew no more often than another. Gray sits outside the violet speed scale,
// so it never reads as a speed. A dot means too few hours with wind to give a direction.
const ARROW_PX = 14; // fits the smallest cell: 13 months on a phone, 24 hours in the chart's height
const HEAD_PX = 4;
const WIDTHS = [1.25, 2, 2.75, 3.5];
const STEPS = [0.6, 0.73, 0.87, 1]; // of the way from the surface to the wind-speed hue; the lightest still shows
const hourLabel = (h) => `${String(h).padStart(2, "0")}:00`;
const n1 = (v) => v.toFixed(1);
const pct = (v) => `${Math.round(v * 100)}%`;
const RING_PX = 4.5; // radius
const SHOW_FROM = 0.15; // the tooltip lists every direction with at least this share of the windy hours

// "NE 50%, W 25%, SW 14%": the directions the wind came from, most frequent first.
const directionShares = (c) =>
  c.counts
    .map((n, i) => ({ name: sectorName((i * 360) / SECTORS_8), share: n / c.windy }))
    .filter((d) => d.share >= SHOW_FROM)
    .sort((a, b) => b.share - a.share)
    .map((d) => `${d.name} ${pct(d.share)}`)
    .join(", ");

// "N/SW": the two most frequent directions of a tied cell, for the table.
const topTwo = (c) =>
  c.counts
    .map((n, i) => ({ n, i }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, 2)
    .filter((d) => d.n > 0)
    .map((d) => sectorName((d.i * 360) / SECTORS_8))
    .join("/");

const classes = () =>
  SPEED_CLASSES.concat(Infinity).map((max, i) => ({
    color: mix(token("--surface"), token(WIND_SPEED_TOKEN), STEPS[i]),
    width: WIDTHS[i],
    label:
      i === 0
        ? t(`under ${SPEED_CLASSES[0]} km/h`, `menos de ${SPEED_CLASSES[0]} km/h`)
        : max === Infinity
          ? t(`${SPEED_CLASSES[i - 1]} km/h or more`, `${SPEED_CLASSES[i - 1]} km/h o más`)
          : `${SPEED_CLASSES[i - 1]}–${max} km/h`,
  }));

// The arrow as a path in pixels around the cell centre; screen y grows downwards, Plotly's pixel offsets upwards.
function arrowPath(dirFrom) {
  const b = ((dirFrom + 180) * Math.PI) / 180; // the way the wind blows to
  const ux = Math.sin(b);
  const uy = Math.cos(b);
  const tip = [(ux * ARROW_PX) / 2, (uy * ARROW_PX) / 2];
  const tail = [-tip[0], -tip[1]];
  const barb = (side) => [tip[0] - HEAD_PX * (ux + side * uy * 0.8), tip[1] - HEAD_PX * (uy - side * ux * 0.8)];
  const p = (pt) => `${pt[0].toFixed(2)},${pt[1].toFixed(2)}`;
  return `M${p(tail)} L${p(tip)} M${p(barb(1))} L${p(tip)} L${p(barb(-1))}`;
}

const describe = (c, m, h) => {
  if (!c) return t(`${longMonth(m)}, ${hourLabel(h)}<br>no data`, `${longMonth(m)}, ${hourLabel(h)}<br>sin datos`);
  const speed = t(`${n1(c.speed)} km/h on average, calm ${Math.round(c.calm * 100)}% of hours`, `${n1(c.speed)} km/h en promedio, calma el ${Math.round(c.calm * 100)}% de las horas`);
  const dir =
    c.dir === null
      ? t(`fewer than ${MIN_WINDY_HOURS} hours with wind`, `menos de ${MIN_WINDY_HOURS} horas con viento`)
      : (c.tied ? t(`tied: ${topTwo(c).replace("/", " and ")}`, `empate: ${topTwo(c).replace("/", " y ")}`) : t(`most often from ${sectorName(c.dir)}`, `más a menudo desde ${sectorName(c.dir)}`)) +
        `<br>${t("windy hours from", "horas con viento desde")} ${directionShares(c)}`;
  return `${longMonth(m)}, ${hourLabel(h)}<br>${dir}<br>${speed}`;
};

export function renderWindArrowsChart(hm) {
  const font = chartFont();
  const muted = token("--text-secondary");
  const cls = classes();
  const shapes = [];
  const dots = { x: [], y: [] };
  const hover = { x: [], y: [], text: [] };
  hm.cells.forEach((row, h) =>
    row.forEach((c, m) => {
      hover.x.push(m);
      hover.y.push(h);
      hover.text.push(describe(c, hm.months[m], h));
      if (!c) return;
      if (c.dir === null) {
        dots.x.push(m);
        dots.y.push(h);
        return;
      }
      const k = cls[speedClass(c.speed)];
      const at = { xref: "x", yref: "y", xsizemode: "pixel", ysizemode: "pixel", xanchor: m, yanchor: h, layer: "above" };
      shapes.push(
        !c.tied
          ? { ...at, type: "path", path: arrowPath(c.dir), line: { color: k.color, width: k.width } }
          : { ...at, type: "circle", x0: -RING_PX, x1: RING_PX, y0: -RING_PX, y1: RING_PX, line: { color: token("--text-muted"), width: k.width } },
      );
    }),
  );
  const labels = hm.months.map(tick);
  const shown = new Set(monthTicks(labels));
  // A pale tile under every cell with data, 2px apart like the heatmaps beside it, so rows and columns can be followed.
  // Halfway from the surface to the gridline gray: the lightest arrow and the gray ones still stand out on it.
  const tile = mix(token("--surface"), token("--grid"), 0.5);
  const traces = [
    {
      type: "heatmap",
      z: hm.cells.map((row) => row.map((c) => (c ? 1 : null))),
      x: labels.map((_, i) => i),
      y: hm.cells.map((_, h) => h),
      colorscale: [[0, tile], [1, tile]],
      showscale: false,
      xgap: 2,
      ygap: 2,
      hoverinfo: "skip",
    },
    { type: "scatter", mode: "markers", x: dots.x, y: dots.y, marker: { size: 4, color: token("--text-muted") }, hoverinfo: "skip" },
    // Invisible cell-sized targets carry the tooltip for every cell, arrow or not.
    { type: "scatter", mode: "markers", x: hover.x, y: hover.y, text: hover.text, marker: { size: 20, symbol: "square", color: "rgba(0,0,0,0)" }, hovertemplate: "%{text}<extra></extra>" },
  ];
  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 56, r: 8, t: 12, b: 48 },
    showlegend: false,
    hovermode: "closest",
    hoverlabel: hoverLabel(),
    shapes,
    xaxis: {
      range: [-0.5, labels.length - 0.5],
      tickmode: "array",
      tickvals: labels.map((_, i) => i).filter((i) => shown.has(labels[i])),
      ticktext: labels.filter((l) => shown.has(l)),
      tickangle: 0,
      automargin: true,
      showgrid: false,
      zeroline: false,
      ticks: "",
      tickfont: { color: muted, size: 12 },
      fixedrange: true,
    },
    yaxis: {
      tickmode: "array",
      tickvals: [0, 3, 6, 9, 12, 15, 18, 21],
      ticktext: [0, 3, 6, 9, 12, 15, 18, 21].map(hourLabel),
      range: [23.5, -0.5], // reversed: midnight at the top, as on the temperature heatmap
      showgrid: false,
      zeroline: false,
      ticks: "",
      tickfont: { color: muted, size: 12 },
      fixedrange: true,
    },
  };
  return Plotly.react($("wa-chart"), traces, layout, { displayModeBar: false, responsive: true });
}

export function renderWindArrowsText(hm) {
  const cls = classes();
  fillLegend(
    $("wa-legend"),
    [
      ...cls.map((k) => ({ label: k.label, color: k.color, style: { height: `${k.width}px` } })),
      { label: t("two directions tied", "dos direcciones empatadas"), color: "transparent", shape: "ring", style: { borderColor: token("--text-muted") } },
      { label: t("too few hours with wind", "muy pocas horas con viento"), color: token("--text-muted"), shape: "dot", style: { width: "4px", height: "4px" } },
    ],
    "line",
  );

  const w = windiest(hm);
  const night = directionDuring(hm, [0, 1, 2, 3, 4, 5]);
  const afternoon = directionDuring(hm, [12, 13, 14, 15, 16, 17]);
  const when = `${hourLabel(w.hour)} ${t("in", "en")} ${monthName(w.month)} ${w.month.slice(0, 4)}`;
  $("wa-summary").textContent =
    t(`Windiest: ${n1(w.speed)} km/h at ${when}.`, `Más ventoso: ${n1(w.speed)} km/h a las ${when}.`) +
    (night !== null && afternoon !== null
      ? t(` At night the wind comes mostly from ${sectorName(night)}, in the afternoon from ${sectorName(afternoon)}.`, ` De noche el viento viene sobre todo del ${sectorName(night)}, por la tarde del ${sectorName(afternoon)}.`)
      : "");

  const partial = hm.months.some((m) => m.partial);
  $("wa-note").textContent =
    t(
      `Each arrow shows the prevailing wind at that hour of the local day (UTC-6) through the month: it starts from the direction the wind came from most often (of 8 compass points, leaving out calm hours under ${CALM_BELOW_KMH_TEXT}) and points the way it blew. Thickness and colour give the average speed, calm hours included. The arrow can stand for well under half the windy hours when trade-wind days and sea-breeze days take turns. A gray ring means two directions tied for most frequent; its thickness still gives the speed. A dot means fewer than ${MIN_WINDY_HOURS} hours with wind that month. Hover over or tap a cell for the share of windy hours from each direction, the speed and the share of calm hours. In the table, a tied cell lists both directions with a *.`,
      `Cada flecha muestra el viento predominante a esa hora del día local (UTC-6) durante el mes: parte de la dirección desde la que el viento sopló más a menudo (de 8 puntos cardinales, sin las horas de calma bajo ${CALM_BELOW_KMH_TEXT}) y apunta hacia donde sopló. El grosor y el color dan la velocidad media, con las horas de calma. La flecha puede representar bastante menos de la mitad de las horas con viento cuando se alternan días de alisios y días de brisa marina. Un anillo gris indica que dos direcciones empataron como las más frecuentes; su grosor sigue dando la velocidad. Un punto indica menos de ${MIN_WINDY_HOURS} horas con viento ese mes. Pase el cursor o toque una celda para ver la proporción de horas con viento desde cada dirección, la velocidad y la proporción de horas de calma. En la tabla, una celda empatada muestra ambas direcciones con un *.`,
    ) + (partial ? t(" † marks a month with missing data (or the month in progress).", " † indica un mes con datos faltantes (o el mes en curso).") : "");

  const table = $("wa-table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const h of [t("Hour", "Hora"), ...hm.months.map((m) => `${monthName(m.key)} ${m.key.slice(2, 4)}${m.partial ? "†" : ""}`)]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  hm.cells.forEach((row, h) => {
    const r = body.insertRow();
    r.insertCell().textContent = hourLabel(h);
    for (const c of row) {
      const dir = c?.dir == null ? "–" : c.tied ? `${topTwo(c)}*` : sectorName(c.dir);
      r.insertCell().textContent = c ? `${dir} ${n1(c.speed)}` : "";
    }
  });
}

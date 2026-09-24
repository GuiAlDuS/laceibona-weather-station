import { $, token, MONTHS, chartFont, hoverLabel } from "./common.js";
import { t } from "./i18n.js";
import { monthName, longMonth, tick } from "./heatmap-view.js";

const TEMP = { prefix: "bm", unit: "°C", decimals: 1, basis: t("hourly temperatures", "las temperaturas horarias"), high: t("Highest typical temperature", "Temperatura típica más alta"), low: t("Lowest", "Más baja") };
export const WIND = { prefix: "wk", unit: "km/h", decimals: 1, basis: t("hourly wind speeds", "las velocidades del viento horarias"), high: t("Windiest", "Más ventoso"), low: t("Calmest", "Más calmado") };
// Standard UV index risk levels, as bands behind the boxes. Edges sit between whole numbers because the index is
// reported rounded (5.6 reads as 6, "high"). Low (0-2) is left unshaded.
const UV_BANDS = () => [
  { from: 2.5, to: 5.5, color: token("--sun"), label: t("Moderate (3–5)", "Moderado (3–5)") },
  { from: 5.5, to: 7.5, color: token("--series-2"), label: t("High (6–7)", "Alto (6–7)") },
  { from: 7.5, to: 10.5, color: token("--hot"), label: t("Very high (8–10)", "Muy alto (8–10)") },
  { from: 10.5, to: Infinity, color: token("--series-7"), label: t("Extreme (11+)", "Extremo (11+)") },
];
export const UV = {
  prefix: "uv",
  unit: t("UV index", "índice UV"),
  decimals: 1,
  basis: t("daily peak UV index (one value per day)", "índice UV máximo diario (un valor por día)"),
  high: t("Strongest sun", "Sol más fuerte"),
  low: t("Weakest", "Más débil"),
  fmt: (v) => `${t("UV index", "índice UV")} ${v.toFixed(1)}`,
  bands: UV_BANDS,
  extraNote: t("The shaded bands are the standard UV index risk levels. Days missing any daylight hour (06:00–18:00), such as sensor outages or today, are left out, since their peak could be too low. ", "Las bandas sombreadas son los niveles de riesgo estándar del índice UV. Los días a los que les falta alguna hora de luz (06:00–18:00), como cortes del sensor o el día de hoy, se excluyen, porque su máximo podría quedar demasiado bajo. "),
};
const BAND_ALPHA = "26"; // hex alpha, about 15%
const f1 = (v) => v.toFixed(1);
const COLS = () => [t("Minimum", "Mínimo"), t("Lower quartile", "Cuartil inferior"), t("Median", "Mediana"), t("Upper quartile", "Cuartil superior"), t("Maximum", "Máximo"), t("Mean", "Media")];
const cells = (s, d = 1) => [s.min, s.q1, s.median, s.q3, s.max, s.mean].map((v) => v.toFixed(d));

function boxChart(el, labels, longLabels, stats, unit = "°C", bands = null) {
  const font = chartFont();
  const muted = token("--text-muted");
  const color = token("--series-1");
  const band = bands && bandLayout(bands, stats);
  const trace = {
    type: "box",
    x: labels,
    q1: stats.map((s) => s.q1),
    median: stats.map((s) => s.median),
    q3: stats.map((s) => s.q3),
    lowerfence: stats.map((s) => s.min),
    upperfence: stats.map((s) => s.max),
    mean: stats.map((s) => s.mean),
    text: longLabels,
    hoverinfo: "y+text",
    marker: { color },
    line: { color, width: 2 },
    fillcolor: color + "55",
    boxmean: false,
    showlegend: false,
  };
  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 56, r: 12, t: 16, b: 48 },
    hoverlabel: hoverLabel(),
    shapes: band?.shapes ?? [],
    xaxis: { type: "category", tickangle: 0, automargin: true, showgrid: false, showline: true, linecolor: token("--baseline"), tickfont: { color: muted, size: 12 }, fixedrange: true },
    yaxis: { ...(band && { range: band.range }), title: { text: unit, font: { color: muted, size: 12 }, standoff: 8 }, gridcolor: token("--grid"), gridwidth: 1, zeroline: false, tickfont: { color: muted, size: 12 }, fixedrange: true },
  };
  return Plotly.react(el, [trace], layout, { displayModeBar: false, responsive: true });
}

// Bands as full-width shapes behind the boxes, with the y range fixed to show the top band even when no box
// reaches it.
function bandLayout(bands, stats) {
  const top = Math.max(12, ...stats.map((s) => s.max + 0.5));
  return {
    shapes: bands.map((b) => ({ type: "rect", xref: "paper", yref: "y", x0: 0, x1: 1, y0: b.from, y1: Math.min(b.to, top), fillcolor: b.color + BAND_ALPHA, line: { width: 0 }, layer: "below" })),
    range: [0, top],
  };
}

function fillLegend(id, bands) {
  const ul = $(id);
  if (!ul) return;
  ul.replaceChildren(
    ...bands.map((b) => {
      const li = document.createElement("li");
      const key = document.createElement("span");
      key.className = "key rect";
      key.style.background = b.color + "66";
      li.append(key, b.label);
      return li;
    }),
  );
}

function fillTable(id, first, rows, unit = "°C", d = 1) {
  const table = $(id);
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const h of [first, ...COLS().map((c) => `${c} (${unit})`)]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  for (const [label, s] of rows) {
    const row = body.insertRow();
    row.insertCell().textContent = label;
    for (const c of cells(s, d)) row.insertCell().textContent = c;
  }
}

// cfg: TEMP (default), WIND or UV.
export function renderTempBoxMonthly(boxes, cfg = TEMP) {
  const bands = cfg.bands?.();
  if (bands) fillLegend(`${cfg.prefix}-legend`, bands);
  return boxChart($(`${cfg.prefix}-chart`), boxes.map((m) => tick(m)), boxes.map(longMonth), boxes.map((m) => m.stats), cfg.unit, bands);
}

export function renderTempBoxMonthlyText(boxes, cfg = TEMP) {
  const p = cfg.prefix;
  const fmt = cfg.fmt ?? ((v) => `${v.toFixed(cfg.decimals)} ${cfg.unit}`);
  const warm = boxes.reduce((a, b) => (b.stats.median > a.stats.median ? b : a));
  const cool = boxes.reduce((a, b) => (b.stats.median < a.stats.median ? b : a));
  $(`${p}-summary`).textContent = `${cfg.high}: ${monthName(warm.key)} ${warm.key.slice(0, 4)} (${t("median", "mediana")} ${fmt(warm.stats.median)}). ${cfg.low}: ${monthName(cool.key)} ${cool.key.slice(0, 4)} (${fmt(cool.stats.median)}).`;
  $(`${p}-note`).textContent =
    t(
      `Each box spans the middle half of the month's ${cfg.basis}, with the line at the median; the whiskers reach the lowest and highest value. `,
      `Cada caja abarca la mitad central de ${cfg.basis} del mes, con la línea en la mediana; los bigotes llegan al valor más bajo y más alto. `,
    ) + (cfg.extraNote ?? "") + (boxes.some((m) => m.partial) ? t("† marks a month with missing data (or the month in progress).", "† indica un mes con datos faltantes (o el mes en curso).") : "");
  fillTable(`${p}-table`, t("Month", "Mes"), boxes.map((m) => [`${monthName(m.key)} ${m.key.slice(0, 4)}${m.partial ? "†" : ""}`, m.stats]), cfg.unit, cfg.decimals);
}

const md = (through) => `${+through.slice(3)} ${MONTHS[+through.slice(0, 2) - 1]}`;

export function renderTempBoxYearly(years) {
  return boxChart($("by-chart"), years.map((y) => y.year), years.map((y) => t(`${y.year}, 1 Jan to ${md(y.through)}`, `${y.year}, 1 ene al ${md(y.through)}`)), years.map((y) => y.stats));
}

export function renderTempBoxYearlyText(years) {
  const through = md(years[0].through);
  $("by-summary").textContent = years.map((y) => t(`${y.year}: median ${f1(y.stats.median)} °C`, `${y.year}: mediana ${f1(y.stats.median)} °C`)).join(" · ") + t(` (1 Jan to ${through}).`, ` (1 ene al ${through}).`);
  $("by-note").textContent = t(
    `Every year covers the same window, 1 January to ${through}, so a partial year is compared fairly. Years with under 30 days in that window are left out. Box and whiskers as in the monthly chart.`,
    `Cada año cubre la misma ventana, del 1 de enero al ${through}, para que un año parcial se compare de forma justa. Los años con menos de 30 días en esa ventana se excluyen. Caja y bigotes como en el gráfico mensual.`,
  );
  fillTable("by-table", t("Year", "Año"), years.map((y) => [t(`${y.year} (${y.days} days)`, `${y.year} (${y.days} días)`), y.stats]));
}

import { $, token, MONTHS, chartFont, hoverLabel } from "./common.js";
import { monthName, longMonth, tick } from "./heatmap-view.js";

const TEMP = { prefix: "bm", unit: "°C", decimals: 1, basis: "hourly temperatures", high: "Highest typical temperature", low: "Lowest" };
export const WIND = { prefix: "wk", unit: "km/h", decimals: 1, basis: "hourly wind speeds", high: "Windiest", low: "Calmest" };
const f1 = (v) => v.toFixed(1);
const COLS = ["Minimum", "Lower quartile", "Median", "Upper quartile", "Maximum", "Mean"];
const cells = (s, d = 1) => [s.min, s.q1, s.median, s.q3, s.max, s.mean].map((v) => v.toFixed(d));

function boxChart(el, labels, longLabels, stats, unit = "°C") {
  const font = chartFont();
  const muted = token("--text-muted");
  const color = token("--series-1");
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
    xaxis: { type: "category", tickangle: 0, showgrid: false, showline: true, linecolor: token("--baseline"), tickfont: { color: muted, size: 12 }, fixedrange: true },
    yaxis: { title: { text: unit, font: { color: muted, size: 12 }, standoff: 8 }, gridcolor: token("--grid"), gridwidth: 1, zeroline: false, tickfont: { color: muted, size: 12 }, fixedrange: true },
  };
  return Plotly.react(el, [trace], layout, { displayModeBar: false, responsive: true });
}

function fillTable(id, first, rows, unit = "°C", d = 1) {
  const t = $(id);
  t.replaceChildren();
  const head = t.createTHead().insertRow();
  for (const h of [first, ...COLS.map((c) => `${c} (${unit})`)]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = t.createTBody();
  for (const [label, s] of rows) {
    const row = body.insertRow();
    row.insertCell().textContent = label;
    for (const c of cells(s, d)) row.insertCell().textContent = c;
  }
}

// cfg: TEMP (default) or WIND.
export function renderTempBoxMonthly(boxes, cfg = TEMP) {
  return boxChart($(`${cfg.prefix}-chart`), boxes.map((m) => tick(m)), boxes.map(longMonth), boxes.map((m) => m.stats), cfg.unit);
}

export function renderTempBoxMonthlyText(boxes, cfg = TEMP) {
  const p = cfg.prefix;
  const fmt = (v) => `${v.toFixed(cfg.decimals)} ${cfg.unit}`;
  const warm = boxes.reduce((a, b) => (b.stats.median > a.stats.median ? b : a));
  const cool = boxes.reduce((a, b) => (b.stats.median < a.stats.median ? b : a));
  $(`${p}-summary`).textContent = `${cfg.high}: ${monthName(warm.key)} ${warm.key.slice(0, 4)} (median ${fmt(warm.stats.median)}). ${cfg.low}: ${monthName(cool.key)} ${cool.key.slice(0, 4)} (${fmt(cool.stats.median)}).`;
  $(`${p}-note`).textContent =
    `Each box spans the middle half of the month's ${cfg.basis}, with the line at the median; the whiskers reach the lowest and highest value. ` +
    (boxes.some((m) => m.partial) ? "† marks a month with missing data (or the month in progress)." : "");
  fillTable(`${p}-table`, "Month", boxes.map((m) => [`${monthName(m.key)} ${m.key.slice(0, 4)}${m.partial ? "†" : ""}`, m.stats]), cfg.unit, cfg.decimals);
}

const md = (through) => `${+through.slice(3)} ${MONTHS[+through.slice(0, 2) - 1]}`;

export function renderTempBoxYearly(years) {
  return boxChart($("by-chart"), years.map((y) => y.year), years.map((y) => `${y.year}, 1 Jan to ${md(y.through)}`), years.map((y) => y.stats));
}

export function renderTempBoxYearlyText(years) {
  const through = md(years[0].through);
  $("by-summary").textContent = years.map((y) => `${y.year}: median ${f1(y.stats.median)} °C`).join(" · ") + ` (1 Jan to ${through}).`;
  $("by-note").textContent = `Every year covers the same window, 1 January to ${through}, so a partial year is compared fairly. Years with under 30 days in that window are left out. Box and whiskers as in the monthly chart.`;
  fillTable("by-table", "Year", years.map((y) => [`${y.year} (${y.days} days)`, y.stats]));
}

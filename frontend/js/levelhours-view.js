import { $, token, chartFont, hoverLabel, fillLegend, addSensorFixNote, FIX_FACTOR } from "./common.js";
import { SENSOR_FIX } from "./sensor-fix.js";
import { t } from "./i18n.js";
import { monthName, tick } from "./heatmap-view.js";

// Stacked monthly bars of the mean hours a day spent at each level of a risk scale: the UV index (uvhours-view.js)
// and heat (wbgthours-view.js). cfg: { prefix, levels: [{ key, colorToken, label }] lowest first, strong: the keys
// the summary ranks months by, most/fewest(month name, hours): the summary's two sentences, note, totalHead }.
// months: [{ key, days, partial, hours: { level key: hours } }], oldest first.
// The strongest level sits at the bottom of each bar, so the hours that matter most share a baseline and compare
// across months.
const levels = (cfg) => cfg.levels.map((l) => ({ ...l, color: token(l.colorToken) })).reverse();
const h1 = (v) => v.toFixed(1);

export function renderLevelHoursChart(cfg, months) {
  const font = chartFont();
  const muted = token("--text-secondary");
  const x = months.map(tick);
  const traces = levels(cfg).map((l) => ({
    type: "bar",
    name: l.label,
    x,
    y: months.map((m) => m.hours[l.key]),
    marker: { color: l.color, line: { color: token("--surface"), width: 2 } },
    hovertemplate: "%{y:.1f} h",
  }));
  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 56, r: 12, t: 16, b: 48 },
    showlegend: false,
    barmode: "stack",
    barcornerradius: 4,
    bargap: 0.3,
    hovermode: "x unified",
    hoverlabel: hoverLabel(),
    xaxis: { type: "category", tickangle: 0, automargin: true, showgrid: false, showline: true, linecolor: token("--baseline"), tickfont: { color: muted, size: 12 }, fixedrange: true },
    yaxis: { title: { text: t("hours per day", "horas por día"), font: { color: muted, size: 12 }, standoff: 8 }, rangemode: "tozero", gridcolor: token("--grid"), gridwidth: 1, zeroline: false, tickfont: { color: muted, size: 12 }, fixedrange: true },
  };
  return Plotly.react($(`${cfg.prefix}-chart`), traces, layout, { displayModeBar: false, responsive: true });
}

export function renderLevelHoursText(cfg, months) {
  const p = cfg.prefix;
  fillLegend($(`${p}-legend`), levels(cfg), "rect");

  const name = (m) => `${monthName(m.key)} ${m.key.slice(0, 4)}`;
  const strong = (m) => cfg.strong.reduce((s, k) => s + m.hours[k], 0);
  const most = months.reduce((a, b) => (strong(b) > strong(a) ? b : a));
  const least = months.reduce((a, b) => (strong(b) < strong(a) ? b : a));
  const summary = $(`${p}-summary`);
  summary.textContent = `${cfg.most(name(most), h1(strong(most)))} ${cfg.fewest(name(least), h1(strong(least)))}`;
  if (months.some((m) => m.key >= SENSOR_FIX.from.slice(0, 7) && m.key <= SENSOR_FIX.to.slice(0, 7))) {
    addSensorFixNote(summary, t(`, so those days' readings are divided by ${FIX_FACTOR}.`, `, así que las lecturas de esos días se dividen entre ${FIX_FACTOR}.`));
  }

  $(`${p}-note`).textContent = cfg.note + (months.some((m) => m.partial) ? t("† marks a month with missing data (or the month in progress).", "† indica un mes con datos faltantes (o el mes en curso).") : "");

  const table = $(`${p}-table`);
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const h of [t("Month", "Mes"), ...levels(cfg).map((l) => `${l.label}, h`), cfg.totalHead, t("Days counted", "Días contados")]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  for (const m of months) {
    const row = body.insertRow();
    row.insertCell().textContent = `${name(m)}${m.partial ? "†" : ""}`;
    for (const l of levels(cfg)) row.insertCell().textContent = h1(m.hours[l.key]);
    row.insertCell().textContent = h1(cfg.levels.reduce((s, l) => s + m.hours[l.key], 0));
    row.insertCell().textContent = m.days;
  }
}

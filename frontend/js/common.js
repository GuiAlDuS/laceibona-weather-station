import { t, nf, MONTHS } from "./i18n.js";

export const $ = (id) => document.getElementById(id);
export const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const narrowScreen = window.matchMedia("(max-width: 600px)");

export const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export const num = (v, digits = 1) => (typeof v === "number" ? v.toFixed(digits) : "—");

// A bordered stat box: a label, a value with an optional unit, and any number of muted sub-lines.
export function tile(label, value, unit, subs = []) {
  const box = el("div", "tile");
  box.append(el("div", "tile-label", label));
  const v = el("div", "tile-value", value);
  if (unit) v.append(el("span", "tile-unit", ` ${unit}`));
  box.append(v);
  for (const s of subs) if (s) box.append(el("div", "tile-sub", s));
  return box;
}

export { nf, MONTHS };
export const mm = (v) => {
  const r = Math.round(v);
  return `${r < 0 ? "−" : r > 0 ? "+" : ""}${nf.format(Math.abs(r))} mm`;
};
export const longDate = (iso) => `${+iso.slice(8)} ${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;

export const chartFont = () => ({
  family: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  color: token("--text-secondary"),
  size: 12,
});

export const hoverLabel = () => ({
  bgcolor: token("--surface"),
  bordercolor: token("--baseline"),
  font: { ...chartFont(), color: token("--text-primary") },
});

// Shared day axis for the week charts, where day i spans x = i..i+1: a tick mark at every midnight (minor ticks) and
// each day's name centred under its noon, between the two marks that bound it. Every other name on narrow screens.
// `grid` also draws the midnights as vertical gridlines.
export const DAY_TICK_LEN = 8;
export const keepDayLabel = (_, i) => !narrowScreen.matches || i % 2 === 0;
export function dayAxisTicks(labels, { grid = false } = {}) {
  const keep = keepDayLabel;
  return {
    tickmode: "array",
    tickvals: labels.map((_, i) => i + 0.5).filter(keep),
    ticktext: labels.filter(keep),
    ticks: "",
    showgrid: false,
    minor: { tickmode: "array", tickvals: labels.map((_, i) => i).concat(labels.length), ticks: "outside", ticklen: DAY_TICK_LEN, tickcolor: token("--baseline"), showgrid: grid, gridcolor: token("--grid") },
  };
}

// The same midnight marks for a category axis (Plotly's minor ticks don't apply there): category i is centred on
// x = i, so its day starts at i - 0.5. Drawn as shapes hanging below the plot area, the same length as a minor tick.
// Pair with `tickvals: categories.filter(keepDayLabel)` for the same every-other-name rule on narrow screens.
export const categoryDayTicks = (n) =>
  Array.from({ length: n + 1 }, (_, i) => ({ type: "line", xref: "x", yref: "paper", ysizemode: "pixel", yanchor: 0, x0: i - 0.5, x1: i - 0.5, y0: 0, y1: -DAY_TICK_LEN, line: { color: token("--baseline"), width: 1 } }));

// entries: [{ label, color }]; shape "line" for line charts, "rect" for bars.
export function fillLegend(ul, entries, shape) {
  ul.replaceChildren();
  for (const e of entries) {
    const li = document.createElement("li");
    const key = document.createElement("span");
    key.className = `key ${shape}`;
    key.style.background = e.color;
    const text = document.createElement("span");
    text.textContent = e.label;
    li.append(key, text);
    ul.append(li);
  }
}

export function setStatus(id, message, onRetry) {
  const el = $(id);
  el.replaceChildren();
  if (message) el.append(message);
  if (onRetry) {
    const b = document.createElement("button");
    b.textContent = t("Retry", "Reintentar");
    b.addEventListener("click", onRetry);
    el.append(b);
  }
}

export const SOLAR_NOTE = t(
  "Data caveat: since April 2026 the station's daily solar averages appear to read about 4% high, which may overstate 2026 solar irradiation and ETo slightly (under review).",
  "Advertencia sobre los datos: desde abril de 2026, los promedios diarios de radiación solar de la estación parecen ser un 4% más altos de lo real, lo que podría sobreestimar ligeramente la radiación solar y la ETo de 2026 (en revisión).",
);

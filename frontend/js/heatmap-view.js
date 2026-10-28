import { $, token, MONTHS, chartFont, hoverLabel, monthTicks } from "./common.js";
import { t } from "./i18n.js";
import { extremes } from "./heatmap.js";

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export const mix = (a, b, f) => `rgb(${rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * f)).join(",")})`;

// One hue from the page surface up to the series colour, so low is quiet and high is loud in both themes. With
// curve 2 the steps sit at the squares of the stops (a square-root scale), so a skewed measure such as rain, mostly
// near zero, still shows its small values; the colour bar keeps a linear axis and shows the squeeze.
export const colorscale = (colorToken, curve = 1) => [0, 0.25, 0.5, 0.75, 1].map((f, i) => [f ** curve, mix(token("--surface"), token(colorToken), [0.1, 0.32, 0.55, 0.78, 1][i])]);

// The same ramp for dots drawn on the page itself: it starts further from the surface, so the lowest value still shows.
export const dotscale = (colorToken) => [0, 0.5, 1].map((f, i) => [f, mix(token("--surface"), token(colorToken), [0.35, 0.68, 1][i])]);
// Wind speed's hue, on the month-by-hour arrows and the day-by-day dots: violet, since red is temperature.
export const WIND_SPEED_TOKEN = "--series-7";

export const monthName = (key) => MONTHS[+key.slice(5, 7) - 1];
export const longMonth = (m) => `${monthName(m.key)} ${m.key.slice(0, 4)}${m.partial ? t(" (incomplete)", " (incompleto)") : ""}`;
export const tick = (m) => `${monthName(m.key)}${m.partial ? "†" : ""}<br>${m.key.slice(2, 4)}`;
const hourLabel = (h) => `${String(h).padStart(2, "0")}:00`;
const withUnit = (unit) => (unit === "%" ? unit : ` ${unit}`); // 99%, but 21.6 °C

// cfg: { prefix, unit, decimals, colorToken, curve? (see colorscale), zmin? (pins the low end of the colour scale) }
export function renderMonthHourChart(cfg, hm) {
  const font = chartFont();
  const muted = token("--text-secondary");
  const x = hm.months.map(tick);
  const trace = {
    type: "heatmap",
    x,
    y: hm.z.map((_, h) => h),
    z: hm.z,
    customdata: hm.z.map(() => hm.months.map(longMonth)),
    hovertemplate: `%{customdata}, %{y}:00<br>%{z:.${cfg.decimals}f}${withUnit(cfg.unit)}<extra></extra>`,
    hoverongaps: false,
    xgap: 2,
    ygap: 2,
    colorscale: colorscale(cfg.colorToken, cfg.curve),
    zmin: cfg.zmin,
    colorbar: { title: { text: cfg.unit, font: { color: muted, size: 12 } }, thickness: 12, len: 0.9, outlinewidth: 0, tickfont: { color: muted, size: 12 } },
  };
  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 56, r: 8, t: 12, b: 48 },
    hoverlabel: hoverLabel(),
    xaxis: { type: "category", tickmode: "array", tickvals: monthTicks(x), tickangle: 0, automargin: true, showgrid: false, ticks: "", tickfont: { color: muted, size: 12 }, fixedrange: true },
    yaxis: {
      tickmode: "array",
      tickvals: [0, 3, 6, 9, 12, 15, 18, 21],
      ticktext: [0, 3, 6, 9, 12, 15, 18, 21].map(hourLabel),
      range: [23.5, -0.5], // reversed: midnight at the top, so time reads downwards
      showgrid: false,
      zeroline: false, // would show through the gaps along the 00:00 row
      ticks: "",
      tickfont: { color: muted, size: 12 },
      fixedrange: true,
    },
  };
  return Plotly.react($(`${cfg.prefix}-chart`), [trace], layout, { displayModeBar: false, responsive: true });
}

// cfg additionally: { high, low } — words for the extremes, e.g. "Warmest" / "Coolest"; no low leaves the lowest out
// (for rain it is just one of many dry cells).
export function renderMonthHourText(cfg, hm) {
  const p = cfg.prefix;
  const { hi, lo } = extremes(hm);
  const v = (e) => t(`${e.value.toFixed(cfg.decimals)}${withUnit(cfg.unit)} at ${hourLabel(e.hour)} in ${monthName(e.month)} ${e.month.slice(0, 4)}`, `${e.value.toFixed(cfg.decimals)}${withUnit(cfg.unit)} a las ${hourLabel(e.hour)} en ${monthName(e.month)} ${e.month.slice(0, 4)}`);
  $(`${p}-summary`).textContent = cfg.low ? `${cfg.high}: ${v(hi)} · ${cfg.low}: ${v(lo)}.` : `${cfg.high}: ${v(hi)}.`;
  const partial = hm.months.filter((m) => m.partial);
  $(`${p}-note`).textContent =
    t(`${cfg.what} for each hour of the local day (UTC-6), averaged over the month. Gray cells have no data.`, `${cfg.what} para cada hora del día local (UTC-6), promediada durante el mes. Las celdas grises no tienen datos.`) +
    (partial.length ? t(" † marks a month with missing data (or the month in progress).", " † indica un mes con datos faltantes (o el mes en curso).") : "");

  const table = $(`${p}-table`);
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const h of [t("Hour", "Hora"), ...hm.months.map((m) => `${monthName(m.key)} ${m.key.slice(2, 4)}${m.partial ? "†" : ""}`)]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  hm.z.forEach((row, h) => {
    const r = body.insertRow();
    r.insertCell().textContent = hourLabel(h);
    for (const val of row) r.insertCell().textContent = val === null ? "" : val.toFixed(cfg.decimals);
  });
}

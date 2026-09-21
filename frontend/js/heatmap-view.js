import { $, token, MONTHS, chartFont, hoverLabel } from "./common.js";
import { extremes } from "./heatmap.js";

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export const mix = (a, b, f) => `rgb(${rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * f)).join(",")})`;

// One hue from the page surface up to the series colour, so low is quiet and high is loud in both themes.
export const colorscale = (colorToken) => [0, 0.25, 0.5, 0.75, 1].map((f, i) => [f, mix(token("--surface"), token(colorToken), [0.1, 0.32, 0.55, 0.78, 1][i])]);

// Dark purple through teal and green to yellow: perceptually even, so the strongest values glow yellow.
export const VIRIDIS = [[0, "#440154"], [0.25, "#3b528b"], [0.5, "#21918c"], [0.75, "#5ec962"], [1, "#fde725"]];

export const monthName = (key) => MONTHS[+key.slice(5, 7) - 1];
export const longMonth = (m) => `${monthName(m.key)} ${m.key.slice(0, 4)}${m.partial ? " (incomplete)" : ""}`;
export const tick = (m) => `${monthName(m.key)}${m.partial ? "†" : ""}<br>${m.key.slice(2, 4)}`;
const hourLabel = (h) => `${String(h).padStart(2, "0")}:00`;

// cfg: { prefix, unit, decimals, colorToken } — or `ramp` (a Plotly colorscale) instead of colorToken
export function renderMonthHourChart(cfg, hm) {
  const font = chartFont();
  const muted = token("--text-muted");
  const x = hm.months.map(tick);
  const trace = {
    type: "heatmap",
    x,
    y: hm.z.map((_, h) => h),
    z: hm.z,
    customdata: hm.z.map(() => hm.months.map(longMonth)),
    hovertemplate: `%{customdata}, %{y}:00<br>%{z:.${cfg.decimals}f} ${cfg.unit}<extra></extra>`,
    hoverongaps: false,
    xgap: 2,
    ygap: 2,
    colorscale: cfg.ramp ?? colorscale(cfg.colorToken),
    colorbar: { title: { text: cfg.unit, font: { color: muted, size: 12 } }, thickness: 12, len: 0.9, outlinewidth: 0, tickfont: { color: muted, size: 12 } },
  };
  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 56, r: 8, t: 12, b: 48 },
    hoverlabel: hoverLabel(),
    xaxis: { type: "category", tickangle: 0, showgrid: false, ticks: "", tickfont: { color: muted, size: 12 }, fixedrange: true },
    yaxis: {
      tickmode: "array",
      tickvals: [0, 3, 6, 9, 12, 15, 18, 21],
      ticktext: [0, 3, 6, 9, 12, 15, 18, 21].map(hourLabel),
      range: [-0.5, 23.5],
      showgrid: false,
      ticks: "",
      tickfont: { color: muted, size: 12 },
      fixedrange: true,
    },
  };
  return Plotly.react($(`${cfg.prefix}-chart`), [trace], layout, { displayModeBar: false, responsive: true });
}

// cfg additionally: { high, low } — words for the extremes, e.g. "Warmest" / "Coolest".
export function renderMonthHourText(cfg, hm) {
  const p = cfg.prefix;
  const { hi, lo } = extremes(hm);
  const v = (e) => `${e.value.toFixed(cfg.decimals)} ${cfg.unit} at ${hourLabel(e.hour)} in ${monthName(e.month)} ${e.month.slice(0, 4)}`;
  $(`${p}-summary`).textContent = `${cfg.high}: ${v(hi)} · ${cfg.low}: ${v(lo)}.`;
  const partial = hm.months.filter((m) => m.partial);
  $(`${p}-note`).textContent =
    `${cfg.what} for each hour of the local day (UTC-6), averaged over the month. Gray cells have no data.` +
    (partial.length ? " † marks a month with missing data (or the month in progress)." : "");

  const t = $(`${p}-table`);
  t.replaceChildren();
  const head = t.createTHead().insertRow();
  for (const h of ["Hour", ...hm.months.map((m) => `${monthName(m.key)} ${m.key.slice(2, 4)}${m.partial ? "†" : ""}`)]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = t.createTBody();
  hm.z.forEach((row, h) => {
    const r = body.insertRow();
    r.insertCell().textContent = hourLabel(h);
    for (const val of row) r.insertCell().textContent = val === null ? "" : val.toFixed(cfg.decimals);
  });
}

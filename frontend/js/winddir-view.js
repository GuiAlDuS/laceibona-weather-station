import { $, token, chartFont, hoverLabel } from "./common.js";
import { colorscale, monthName, longMonth, tick } from "./heatmap-view.js";
import { SECTORS } from "./windrose.js";
import { ROW_SECTORS, prevailing } from "./winddir.js";

const CFG = { colorToken: "--series-1" };
const f1 = (v) => `${v.toFixed(1)}%`;

export function renderWindDirChart(hm) {
  const font = chartFont();
  const muted = token("--text-muted");
  const names = ROW_SECTORS.map((s) => SECTORS[s]);
  const trace = {
    type: "heatmap",
    x: hm.months.map(tick),
    y: names.map((_, i) => i),
    z: hm.z,
    customdata: hm.z.map((_, r) => hm.months.map((m) => `${longMonth(m)}, from ${names[r]}`)),
    hovertemplate: "%{customdata}<br>%{z:.1f}% of hours<extra></extra>",
    hoverongaps: false,
    xgap: 2,
    ygap: 2,
    colorscale: colorscale(CFG.colorToken),
    colorbar: { title: { text: "% of hours", font: { color: muted, size: 12 } }, thickness: 12, len: 0.9, outlinewidth: 0, tickfont: { color: muted, size: 12 } },
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
      tickvals: names.map((_, i) => i).filter((i) => i % 2 === 0),
      ticktext: names.filter((_, i) => i % 2 === 0),
      range: [-0.5, names.length - 0.5],
      showgrid: false,
      ticks: "",
      tickfont: { color: muted, size: 12 },
      fixedrange: true,
    },
  };
  return Plotly.react($("wd-chart"), [trace], layout, { displayModeBar: false, responsive: true });
}

export function renderWindDirText(hm) {
  const top = prevailing(hm);
  $("wd-summary").textContent = `Prevailing direction: from ${top.name}, about ${f1(top.percent)} of hours in a typical month.`;
  const partial = hm.months.filter((m) => m.partial);
  $("wd-note").textContent =
    "Share of each month's hours the wind blew from each direction (hourly average direction; calm hours under 1.8 km/h left out). South is at both top and bottom, so the north and east winds sit together in the middle. Gray cells never occurred." +
    (partial.length ? " † marks a month with missing data (or the month in progress)." : "");

  const t = $("wd-table");
  t.replaceChildren();
  const head = t.createTHead().insertRow();
  for (const h of ["From", ...hm.months.map((m) => `${monthName(m.key)} ${m.key.slice(2, 4)}${m.partial ? "†" : ""}`)]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = t.createTBody();
  SECTORS.forEach((name, s) => {
    const row = body.insertRow();
    row.insertCell().textContent = name;
    for (const v of hm.z[ROW_SECTORS.indexOf(s)]) row.insertCell().textContent = v === null ? "" : v.toFixed(1);
  });
}

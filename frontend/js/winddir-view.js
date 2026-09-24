import { $, token, chartFont, hoverLabel, monthTicks } from "./common.js";
import { t, sectorLabel } from "./i18n.js";
import { colorscale, monthName, longMonth, tick } from "./heatmap-view.js";
import { SECTORS } from "./windrose.js";
import { ROW_SECTORS, prevailing } from "./winddir.js";

const CFG = { colorToken: "--series-1" };
const f1 = (v) => `${v.toFixed(1)}%`;

export function renderWindDirChart(hm) {
  const font = chartFont();
  const muted = token("--text-muted");
  const names = ROW_SECTORS.map(sectorLabel);
  const x = hm.months.map(tick);
  const trace = {
    type: "heatmap",
    x,
    y: names.map((_, i) => i),
    z: hm.z,
    customdata: hm.z.map((_, r) => hm.months.map((m) => t(`${longMonth(m)}, from ${names[r]}`, `${longMonth(m)}, desde ${names[r]}`))),
    hovertemplate: t("%{customdata}<br>%{z:.1f}% of hours<extra></extra>", "%{customdata}<br>%{z:.1f}% de las horas<extra></extra>"),
    hoverongaps: false,
    xgap: 2,
    ygap: 2,
    colorscale: colorscale(CFG.colorToken),
    colorbar: { title: { text: t("% of hours", "% de horas"), font: { color: muted, size: 12 } }, thickness: 12, len: 0.9, outlinewidth: 0, tickfont: { color: muted, size: 12 } },
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
  $("wd-summary").textContent = t(`Prevailing direction: from ${top.name}, about ${f1(top.percent)} of hours in a typical month.`, `Dirección predominante: desde ${top.name}, cerca del ${f1(top.percent)} de las horas en un mes típico.`);
  const partial = hm.months.filter((m) => m.partial);
  $("wd-note").textContent =
    t(
      "Share of each month's hours the wind blew from each direction (hourly average direction; calm hours under 1.8 km/h left out). South is at both top and bottom, so the north and east winds sit together in the middle. Gray cells never occurred.",
      "Proporción de las horas de cada mes en que el viento sopló desde cada dirección (dirección media por hora; se excluyen las horas de calma bajo 1,8 km/h). El sur está arriba y abajo, así que los vientos del norte y del este quedan juntos en el medio. Las celdas grises nunca ocurrieron.",
    ) + (partial.length ? t(" † marks a month with missing data (or the month in progress).", " † indica un mes con datos faltantes (o el mes en curso).") : "");

  const table = $("wd-table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const h of [t("From", "Desde"), ...hm.months.map((m) => `${monthName(m.key)} ${m.key.slice(2, 4)}${m.partial ? "†" : ""}`)]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  SECTORS.forEach((_, s) => {
    const row = body.insertRow();
    row.insertCell().textContent = sectorLabel(s);
    for (const v of hm.z[ROW_SECTORS.indexOf(s)]) row.insertCell().textContent = v === null ? "" : v.toFixed(1);
  });
}

import { $, token, nf, chartFont, hoverLabel } from "./common.js";
import { t, MONTHS } from "./i18n.js";

const md = (through) => `${+through.slice(3)} ${MONTHS[+through.slice(0, 2) - 1]}`;
const perDay = (y) => y.total / y.days;

export function renderSolarYearChart(years) {
  const font = chartFont();
  const muted = token("--text-muted");
  const bar = {
    type: "bar",
    x: years.map((y) => y.year),
    y: years.map((y) => y.total),
    marker: { color: token("--sun") },
    hovertemplate: "%{y:,.0f} kWh/m²<extra></extra>",
  };
  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 56, r: 24, t: 24, b: 36 },
    showlegend: false,
    hovermode: "x",
    hoverlabel: hoverLabel(),
    xaxis: { type: "category", showgrid: false, showline: true, linecolor: token("--baseline"), tickfont: { color: muted, size: 12 }, fixedrange: true },
    yaxis: { title: { text: "kWh/m²", font: { color: muted, size: 12 }, standoff: 8 }, rangemode: "tozero", gridcolor: token("--grid"), gridwidth: 1, zeroline: false, tickfont: { color: muted, size: 12 }, fixedrange: true },
  };
  return Plotly.react($("sy-chart"), [bar], layout, { displayModeBar: false, responsive: true });
}

export function renderSolarYearText(years) {
  const through = md(years.at(-1).through);
  $("sy-summary").textContent =
    years.map((y) => t(`${y.year}: ${nf.format(Math.round(y.total))} kWh/m² (${perDay(y).toFixed(1)} kWh/m²/day)`, `${y.year}: ${nf.format(Math.round(y.total))} kWh/m² (${perDay(y).toFixed(1)} kWh/m²/día)`)).join(" · ") +
    t(` (1 Jan to ${through}).`, ` (1 ene al ${through}).`);
  $("sy-note").textContent = t(
    `Total solar irradiation per year, from raw hourly observations (not the stats endpoint used elsewhere on this page, so this is not affected by the solar-bias caveat on the water balance chart). Every year covers the same window, 1 January to ${through}, so a partial year is compared fairly. Years with under 30 days in that window are left out.`,
    `Irradiación solar total por año, a partir de observaciones horarias sin procesar (no del endpoint de estadísticas usado en otras partes de esta página, por lo que no está afectado por la advertencia sobre el sesgo solar de la gráfica de balance hídrico). Cada año cubre la misma ventana, del 1 de enero al ${through}, para que un año parcial se compare de forma justa. Los años con menos de 30 días en esa ventana se excluyen.`,
  );

  const table = $("sy-table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const h of [t("Year", "Año"), t("Days", "Días"), t("Total (kWh/m²)", "Total (kWh/m²)"), t("Daily avg (kWh/m²/day)", "Media diaria (kWh/m²/día)")]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  for (const y of years) {
    const row = body.insertRow();
    row.insertCell().textContent = y.year;
    row.insertCell().textContent = y.days;
    row.insertCell().textContent = nf.format(Math.round(y.total));
    row.insertCell().textContent = perDay(y).toFixed(1);
  }
}

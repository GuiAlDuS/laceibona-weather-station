import { $, token, nf, chartFont, hoverLabel, SENSOR_HIGH_FROM, addCaveat } from "./common.js";
import { t, MONTHS } from "./i18n.js";

const md = (through) => `${+through.slice(3)} ${MONTHS[+through.slice(0, 2) - 1]}`;
const perDay = (y) => y.total / y.days;
// A year whose window reaches SENSOR_HIGH_FROM includes the light sensor's too-high readings.
const sensorHigh = (y) => `${y.year}-${y.through}` >= SENSOR_HIGH_FROM;

export function renderSolarYearChart(years) {
  const font = chartFont();
  const muted = token("--text-muted");
  const bar = {
    type: "bar",
    x: years.map((y) => y.year),
    y: years.map((y) => y.total),
    // The affected year is hatched, so the caveat shows on the chart itself.
    marker: { color: token("--sun"), pattern: { shape: years.map((y) => (sensorHigh(y) ? "/" : "")), fillmode: "overlay", fgcolor: token("--surface"), fgopacity: 0.7, solidity: 0.3 } },
    customdata: years.map((y) => (sensorHigh(y) ? t("<br>includes readings that are too high", "<br>incluye lecturas demasiado altas") : "")),
    hovertemplate: "%{y:,.0f} kWh/m²%{customdata}<extra></extra>",
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
  const summary = $("sy-summary");
  summary.textContent =
    years.map((y) => t(`${y.year}: ${nf.format(Math.round(y.total))} kWh/m² (${perDay(y).toFixed(1)} kWh/m²/day)`, `${y.year}: ${nf.format(Math.round(y.total))} kWh/m² (${perDay(y).toFixed(1)} kWh/m²/día)`)).join(" · ") +
    t(` (1 Jan to ${through}).`, ` (1 ene al ${through}).`);
  const high = years.filter(sensorHigh).map((y) => y.year);
  if (high.length) {
    addCaveat(
      summary,
      t(
        `Under review: since about 25 Aug 2026 the light sensor has read about 1.35× too high at all light levels (checked against two nearby stations), so the ${high.join(", ")} total (hatched) is somewhat overstated. We're checking the sensor; readings before that date are not affected.`,
        `En revisión: desde alrededor del 25 ago 2026 el sensor de luz lee cerca de 1,35× demasiado alto con cualquier nivel de luz (comparado con dos estaciones cercanas), así que el total de ${high.join(", ")} (rayado) está algo sobreestimado. Estamos revisando el sensor; las lecturas anteriores a esa fecha no están afectadas.`,
      ),
    );
  }
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

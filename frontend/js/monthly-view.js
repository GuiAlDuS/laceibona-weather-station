import { $, token, nf, narrowScreen, MONTHS, chartFont, hoverLabel, fillLegend } from "./common.js";
import { t } from "./i18n.js";
import { summarizeMonths, peak } from "./monthly.js";

export const monthName = (key) => MONTHS[+key.slice(5, 7) - 1];
export const longLabel = (m) => `${monthName(m.month)} ${m.month.slice(0, 4)}${m.partial ? ` — ${m.days} ${t("of", "de")} ${m.daysInMonth} ${t("days", "días")}` : ""}`;
export const tickLabel = (m) => `${monthName(m.month)}${m.partial ? "†" : ""}<br>${m.month.slice(2, 4)}`;

export function renderMonthlyChart(months) {
  const font = chartFont();
  const muted = token("--text-muted");
  const x = months.map(longLabel);
  const labelOnly = (key) => {
    const i = peak(months, key);
    return months.map((m, j) => (j === i ? nf.format(Math.round(m[key])) : ""));
  };
  const bar = (name, key, color) => ({
    type: "bar",
    name,
    x,
    y: months.map((m) => m[key]),
    marker: { color, cornerradius: 4 },
    text: labelOnly(key),
    textposition: "outside",
    textfont: { color: font.color, size: 12 },
    constraintext: "none",
    cliponaxis: false,
    customdata: months.map((m) => (m.partial ? t(` (${m.days} of ${m.daysInMonth} days)`, ` (${m.days} de ${m.daysInMonth} días)`) : "")),
    hovertemplate: "%{y:,.0f} mm%{customdata}",
  });

  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 56, r: 12, t: 24, b: 48 },
    showlegend: false,
    barmode: "group",
    bargap: 0.3,
    bargroupgap: 0.06,
    hovermode: "x unified",
    hoverlabel: hoverLabel(),
    xaxis: {
      type: "category",
      tickmode: "array",
      tickvals: x.filter((_, i) => !narrowScreen.matches || i % 2 === (months.length - 1) % 2),
      ticktext: months.map(tickLabel).filter((_, i) => !narrowScreen.matches || i % 2 === (months.length - 1) % 2),
      tickangle: 0,
      automargin: true,
      showgrid: false,
      showspikes: true,
      spikemode: "across",
      spikesnap: "cursor",
      spikecolor: token("--baseline"),
      spikethickness: 1,
      spikedash: "solid",
      showline: true,
      linecolor: token("--baseline"),
      tickfont: { color: muted, size: 12 },
      fixedrange: true,
    },
    yaxis: {
      title: { text: t("mm per month", "mm por mes"), font: { color: muted, size: 12 }, standoff: 8 },
      tickformat: ",d",
      rangemode: "tozero",
      gridcolor: token("--grid"),
      gridwidth: 1,
      zeroline: true,
      zerolinecolor: token("--baseline"),
      zerolinewidth: 1,
      tickfont: { color: muted, size: 12 },
      fixedrange: true,
    },
  };

  return Plotly.react(
    $("mo-chart"),
    [bar(t("Rain", "Lluvia"), "rain", token("--series-1")), bar("ETo", "eto", token("--series-2"))],
    layout,
    { displayModeBar: false, responsive: true },
  );
}

export function renderMonthlyText(months) {
  fillLegend(
    $("mo-legend"),
    [
      { label: t("Rain", "Lluvia"), color: token("--series-1") },
      { label: t("ETo (evapotranspiration)", "ETo (evapotranspiración)"), color: token("--series-2") },
    ],
    "rect",
  );

  const s = summarizeMonths(months);
  $("mo-summary").textContent = t(`Rain exceeded ETo in ${s.rainAboveEto} of the last ${s.total} months.`, `La lluvia superó a la ETo en ${s.rainAboveEto} de los últimos ${s.total} meses.`);

  const partial = months.filter((m) => m.partial);
  $("mo-note").textContent =
    t("Monthly totals add up only days with complete sensor data. ", "Los totales mensuales suman solo los días con datos completos del sensor. ") +
    (partial.length ? t("† marks a month with missing days (or the month in progress), so its totals read low.", "† indica un mes con días faltantes (o el mes en curso), por lo que sus totales se leen bajos.") : "");

  const table = $("mo-table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const h of [t("Month", "Mes"), t("Rain (mm)", "Lluvia (mm)"), "ETo (mm)", t("Days with data", "Días con datos")]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  for (const m of months) {
    const row = body.insertRow();
    row.insertCell().textContent = `${monthName(m.month)} ${m.month.slice(0, 4)}`;
    row.insertCell().textContent = m.rain === null ? "" : nf.format(Math.round(m.rain));
    row.insertCell().textContent = m.eto === null ? "" : nf.format(Math.round(m.eto));
    row.insertCell().textContent = `${m.days} ${t("of", "de")} ${m.daysInMonth}`;
  }
}

import { $, token, nf, chartFont, hoverLabel, categoryDayTicks, keepDayLabel } from "./common.js";
import { t } from "./i18n.js";
import { dayLabel } from "./tempdaily-view.js";
import { weekTotals } from "./rainweek.js";

const label = (r) => `${dayLabel(r.date)}${r.inProgress ? t("<br>so far", "<br>hasta ahora") : ""}`;
const hrs = (h) => `${h.toFixed(1)} h`;

// Two panels sharing one day axis: rain and ETo bars (mm) above, rain duration (hours) below.
// Different units get their own axis instead of a second y-axis on one plot.
export function renderRainWeekChart(rows) {
  const font = chartFont();
  const muted = token("--text-muted");
  const surface = token("--surface");
  const x = rows.map(label);
  const bar = (name, key, color) => ({
    type: "bar",
    name,
    x,
    y: rows.map((r) => r[key]),
    xaxis: "x",
    yaxis: "y",
    marker: { color, cornerradius: 4 },
    hovertemplate: "%{y:,.1f} mm",
  });
  const peak = rows.reduce((b, r, i) => ((r.rain ?? -1) > (rows[b].rain ?? -1) ? i : b), 0);
  const rain = { ...bar(t("Rain", "Lluvia"), "rain", token("--series-1")), text: rows.map((r, i) => (i === peak && r.rain ? nf.format(Math.round(r.rain)) : "")), textposition: "outside", textfont: { color: font.color, size: 12 }, cliponaxis: false };
  const duration = {
    type: "scatter",
    mode: "lines+markers",
    name: t("Rain duration", "Duración de la lluvia"),
    x,
    y: rows.map((r) => r.hours),
    xaxis: "x",
    yaxis: "y2",
    line: { color: token("--series-3"), width: 2 },
    marker: { size: 8, color: token("--series-3"), line: { color: surface, width: 2 } },
    hovertemplate: "%{y:.1f} h",
  };
  const axis = (title, domain, extra = {}) => ({
    title: { text: title, font: { color: muted, size: 12 }, standoff: 8 },
    domain,
    rangemode: "tozero",
    gridcolor: token("--grid"),
    gridwidth: 1,
    zeroline: true,
    zerolinecolor: token("--baseline"),
    tickfont: { color: muted, size: 12 },
    fixedrange: true,
    ...extra,
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
    shapes: categoryDayTicks(rows.length),
    xaxis: { type: "category", anchor: "y2", tickmode: "array", tickvals: x.filter(keepDayLabel), ticktext: x.filter(keepDayLabel), tickangle: 0, automargin: true, showgrid: false, showline: true, linecolor: token("--baseline"), showspikes: true, spikemode: "across", spikesnap: "cursor", spikecolor: token("--baseline"), spikethickness: 1, spikedash: "solid", tickfont: { color: muted, size: 12 }, fixedrange: true },
    yaxis: axis("mm", [0.4, 1], { tickformat: ",d" }),
    yaxis2: axis(t("hours", "horas"), [0, 0.28], { dtick: 6, rangemode: "tozero" }),
  };
  return Plotly.react($("rw-chart"), [rain, bar("ETo", "eto", token("--series-2")), duration], layout, { displayModeBar: false, responsive: true });
}

export function renderRainWeekText(rows) {
  const legend = $("rw-legend");
  legend.replaceChildren();
  for (const [name, color, cls] of [
    [t("Rain", "Lluvia"), token("--series-1"), "rect"],
    [t("ETo (evapotranspiration)", "ETo (evapotranspiración)"), token("--series-2"), "rect"],
    [t("Rain duration (hours, lower panel)", "Duración de la lluvia (horas, panel inferior)"), token("--series-3"), "line"],
  ]) {
    const li = document.createElement("li");
    const key = document.createElement("span");
    key.className = `key ${cls}`;
    key.style.background = color;
    const text = document.createElement("span");
    text.textContent = name;
    li.append(key, text);
    legend.append(li);
  }

  const totals = weekTotals(rows);
  $("rw-summary").textContent = t(
    `${nf.format(Math.round(totals.rain))} mm of rain on ${totals.rainDays} of the last ${rows.length} days, ${hrs(totals.hours)} in total. ` +
      `On the ${totals.etoDays} finished days, rain was ${nf.format(Math.round(totals.rainOnEtoDays))} mm against ${nf.format(Math.round(totals.eto))} mm of ETo.`,
    `${nf.format(Math.round(totals.rain))} mm de lluvia en ${totals.rainDays} de los últimos ${rows.length} días, ${hrs(totals.hours)} en total. ` +
      `En los ${totals.etoDays} días terminados, la lluvia fue de ${nf.format(Math.round(totals.rainOnEtoDays))} mm frente a ${nf.format(Math.round(totals.eto))} mm de ETo.`,
  );
  $("rw-note").textContent =
    (rows.at(-1).inProgress
      ? t(
          "Today's ETo is not shown: ETo is worked out once a day for the finished day, so it cannot be calculated for today. Today's rain and rain duration are totals so far. ",
          "La ETo de hoy no se muestra: se calcula una vez al día para el día terminado, así que no puede calcularse para hoy. La lluvia y la duración de hoy son totales hasta ahora. ",
        )
      : "") + t("Rain duration is the number of minutes with rain in the day, shown in hours.", "La duración de la lluvia es la cantidad de minutos con lluvia en el día, mostrada en horas.");

  const table = $("rw-table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const h of [t("Day", "Día"), t("Rain (mm)", "Lluvia (mm)"), "ETo (mm)", t("Rain duration (h)", "Duración de la lluvia (h)")]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  for (const r of rows) {
    const row = body.insertRow();
    row.insertCell().textContent = dayLabel(r.date) + (r.inProgress ? t(" (so far)", " (hasta ahora)") : "");
    row.insertCell().textContent = r.rain === null ? "" : r.rain.toFixed(1);
    row.insertCell().textContent = r.eto === null ? (r.inProgress ? t("not yet", "aún no") : "") : r.eto.toFixed(1);
    row.insertCell().textContent = r.hours === null ? "" : r.hours.toFixed(1);
  }
}

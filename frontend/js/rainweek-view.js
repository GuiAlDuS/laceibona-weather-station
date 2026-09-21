import { $, token, nf, chartFont, hoverLabel } from "./common.js";
import { dayLabel } from "./tempdaily-view.js";
import { weekTotals } from "./rainweek.js";

const label = (r) => `${dayLabel(r.date)}${r.inProgress ? "<br>so far" : ""}`;
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
  const rain = { ...bar("Rain", "rain", token("--series-1")), text: rows.map((r, i) => (i === peak && r.rain ? nf.format(Math.round(r.rain)) : "")), textposition: "outside", textfont: { color: font.color, size: 12 }, cliponaxis: false };
  const duration = {
    type: "scatter",
    mode: "lines+markers",
    name: "Rain duration",
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
    xaxis: { type: "category", anchor: "y2", tickangle: 0, showgrid: false, showline: true, linecolor: token("--baseline"), showspikes: true, spikemode: "across", spikesnap: "cursor", spikecolor: token("--baseline"), spikethickness: 1, spikedash: "solid", tickfont: { color: muted, size: 12 }, fixedrange: true },
    yaxis: axis("mm", [0.4, 1], { tickformat: ",d" }),
    yaxis2: axis("hours", [0, 0.28], { dtick: 6, rangemode: "tozero" }),
  };
  return Plotly.react($("rw-chart"), [rain, bar("ETo", "eto", token("--series-2")), duration], layout, { displayModeBar: false, responsive: true });
}

export function renderRainWeekText(rows) {
  const legend = $("rw-legend");
  legend.replaceChildren();
  for (const [name, color, cls] of [["Rain", token("--series-1"), "rect"], ["ETo (evapotranspiration)", token("--series-2"), "rect"], ["Rain duration (hours, lower panel)", token("--series-3"), "line"]]) {
    const li = document.createElement("li");
    const key = document.createElement("span");
    key.className = `key ${cls}`;
    key.style.background = color;
    const text = document.createElement("span");
    text.textContent = name;
    li.append(key, text);
    legend.append(li);
  }

  const t = weekTotals(rows);
  $("rw-summary").textContent =
    `${nf.format(Math.round(t.rain))} mm of rain on ${t.rainDays} of the last ${rows.length} days, ${hrs(t.hours)} in total. ` +
    `On the ${t.etoDays} finished days, rain was ${nf.format(Math.round(t.rainOnEtoDays))} mm against ${nf.format(Math.round(t.eto))} mm of ETo.`;
  $("rw-note").textContent =
    (rows.at(-1).inProgress ? "Today's ETo is not shown: ETo is worked out once a day for the finished day, so it cannot be calculated for today. Today's rain and rain duration are totals so far. " : "") +
    "Rain duration is the number of minutes with rain in the day, shown in hours.";

  const tbl = $("rw-table");
  tbl.replaceChildren();
  const head = tbl.createTHead().insertRow();
  for (const h of ["Day", "Rain (mm)", "ETo (mm)", "Rain duration (h)"]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = tbl.createTBody();
  for (const r of rows) {
    const row = body.insertRow();
    row.insertCell().textContent = dayLabel(r.date) + (r.inProgress ? " (so far)" : "");
    row.insertCell().textContent = r.rain === null ? "" : r.rain.toFixed(1);
    row.insertCell().textContent = r.eto === null ? (r.inProgress ? "not yet" : "") : r.eto.toFixed(1);
    row.insertCell().textContent = r.hours === null ? "" : r.hours.toFixed(1);
  }
}

import { $, token, nf, narrowScreen, chartFont, hoverLabel, SOLAR_NOTE } from "./common.js";
import { longLabel, tickLabel, monthName } from "./monthly-view.js";

const kwh = (v, d = 1) => `${v.toFixed(d)} kWh/m²`;

function baseLayout(yTitle) {
  const font = chartFont();
  const muted = token("--text-muted");
  return {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 56, r: 12, t: 24, b: 48 },
    showlegend: false,
    hovermode: "x unified",
    hoverlabel: hoverLabel(),
    xaxis: {
      showgrid: false,
      showspikes: true,
      spikemode: "across",
      spikesnap: "cursor",
      spikecolor: token("--baseline"),
      spikethickness: 1,
      spikedash: "solid",
      showline: true,
      linecolor: token("--baseline"),
      tickangle: 0,
      tickfont: { color: muted, size: 12 },
      fixedrange: true,
    },
    yaxis: {
      title: { text: yTitle, font: { color: muted, size: 12 }, standoff: 8 },
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
}

const config = { displayModeBar: false, responsive: true };

export function renderMonthlySolarChart(months) {
  const font = chartFont();
  const x = months.map(longLabel);
  const peakIdx = months.reduce((best, m, i) => (m.total !== null && (best === -1 || m.total > months[best].total) ? i : best), -1);
  const layout = baseLayout("kWh/m² per month");
  const keep = (_, i) => !narrowScreen.matches || i % 2 === (months.length - 1) % 2;
  layout.xaxis = { ...layout.xaxis, type: "category", tickmode: "array", tickvals: x.filter(keep), ticktext: months.map(tickLabel).filter(keep) };
  layout.bargap = 0.3;
  const trace = {
    type: "bar",
    x,
    y: months.map((m) => m.total),
    marker: { color: token("--series-1"), cornerradius: 4 },
    text: months.map((m, i) => (i === peakIdx ? nf.format(Math.round(m.total)) : "")),
    textposition: "outside",
    textfont: { color: font.color, size: 12 },
    constraintext: "none",
    cliponaxis: false,
    customdata: months.map((m) => (m.meanDaily === null ? "" : ` · ${m.meanDaily.toFixed(1)} per day${m.partial ? ` (${m.days} of ${m.daysInMonth} days)` : ""}`)),
    hovertemplate: "%{y:,.0f} kWh/m²%{customdata}",
  };
  return Plotly.react($("sm-chart"), [trace], layout, config);
}

export function renderMonthlySolarText(months) {
  const withData = months.filter((m) => m.meanDaily !== null);
  const best = withData.reduce((a, m) => (a === null || m.meanDaily > a.meanDaily ? m : a), null);
  const worst = withData.reduce((a, m) => (a === null || m.meanDaily < a.meanDaily ? m : a), null);
  $("sm-summary").textContent = best
    ? `Sunniest month: ${monthName(best.month)} ${best.month.slice(0, 4)} (${kwh(best.meanDaily)} per day) · dullest: ${monthName(worst.month)} ${worst.month.slice(0, 4)} (${kwh(worst.meanDaily)} per day)`
    : "";
  $("sm-note").textContent =
    "Monthly totals add up only days with complete sensor data. † marks a month with missing days (or the month in progress), so its total reads low; the per-day mean is comparable across months. " + SOLAR_NOTE;

  const t = $("sm-table");
  t.replaceChildren();
  const head = t.createTHead().insertRow();
  for (const h of ["Month", "Total (kWh/m²)", "Per day (kWh/m²)", "Days with data"]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = t.createTBody();
  for (const m of months) {
    const row = body.insertRow();
    row.insertCell().textContent = `${monthName(m.month)} ${m.month.slice(0, 4)}`;
    row.insertCell().textContent = m.total === null ? "" : nf.format(Math.round(m.total));
    row.insertCell().textContent = m.meanDaily === null ? "" : m.meanDaily.toFixed(2);
    row.insertCell().textContent = `${m.days} of ${m.daysInMonth}`;
  }
}

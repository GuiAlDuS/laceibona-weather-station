import { $, token, nf, MONTHS, chartFont, hoverLabel, SOLAR_NOTE } from "./common.js";
import { colorFor } from "./line-chart.js";

const PANELS = [
  { id: "an-temp", key: "tempMean", title: "Mean temperature", unit: "°C", digits: 1 },
  { id: "an-eto", key: "etoMean", title: "ETo", unit: "mm per day", digits: 1 },
  { id: "an-kwh", key: "kwhMean", title: "Solar irradiation", unit: "kWh/m² per day", digits: 1 },
];

const windowLabel = (s) => `1 Jan – ${+s.throughDate.slice(8)} ${MONTHS[+s.throughDate.slice(5, 7) - 1]}`;

export function renderAnnualCharts(summary) {
  const font = chartFont();
  const muted = token("--text-muted");
  const years = summary.years.map((y) => y.year);
  const colors = summary.years.map((y) => colorFor(y.year, summary.latestYear));

  return Promise.all(
    PANELS.map((p) => {
      const values = summary.years.map((y) => y[p.key]);
      const trace = {
        type: "bar",
        x: years,
        y: values,
        marker: { color: colors, cornerradius: 4 },
        text: values.map((v) => (v === null ? "" : v.toFixed(p.digits))),
        textposition: "outside",
        textfont: { color: font.color, size: 13 },
        constraintext: "none",
        cliponaxis: false,
        hovertemplate: `%{y:.${p.digits}f} ${p.unit}<extra></extra>`,
      };
      const layout = {
        font,
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        margin: { l: 44, r: 8, t: 24, b: 32 },
        showlegend: false,
        bargap: 0.4,
        hoverlabel: hoverLabel(),
        xaxis: { type: "category", showline: true, linecolor: token("--baseline"), tickfont: { color: muted, size: 12 }, fixedrange: true },
        yaxis: { rangemode: "tozero", gridcolor: token("--grid"), gridwidth: 1, zeroline: true, zerolinecolor: token("--baseline"), tickfont: { color: muted, size: 12 }, fixedrange: true },
      };
      return Plotly.react($(p.id), [trace], layout, { displayModeBar: false, responsive: true });
    }),
  );
}

const sign = (v, digits) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;

export function renderAnnualText(summary) {
  const ys = summary.years;
  const latest = ys[ys.length - 1];
  const prev = ys.length > 1 ? ys[ys.length - 2] : null;

  $("an-summary").textContent = `Each year over the same period, ${windowLabel(summary)}. Bars are the mean per day, so days without data do not bias them.`;

  for (const p of PANELS) {
    const el = $(`${p.id}-delta`);
    el.textContent = prev && latest[p.key] !== null && prev[p.key] !== null ? `${sign(latest[p.key] - prev[p.key], p.digits)} vs ${prev.year}` : "";
    $(`${p.id}-title`).textContent = `${p.title} (${p.unit})`;
  }

  $("an-note").textContent = `Days per year in the comparison: ${ys.map((y) => `${y.year} – ${y.tempDays} with temperature, ${y.etoDays} with ETo, ${y.kwhDays} with solar`).join("; ")}. ${SOLAR_NOTE}`;

  const t = $("an-table");
  t.replaceChildren();
  const head = t.createTHead().insertRow();
  const corner = document.createElement("th");
  corner.textContent = windowLabel(summary);
  head.append(corner);
  for (const y of ys) {
    const th = document.createElement("th");
    th.textContent = y.year;
    head.append(th);
  }
  const f = (v, d) => (v === null ? "" : v.toFixed(d));
  const rows = [
    ["Mean temperature (\u00b0C)", (y) => f(y.tempMean, 1)],
    ["ETo per day (mm)", (y) => f(y.etoMean, 2)],
    ["ETo total (mm)", (y) => nf.format(Math.round(y.etoTotal))],
    ["Solar per day (kWh/m\u00b2)", (y) => f(y.kwhMean, 2)],
    ["Solar total (kWh/m\u00b2)", (y) => nf.format(Math.round(y.kwhTotal))],
  ];
  const body = t.createTBody();
  for (const [label, cell] of rows) {
    const row = body.insertRow();
    row.insertCell().textContent = label;
    for (const y of ys) row.insertCell().textContent = cell(y);
  }
}

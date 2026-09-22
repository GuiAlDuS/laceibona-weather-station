import { token, narrowScreen, chartFont, hoverLabel, MONTHS } from "./common.js";
import { LANG } from "./i18n.js";

// Latest year in the accent color, earlier years in the context gray.
export const colorFor = (year, latest) => (year === latest ? token("--series-1") : token("--series-context"));

// One line per year over a shared Jan-Dec axis. `key` names the value on each point;
// `format` turns the last value into its label text (number only; the axis title carries the unit).
export function renderYearLines({ el, series, key, format, unit = "mm" }) {
  const latest = series.at(-1).year;
  const surface = token("--surface");
  const muted = token("--text-muted");
  const font = chartFont();

  const lines = series.map((y) => ({
    type: "scatter",
    mode: "lines",
    name: y.year,
    x: y.points.map((p) => p.x),
    y: y.points.map((p) => p[key]),
    line: { color: colorFor(y.year, latest), width: 2 },
    hovertemplate: `%{y:,.0f} ${unit}`,
  }));

  const ends = series.map((y) => {
    const last = y.points.at(-1);
    return {
      type: "scatter",
      mode: "markers",
      x: [last.x],
      y: [last[key]],
      marker: { size: 9, color: colorFor(y.year, latest), line: { color: surface, width: 2 } },
      hoverinfo: "skip",
      showlegend: false,
    };
  });

  // Just the number, above the last point; right-aligned when the line ends at the right edge.
  const labels = series.map((y) => {
    const last = y.points.at(-1);
    return {
      x: last.x,
      y: last[key],
      xanchor: last.x >= "2000-12-10" ? "right" : "center",
      yanchor: "bottom",
      yshift: 10,
      showarrow: false,
      text: format(last[key]),
      font,
    };
  });

  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 56, r: 24, t: 28, b: 36 },
    showlegend: false,
    hovermode: "x unified",
    hoverlabel: hoverLabel(),
    xaxis: {
      type: "date",
      range: ["2000-01-01", "2000-12-31"],
      tickangle: 0,
      hoverformat: LANG === "es" ? "%d/%m" : "%b %d",
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
      title: { text: unit, font: { color: muted, size: 12 }, standoff: 8 },
      tickformat: ",d",
      gridcolor: token("--grid"),
      gridwidth: 1,
      zeroline: true,
      zerolinecolor: muted,
      zerolinewidth: 1,
      tickfont: { color: muted, size: 12 },
      fixedrange: true,
    },
    annotations: labels,
  };

  // Plotly's own %b date formatting is always English; the axis ticks are built by hand
  // instead (hoverformat above is already numeric on the Spanish page).
  const monthStep = narrowScreen.matches ? 3 : 1;
  const monthIdx = MONTHS.map((_, i) => i).filter((i) => i % monthStep === 0);
  layout.xaxis.tickmode = "array";
  layout.xaxis.tickvals = monthIdx.map((i) => `2000-${String(i + 1).padStart(2, "0")}-01`);
  layout.xaxis.ticktext = monthIdx.map((i) => MONTHS[i]);

  return Plotly.react(el, [...lines, ...ends], layout, { displayModeBar: false, responsive: true });
}

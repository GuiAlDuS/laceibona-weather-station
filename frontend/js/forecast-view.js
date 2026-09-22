import { $, el, num, tile, token, chartFont, hoverLabel } from "./common.js";
import { t, WEEKDAYS } from "./i18n.js";
import { isRainLikely, isStormHour, contiguousRanges } from "./forecast.js";

// Tempest's `icon` field is a fixed 19-value enum (verified against the API's published schema);
// its `conditions` text is English-only free text, so it is never shown as-is on the Spanish page.
const CONDITION_LABEL = {
  "clear-day": t("Clear", "Despejado"),
  "clear-night": t("Clear", "Despejado"),
  rainy: t("Rain", "Lluvia"),
  "possible-rainy-day": t("Chance of rain", "Probabilidad de lluvia"),
  "possible-rainy-night": t("Chance of rain", "Probabilidad de lluvia"),
  snow: t("Snow", "Nieve"),
  "possible-snow-day": t("Chance of snow", "Probabilidad de nieve"),
  "possible-snow-night": t("Chance of snow", "Probabilidad de nieve"),
  sleet: t("Sleet", "Aguanieve"),
  "possible-sleet-day": t("Chance of sleet", "Probabilidad de aguanieve"),
  "possible-sleet-night": t("Chance of sleet", "Probabilidad de aguanieve"),
  thunderstorm: t("Thunderstorms", "Tormentas"),
  "possibly-thunderstorm-day": t("Chance of thunderstorms", "Probabilidad de tormentas"),
  "possibly-thunderstorm-night": t("Chance of thunderstorms", "Probabilidad de tormentas"),
  windy: t("Windy", "Ventoso"),
  foggy: t("Foggy", "Neblina"),
  cloudy: t("Cloudy", "Nublado"),
  "partly-cloudy-day": t("Partly cloudy", "Parcialmente nublado"),
  "partly-cloudy-night": t("Partly cloudy", "Parcialmente nublado"),
};

export const conditionLabel = (icon) => CONDITION_LABEL[icon] ?? null;

export function dayLabel(date, index) {
  if (index === 0) return t("Today", "Hoy");
  if (index === 1) return t("Tomorrow", "Mañana");
  const d = new Date(Date.parse(date));
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

export function renderForecast(days) {
  const grid = $("fc-body");
  grid.replaceChildren();
  days.forEach((d, i) => {
    const precip = typeof d.precip_probability === "number" ? t(`${d.precip_probability}% rain`, `${d.precip_probability}% de lluvia`) : null;
    const cond = conditionLabel(d.icon);
    grid.append(
      tile(dayLabel(d.date, i), typeof d.temp_high === "number" ? `${num(d.temp_high, 0)}°` : "—", null, [
        typeof d.temp_low === "number" ? t(`Low ${num(d.temp_low, 0)}°`, `Mínima ${num(d.temp_low, 0)}°`) : null,
        [cond, precip].filter(Boolean).join(" — ") || null,
      ]),
    );
  });
}

export function renderForecastUnavailable(message) {
  $("fc-body").replaceChildren(el("p", "muted", message));
}

const hourLabel = (h) => `${String(h).padStart(2, "0")}:00`;
const rangesText = (ranges) => ranges.map((r) => `${hourLabel(r.start)}–${hourLabel((r.end + 1) % 24)}`).join(", ");

export function outlookText(hours) {
  const rain = contiguousRanges(hours, isRainLikely);
  const storm = contiguousRanges(hours, isStormHour);
  if (rain.length === 0 && storm.length === 0) return t("No significant rain expected today.", "No se espera lluvia significativa hoy.");
  const parts = [];
  if (rain.length) parts.push(t(`Rain likely ${rangesText(rain)}`, `Lluvia probable ${rangesText(rain)}`));
  if (storm.length) parts.push(t(`thunderstorms possible ${rangesText(storm)}`, `posibles tormentas ${rangesText(storm)}`));
  return `${parts.join(", ")}.`;
}

// Rain probability by hour (bars, coloured by storm risk) with temperature overlaid, for today only.
export function renderForecastHourlyChart(hours) {
  const font = chartFont();
  const muted = token("--text-muted");
  const x = hours.map((h) => h.hour);
  const rainColor = token("--series-1");
  const stormColor = token("--hot");
  const precip = {
    type: "bar",
    name: t("Rain probability", "Probabilidad de lluvia"),
    x,
    y: hours.map((h) => h.precip_probability),
    marker: { color: hours.map((h) => (isStormHour(h) ? stormColor : rainColor)) },
    hovertemplate: "%{y}%<extra></extra>",
  };
  const temp = {
    type: "scatter",
    mode: "lines",
    name: t("Temperature", "Temperatura"),
    x,
    y: hours.map((h) => h.temp),
    yaxis: "y2",
    line: { color: token("--series-3"), width: 1.5 },
    hovertemplate: "%{y:.1f} °C<extra></extra>",
  };
  // A faint band for night (18:00-06:00), same convention as the weekly rain-intensity chart.
  const nightShapes = [
    { x0: -0.5, x1: 5.5 },
    { x0: 17.5, x1: 23.5 },
  ].map(({ x0, x1 }) => ({ type: "rect", xref: "x", yref: "paper", x0, x1, y0: 0, y1: 1, fillcolor: token("--grid"), opacity: 0.5, line: { width: 0 }, layer: "below" }));

  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 48, r: 48, t: 24, b: 36 },
    showlegend: false,
    shapes: nightShapes,
    hovermode: "x unified",
    hoverlabel: hoverLabel(),
    xaxis: {
      range: [-0.5, 23.5],
      tickmode: "array",
      tickvals: [0, 3, 6, 9, 12, 15, 18, 21],
      ticktext: [0, 3, 6, 9, 12, 15, 18, 21].map(hourLabel),
      tickangle: 0,
      showgrid: false,
      showline: true,
      linecolor: token("--baseline"),
      tickfont: { color: muted, size: 12 },
      fixedrange: true,
    },
    yaxis: { title: { text: "%", font: { color: muted, size: 12 }, standoff: 8 }, range: [0, 100], gridcolor: token("--grid"), gridwidth: 1, zeroline: false, tickfont: { color: muted, size: 12 }, fixedrange: true },
    yaxis2: { title: { text: "°C", font: { color: muted, size: 12 }, standoff: 8 }, overlaying: "y", side: "right", showgrid: false, tickfont: { color: muted, size: 12 }, fixedrange: true },
  };
  return Plotly.react($("fh-chart"), [precip, temp], layout, { displayModeBar: false, responsive: true });
}

export function renderForecastHourlyText(hours) {
  $("fh-summary").textContent = outlookText(hours);

  const legend = $("fh-legend");
  legend.replaceChildren();
  for (const [name, color, cls] of [
    [t("Rain probability", "Probabilidad de lluvia"), token("--series-1"), "rect"],
    [t("Thunderstorm risk", "Riesgo de tormenta"), token("--hot"), "rect"],
    [t("Temperature", "Temperatura"), token("--series-3"), "line"],
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

  $("fh-note").textContent = t(
    "Tempest's hourly forecast model for today, not a measurement. Night (18:00–06:00) is shaded.",
    "Modelo de pronóstico horario de Tempest para hoy, no una medición. La noche (18:00–06:00) está sombreada.",
  );

  const table = $("fh-table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const h of [t("Hour", "Hora"), t("Temp (°C)", "Temp (°C)"), t("Rain chance", "Prob. de lluvia"), t("Conditions", "Condiciones")]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  for (const h of hours) {
    const row = body.insertRow();
    row.insertCell().textContent = hourLabel(h.hour);
    row.insertCell().textContent = typeof h.temp === "number" ? h.temp.toFixed(1) : "";
    row.insertCell().textContent = typeof h.precip_probability === "number" ? `${h.precip_probability}%` : "";
    row.insertCell().textContent = conditionLabel(h.icon) ?? "";
  }
}

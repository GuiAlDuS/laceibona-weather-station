import { $, el, num, tile, token, chartFont, hoverLabel } from "./common.js";
import { t, WEEKDAYS } from "./i18n.js";
import { isRainLikely, isStormHour, contiguousRanges, localStamp } from "./forecast.js";

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

// `days` here never includes today (the hourly chart covers today); index 0 is always tomorrow.
export function dayLabel(date, index) {
  if (index === 0) return t("Tomorrow", "Mañana");
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
      tile(dayLabel(d.date, i), typeof d.temp_high === "number" ? `${num(d.temp_high, 1)}°` : "—", null, [
        typeof d.temp_low === "number" ? t(`Low ${num(d.temp_low, 1)}°`, `Mínima ${num(d.temp_low, 1)}°`) : null,
        [cond, precip].filter(Boolean).join(" — ") || null,
      ]),
    );
  });
}

export function renderForecastUnavailable(message) {
  $("fc-body").replaceChildren(el("p", "muted", message));
}

const hourLabel = (h) => `${String(h).padStart(2, "0")}:00`;
// A range that starts on a later date than the window's first hour is tomorrow's; one that only runs past midnight is tonight's.
const rangesText = (ranges, today) =>
  ranges
    .map((r) => {
      const span = `${hourLabel(r.start)}–${hourLabel((r.end + 1) % 24)}`;
      return r.date > today ? t(`${span} tomorrow`, `${span} mañana`) : span;
    })
    .join(", ");

export function outlookText(hours) {
  const today = hours[0]?.date;
  const rain = contiguousRanges(hours, isRainLikely);
  const storm = contiguousRanges(hours, isStormHour);
  if (rain.length === 0 && storm.length === 0) return t("No significant rain expected in the next 24 hours.", "No se espera lluvia significativa en las próximas 24 horas.");
  const parts = [];
  if (rain.length) parts.push(t(`Rain likely ${rangesText(rain, today)}`, `Lluvia probable ${rangesText(rain, today)}`));
  if (storm.length) parts.push(t(`thunderstorms possible ${rangesText(storm, today)}`, `posibles tormentas ${rangesText(storm, today)}`));
  parts[0] = parts[0][0].toUpperCase() + parts[0].slice(1);
  return `${parts.join(", ")}.`;
}

// Rain probability by hour (bars, coloured by storm risk) with temperature overlaid, for the next 24 hours.
// x is each hour's local start time, so the bar for 14:00-15:00 sits on the 14:00 tick, as on the other hourly charts.
export function renderForecastHourlyChart(hours) {
  const font = chartFont();
  const muted = token("--text-muted");
  const at = (h, offsetH = 0) => localStamp(h.time + offsetH * 3600);
  const x = hours.map((h) => at(h));
  const rainColor = token("--series-1");
  const stormColor = token("--hot");
  const precip = {
    type: "bar",
    name: t("Rain probability", "Probabilidad de lluvia"),
    x,
    y: hours.map((h) => h.precip_probability),
    width: 0.8 * 3_600_000,
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
  // A faint band for night (18:00-06:00), same convention as the weekly rain-intensity chart; one rect per run of night hours.
  const shapes = [];
  for (let i = 0, run = null; i <= hours.length; i++) {
    const isNight = i < hours.length && (hours[i].hour >= 18 || hours[i].hour < 6);
    if (isNight && run === null) run = i;
    if (!isNight && run !== null) {
      shapes.push({ type: "rect", xref: "x", yref: "paper", x0: at(hours[run], -0.5), x1: at(hours[i - 1], 0.5), y0: 0, y1: 1, fillcolor: token("--grid"), opacity: 0.5, line: { width: 0 }, layer: "below" });
      run = null;
    }
  }
  // Midnight: a thin rule between 23:00 and 00:00, labelled with the day it starts.
  const annotations = [];
  const midnight = hours.findIndex((h, i) => i > 0 && h.hour === 0);
  if (midnight > 0) {
    const xm = at(hours[midnight], -0.5);
    shapes.push({ type: "line", xref: "x", yref: "paper", x0: xm, x1: xm, y0: 0, y1: 1, line: { color: token("--baseline"), width: 1, dash: "dot" } });
    annotations.push({ x: xm, xref: "x", y: 1, yref: "paper", yanchor: "bottom", xanchor: "left", xshift: 4, showarrow: false, text: t("Tomorrow", "Mañana"), font: { color: muted, size: 12 } });
  }
  const ticks = hours.filter((h) => h.hour % 3 === 0);

  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 48, r: 48, t: 24, b: 36 },
    showlegend: false,
    shapes,
    annotations,
    hovermode: "x unified",
    hoverlabel: hoverLabel(),
    xaxis: {
      type: "date",
      range: hours.length ? [at(hours[0], -0.5), at(hours.at(-1), 0.5)] : undefined,
      tickmode: "array",
      tickvals: ticks.map((h) => at(h)),
      ticktext: ticks.map((h) => hourLabel(h.hour)),
      hoverformat: "%H:%M",
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
    "Bar height is that hour's rain probability; red marks hours where any rain is expected to come as a thunderstorm, not a separate risk on top of the rain chance. Tempest's hourly forecast model for the next 24 hours, starting with the next full hour; not a measurement. Night (18:00–06:00) is shaded and the dotted line marks midnight.",
    "La altura de la barra es la probabilidad de lluvia de esa hora; el rojo marca las horas en que, de llover, se espera que sea en forma de tormenta, no un riesgo aparte que se suma a la probabilidad de lluvia. Modelo de pronóstico horario de Tempest para las próximas 24 horas, a partir de la próxima hora en punto; no una medición. La noche (18:00–06:00) está sombreada y la línea punteada marca la medianoche.",
  );

  const table = $("fh-table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const h of [t("Day", "Día"), t("Hour", "Hora"), t("Temp (°C)", "Temp (°C)"), t("Rain chance", "Prob. de lluvia"), t("Conditions", "Condiciones")]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  const today = hours[0]?.date;
  for (const h of hours) {
    const row = body.insertRow();
    row.insertCell().textContent = h.date > today ? t("Tomorrow", "Mañana") : t("Today", "Hoy");
    row.insertCell().textContent = hourLabel(h.hour);
    row.insertCell().textContent = typeof h.temp === "number" ? h.temp.toFixed(1) : "";
    row.insertCell().textContent = typeof h.precip_probability === "number" ? `${h.precip_probability}%` : "";
    row.insertCell().textContent = conditionLabel(h.icon) ?? "";
  }
}

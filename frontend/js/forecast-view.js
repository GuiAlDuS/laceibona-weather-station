import { $, el, num, token, chartFont, hoverLabel, stackDomains, panelTitle, PANEL_GAP_PX, perPanel, nowRing } from "./common.js";
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

// One row per day: day, high, low, rain chance and conditions.
export function renderForecast(days) {
  const table = el("table", "fc-table");
  const head = table.createTHead().insertRow();
  for (const h of [t("Day", "Día"), t("High", "Máx."), t("Low", "Mín."), t("Rain", "Lluvia"), t("Conditions", "Condiciones")]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  days.forEach((d, i) => {
    const row = body.insertRow();
    row.insertCell().textContent = dayLabel(d.date, i);
    row.insertCell().textContent = typeof d.temp_high === "number" ? `${num(d.temp_high, 1)}°` : "—";
    row.insertCell().textContent = typeof d.temp_low === "number" ? `${num(d.temp_low, 1)}°` : "—";
    row.insertCell().textContent = typeof d.precip_probability === "number" ? `${d.precip_probability}%` : "—";
    row.insertCell().textContent = conditionLabel(d.icon) ?? "";
  });
  $("fc-body").replaceChildren(table);
}

export function renderForecastUnavailable(message) {
  $("fc-body").replaceChildren(el("p", "muted", message));
}

const hourLabel = (h) => `${String(h).padStart(2, "0")}:00`;
// A range that starts on a later date than the window's first hour is tomorrow's; one that only runs past midnight is tonight's.
// When every hour in the window matches, it reads "all day" rather than a range that ends where it starts ("19:00–19:00").
const rangesText = (hours, predicate) => {
  const today = hours[0]?.date;
  if (hours.every(predicate)) return t("all day", "todo el día");
  return contiguousRanges(hours, predicate)
    .map((r) => {
      const span = `${hourLabel(r.start)}–${hourLabel((r.end + 1) % 24)}`;
      return r.date > today ? t(`${span} tomorrow`, `${span} mañana`) : span;
    })
    .join(", ");
};

export function outlookText(hours) {
  const rain = contiguousRanges(hours, isRainLikely);
  const storm = contiguousRanges(hours, isStormHour);
  if (rain.length === 0 && storm.length === 0) return t("No significant rain expected in the next 24 hours.", "No se espera lluvia significativa en las próximas 24 horas.");
  const parts = [];
  if (rain.length) parts.push(t(`Rain likely ${rangesText(hours, isRainLikely)}`, `Lluvia probable ${rangesText(hours, isRainLikely)}`));
  if (storm.length) parts.push(t(`thunderstorms possible ${rangesText(hours, isStormHour)}`, `posibles tormentas ${rangesText(hours, isStormHour)}`));
  parts[0] = parts[0][0].toUpperCase() + parts[0].slice(1);
  return `${parts.join(", ")}.`;
}

// Two panels over the next 24 hours on one shared time axis: temperature on top, then rain probability by hour (bars,
// coloured by storm risk). Temperature is red and rain blue, as on the observed charts, so storm hours take the
// lightning colour. x is each hour's local start time, so the bar for 14:00-15:00 sits on the 14:00 tick, as on the
// other hourly charts.
const MARGIN = { l: 48, r: 16, t: 24, b: 36 };
const panelNames = () => [t("Temperature (°C)", "Temperatura (°C)"), t("Rain probability (%)", "Probabilidad de lluvia (%)")];

// now: the station's current reading { ts (unix s), temp (°C) }, or null. It is drawn as a ring at its own time on the
// temperature line, so the chart starts from what the station measures now; a dotted segment bridges it to the first
// forecast hour when that hour is still ahead. The x axis reaches back to include it.
export function renderForecastHourlyChart(hours, now = null) {
  const font = chartFont();
  const muted = token("--text-muted");
  const hot = token("--hot");
  const at = (h, offsetH = 0) => localStamp(h.time + offsetH * 3600);
  const x = hours.map((h) => at(h));
  const rainColor = token("--series-1");
  const stormColor = token("--series-7");
  // The axis runs from half an hour before the first hour (or a quarter of an hour before the current reading, if
  // earlier) to half an hour after the last, in unix seconds.
  const x0 = hours.length ? Math.min(hours[0].time - 1800, now ? now.ts - 900 : Infinity) : 0;
  const x1 = hours.length ? hours.at(-1).time + 1800 : 0;
  const xStart = hours.length ? localStamp(x0) : undefined;
  const xEnd = hours.length ? localStamp(x1) : undefined;
  let nowTraces = [];
  let nowLabel = null;
  if (now?.temp != null && hours.length) {
    const next = hours.find((h) => h.time > now.ts && typeof h.temp === "number");
    const join = next && next === hours[0] ? { x: at(next), y: next.temp } : null;
    ({ traces: nowTraces, label: nowLabel } = nowRing(localStamp(now.ts), now.temp, hot, { join, yaxis: "y2", frac: (now.ts - x0) / (x1 - x0) }));
  }
  const temp = {
    type: "scatter",
    mode: "lines",
    x,
    y: hours.map((h) => h.temp),
    yaxis: "y2",
    line: { color: hot, width: 2 },
    hovertemplate: t("temperature %{y:.1f} °C<extra></extra>", "temperatura %{y:.1f} °C<extra></extra>"),
  };
  const precip = {
    type: "bar",
    x,
    y: hours.map((h) => h.precip_probability),
    width: 0.8 * 3_600_000,
    marker: { color: hours.map((h) => (isStormHour(h) ? stormColor : rainColor)) },
    customdata: hours.map((h) => (isStormHour(h) ? t(", thunderstorm", ", tormenta") : "")),
    hovertemplate: t("rain %{y}%%{customdata}<extra></extra>", "lluvia %{y}%%{customdata}<extra></extra>"),
  };
  // A faint band for night (18:00-06:00), same convention as the weekly rain-intensity chart; one rect per run of night hours.
  const shapes = [];
  for (let i = 0, run = null; i <= hours.length; i++) {
    const isNight = i < hours.length && (hours[i].hour >= 18 || hours[i].hour < 6);
    if (isNight && run === null) run = i;
    if (!isNight && run !== null) {
      // A night run at the start also covers the stretch before the first hour where the current reading sits.
      shapes.push({ type: "rect", xref: "x", yref: "paper", x0: run === 0 ? xStart : at(hours[run], -0.5), x1: at(hours[i - 1], 0.5), y0: 0, y1: 1, fillcolor: token("--grid"), opacity: 0.5, line: { width: 0 }, layer: "below" });
      run = null;
    }
  }
  const [tempD, rainD] = stackDomains([1, 1], PANEL_GAP_PX, $("fh-chart").clientHeight - MARGIN.t - MARGIN.b);
  const annotations = panelNames().map((name, i) => panelTitle(name, [tempD, rainD][i][1]));
  if (nowLabel) annotations.push(nowLabel);
  // Midnight: a thin rule between 23:00 and 00:00 in both panels, labelled with the day it starts on the top panel's
  // label row, unless midnight is so early that it would run into the temperature label; then it drops into the panel.
  const midnight = hours.findIndex((h, i) => i > 0 && h.hour === 0);
  if (midnight > 0) {
    const xm = at(hours[midnight], -0.5);
    shapes.push({ type: "line", xref: "x", yref: "paper", x0: xm, x1: xm, y0: 0, y1: 1, line: { color: token("--baseline"), width: 1, dash: "dot" } });
    const early = midnight / hours.length < 0.25;
    annotations.push({ x: xm, xref: "x", y: early ? tempD[0] : 1, yref: "paper", yanchor: "bottom", xanchor: "left", xshift: 4, showarrow: false, text: t("Tomorrow", "Mañana"), font: { color: muted, size: 12 } });
  }
  const ticks = hours.filter((h) => h.hour % 3 === 0);

  const yBase = { gridcolor: token("--grid"), gridwidth: 1, zeroline: false, tickfont: { color: muted, size: 12 }, fixedrange: true };
  const layout = {
    font,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: MARGIN,
    showlegend: false,
    shapes: perPanel(shapes, [tempD, rainD]),
    annotations,
    hovermode: "x unified",
    hoverlabel: hoverLabel(),
    xaxis: {
      type: "date",
      range: hours.length ? [xStart, xEnd] : undefined,
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
    yaxis: { ...yBase, domain: rainD, range: [0, 105], tickvals: [0, 50, 100] },
    yaxis2: { ...yBase, domain: tempD, nticks: 4 },
  };
  return Plotly.react($("fh-chart"), [temp, precip, ...nowTraces], layout, { displayModeBar: false, responsive: true });
}

export function renderForecastHourlyText(hours) {
  $("fh-summary").textContent = outlookText(hours);

  const legend = $("fh-legend");
  legend.replaceChildren();
  for (const [name, color, cls] of [
    [t("Rain probability", "Probabilidad de lluvia"), token("--series-1"), "rect"],
    [t("Thunderstorm risk", "Riesgo de tormenta"), token("--series-7"), "rect"],
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
    "Two panels over the same 24 hours, each with its own scale: temperature on top, rain probability below. Bar height is that hour's rain probability; purple (the lightning colour on the last-24-hours chart) marks hours where any rain is expected to come as a thunderstorm, not a separate risk on top of the rain chance. Tempest's hourly forecast model for the next 24 hours, starting with the next full hour; not a measurement. The ring at the start of the temperature line is the one exception: the station's current measured temperature, so you can see where the forecast starts from. Night (18:00–06:00) is shaded and the dotted line marks midnight.",
    "Dos paneles sobre las mismas 24 horas, cada uno con su propia escala: la temperatura arriba y la probabilidad de lluvia abajo. La altura de la barra es la probabilidad de lluvia de esa hora; el morado (el color de los rayos en el gráfico de las últimas 24 horas) marca las horas en que, de llover, se espera que sea en forma de tormenta, no un riesgo aparte que se suma a la probabilidad de lluvia. Modelo de pronóstico horario de Tempest para las próximas 24 horas, a partir de la próxima hora en punto; no una medición. La única excepción es el círculo al inicio de la línea de temperatura: la temperatura medida ahora en la estación, para ver desde dónde arranca el pronóstico. La noche (18:00–06:00) está sombreada y la línea punteada marca la medianoche.",
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

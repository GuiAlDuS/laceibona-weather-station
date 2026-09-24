import { API_BASE } from "./config.js";
import { initNav } from "./nav.js";
import { $, narrowScreen, wideLayout, setStatus, longDate, weekStart, WEEK_DAYS } from "./common.js";
import { t, TIME_LOCALE } from "./i18n.js";
import { cumulativeByYear } from "./balance.js";
import { monthlyTotals } from "./monthly.js";
import { cumulativeRainByYear, cumulativeLightningByYear } from "./cumulative.js";
import { renderWaterBalanceChart, renderWaterBalanceText } from "./waterbalance-view.js";
import { renderMonthlyChart, renderMonthlyText } from "./monthly-view.js";
import { RAIN, LIGHTNING, renderCumulativeChart, renderCumulativeText } from "./cumulative-view.js";
import { lastRainDays, withLiveToday } from "./rainweek.js";
import { renderRainWeekChart, renderRainWeekText } from "./rainweek-view.js";
import { fineBuckets } from "./rainfine.js";
import { renderRainFineChart, renderRainFineText, initRainFineToggle } from "./rainfine-view.js";
import { renderCurrent, renderCurrentUnavailable } from "./current-view.js";
import { forecastDays, forecastHours } from "./forecast.js";
import { renderForecast, renderForecastUnavailable, renderForecastHourlyChart, renderForecastHourlyText } from "./forecast-view.js";
import { getMonths, monthKeys } from "./obs-data.js";
import { lastDays } from "./tempdaily.js";
import { monthHourMeans } from "./heatmap.js";
import { monthDirectionFrequency } from "./winddir.js";
import { renderWindDirChart, renderWindDirText } from "./winddir-view.js";
import { recentHours } from "./winddaily.js";
import { renderWindDailyChart, renderWindDailyText } from "./winddaily-view.js";
import { monthlyBoxes, yearlyBoxes } from "./tempbox.js";
import { WIND as WIND_BOX, renderTempBoxMonthly, renderTempBoxMonthlyText, renderTempBoxYearly, renderTempBoxYearlyText } from "./tempbox-view.js";
import { VIRIDIS, renderMonthHourChart, renderMonthHourText } from "./heatmap-view.js";
import { renderTempDailyChart, renderTempDailyText } from "./tempdaily-view.js";
import { windRose, sliceWindow, MS_TO_KMH } from "./windrose.js";
import { renderWindRose } from "./windrose-view.js";
import { recentStrikes } from "./lightning24h.js";
import { renderLightningChart, renderLightningText } from "./lightning24h-view.js";
import { annualSolarTotals } from "./solar.js";
import { renderSolarYearChart, renderSolarYearText } from "./solar-view.js";

const NO_USABLE_DATA = () => new Error(t("no usable data yet", "todavía no hay datos utilizables"));
const couldNotLoad = (msg) => t(`Could not load data (${msg}). `, `No se pudieron cargar los datos (${msg}). `);

let currentDoc = null;

// Re-renders the rain-week chart with today's row overlaid from `currentDoc`, once both are loaded.
function refreshRainWeekLive() {
  if (!rainWeek) return;
  const rows = withLiveToday(rainWeek, currentDoc);
  renderRainWeekText(rows);
  renderRainWeekChart(rows);
}

async function loadCurrent() {
  $("cc-body").classList.add("reloading");
  try {
    const res = await fetch(`${API_BASE}/api/current`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    if (doc.available === false) {
      renderCurrentUnavailable(t("Live conditions will appear once the station data feed is running.", "Las condiciones en vivo aparecerán en cuanto el flujo de datos de la estación esté funcionando."));
    } else {
      currentDoc = doc;
      renderCurrent(doc, Date.now());
      refreshRainWeekLive();
    }
  } catch (err) {
    console.error(err);
    if (!currentDoc) renderCurrentUnavailable(t(`Could not load current conditions (${err.message}).`, `No se pudieron cargar las condiciones actuales (${err.message}).`));
  } finally {
    $("cc-body").classList.remove("reloading");
  }
}

// Ages advance between fetches, so re-render from the last document without refetching.
setInterval(() => currentDoc && renderCurrent(currentDoc, Date.now()), 30_000);
setInterval(loadCurrent, 60_000);

let forecast = null;
let forecastHourly = null;

async function loadForecast() {
  $("fc-body").classList.add("reloading");
  $("fh-frame").classList.add("reloading");
  if (!forecastHourly) setStatus("fh-status", t("Loading…", "Cargando…"));
  try {
    const res = await fetch(`${API_BASE}/api/forecast`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    if (doc.available === false) {
      const msg = t("The forecast will appear once the station data feed is running.", "El pronóstico aparecerá en cuanto el flujo de datos de la estación esté funcionando.");
      renderForecastUnavailable(msg);
      if (!forecastHourly) setStatus("fh-status", msg);
    } else {
      forecast = forecastDays(doc);
      if (forecast.length === 0) throw NO_USABLE_DATA();
      renderForecast(forecast.slice(1, 6)); // the 5 days after today; today is covered by the 24-hour chart

      forecastHourly = forecastHours(doc);
      if (forecastHourly.length === 0) throw NO_USABLE_DATA();
      renderForecastHourlyText(forecastHourly);
      await renderForecastHourlyChart(forecastHourly);
      setStatus("fh-status", "");
    }
  } catch (err) {
    console.error(err);
    if (!forecast) renderForecastUnavailable(couldNotLoad(err.message));
    if (!forecastHourly) setStatus("fh-status", couldNotLoad(err.message), loadForecast);
  } finally {
    $("fc-body").classList.remove("reloading");
    $("fh-frame").classList.remove("reloading");
  }
}
setInterval(loadForecast, 600_000);

let balance = null;
let months = null;
let rain = null;
let lightning = null;
let rainWeek = null;

const FRAMES = ["wb-frame", "mo-frame", "rn-frame", "lt-frame", "rw-frame"];
const STATUSES = ["wb-status", "mo-status", "rn-status", "lt-status", "rw-status"];

async function load() {
  for (const id of FRAMES) $(id).classList.add("reloading");
  if (!balance) for (const id of STATUSES) setStatus(id, t("Loading…", "Cargando…"));
  try {
    const res = await fetch(`${API_BASE}/api/daily`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    balance = cumulativeByYear(doc.days);
    months = monthlyTotals(doc.days);
    rain = cumulativeRainByYear(doc.days);
    lightning = cumulativeLightningByYear(doc.days);
    rainWeek = lastRainDays(doc.days);
    if (balance.length === 0 || months.length === 0 || rain.length === 0 || lightning.length === 0 || rainWeek.length === 0) throw NO_USABLE_DATA();
    const rainWeekRows = withLiveToday(rainWeek, currentDoc);
    renderWaterBalanceText(balance);
    renderMonthlyText(months);
    renderCumulativeText(RAIN, rain);
    renderCumulativeText(LIGHTNING, lightning);
    renderRainWeekText(rainWeekRows);
    await Promise.all([
      renderWaterBalanceChart(balance),
      renderMonthlyChart(months),
      renderCumulativeChart(RAIN, rain),
      renderCumulativeChart(LIGHTNING, lightning),
      renderRainWeekChart(rainWeekRows),
    ]);
    for (const id of STATUSES) setStatus(id, "");
  } catch (err) {
    console.error(err);
    if (!balance) for (const id of STATUSES) setStatus(id, couldNotLoad(err.message), load);
  } finally {
    for (const id of FRAMES) $(id).classList.remove("reloading");
  }
}

let rose = null;
let roseDoc = null;
let windowHours = 24;

let strikes24h = null;

async function loadWind() {
  $("wr-frame").classList.add("reloading");
  $("lg-frame").classList.add("reloading");
  if (!rose) setStatus("wr-status", t("Loading…", "Cargando…"));
  if (!strikes24h) setStatus("lg-status", t("Loading…", "Cargando…"));
  try {
    const res = await fetch(`${API_BASE}/api/wind24h`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    roseDoc = await res.json();
    if (roseDoc.available === false) throw new Error(t("no wind data yet", "todavía no hay datos de viento"));
    // Lightning rides on the same 24h document; a document from before the fetcher added it just reads as none.
    strikes24h = recentStrikes(roseDoc);
    drawLightning();
    setStatus("lg-status", "");
    updateRose();
    if (rose.hours === 0) throw NO_USABLE_DATA();
    drawWind();
    setStatus("wr-status", "");
  } catch (err) {
    console.error(err);
    if (!rose) setStatus("wr-status", couldNotLoad(err.message), loadWind);
    if (!strikes24h) setStatus("lg-status", couldNotLoad(err.message), loadWind);
  } finally {
    $("wr-frame").classList.remove("reloading");
    $("lg-frame").classList.remove("reloading");
  }
}

function drawLightning() {
  if (!strikes24h) return;
  renderLightningText(strikes24h, fineBucketsData);
  renderLightningChart(strikes24h, fineBucketsData);
}

// Recomputes `rose` from the already-fetched 24h document for the selected window; no re-fetch needed.
function updateRose() {
  rose = windRose([sliceWindow(roseDoc, windowHours)]);
}

function windPeriodText(time, date) {
  return t(`the ${windowHours} hours to ${time} on ${date}`, `las ${windowHours} horas hasta las ${time} del ${date}`);
}

function drawWind() {
  if (!rose) return;
  const to = new Date(roseDoc.to);
  const time = to.toLocaleTimeString(TIME_LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" });
  const date = longDate(new Date(to - 6 * 3600_000).toISOString().slice(0, 10));
  renderWindRose(rose, windPeriodText(time, date));
}

// Wires the window-length buttons once; cheap to call again.
function initWindRoseToggle() {
  const group = $("wr-window");
  if (!group || group.dataset.wired) return;
  group.dataset.wired = "true";
  for (const btn of group.querySelectorAll("button")) {
    btn.addEventListener("click", () => {
      const hours = Number(btn.dataset.hours);
      if (hours === windowHours) return;
      windowHours = hours;
      for (const b of group.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b === btn));
      if (roseDoc) {
        updateRose();
        drawWind();
      }
    });
  }
}

let fineBucketsData = null;

async function loadRainFine() {
  $("rf-frame").classList.add("reloading");
  if (!fineBucketsData) setStatus("rf-status", t("Loading…", "Cargando…"));
  try {
    const res = await fetch(`${API_BASE}/api/fine7d`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    if (doc.available === false) throw new Error(t("no data yet", "todavía no hay datos"));
    fineBucketsData = fineBuckets(doc);
    if (fineBucketsData.every((b) => b.rate === null && b.p === null && b.solar === null)) throw NO_USABLE_DATA();
    drawRainFine();
    drawLightning(); // its rain bars come from this same document
    setStatus("rf-status", "");
    $("rf-solar-toggle").disabled = false;
    $("rf-rh-toggle").disabled = false;
  } catch (err) {
    console.error(err);
    if (!fineBucketsData) setStatus("rf-status", couldNotLoad(err.message), loadRainFine);
  } finally {
    $("rf-frame").classList.remove("reloading");
  }
}

// The chart and its summary cover the shared week window (weekStart), not the document's rolling 168 hours.
function drawRainFine() {
  if (!fineBucketsData) return;
  const first = weekStart();
  const week = fineBucketsData.filter((b) => b.date >= first);
  renderRainFineText(week);
  renderRainFineChart(week, first);
}

// Charts built from the monthly `obs:` documents. Each is [id prefix, draw(docs)]; one failure does not stop the others.
const TEMP_HEAT = { prefix: "th", unit: "°C", decimals: 1, colorToken: "--hot", high: t("Warmest", "Más cálido"), low: t("Coolest", "Más fresco"), what: t("Average temperature", "Temperatura media") };
const WIND_HEAT = { prefix: "wh", unit: "km/h", decimals: 1, ramp: VIRIDIS, high: t("Windiest", "Más ventoso"), low: t("Calmest", "Más calmado"), what: t("Average wind speed", "Velocidad media del viento") };
const obsState = {};
const last13 = (docs) => docs.filter((d) => d.month >= monthKeys(13)[0]);
const OBS_CHARTS = [
  ["td", (docs, live) => {
    const days = lastDays(docs, 7, live?.hourly);
    if (days.length === 0) throw NO_USABLE_DATA();
    obsState.td = days;
  }, () => {
    renderTempDailyText(obsState.td);
    return renderTempDailyChart(obsState.td);
  }],
  ["th", (docs) => {
    obsState.th = monthHourMeans(last13(docs), "t");
    if (obsState.th.months.length === 0) throw NO_USABLE_DATA();
  }, () => {
    renderMonthHourText(TEMP_HEAT, obsState.th);
    return renderMonthHourChart(TEMP_HEAT, obsState.th);
  }],
  ["wh", (docs) => {
    obsState.wh = monthHourMeans(last13(docs), "ws", MS_TO_KMH);
    if (obsState.wh.months.length === 0) throw NO_USABLE_DATA();
  }, () => {
    renderMonthHourText(WIND_HEAT, obsState.wh);
    return renderMonthHourChart(WIND_HEAT, obsState.wh);
  }],
  ["wd", (docs) => {
    obsState.wd = monthDirectionFrequency(last13(docs));
    if (obsState.wd.months.length === 0) throw NO_USABLE_DATA();
  }, () => {
    renderWindDirText(obsState.wd);
    return renderWindDirChart(obsState.wd);
  }],
  ["ds", (docs) => {
    // A day more than the window, then cut to it, so a feed that is a day behind still fills the same week.
    const first = weekStart();
    obsState.ds = recentHours(docs, WEEK_DAYS + 1).filter((h) => h.date >= first);
    if (obsState.ds.length === 0) throw NO_USABLE_DATA();
  }, () => {
    renderWindDailyText(obsState.ds);
    return renderWindDailyChart(obsState.ds, weekStart());
  }],
  ["bm", (docs) => {
    obsState.bm = monthlyBoxes(last13(docs));
    if (obsState.bm.length === 0) throw NO_USABLE_DATA();
  }, () => {
    renderTempBoxMonthlyText(obsState.bm);
    return renderTempBoxMonthly(obsState.bm);
  }],
  ["wk", (docs) => {
    obsState.wk = monthlyBoxes(last13(docs), "ws", MS_TO_KMH);
    if (obsState.wk.length === 0) throw NO_USABLE_DATA();
  }, () => {
    renderTempBoxMonthlyText(obsState.wk, WIND_BOX);
    return renderTempBoxMonthly(obsState.wk, WIND_BOX);
  }],
  ["by", (docs) => {
    obsState.by = yearlyBoxes(docs);
    if (obsState.by.length === 0) throw NO_USABLE_DATA();
  }, () => {
    renderTempBoxYearlyText(obsState.by);
    return renderTempBoxYearly(obsState.by);
  }],
  ["sy", (docs) => {
    obsState.sy = annualSolarTotals(docs);
    if (obsState.sy.length === 0) throw NO_USABLE_DATA();
  }, () => {
    renderSolarYearText(obsState.sy);
    return renderSolarYearChart(obsState.sy);
  }],
];

async function loadObsCharts() {
  const ids = OBS_CHARTS.map(([p]) => p);
  for (const p of ids) $(`${p}-frame`).classList.add("reloading");
  let docs;
  let live = null; // the last 24 h feed; the charts still work without it, just up to an hour behind
  try {
    [docs, live] = await Promise.all([getMonths(24), fetch(`${API_BASE}/api/wind24h`).then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
  } catch (err) {
    console.error(err);
    for (const p of ids) if (!obsState[p]) setStatus(`${p}-status`, couldNotLoad(err.message), loadObsCharts);
    for (const p of ids) $(`${p}-frame`).classList.remove("reloading");
    return;
  }
  for (const [p, prepare, draw] of OBS_CHARTS) {
    try {
      prepare(docs, live);
      await draw();
      setStatus(`${p}-status`, "");
    } catch (err) {
      console.error(err);
      if (!obsState[p]) setStatus(`${p}-status`, couldNotLoad(err.message), loadObsCharts);
    } finally {
      $(`${p}-frame`).classList.remove("reloading");
    }
  }
}

function drawObsCharts() {
  for (const [p, , draw] of OBS_CHARTS) if (obsState[p]) draw();
}

setInterval(load, 300_000);
setInterval(loadWind, 300_000);
setInterval(loadObsCharts, 300_000);
setInterval(loadRainFine, 300_000);

function redraw() {
  drawWind();
  drawLightning();
  drawObsCharts();
  drawRainFine();
  if (forecastHourly) renderForecastHourlyChart(forecastHourly);
  if (!balance) return;
  renderWaterBalanceText(balance);
  renderMonthlyText(months);
  renderCumulativeText(RAIN, rain);
  renderCumulativeText(LIGHTNING, lightning);
  renderRainWeekText(rainWeek);
  renderWaterBalanceChart(balance);
  renderMonthlyChart(months);
  renderCumulativeChart(RAIN, rain);
  renderCumulativeChart(LIGHTNING, lightning);
  renderRainWeekChart(rainWeek);
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
narrowScreen.addEventListener("change", redraw);
wideLayout.addEventListener("change", redraw);

initNav();
initRainFineToggle();
initWindRoseToggle();
loadCurrent();
loadForecast();
load();
loadWind();
loadObsCharts();
loadRainFine();

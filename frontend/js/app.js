import { API_BASE } from "./config.js";
import { initNav } from "./nav.js";
import { $, narrowScreen, setStatus, longDate } from "./common.js";
import { cumulativeByYear } from "./balance.js";
import { monthlyTotals } from "./monthly.js";
import { cumulativeRainByYear, cumulativeLightningByYear } from "./cumulative.js";
import { renderWaterBalanceChart, renderWaterBalanceText } from "./waterbalance-view.js";
import { renderMonthlyChart, renderMonthlyText } from "./monthly-view.js";
import { RAIN, LIGHTNING, renderCumulativeChart, renderCumulativeText } from "./cumulative-view.js";
import { lastRainDays } from "./rainweek.js";
import { renderRainWeekChart, renderRainWeekText } from "./rainweek-view.js";
import { fineBuckets } from "./rainfine.js";
import { renderRainFineChart, renderRainFineText, initRainFineToggle } from "./rainfine-view.js";
import { renderCurrent, renderCurrentUnavailable } from "./current-view.js";
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
import { windRose, MS_TO_KMH } from "./windrose.js";
import { renderWindRose } from "./windrose-view.js";

let currentDoc = null;

async function loadCurrent() {
  $("cc-body").classList.add("reloading");
  try {
    const res = await fetch(`${API_BASE}/api/current`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    if (doc.available === false) {
      renderCurrentUnavailable("Live conditions will appear once the station data feed is running.");
    } else {
      currentDoc = doc;
      renderCurrent(doc, Date.now());
    }
  } catch (err) {
    console.error(err);
    if (!currentDoc) renderCurrentUnavailable(`Could not load current conditions (${err.message}).`);
  } finally {
    $("cc-body").classList.remove("reloading");
  }
}

// Ages advance between fetches, so re-render from the last document without refetching.
setInterval(() => currentDoc && renderCurrent(currentDoc, Date.now()), 30_000);
setInterval(loadCurrent, 60_000);

let balance = null;
let months = null;
let rain = null;
let lightning = null;
let rainWeek = null;

const FRAMES = ["wb-frame", "mo-frame", "rn-frame", "lt-frame", "rw-frame"];
const STATUSES = ["wb-status", "mo-status", "rn-status", "lt-status", "rw-status"];

async function load() {
  for (const id of FRAMES) $(id).classList.add("reloading");
  if (!balance) for (const id of STATUSES) setStatus(id, "Loading…");
  try {
    const res = await fetch(`${API_BASE}/api/daily`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    balance = cumulativeByYear(doc.days);
    months = monthlyTotals(doc.days);
    rain = cumulativeRainByYear(doc.days);
    lightning = cumulativeLightningByYear(doc.days);
    rainWeek = lastRainDays(doc.days);
    if (balance.length === 0 || months.length === 0 || rain.length === 0 || lightning.length === 0 || rainWeek.length === 0) throw new Error("no usable data yet");
    renderWaterBalanceText(balance);
    renderMonthlyText(months);
    renderCumulativeText(RAIN, rain);
    renderCumulativeText(LIGHTNING, lightning);
    renderRainWeekText(rainWeek);
    await Promise.all([
      renderWaterBalanceChart(balance),
      renderMonthlyChart(months),
      renderCumulativeChart(RAIN, rain),
      renderCumulativeChart(LIGHTNING, lightning),
      renderRainWeekChart(rainWeek),
    ]);
    for (const id of STATUSES) setStatus(id, "");
  } catch (err) {
    console.error(err);
    if (!balance) for (const id of STATUSES) setStatus(id, `Could not load data (${err.message}). `, load);
  } finally {
    for (const id of FRAMES) $(id).classList.remove("reloading");
  }
}

let rose = null;
let roseDoc = null;

async function loadWind() {
  $("wr-frame").classList.add("reloading");
  if (!rose) setStatus("wr-status", "Loading…");
  try {
    const res = await fetch(`${API_BASE}/api/wind24h`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    roseDoc = await res.json();
    if (roseDoc.available === false) throw new Error("no wind data yet");
    rose = windRose([roseDoc]);
    if (rose.hours === 0) throw new Error("no usable data yet");
    drawWind();
    setStatus("wr-status", "");
  } catch (err) {
    console.error(err);
    if (!rose) setStatus("wr-status", `Could not load data (${err.message}). `, loadWind);
  } finally {
    $("wr-frame").classList.remove("reloading");
  }
}

function drawWind() {
  if (!rose) return;
  const to = new Date(roseDoc.to);
  renderWindRose(rose, `the 24 hours to ${to.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" })} on ${longDate(new Date(to - 6 * 3600_000).toISOString().slice(0, 10))}`);
}

let fineBucketsData = null;

async function loadRainFine() {
  $("rf-frame").classList.add("reloading");
  if (!fineBucketsData) setStatus("rf-status", "Loading…");
  try {
    const res = await fetch(`${API_BASE}/api/fine7d`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    if (doc.available === false) throw new Error("no data yet");
    fineBucketsData = fineBuckets(doc);
    if (fineBucketsData.every((b) => b.rate === null && b.p === null && b.solar === null)) throw new Error("no usable data yet");
    drawRainFine();
    setStatus("rf-status", "");
    $("rf-solar-toggle").disabled = false;
  } catch (err) {
    console.error(err);
    if (!fineBucketsData) setStatus("rf-status", `Could not load data (${err.message}). `, loadRainFine);
  } finally {
    $("rf-frame").classList.remove("reloading");
  }
}

function drawRainFine() {
  if (!fineBucketsData) return;
  renderRainFineText(fineBucketsData);
  renderRainFineChart(fineBucketsData);
}

// Charts built from the monthly `obs:` documents. Each is [id prefix, draw(docs)]; one failure does not stop the others.
const TEMP_HEAT = { prefix: "th", unit: "°C", decimals: 1, colorToken: "--hot", high: "Warmest", low: "Coolest", what: "Average temperature" };
const WIND_HEAT = { prefix: "wh", unit: "km/h", decimals: 1, ramp: VIRIDIS, high: "Windiest", low: "Calmest", what: "Average wind speed" };
const obsState = {};
const last13 = (docs) => docs.filter((d) => d.month >= monthKeys(13)[0]);
const OBS_CHARTS = [
  ["td", (docs, live) => {
    const days = lastDays(docs, 7, live?.hourly);
    if (days.length === 0) throw new Error("no usable data yet");
    obsState.td = days;
  }, () => {
    renderTempDailyText(obsState.td);
    return renderTempDailyChart(obsState.td);
  }],
  ["th", (docs) => {
    obsState.th = monthHourMeans(last13(docs), "t");
    if (obsState.th.months.length === 0) throw new Error("no usable data yet");
  }, () => {
    renderMonthHourText(TEMP_HEAT, obsState.th);
    return renderMonthHourChart(TEMP_HEAT, obsState.th);
  }],
  ["wh", (docs) => {
    obsState.wh = monthHourMeans(last13(docs), "ws", MS_TO_KMH);
    if (obsState.wh.months.length === 0) throw new Error("no usable data yet");
  }, () => {
    renderMonthHourText(WIND_HEAT, obsState.wh);
    return renderMonthHourChart(WIND_HEAT, obsState.wh);
  }],
  ["wd", (docs) => {
    obsState.wd = monthDirectionFrequency(last13(docs));
    if (obsState.wd.months.length === 0) throw new Error("no usable data yet");
  }, () => {
    renderWindDirText(obsState.wd);
    return renderWindDirChart(obsState.wd);
  }],
  ["ds", (docs) => {
    obsState.ds = recentHours(docs, 7);
    if (obsState.ds.length === 0) throw new Error("no usable data yet");
  }, () => {
    renderWindDailyText(obsState.ds);
    return renderWindDailyChart(obsState.ds);
  }],
  ["bm", (docs) => {
    obsState.bm = monthlyBoxes(last13(docs));
    if (obsState.bm.length === 0) throw new Error("no usable data yet");
  }, () => {
    renderTempBoxMonthlyText(obsState.bm);
    return renderTempBoxMonthly(obsState.bm);
  }],
  ["wk", (docs) => {
    obsState.wk = monthlyBoxes(last13(docs), "ws", MS_TO_KMH);
    if (obsState.wk.length === 0) throw new Error("no usable data yet");
  }, () => {
    renderTempBoxMonthlyText(obsState.wk, WIND_BOX);
    return renderTempBoxMonthly(obsState.wk, WIND_BOX);
  }],
  ["by", (docs) => {
    obsState.by = yearlyBoxes(docs);
    if (obsState.by.length === 0) throw new Error("no usable data yet");
  }, () => {
    renderTempBoxYearlyText(obsState.by);
    return renderTempBoxYearly(obsState.by);
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
    for (const p of ids) if (!obsState[p]) setStatus(`${p}-status`, `Could not load data (${err.message}). `, loadObsCharts);
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
      if (!obsState[p]) setStatus(`${p}-status`, `Could not load data (${err.message}). `, loadObsCharts);
    } finally {
      $(`${p}-frame`).classList.remove("reloading");
    }
  }
}

function drawObsCharts() {
  for (const [p, , draw] of OBS_CHARTS) if (obsState[p]) draw();
}

setInterval(loadWind, 300_000);
setInterval(loadObsCharts, 300_000);
setInterval(loadRainFine, 300_000);

function redraw() {
  drawWind();
  drawObsCharts();
  drawRainFine();
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

initNav();
initRainFineToggle();
loadCurrent();
load();
loadWind();
loadObsCharts();
loadRainFine();

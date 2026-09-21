import { API_BASE } from "./config.js";
import { $, narrowScreen, setStatus } from "./common.js";
import { cumulativeByYear } from "./balance.js";
import { monthlyTotals } from "./monthly.js";
import { cumulativeRainByYear, cumulativeLightningByYear } from "./cumulative.js";
import { renderWaterBalanceChart, renderWaterBalanceText } from "./waterbalance-view.js";
import { renderMonthlyChart, renderMonthlyText } from "./monthly-view.js";
import { RAIN, LIGHTNING, renderCumulativeChart, renderCumulativeText } from "./cumulative-view.js";
import { renderCurrent, renderCurrentUnavailable } from "./current-view.js";
import { monthlyIrradiation } from "./solar.js";
import { sameWindowSummary } from "./annual.js";
import { renderMonthlySolarChart, renderMonthlySolarText } from "./solar-view.js";
import { renderAnnualCharts, renderAnnualText } from "./annual-view.js";

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
let solarMonthly = null;
let annual = null;

const FRAMES = ["wb-frame", "mo-frame", "rn-frame", "lt-frame", "sm-frame", "an-frame"];
const STATUSES = ["wb-status", "mo-status", "rn-status", "lt-status", "sm-status", "an-status"];

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
    solarMonthly = monthlyIrradiation(doc.days);
    annual = sameWindowSummary(doc.days);
    if (balance.length === 0 || months.length === 0 || rain.length === 0 || lightning.length === 0 || !annual) throw new Error("no usable data yet");
    renderWaterBalanceText(balance);
    renderMonthlyText(months);
    renderCumulativeText(RAIN, rain);
    renderCumulativeText(LIGHTNING, lightning);
    renderMonthlySolarText(solarMonthly);
    renderAnnualText(annual);
    await Promise.all([
      renderWaterBalanceChart(balance),
      renderMonthlyChart(months),
      renderCumulativeChart(RAIN, rain),
      renderCumulativeChart(LIGHTNING, lightning),
      renderMonthlySolarChart(solarMonthly),
      renderAnnualCharts(annual),
    ]);
    for (const id of STATUSES) setStatus(id, "");
  } catch (err) {
    console.error(err);
    if (!balance) for (const id of STATUSES) setStatus(id, `Could not load data (${err.message}). `, load);
  } finally {
    for (const id of FRAMES) $(id).classList.remove("reloading");
  }
}

function redraw() {
  if (!balance) return;
  renderWaterBalanceText(balance);
  renderMonthlyText(months);
  renderCumulativeText(RAIN, rain);
  renderCumulativeText(LIGHTNING, lightning);
  renderMonthlySolarText(solarMonthly);
  renderAnnualText(annual);
  renderWaterBalanceChart(balance);
  renderMonthlyChart(months);
  renderCumulativeChart(RAIN, rain);
  renderCumulativeChart(LIGHTNING, lightning);
  renderMonthlySolarChart(solarMonthly);
  renderAnnualCharts(annual);
}
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
narrowScreen.addEventListener("change", redraw);

loadCurrent();
load();

// Correction for the light sensor's too-high readings. From 25 Aug to 30 Sep 2026 (whole local days) the station's
// light sensor read about 1.35x too high at every light level; Tempest recalibrated it overnight into 1 Oct, but the
// readings already stored stay as they were. Solar radiation and UV come from that one sensor, so both are divided
// by the same factor, and ETo for those days is worked out again from the corrected solar radiation.
// The API keeps serving the readings as the station reported them: the correction is applied here, as each document
// is loaded. How the dates and the factor were found: sensor-correction.html and data_review/. Pure functions; no DOM.
import { eto, dayOfYear, STATION } from "./eto.js";

export const SENSOR_FIX = { from: "2026-08-25", to: "2026-09-30", factor: 1.35 };

const LOCAL_OFFSET_S = -6 * 3600;
export const sensorFixed = (date) => date >= SENSOR_FIX.from && date <= SENSOR_FIX.to;
const scaled = (v, digits) => (typeof v === "number" ? Math.round((v / SENSOR_FIX.factor) * 10 ** digits) / 10 ** digits : v);

// A columnar document (slot i starts at doc.start + i * stepSec) with the named columns divided on the affected days.
// digits: { column: decimals kept }.
function fixSlots(doc, stepSec, digits) {
  const cols = { ...doc.cols };
  for (const [name, d] of Object.entries(digits)) {
    if (!cols[name]) continue;
    cols[name] = cols[name].map((v, i) => (sensorFixed(new Date((doc.start + i * stepSec + LOCAL_OFFSET_S) * 1000).toISOString().slice(0, 10)) ? scaled(v, d) : v));
  }
  return { ...doc, cols };
}

// An `obs:YYYY-MM` document (hourly): solar radiation.
export const fixObsMonth = (doc) => fixSlots(doc, 3600, { solar: 0 });

// A `uv:YYYY-MM` document (10-minute UV index over each day's daylight hours, `perDay` slots a day).
export function fixUvMonth(doc) {
  const date = (i) => new Date((doc.start + Math.floor(i / doc.perDay) * 86400 + LOCAL_OFFSET_S) * 1000).toISOString().slice(0, 10);
  return { ...doc, uv: doc.uv.map((v, i) => (sensorFixed(date(i)) ? scaled(v, 2) : v)) };
}

// The `fine7d` document (10-minute): solar radiation.
export const fixFine = (doc) => fixSlots(doc, doc.step, { solar: 0 });

// The `daily:all` document: the day's light readings, and ETo recomputed from them (as fetcher/src/daily.js does
// from the stats row; a day that had no ETo still has none).
export function fixDaily(doc) {
  return {
    ...doc,
    days: doc.days.map((d) => {
      if (!sensorFixed(d.date)) return d;
      const day = { ...d, lux_avg: scaled(d.lux_avg, 0), uv_avg: scaled(d.uv_avg, 2), uv_max: scaled(d.uv_max, 2), solar_avg: scaled(d.solar_avg, 1), solar_max: scaled(d.solar_max, 0) };
      if (d.eto === null) return day;
      const et = eto({ tmax: d.t_max, tmin: d.t_min, rhmax: d.rh_max, rhmin: d.rh_min, u: d.wind_avg, pressureHPa: d.p_avg, rsMJ: (day.solar_avg * 86400) / 1_000_000, doy: dayOfYear(d.date), ...STATION });
      return { ...day, eto: Math.round(et * 100) / 100 };
    }),
  };
}

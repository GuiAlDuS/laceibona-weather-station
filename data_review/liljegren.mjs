// Outdoor wet-bulb globe temperature (WBGT, °C) estimated from ordinary weather readings with the Liljegren et al.
// (2008) model, as in its reference code (Argonne National Laboratory, wbgt.c): the heat balance of a 50 mm black
// globe and of a wetted wick is solved by iteration, then WBGT = 0.7 natural wet bulb + 0.2 globe + 0.1 air.
// Kept here for the comparison in wbgt_compare.mjs: the dashboard uses the formula fitted to Tempest's own WBGT
// (frontend/js/wbgt.js), which reads about 3 °C lower in full sun at this station. Pure functions.
import { STATION } from "../frontend/js/eto.js";

const SOLAR_CONST = 1367;
const STEFANB = 5.6696e-8;
const CP = 1003.5;
const M_AIR = 28.97;
const M_H2O = 18.015;
const RATIO = (CP * M_AIR) / M_H2O;
const R_AIR = 8314.34 / M_AIR;
const PR = CP / (CP + 1.25 * R_AIR);
const WICK = { emis: 0.95, albedo: 0.4, d: 0.007, l: 0.0254 };
const GLOBE = { emis: 0.95, albedo: 0.05, d: 0.0508 };
const SFC = { emis: 0.999, albedo: 0.45 };
const CZA_MIN = 0.00873;
const NORMSOLAR_MAX = 0.85;
const MIN_SPEED = 0.13;
const CONVERGENCE = 0.02;
const MAX_ITER = 50;

// Saturation vapour pressure over water (hPa) at tk kelvin, and the dew point (K) of a vapour pressure.
const esat = (tk) => 1.004 * 6.1121 * Math.exp((17.502 * (tk - 273.15)) / (tk - 32.18));
function dewPoint(e) {
  const z = Math.log(e / (6.1121 * 1.004));
  return 273.15 + (240.97 * z) / (17.502 - z);
}
const emisAtm = (tk, rh) => 0.575 * Math.pow(rh * esat(tk), 0.143);
const viscosity = (tk) => (2.6693e-6 * Math.sqrt(M_AIR * tk)) / (3.617 ** 2 * (((tk / 97 - 2.9) / 0.4) * -0.034 + 1.048));
const thermalCond = (tk) => (CP + 1.25 * R_AIR) * viscosity(tk);
const diffusivity = (tk, p) => (3.64e-4 * Math.pow(tk / Math.sqrt(132 * 647.3), 2.334) * Math.cbrt(36.4 * 218) * Math.pow(132 * 647.3, 5 / 12) * Math.sqrt(1 / M_AIR + 1 / M_H2O) * 1e-4) / (p / 1013.25);
const evap = (tk) => ((313.15 - tk) / 30) * -71100 + 2.4073e6;
const density = (tk, p) => (p * 100) / (R_AIR * tk);
const reynolds = (d, tk, p, speed) => (Math.max(speed, MIN_SPEED) * density(tk, p) * d) / viscosity(tk);
const hSphere = (d, tk, p, speed) => ((2 + 0.6 * Math.sqrt(reynolds(d, tk, p, speed)) * Math.pow(PR, 0.3333)) * thermalCond(tk)) / d;
const hCylinder = (d, tk, p, speed) => (0.281 * Math.pow(reynolds(d, tk, p, speed), 0.6) * Math.pow(PR, 0.44) * thermalCond(tk)) / d;

// Measured solar radiation capped at 85% of what reaches the top of the atmosphere, and the share of it that
// comes straight from the sun rather than from the sky.
function solarParts(solar, cza, distFactor) {
  const toa = cza < CZA_MIN ? 0 : SOLAR_CONST * cza * distFactor;
  if (toa <= 0 || !(solar > 0)) return { solar: 0, fdir: 0 };
  const norm = Math.min(solar / toa, NORMSOLAR_MAX);
  return { solar: norm * toa, fdir: Math.min(0.9, Math.max(0, Math.exp(3 - 1.34 * norm - 1.65 / norm))) };
}

// Repeats `step` (previous estimate -> new estimate, kelvin) until it settles; null if it never does.
function solve(start, step) {
  let prev = start;
  for (let i = 0; i < MAX_ITER; i++) {
    const next = step(prev);
    if (!Number.isFinite(next)) return null;
    if (Math.abs(next - prev) < CONVERGENCE) return next;
    prev = 0.9 * prev + 0.1 * next;
  }
  return null;
}

// tempC [°C], rh [%], windMs [m/s at 2 m], solar [W/m²], pressureHPa, cza and distFactor from sunPosition.
// Returns { wbgt, globe, wetBulb } in °C, or null when a reading is missing or the balance does not settle.
export function wbgtLiljegren({ tempC, rh, windMs, solar, pressureHPa, cza, distFactor = 1 }) {
  if (![tempC, rh, windMs, solar, pressureHPa, cza].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const ta = tempC + 273.15;
  const frac = Math.min(1, Math.max(0.01, rh / 100));
  const p = pressureHPa;
  const sun = solarParts(solar, cza, distFactor);
  const z = Math.max(cza, CZA_MIN); // only used multiplied by the direct share, which is 0 with the sun below that
  const sky = 0.5 * (emisAtm(ta, frac) * ta ** 4 + SFC.emis * ta ** 4);

  const globe = solve(ta, (tg) => {
    const h = hSphere(GLOBE.d, 0.5 * (tg + ta), p, windMs);
    return Math.pow(sky - (h / (STEFANB * GLOBE.emis)) * (tg - ta) + (sun.solar / (2 * STEFANB * GLOBE.emis)) * (1 - GLOBE.albedo) * (sun.fdir * (1 / (2 * z) - 1) + 1 + SFC.albedo), 0.25);
  });

  const eair = frac * esat(ta);
  const tanSza = Math.tan(Math.acos(z));
  const wetBulb = solve(dewPoint(eair), (tw) => {
    const tref = 0.5 * (tw + ta);
    const h = hCylinder(WICK.d, tref, p, windMs);
    const fatm = STEFANB * WICK.emis * (sky - tw ** 4) + (1 - WICK.albedo) * sun.solar * ((1 - sun.fdir) * (1 + (0.25 * WICK.d) / WICK.l) + sun.fdir * (tanSza / Math.PI + (0.25 * WICK.d) / WICK.l) + SFC.albedo);
    const ewick = esat(tw);
    const sc = viscosity(tref) / (density(tref, p) * diffusivity(tref, p));
    return ta - (evap(tref) / RATIO) * ((ewick - eair) / (p - ewick)) * Math.pow(PR / sc, 0.56) + fatm / h;
  });

  if (globe === null || wetBulb === null) return null;
  const c = (k) => k - 273.15;
  return { wbgt: 0.7 * c(wetBulb) + 0.2 * c(globe) + 0.1 * tempC, globe: c(globe), wetBulb: c(wetBulb) };
}

// The station's wind, measured at STATION.windHeightM, brought down to the 2 m the model expects (the same
// logarithmic profile as the ETo calculation, eto.js).
export const windAt2m = (u) => u * (4.87 / Math.log(67.8 * STATION.windHeightM - 5.42));

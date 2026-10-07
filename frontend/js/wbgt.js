// Wet-bulb globe temperature (WBGT, °C) from ordinary weather readings, worked out the way Tempest does, and the
// sun's position it needs. The station has no globe thermometer, so this is an estimate. Pure functions; no DOM.
const CZA_MIN = 0.00873;

// Cosine of the sun's zenith angle and the Earth-Sun distance factor (1/r²) at a unix time, from the day of year
// and the equation of time (good to a fraction of a degree, far inside the model's own error).
export function sunPosition(tsSec, latDeg, lonDeg) {
  const d = new Date(tsSec * 1000);
  const doy = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400_000;
  const hoursUtc = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const g = ((2 * Math.PI) / 365) * (doy - 1 + (hoursUtc - 12) / 24);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const hourAngle = (((hoursUtc * 60 + eqTime + 4 * lonDeg) / 4 - 180) * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  return {
    cza: Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle),
    distFactor: 1.00011 + 0.034221 * Math.cos(g) + 0.00128 * Math.sin(g) + 0.000719 * Math.cos(2 * g) + 0.000077 * Math.sin(2 * g),
  };
}

// Tempest reports a WBGT with its current readings but keeps no history of it, and does not publish the formula.
// From the station's own record of that figure (data_review/README.md) it is 0.7 wet bulb + 0.2 globe + 0.1 air,
// with the ordinary (psychrometric) wet bulb and a globe temperature of the form of Dimiceli, Piltz and Amburn
// (2011): at night it equals 0.7 wet bulb + 0.3 air to the rounding. The four constants below were fitted to ten
// days of readings and reproduce Tempest's figure to about 0.05 °C on them, and its hourly means over 20 months to
// about 0.2 °C. Liljegren's model, the usual reference method, runs about 3 °C hotter in full sun here
// (data_review/wbgt_compare.mjs has both and the comparison).
const TEMPEST = { h: 0.536, directShare: 0.024, minWindMs: 0.45, windExp: 0.567 };
const SIGMA = 5.67e-8;
const vapour = (tc) => 6.112 * Math.exp((17.67 * tc) / (tc + 243.5));

// Psychrometric wet-bulb temperature (°C) from air temperature, relative humidity (%) and pressure (hPa).
export function wetBulb(tempC, rh, pressureHPa) {
  const e = (rh / 100) * vapour(tempC);
  let lo = -40;
  let hi = tempC;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (vapour(mid) - pressureHPa * (tempC - mid) * 0.00066 * (1 + 0.00115 * mid) > e) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

// tempC [°C], rh [%], windMs [m/s, as the station measures it], solar [W/m²], pressureHPa, cza from sunPosition.
// Returns { wbgt, globe, wetBulb } in °C, or null when a reading is missing.
export function wbgtTempest({ tempC, rh, windMs, solar, pressureHPa, cza }) {
  if (![tempC, rh, windMs, solar, pressureHPa, cza].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const wb = wetBulb(tempC, rh, pressureHPa);
  let globe = tempC;
  if (solar > 0 && cza > 0) {
    const emis = 0.575 * Math.pow((rh / 100) * vapour(tempC), 1 / 7);
    const b = solar * (TEMPEST.directShare / (4 * SIGMA * Math.max(cza, CZA_MIN)) + (1.2 / SIGMA) * (1 - TEMPEST.directShare)) + emis * tempC ** 4;
    const c = (TEMPEST.h * Math.pow(Math.max(windMs, TEMPEST.minWindMs) * 3600, TEMPEST.windExp)) / 5.3865e-8;
    globe = (b + c * tempC + 7680000) / (c + 256000);
  }
  return { wbgt: 0.7 * wb + 0.2 * globe + 0.1 * tempC, globe, wetBulb: wb };
}

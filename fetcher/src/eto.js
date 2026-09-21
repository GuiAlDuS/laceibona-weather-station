// FAO-56 Penman-Monteith daily reference evapotranspiration (mm/day). See PROJECT.md §4.2.

export const STATION = { latDeg: 9.98, elevationM: 88, windHeightM: 4 };

const e0 = (T) => 0.6108 * Math.exp((17.27 * T) / (T + 237.3));

export function dayOfYear(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400_000);
}

// Inputs: tmax/tmin [°C], rhmax/rhmin [%], u [m/s] measured at windHeightM,
// rsMJ [MJ/m²/day], doy, latDeg, elevationM. pressureHPa is optional; without it (or
// when implausible for this elevation) pressure is estimated from elevation.
export function eto({ tmax, tmin, rhmax, rhmin, u, rsMJ, doy, latDeg, elevationM, windHeightM, pressureHPa }) {
  const tmean = (tmax + tmin) / 2;
  const u2 = Math.max(u * (4.87 / Math.log(67.8 * windHeightM - 5.42)), 0.5);

  const Pest = 101.3 * Math.pow((293 - 0.0065 * elevationM) / 293, 5.26);
  const P = Math.abs(pressureHPa / 10 - Pest) <= 3 ? pressureHPa / 10 : Pest;
  const gamma = 0.000665 * P;

  const es = (e0(tmax) + e0(tmin)) / 2;
  const ea = (e0(tmin) * (rhmax / 100) + e0(tmax) * (rhmin / 100)) / 2;
  const delta = (4098 * e0(tmean)) / Math.pow(tmean + 237.3, 2);

  const lat = (latDeg * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos(((2 * Math.PI) / 365) * doy);
  const decl = 0.409 * Math.sin(((2 * Math.PI) / 365) * doy - 1.39);
  const ws = Math.acos(-Math.tan(lat) * Math.tan(decl));
  const Ra =
    ((24 * 60) / Math.PI) * 0.082 * dr *
    (ws * Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.sin(ws));
  const Rso = (0.75 + 2e-5 * elevationM) * Ra;

  const Rns = 0.77 * rsMJ;
  const sigma = 4.903e-9;
  const Rnl =
    sigma *
    ((Math.pow(tmax + 273.16, 4) + Math.pow(tmin + 273.16, 4)) / 2) *
    (0.34 - 0.14 * Math.sqrt(Math.max(ea, 0))) *
    (1.35 * Math.min(rsMJ / Rso, 1) - 0.35);
  const Rn = Rns - Rnl;

  const et =
    (0.408 * delta * Rn + gamma * (900 / (tmean + 273)) * u2 * (es - ea)) /
    (delta + gamma * (1 + 0.34 * u2));
  return Math.max(et, 0);
}

// Tempest stats_day row (see PROJECT.md §2 for the field map) -> ETo, or null if the row is unusable.
export function etoFromStatsRow(row, { minSamples = 1200 } = {}) {
  const [date, pressure, , , , tmax, tmin, , rhmax, rhmin, , , , , , , solarAvg, , , u] = row;
  const samples = row[26];
  if ([tmax, tmin, rhmax, rhmin, solarAvg, u].some((v) => v === null || v === undefined)) return null;
  if (!(samples >= minSamples)) return null;
  return eto({
    tmax, tmin, rhmax, rhmin, u, pressureHPa: pressure,
    rsMJ: (solarAvg * 86400) / 1_000_000,
    doy: dayOfYear(date),
    ...STATION,
  });
}

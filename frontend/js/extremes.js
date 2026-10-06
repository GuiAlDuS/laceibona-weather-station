// The station's records since it started: the "Extremes" tables. Readings with an hour, and the day and month totals,
// come from the hourly `obs:` documents; ETo, minutes of rain and the lowest humidity come from `daily:all`.
// The wind records skip days with a sensor fault (see WIND_FAULT_GUST).
// Pure functions; no DOM.
const LOCAL_OFFSET_S = -6 * 3600;
const MIN_MINUTES = 1200; // 1-minute readings a day needs to count as a whole day, as in fetcher/src/daily.js
export const WET_DAY_MM = 1; // a day with at least this much rain is a wet day
// Sunshine and ETo records count from this day: the light sensor's first days (22 and 23 Dec 2024 peaked above
// 1,400 W/m², against the 1,000-1,100 of every later clear day) are not trusted.
export const SUN_FROM = "2025-01-01";
// A day with a gust this strong (m/s; 80 km/h) is taken as a sensor fault and left out of the wind records. During and
// for up to 15 hours after some heavy storms the sensor reads 80-160 km/h for hours on end, which also lifts the day's
// mean. Six days so far, all in 2025: 10-11 Jul, 17 Aug, 23-24 Aug and 26 Sep. The highest gust on any other day is
// 68 km/h. A real storm with a gust this strong would be skipped too: the owner reports such days, to be reviewed
// one by one (PROJECT.md).
export const WIND_FAULT_GUST = 80 / 3.6;
export const MS_TO_KMH = 3.6;

const num = (v) => typeof v === "number" && Number.isFinite(v);
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
const nextDay = (iso) => new Date(Date.parse(iso) + 86400_000).toISOString().slice(0, 10);

// One entry per local day (UTC-6) that has readings, oldest first: the day's totals and where its extremes fell.
// `covered` marks days with enough readings to stand for the full day; `whole` ones also have all 24 hours.
export function dayStats(docs) {
  const days = new Map();
  for (const doc of docs) {
    const c = doc.cols;
    for (let i = 0; i < c.n.length; i++) {
      if (!c.n[i]) continue;
      const local = new Date((doc.start + i * 3600 + LOCAL_OFFSET_S) * 1000).toISOString();
      const date = local.slice(0, 10);
      const hour = +local.slice(11, 13);
      if (!days.has(date)) days.set(date, { date, hours: 0, minutes: 0, tmax: null, tmaxHour: null, tmin: null, tminHour: null, rain: null, wetHour: null, wetHourMm: null, solarWh: 0, solarHours: 0, ltn: 0, rhLowHour: null, rhLow: null, windHours: 0, windSum: 0, gust: null, gustHour: null });
      const d = days.get(date);
      d.hours++;
      d.minutes += c.n[i];
      if (num(c.tmax[i]) && (d.tmax === null || c.tmax[i] > d.tmax)) [d.tmax, d.tmaxHour] = [c.tmax[i], hour];
      if (num(c.tmin[i]) && (d.tmin === null || c.tmin[i] < d.tmin)) [d.tmin, d.tminHour] = [c.tmin[i], hour];
      if (num(c.rain[i])) {
        d.rain = (d.rain ?? 0) + c.rain[i];
        if (d.wetHourMm === null || c.rain[i] > d.wetHourMm) [d.wetHourMm, d.wetHour] = [c.rain[i], hour];
      }
      if (num(c.solar[i])) {
        d.solarWh += c.solar[i]; // a 1 h mean in W/m² is that hour's Wh/m²
        d.solarHours++;
      }
      if (num(c.ltn[i])) d.ltn += c.ltn[i];
      if (num(c.rh[i]) && (d.rhLow === null || c.rh[i] < d.rhLow)) [d.rhLow, d.rhLowHour] = [c.rh[i], hour];
      if (num(c.ws[i])) {
        d.windSum += c.ws[i];
        d.windHours++;
      }
      if (num(c.gust[i]) && (d.gust === null || c.gust[i] > d.gust)) [d.gust, d.gustHour] = [c.gust[i], hour];
    }
  }
  return [...days.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ ...d, rain: d.rain === null ? null : round(d.rain, 2), covered: d.minutes >= MIN_MINUTES, whole: d.hours === 24 && d.minutes >= MIN_MINUTES }));
}

// The item with the highest score (the lowest with sign -1), as { item, value }; the earliest wins a tie, and items
// without a numeric score are skipped. null when none has one.
function best(items, score, sign = 1) {
  let top = null;
  for (const item of items) {
    const value = score(item);
    if (num(value) && (top === null || sign * value > sign * top.value)) top = { item, value };
  }
  return top;
}

// The longest runs of consecutive wet days and of dry days, each as { days, from, to, noData } or null. A day is wet
// with WET_DAY_MM or more, whatever its coverage, and dry when it is a covered day below that. A day we can't tell
// (missing, or mostly missing) ends a wet run but not a dry one: between two dry days it is taken as dry and counted,
// with `noData` saying how many of the run's days were such. A dry run never starts or ends on one.
export function longestSpells(stats) {
  const out = { wet: null, dry: null };
  if (stats.length === 0) return out;
  const byDate = new Map(stats.map((d) => [d.date, d]));
  let run = null;
  let pending = 0; // days without data since the dry run's last known day
  for (let date = stats[0].date; date <= stats.at(-1).date; date = nextDay(date)) {
    const d = byDate.get(date);
    const kind = d && num(d.rain) && d.rain >= WET_DAY_MM ? "wet" : d && d.covered && num(d.rain) ? "dry" : null;
    if (kind === null) {
      if (run?.kind === "dry") pending++;
      else run = null;
      continue;
    }
    if (run && run.kind === kind) run = { ...run, to: date, days: run.days + 1 + pending, noData: run.noData + pending };
    else run = { kind, from: date, to: date, days: 1, noData: 0 };
    pending = 0;
    if (out[kind] === null || run.days > out[kind].days) out[kind] = { days: run.days, from: run.from, to: run.to, noData: run.noData };
  }
  return out;
}

// docs: the `obs:YYYY-MM` documents of the whole record; days: `daily:all`'s days. Each record is null when there
// is nothing to build it from. Temperatures in °C, rain in mm, irradiation in kWh/m², hours as the local hour (0-23)
// the reading fell in.
export function extremes(docs, days) {
  const stats = dayStats(docs);
  const whole = stats.filter((d) => d.whole);
  const pick = (hit, fields) => (hit === null ? null : { value: hit.value, date: hit.item.date, ...fields?.(hit.item) });
  const range = (d) => (num(d.tmax) && num(d.tmin) ? round(d.tmax - d.tmin, 1) : null);
  const fromTo = (d) => ({ tmin: d.tmin, tmax: d.tmax });

  const months = new Map();
  for (const d of stats) if (num(d.rain)) months.set(d.date.slice(0, 7), (months.get(d.date.slice(0, 7)) ?? 0) + d.rain);
  const wetMonth = best(months, ([, mm]) => mm);

  const spells = longestSpells(stats);
  const byDate = new Map(stats.map((d) => [d.date, d]));
  const windDays = stats.filter((d) => d.gust !== null && d.gust < WIND_FAULT_GUST);
  const sunny = whole.filter((d) => d.solarHours === 24 && d.date >= SUN_FROM);
  // ETo needs all 24 hours as well: the day's mean solar radiation runs high when the missing hours were at night.
  const etoDays = days.filter((d) => d.complete && d.date >= SUN_FROM && byDate.get(d.date)?.whole);

  return {
    from: stats[0]?.date ?? null,
    to: stats.at(-1)?.date ?? null,
    temperature: {
      highest: pick(best(stats, (d) => d.tmax), (d) => ({ hour: d.tmaxHour })),
      lowest: pick(best(stats, (d) => d.tmin, -1), (d) => ({ hour: d.tminHour })),
      widestRange: pick(best(whole, range), fromTo),
      narrowestRange: pick(best(whole, range, -1), fromTo),
      warmestNight: pick(best(whole, (d) => d.tmin)),
      coolestDay: pick(best(whole, (d) => d.tmax, -1)),
    },
    rain: {
      wettestDay: pick(best(stats, (d) => d.rain)),
      wettestHour: pick(best(stats, (d) => d.wetHourMm), (d) => ({ hour: d.wetHour })),
      wettestMonth: wetMonth === null ? null : { value: wetMonth.value, month: wetMonth.item[0] },
      longestRain: pick(best(days, (d) => d.rain_min)),
      wetSpell: spells.wet,
      drySpell: spells.dry,
    },
    sunAir: {
      mostSun: pick(best(sunny, (d) => d.solarWh / 1000)),
      leastSun: pick(best(sunny, (d) => d.solarWh / 1000, -1)),
      highestEto: pick(best(etoDays, (d) => d.eto)),
      // The value is the lowest 1-minute reading of the day; the hour is the one with the lowest mean that day.
      lowestHumidity: pick(best(days, (d) => d.rh_min, -1), (d) => ({ hour: byDate.get(d.date)?.rhLowHour ?? null })),
      mostLightning: pick(best(stats, (d) => d.ltn || null)),
    },
    wind: {
      // km/h, on days without a sensor fault: the mean of a whole day's 24 hourly mean speeds, and the highest gust.
      windiestDay: pick(best(windDays.filter((d) => d.whole && d.windHours === 24), (d) => (d.windSum / 24) * MS_TO_KMH)),
      strongestGust: pick(best(windDays, (d) => d.gust * MS_TO_KMH), (d) => ({ hour: d.gustHour })),
    },
  };
}

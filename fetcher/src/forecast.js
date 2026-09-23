// Builds the `forecast` KV document from the /better_forecast response. Unlike obs_st/stats_day,
// this endpoint returns named JSON fields, not positional arrays, so there is no index-shift risk here.
// Field names per Tempest's published schema (day_start_local, air_temp_high/low, precip_probability, ...).

const LOCAL_OFFSET_S = -6 * 3600; // verified against real data: day_start_local lands at 06:00 UTC, i.e. UTC-6

const num = (v) => (typeof v === "number" ? v : null);
const str = (v) => (typeof v === "string" ? v : null);
const localDateFromEpoch = (tsSec) => new Date((tsSec + LOCAL_OFFSET_S) * 1000).toISOString().slice(0, 10);
const localHourFromEpoch = (tsSec) => new Date((tsSec + LOCAL_OFFSET_S) * 1000).getUTCHours();

function dayRecord(d) {
  return {
    day_start_local: num(d?.day_start_local), // unix seconds; timezone convention verified against real data
    conditions: str(d?.conditions),
    icon: str(d?.icon),
    temp_high: num(d?.air_temp_high),
    temp_low: num(d?.air_temp_low),
    precip_probability: num(d?.precip_probability),
    precip_type: str(d?.precip_type),
  };
}

function hourRecord(h) {
  return {
    time: num(h?.time),
    hour: typeof h?.time === "number" ? localHourFromEpoch(h.time) : null,
    conditions: str(h?.conditions),
    icon: str(h?.icon),
    temp: num(h?.air_temperature),
    precip_probability: num(h?.precip_probability),
    precip_type: str(h?.precip_type),
  };
}

// `days`: how many days beyond today to keep (today is daily[0]). `hours` is today's hourly forecast only
// (filtered by local calendar date, same convention as day_start_local), oldest hour first. `next_hours` is a
// rolling window from the current hour on, oldest first; it holds `nextHours` + 2 so the page can still show a
// full 24 after dropping hours that ended while this document sat in KV (refreshed every 30 minutes).
export function buildForecast(body, { days = 6, nextHours = 24, now = new Date() } = {}) {
  const daily = Array.isArray(body?.forecast?.daily) ? body.forecast.daily : [];
  const hourly = Array.isArray(body?.forecast?.hourly) ? body.forecast.hourly : [];
  const hourStart = Math.floor(now.getTime() / 3_600_000) * 3600;
  const today = typeof daily[0]?.day_start_local === "number" ? localDateFromEpoch(daily[0].day_start_local) : null;
  return {
    generated_at: now.toISOString(),
    days: daily.slice(0, days + 1).map(dayRecord),
    hours: today ? hourly.filter((h) => typeof h?.time === "number" && localDateFromEpoch(h.time) === today).map(hourRecord) : [],
    next_hours: hourly
      .filter((h) => typeof h?.time === "number" && h.time >= hourStart)
      .sort((a, b) => a.time - b.time)
      .slice(0, nextHours + 2)
      .map(hourRecord),
  };
}

import { buildDaily } from "./daily.js";
import { buildCurrent, localMidnightSec } from "./current.js";
import { buildWind24h } from "./wind.js";
import { aggregateHours, mergeHours, lastFilledHour, monthKeyLocal } from "./hourly.js";
import { aggregateFine, mergeFine, lastFilledBucket, windowEnd } from "./fine.js";
import { handleRequest } from "./api.js";

const TEMPEST_BASE = "https://swd.weatherflow.com/swd/rest";

async function tempestGet(env, path) {
  const res = await fetch(`${TEMPEST_BASE}${path}`, { headers: { Authorization: `Bearer ${env.TEMPEST_TOKEN}` } });
  if (!res.ok) {
    throw new Error(`${path.split("?")[0]} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = await res.json();
  if (body?.status?.status_code !== 0) {
    throw new Error(`${path.split("?")[0]} API error: ${JSON.stringify(body?.status)}`);
  }
  return body;
}

async function refreshDailyStats(env) {
  const body = await tempestGet(env, `/stats/station/${env.STATION_ID}`);
  // Failures throw before this point, so a bad fetch never overwrites good data.
  const doc = buildDaily(body);
  await env.WEATHER_DATA.put("daily:all", JSON.stringify(doc));
  return doc;
}

async function refreshCurrent(env) {
  const now = Date.now();
  const start = localMidnightSec(now);
  const body = await tempestGet(env, `/observations/device/${env.DEVICE_ID}?time_start=${start}&time_end=${Math.floor(now / 1000)}`);
  const doc = buildCurrent(body.obs ?? [], now);
  await env.WEATHER_DATA.put("current", JSON.stringify(doc));
  return doc;
}

async function refreshWind(env) {
  const now = Date.now();
  const body = await tempestGet(env, `/observations/device/${env.DEVICE_ID}?time_start=${Math.floor(now / 1000) - 86400}&time_end=${Math.floor(now / 1000)}`);
  const doc = buildWind24h(body.obs ?? [], now);
  await env.WEATHER_DATA.put("wind24h", JSON.stringify(doc));
  return doc;
}

// Appends the finished hours to the monthly `obs:` documents. Runs in the first tick of each hour. It starts
// after the last hour already stored (at most 36 h back, and 6 h back when there is nothing to go on), so a
// missed tick heals itself on the next one.
async function refreshObs(env, scheduledMs = Date.now()) {
  const hourStart = Math.floor(scheduledMs / 3600_000) * 3600;
  const prevKey = monthKeyLocal(hourStart - 3600);
  const existing = await env.WEATHER_DATA.get(`obs:${prevKey}`, "json");
  const last = existing ? lastFilledHour(existing) : null;
  const from = last === null ? hourStart - 6 * 3600 : Math.min(Math.max(last + 3600, hourStart - 36 * 3600), hourStart - 3600);
  const body = await tempestGet(env, `/observations/device/${env.DEVICE_ID}?time_start=${from}&time_end=${hourStart - 1}`);
  const hours = aggregateHours(body.obs ?? []);
  const keys = [...new Set([...hours.keys()].map(monthKeyLocal))];
  for (const key of keys) {
    const doc = key === prevKey ? existing : await env.WEATHER_DATA.get(`obs:${key}`, "json");
    await env.WEATHER_DATA.put(`obs:${key}`, JSON.stringify(mergeHours(doc, hours, key)));
  }
  return keys;
}

// Refreshes the 10-minute `fine7d` window. Runs in the first tick of each 10 minutes. It re-reads from the newest
// stored bucket (so a minute that arrived late corrects it), at most 24 h back, and 6 h back when nothing is stored.
async function refreshFine(env, scheduledMs = Date.now()) {
  const end = windowEnd(scheduledMs / 1000);
  const existing = await env.WEATHER_DATA.get("fine7d", "json");
  const last = existing ? lastFilledBucket(existing) : null;
  const from = last === null ? end - 6 * 3600 : Math.max(last, end - 86400);
  const body = await tempestGet(env, `/observations/device/${env.DEVICE_ID}?time_start=${from}&time_end=${end - 1}`);
  const doc = mergeFine(existing, aggregateFine(body.obs ?? []), end);
  await env.WEATHER_DATA.put("fine7d", JSON.stringify(doc));
  return doc;
}

export default {
  fetch: handleRequest,

  async scheduled(controller, env, ctx) {
    // One 5-minute cron drives everything: `current` and `wind24h` every run, `obs:` once an hour, `fine7d` every 10 minutes, and `daily:all` once a day at 07:00 UTC (01:00 local).
    const t = new Date(controller.scheduledTime);
    const jobs = [refreshCurrent, refreshWind];
    if (t.getUTCMinutes() < 5) jobs.push(refreshObs);
    if (t.getUTCMinutes() % 10 < 5) jobs.push(refreshFine);
    if (t.getUTCHours() === 7 && t.getUTCMinutes() < 5) jobs.push(refreshDailyStats);
    for (const job of jobs) {
      ctx.waitUntil(
        job(env, t.getTime()).catch(async (err) => {
          console.error(`${job.name} failed:`, err.message);
          // Only failures are recorded (successes are visible as fresh data), so this costs no writes normally.
          await env.WEATHER_DATA.put("status:last_error", JSON.stringify({ job: job.name, at: new Date().toISOString(), error: String(err.message).slice(0, 500) }));
          throw err;
        }),
      );
    }
  },
};

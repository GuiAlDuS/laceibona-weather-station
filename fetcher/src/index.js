import { buildDaily } from "./daily.js";
import { buildCurrent, localMidnightSec } from "./current.js";
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

export default {
  fetch: handleRequest,

  async scheduled(controller, env, ctx) {
    // One 5-minute cron drives everything: `current` every run, and `daily:all` once a day at 07:00 UTC (01:00 local).
    const t = new Date(controller.scheduledTime);
    const jobs = [refreshCurrent];
    if (t.getUTCHours() === 7 && t.getUTCMinutes() < 5) jobs.push(refreshDailyStats);
    for (const job of jobs) {
      ctx.waitUntil(
        job(env).catch(async (err) => {
          console.error(`${job.name} failed:`, err.message);
          // Only failures are recorded (successes are visible as fresh data), so this costs no writes normally.
          await env.WEATHER_DATA.put("status:last_error", JSON.stringify({ job: job.name, at: new Date().toISOString(), error: String(err.message).slice(0, 500) }));
          throw err;
        }),
      );
    }
  },
};

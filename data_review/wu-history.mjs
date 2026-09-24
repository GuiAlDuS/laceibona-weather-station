// Downloads Weather Underground PWS history (every observation of each day) for our station and its neighbours,
// to compare solar radiation and UV between stations (the light-sensor anomaly from about 25 Aug 2026, PROJECT.md).
//
//   cd data_review && node --env-file=../fetcher/.dev.vars wu-history.mjs [--from 2026-06-01] [--to YYYY-MM-DD] [--stations IESPAR102,IESPAR72,IPUNTA186]
//
// Needs WU_API_KEY (a PWS owner's key from wunderground.com, Member Settings > API Keys; kept in fetcher/.dev.vars,
// which git ignores). Each station-day is cached in data/wu/<station>/<date>.json (also git-ignored: other owners'
// data), so an interrupted run resumes and a re-run only fetches new days.
// The API allows 30 calls a minute and 1,500 a day; calls here are spaced 2.1 s apart.
import fs from "node:fs";
import path from "node:path";
import { daysBetween } from "../fetcher/scripts/backfill.mjs";

const BASE = "https://api.weather.com/v2/pws/history/all";
const OUT_DIR = new URL("./data/wu/", import.meta.url).pathname;
const STATIONS = ["IESPAR102", "IESPAR72", "IPUNTA186"]; // ours (Tempest), Esparza downtown (Tempest), seaside (Davis VP2 Plus)
const GAP_MS = 2100;
const DAILY_LIMIT = 1500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) args[argv[i].slice(2)] = argv[++i];
  return args;
}

// One station-day. The API answers 204 (no body) for a day with no data; that is cached as an empty list too, so it
// is not asked again.
async function fetchDay(station, date, key) {
  const url = `${BASE}?stationId=${station}&format=json&units=m&numericPrecision=decimal&date=${date.replaceAll("-", "")}&apiKey=${key}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.status === 204) return [];
    if (res.ok) return (await res.json()).observations ?? [];
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(attempt * 15_000);
      continue;
    }
    throw new Error(`${station} ${date}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

// Keeps only what the comparison needs, per observation: time and the interval's solar and UV (high and average).
const compact = (obs) =>
  obs.map((o) => ({
    epoch: o.epoch,
    local: o.obsTimeLocal,
    solarHigh: o.solarRadiationHigh ?? null,
    uvHigh: o.uvHigh ?? null,
    tempAvg: o.metric?.tempAvg ?? null,
  }));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const key = process.env.WU_API_KEY;
  if (!key) throw new Error("WU_API_KEY is not set (keep it in fetcher/.dev.vars and run with --env-file=../fetcher/.dev.vars)");
  const yesterday = new Date(Date.now() - 6 * 3600_000 - 86400_000).toISOString().slice(0, 10);
  const from = args.from ?? "2026-06-01";
  const to = args.to ?? yesterday;
  const stations = args.stations ? args.stations.split(",") : STATIONS;

  let calls = 0;
  for (const station of stations) {
    const dir = path.join(OUT_DIR, station);
    fs.mkdirSync(dir, { recursive: true });
    let fetched = 0;
    let empty = 0;
    for (const date of daysBetween(from, to)) {
      const file = path.join(dir, `${date}.json`);
      if (fs.existsSync(file)) continue;
      if (calls >= DAILY_LIMIT - 10) throw new Error(`stopping near the API's daily limit after ${calls} calls; re-run tomorrow to resume`);
      const obs = compact(await fetchDay(station, date, key));
      fs.writeFileSync(file, JSON.stringify(obs));
      calls++;
      fetched++;
      if (obs.length === 0) empty++;
      await sleep(GAP_MS);
    }
    console.log(`${station}: fetched ${fetched} day(s), ${empty} with no data`);
  }
  console.log(`${calls} API call(s). Cache: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

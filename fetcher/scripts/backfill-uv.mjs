// One-off back-fill of the monthly `uv:YYYY-MM` documents (10-minute UV index means, src/uv.js) from raw 1-minute
// Tempest data. After this the Worker's daily job keeps them current.
//
//   node --env-file=.dev.vars scripts/backfill-uv.mjs [--from 2024-12-21] [--to YYYY-MM-DD]
//
// Each local day (UTC-6) is fetched once and cached in .backfill/uv-days/, so an interrupted run resumes.
// Output: .backfill/uv-bulk.json; publish it with:
//   npx wrangler kv bulk put --binding WEATHER_DATA --remote --preview false .backfill/uv-bulk.json
import fs from "node:fs";
import path from "node:path";
import { dayBounds, daysBetween } from "./backfill.mjs";
import { aggregateUv, mergeUv } from "../src/uv.js";
import { monthKeyLocal } from "../src/hourly.js";

const BASE = "https://swd.weatherflow.com/swd/rest";
const OUT_DIR = new URL("../.backfill/", import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getDay(date, deviceId, token) {
  const { start, end } = dayBounds(date);
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${BASE}/observations/device/${deviceId}?time_start=${start}&time_end=${end}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body?.status?.status_code !== 0) throw new Error(`API status ${JSON.stringify(body?.status)}`);
      return [...aggregateUv(body.obs ?? [])];
    } catch (err) {
      if (attempt === 6) throw new Error(`${date}: ${err.message}`);
      await sleep(2000 * attempt);
    }
  }
}

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const token = process.env.TEMPEST_TOKEN;
if (!token) throw new Error("Set TEMPEST_TOKEN in the environment.");
const deviceId = process.env.DEVICE_ID ?? "391086";
const to = args.to ?? new Date(Date.now() - 6 * 3600_000 - 86400_000).toISOString().slice(0, 10); // yesterday, local
const cacheDir = path.join(OUT_DIR, "uv-days");
fs.mkdirSync(cacheDir, { recursive: true });

const buckets = new Map();
let fetched = 0;
let empty = 0;
for (const date of daysBetween(args.from ?? "2024-12-21", to)) {
  const file = path.join(cacheDir, `${date}.json`);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(await getDay(date, deviceId, token)));
    if (++fetched % 50 === 0) console.log(`${date} (${fetched} fetched)`);
    await sleep(250);
  }
  const day = JSON.parse(fs.readFileSync(file, "utf8"));
  if (day.length === 0) empty++;
  for (const [b, v] of day) buckets.set(b, v);
}

const months = [...new Set([...buckets.keys()].map(monthKeyLocal))].sort();
const kv = months.map((key) => ({ key: `uv:${key}`, value: JSON.stringify(mergeUv(null, buckets, key)) }));
fs.writeFileSync(path.join(OUT_DIR, "uv-bulk.json"), JSON.stringify(kv));
console.log(`${fetched} days fetched, ${empty} days with no daylight readings. Wrote .backfill/uv-bulk.json: ${kv.length} keys, ${(kv.reduce((s, e) => s + e.value.length, 0) / 1024).toFixed(0)} KB`);

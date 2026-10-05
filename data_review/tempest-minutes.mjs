// Downloads our own station's raw 1-minute Tempest observations, keeping the fields the rain and lightning analysis
// (lightning.py) needs, and later short-range rain prediction work may use.
//
//   cd data_review && node --env-file=../fetcher/.dev.vars tempest-minutes.mjs [--from 2024-12-21] [--to YYYY-MM-DD]
//
// Needs TEMPEST_TOKEN (fetcher/.dev.vars). Writes data/tempest-min/IESPAR102/<date>.json, one file per local day
// (UTC-6): { cols, rows } with one row per minute, [ts, rain mm, lightning distance km, strike count, pressure hPa,
// temp °C, RH %, wind avg m/s, gust m/s, wind dir °, solar W/m²]. Cached days are skipped, so a re-run only fetches
// new days.
import fs from "node:fs";
import path from "node:path";
import { daysBetween, dayBounds } from "../fetcher/scripts/backfill.mjs";

const BASE = "https://swd.weatherflow.com/swd/rest";
const DEVICE = process.env.DEVICE_ID ?? "391086";
const OUT_DIR = new URL("./data/tempest-min/IESPAR102/", import.meta.url).pathname;
// obs_st field indices, in the order they are kept.
const KEEP = { ts: 0, rain: 12, lightDist: 14, lightCount: 15, pressure: 6, temp: 7, rh: 8, ws: 2, gust: 3, wd: 4, solar: 11 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) args[argv[i].slice(2)] = argv[++i];
  return args;
}

async function getDay(date, token) {
  const { start, end } = dayBounds(date);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${BASE}/observations/device/${DEVICE}?time_start=${start}&time_end=${end}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const body = await res.json();
      if (body?.status?.status_code !== 0) throw new Error(`${date}: API status ${JSON.stringify(body?.status)}`);
      return body.obs ?? [];
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await sleep(attempt * 5000);
      continue;
    }
    throw new Error(`${date}: HTTP ${res.status}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.TEMPEST_TOKEN;
  if (!token) throw new Error("TEMPEST_TOKEN is not set (run with --env-file=../fetcher/.dev.vars)");
  const yesterday = new Date(Date.now() - 6 * 3600_000 - 86400_000).toISOString().slice(0, 10);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const idx = Object.values(KEEP);
  let fetched = 0;
  for (const date of daysBetween(args.from ?? "2024-12-21", args.to ?? yesterday)) {
    const file = path.join(OUT_DIR, `${date}.json`);
    if (fs.existsSync(file)) continue;
    const rows = (await getDay(date, token)).filter(Array.isArray).map((r) => idx.map((i) => r[i] ?? null));
    fs.writeFileSync(file, JSON.stringify({ cols: Object.keys(KEEP), rows }));
    fetched++;
    await sleep(500);
  }
  console.log(`IESPAR102 (Tempest, 1-minute): fetched ${fetched} day(s). Cache: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

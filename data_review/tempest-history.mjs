// Downloads our own station's raw 1-minute Tempest observations and reduces them to the same 5-minute shape as the
// Weather Underground history (wu-history.mjs), so all three stations are compared alike. Our station's WU feed only
// starts on 23 Sep 2026, so our side of the comparison comes from Tempest directly.
//
//   cd data_review && node --env-file=../fetcher/.dev.vars tempest-history.mjs [--from 2026-06-01] [--to YYYY-MM-DD]
//
// Needs TEMPEST_TOKEN (fetcher/.dev.vars). Writes data/tempest/IESPAR102/<date>.json, one file per local day (UTC-6),
// each a list of { epoch, local, solarHigh, uvHigh, solarLast, uvLast, tempAvg } per 5-minute interval, stamped at
// the interval's end like WU's. WU keeps roughly one reading per interval from what the station uploads, so on
// cloudy moments its "high" is closer to the interval's last reading (solarLast/uvLast) than to its peak.
// Cached days are skipped, so a re-run only fetches new days.
import fs from "node:fs";
import path from "node:path";
import { daysBetween, dayBounds } from "../fetcher/scripts/backfill.mjs";

const BASE = "https://swd.weatherflow.com/swd/rest";
const DEVICE = process.env.DEVICE_ID ?? "391086";
const OUT_DIR = new URL("./data/tempest/IESPAR102/", import.meta.url).pathname;
const F = { ts: 0, temp: 7, uv: 10, solar: 11 }; // obs_st field indices
const STEP = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => typeof v === "number" && Number.isFinite(v);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) args[argv[i].slice(2)] = argv[++i];
  return args;
}

// "YYYY-MM-DD HH:MM:SS" in local time (UTC-6), as WU's obsTimeLocal.
const localStamp = (epoch) => new Date((epoch - 6 * 3600) * 1000).toISOString().slice(0, 19).replace("T", " ");

// 1-minute rows -> 5-minute intervals (end-stamped): the interval's highest and last solar and UV, and mean temperature.
export function fiveMinute(rows) {
  const slots = new Map();
  for (const r of rows) {
    if (!num(r[F.ts])) continue;
    const end = Math.ceil(r[F.ts] / STEP) * STEP;
    if (!slots.has(end)) slots.set(end, []);
    slots.get(end).push(r);
  }
  return [...slots]
    .sort(([a], [b]) => a - b)
    .map(([end, rs]) => {
      const col = (i) => rs.map((r) => r[i]).filter(num);
      const temps = col(F.temp);
      const last = rs.reduce((a, r) => (r[F.ts] > a[F.ts] ? r : a));
      return {
        epoch: end,
        local: localStamp(end),
        solarHigh: col(F.solar).length ? Math.max(...col(F.solar)) : null,
        uvHigh: col(F.uv).length ? Math.max(...col(F.uv)) : null,
        solarLast: num(last[F.solar]) ? last[F.solar] : null,
        uvLast: num(last[F.uv]) ? last[F.uv] : null,
        tempAvg: temps.length ? Math.round((temps.reduce((s, v) => s + v, 0) / temps.length) * 10) / 10 : null,
      };
    });
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
  let fetched = 0;
  for (const date of daysBetween(args.from ?? "2026-06-01", args.to ?? yesterday)) {
    const file = path.join(OUT_DIR, `${date}.json`);
    if (fs.existsSync(file)) continue;
    fs.writeFileSync(file, JSON.stringify(fiveMinute(await getDay(date, token))));
    fetched++;
    await sleep(500);
  }
  console.log(`IESPAR102 (Tempest): fetched ${fetched} day(s). Cache: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

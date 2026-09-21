// One-off back-fill of hourly observations and lightning events from raw 1-minute Tempest data.
//
//   TEMPEST_TOKEN=... node scripts/backfill.mjs [--from 2024-12-21] [--to YYYY-MM-DD]
//
// Each local day (UTC-6) is fetched once and cached in .backfill/days/, so an interrupted run resumes.
// Output: .backfill/kv-bulk.json, for `wrangler kv bulk put` (keys obs:YYYY-MM, lightning:YYYY, obs:meta).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { aggregateHours, buildMonth, lightningEvents, monthKeyLocal, yearKeyLocal, COLS } from "../src/hourly.js";

const BASE = "https://swd.weatherflow.com/swd/rest";
const OUT_DIR = new URL("../.backfill/", import.meta.url).pathname;

export function dayBounds(date) {
  const [y, m, d] = date.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d, 6) / 1000; // local midnight = 06:00 UTC
  return { start, end: start + 86399 };
}

export function* daysBetween(from, to) {
  const [y, m, d] = from.split("-").map(Number);
  for (let t = Date.UTC(y, m - 1, d); ; t += 86400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    if (date > to) return;
    yield date;
  }
}

// getJson(path) -> parsed Tempest response body. Returns the compact per-day document that gets cached.
export async function processDay(date, deviceId, getJson) {
  const { start, end } = dayBounds(date);
  const body = await getJson(`/observations/device/${deviceId}?time_start=${start}&time_end=${end}`);
  const rows = body.obs ?? [];
  return { date, rows: rows.length, hours: [...aggregateHours(rows)], strikes: lightningEvents(rows) };
}

// Cached day documents -> the KV documents.
export function assemble(dayDocs, now = new Date()) {
  const hours = new Map();
  const strikesByYear = new Map();
  for (const day of dayDocs) {
    for (const [h, rec] of day.hours) hours.set(h, rec);
    for (const ev of day.strikes) {
      const y = yearKeyLocal(ev[0]);
      if (!strikesByYear.has(y)) strikesByYear.set(y, []);
      strikesByYear.get(y).push(ev);
    }
  }
  const months = [...new Set([...hours.keys()].map(monthKeyLocal))].sort();
  const kv = months.map((key) => ({ key: `obs:${key}`, value: JSON.stringify(buildMonth(hours, key)) }));
  for (const [year, events] of [...strikesByYear].sort()) {
    events.sort((a, b) => a[0] - b[0]);
    kv.push({ key: `lightning:${year}`, value: JSON.stringify({ year, fields: ["ts", "distance_km", "count"], events }) });
  }
  kv.push({
    key: "obs:meta",
    value: JSON.stringify({ cols: COLS, first: months[0] ?? null, last: months.at(-1) ?? null, generated_at: now.toISOString() }),
  });
  return kv;
}

// Compare hourly aggregates with the daily stats already in daily:all (stats-side day totals).
export function verify(dayDocs, dailyDays, tol = { rain: 0.1, temp: 0.15 }) {
  const byDate = new Map(dailyDays.map((d) => [d.date, d]));
  const checks = { rain: [0, 0], tmax: [0, 0], tmin: [0, 0], lightning: [0, 0] }; // [compared, mismatched]
  const examples = [];
  const note = (name, ok, date, mine, theirs) => {
    checks[name][0]++;
    if (!ok) {
      checks[name][1]++;
      if (examples.length < 10) examples.push(`${date} ${name}: hourly=${mine} stats=${theirs}`);
    }
  };
  for (const day of dayDocs) {
    const s = byDate.get(day.date);
    if (!s || day.hours.length === 0) continue;
    const recs = day.hours.map(([, r]) => r);
    const rain = recs.reduce((a, r) => a + (r.rain ?? 0), 0);
    const tmax = Math.max(...recs.map((r) => r.tmax ?? -Infinity));
    const tmin = Math.min(...recs.map((r) => r.tmin ?? Infinity));
    const ltn = recs.reduce((a, r) => a + r.ltn, 0);
    if (typeof s.rain_mm === "number") note("rain", Math.abs(rain - s.rain_mm) <= tol.rain, day.date, rain.toFixed(2), s.rain_mm);
    if (typeof s.t_max === "number") note("tmax", Math.abs(tmax - s.t_max) <= tol.temp, day.date, tmax, s.t_max);
    if (typeof s.t_min === "number") note("tmin", Math.abs(tmin - s.t_min) <= tol.temp, day.date, tmin, s.t_min);
    if (typeof s.lightning === "number") note("lightning", ltn === s.lightning, day.date, ltn, s.lightning);
  }
  return { checks, examples };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeGetJson(token) {
  return async (p) => {
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        const res = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
        if (!res.ok) throw new Error(`HTTP ${res.status} (not retrying)`);
        const body = await res.json();
        if (body?.status?.status_code !== 0) throw new Error(`API status ${JSON.stringify(body?.status)}`);
        return body;
      } catch (err) {
        if (String(err.message).includes("not retrying") || attempt === 6) throw err;
        await sleep(2000 * attempt);
      }
    }
  };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1]]] : a), []));
  const token = process.env.TEMPEST_TOKEN;
  if (!token) throw new Error("Set TEMPEST_TOKEN in the environment.");
  const deviceId = args.device ?? process.env.DEVICE_ID ?? "391086";
  const from = args.from ?? "2024-12-21";
  const to = args.to ?? new Date(Date.now() - 6 * 3600_000 - 86400_000).toISOString().slice(0, 10); // yesterday, local
  const cacheDir = path.join(OUT_DIR, "days");
  fs.mkdirSync(cacheDir, { recursive: true });

  const getJson = makeGetJson(token);
  const dates = [...daysBetween(from, to)];
  const t0 = Date.now();
  const docs = [];
  let fetched = 0;
  for (const [i, date] of dates.entries()) {
    const file = path.join(cacheDir, `${date}.json`);
    if (fs.existsSync(file)) {
      docs.push(JSON.parse(fs.readFileSync(file, "utf8")));
      continue;
    }
    const doc = await processDay(date, deviceId, getJson);
    fs.writeFileSync(file, JSON.stringify(doc));
    docs.push(doc);
    fetched++;
    if (fetched % 20 === 0) console.log(`${date}  (${i + 1}/${dates.length}, ${Math.round((Date.now() - t0) / 1000)} s)`);
    await sleep(250);
  }
  console.log(`Days: ${dates.length} (${fetched} fetched, ${dates.length - fetched} from cache). Days with no rows: ${docs.filter((d) => d.rows === 0).length}.`);

  const kv = assemble(docs);
  fs.writeFileSync(path.join(OUT_DIR, "kv-bulk.json"), JSON.stringify(kv));
  const bytes = kv.reduce((s, e) => s + e.value.length, 0);
  console.log(`Wrote .backfill/kv-bulk.json: ${kv.length} keys, ${(bytes / 1e6).toFixed(2)} MB`);
  for (const e of kv) console.log(`  ${e.key}  ${(e.value.length / 1024).toFixed(1)} KB`);

  const apiBase = process.env.API_BASE ?? "https://laceibona-fetcher.gds506.workers.dev";
  try {
    const daily = await (await fetch(`${apiBase}/api/daily`)).json();
    const { checks, examples } = verify(docs, daily.days);
    console.log("\nCheck against daily stats (compared / mismatched):");
    for (const [name, [n, bad]] of Object.entries(checks)) console.log(`  ${name.padEnd(10)} ${n} / ${bad}`);
    if (examples.length) console.log("First mismatches:\n  " + examples.join("\n  "));
  } catch (err) {
    console.log(`(Skipped the daily-stats check: ${err.message})`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`Back-fill failed: ${err.message}. Re-run the same command to resume.`);
    process.exit(1);
  });
}

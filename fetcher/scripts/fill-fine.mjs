// One-off initial fill of the `fine7d` KV document from the last 7 days of raw 1-minute Tempest data.
// After this the Worker's 10-minute cron keeps it current.
//
//   TEMPEST_TOKEN=... node scripts/fill-fine.mjs
//
// Writes .backfill/fine7d.json; publish it with:
//   npx wrangler kv key put --binding WEATHER_DATA --remote fine7d --path .backfill/fine7d.json
import fs from "node:fs";
import { aggregateFine, mergeFine, windowEnd, SLOTS, STEP } from "../src/fine.js";

const BASE = "https://swd.weatherflow.com/swd/rest";
const token = process.env.TEMPEST_TOKEN;
if (!token) throw new Error("Set TEMPEST_TOKEN in the environment.");
const deviceId = process.env.DEVICE_ID ?? "391086";

const end = windowEnd(Date.now() / 1000);
const start = end - SLOTS * STEP;
const buckets = new Map();
for (let from = start; from < end; from += 86400) {
  const to = Math.min(from + 86400, end) - 1; // one day per request, as backfill.mjs does
  const res = await fetch(`${BASE}/observations/device/${deviceId}?time_start=${from}&time_end=${to}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body?.status?.status_code !== 0) throw new Error(`API status ${JSON.stringify(body?.status)}`);
  for (const [b, rec] of aggregateFine(body.obs ?? [])) buckets.set(b, rec);
  console.log(new Date(from * 1000).toISOString(), (body.obs ?? []).length, "rows");
}
const doc = mergeFine(null, buckets, end);
fs.mkdirSync(new URL("../.backfill/", import.meta.url).pathname, { recursive: true });
fs.writeFileSync(new URL("../.backfill/fine7d.json", import.meta.url).pathname, JSON.stringify(doc));
const filled = doc.cols.n.filter((n) => n).length;
console.log(`${filled}/${SLOTS} buckets filled, ${doc.cols.rain.reduce((a, v) => a + (v ?? 0), 0).toFixed(1)} mm of rain`);

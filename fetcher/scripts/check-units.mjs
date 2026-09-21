// Usage: TEMPEST_TOKEN=... node scripts/check-units.mjs [YYYY-MM-DD]
// Compares one local day (UTC-6) of raw observations against that day's stats/station row.
const BASE = "https://swd.weatherflow.com/swd/rest";
const STATION_ID = process.env.STATION_ID || "163576";
const token = process.env.TEMPEST_TOKEN;
if (!token) {
  console.error("Set TEMPEST_TOKEN in the environment.");
  process.exit(1);
}

const get = async (path) => {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
};

const localDay =
  process.argv[2] ?? new Date(Date.now() - 3 * 86400_000 - 6 * 3600_000).toISOString().slice(0, 10);
const [y, m, d] = localDay.split("-").map(Number);
const start = Date.UTC(y, m - 1, d, 6) / 1000; // local midnight = 06:00 UTC
const end = start + 86400 - 1;

const stations = await get(`/stations/${STATION_ID}`);
const st = stations.stations[0];
console.log("== Station display units (what the Tempest app is set to) ==");
console.log(st.station_units ?? "(not returned by /stations; see the Tempest app: Settings > Units)");
console.log("\n== Devices (agl = height above ground, m) ==");
for (const dev of st.devices) console.log(dev.device_type, dev.device_id, "agl:", dev.device_meta?.agl);

const tempestDevice = st.devices.find((x) => x.device_type === "ST");
const obs = await get(`/observations/device/${tempestDevice.device_id}?time_start=${start}&time_end=${end}`);
const rows = obs.obs ?? [];
console.log(`\n== Raw observations for ${localDay}: ${rows.length} rows, obs_type=${obs.type} ==`);
if (!rows.length) process.exit(1);

const col = (i) => rows.map((r) => r[i]).filter((v) => v !== null);
const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const max = (a) => Math.max(...a);
const min = (a) => Math.min(...a);
const sum = (a) => a.reduce((s, v) => s + v, 0);

const stats = await get(`/stats/station/${STATION_ID}`);
const row = stats.stats_day.find((r) => r[0] === localDay);
if (!row) {
  console.log(`No stats_day row for ${localDay}`);
  process.exit(1);
}

const f = (v) => (typeof v === "number" ? +v.toFixed(3) : v);
const compare = (label, statIdx, raw) => {
  const s = row[statIdx];
  const ratio = typeof s === "number" && raw ? +(s / raw).toFixed(3) : "-";
  console.log(label.padEnd(24), String(statIdx).padStart(3), String(f(s)).padStart(12), String(f(raw)).padStart(12), String(ratio).padStart(8));
};

console.log("\nlabel                    idx        stats          raw   ratio   (ratio 1 = same units; 2.237 = mph vs m/s; 3.6 = km/h vs m/s)");
compare("pressure avg (mb)", 1, avg(col(6)));
compare("pressure max", 2, max(col(6)));
compare("pressure min", 3, min(col(6)));
compare("temp avg (C)", 4, avg(col(7)));
compare("temp max", 5, max(col(7)));
compare("temp min", 6, min(col(7)));
compare("RH avg (%)", 7, avg(col(8)));
compare("RH max", 8, max(col(8)));
compare("RH min", 9, min(col(8)));
compare("lux avg", 10, avg(col(9)));
compare("lux max", 11, max(col(9)));
compare("UV avg", 13, avg(col(10)));
compare("UV max", 14, max(col(10)));
compare("solar avg (W/m2)", 16, avg(col(11)));
compare("solar max", 17, max(col(11)));
compare("wind avg (m/s)", 19, avg(col(2)));
compare("wind gust max", 20, max(col(3)));
compare("wind lull min", 21, min(col(1)));
compare("wind dir avg (deg)", 22, avg(col(4)));
compare("rain sum (mm) vs idx28", 28, sum(col(12)));
compare("lightning count vs idx24", 24, sum(col(15)));
compare("rain minutes (rain>0) i30", 30, col(12).filter((v) => v > 0).length);
compare("rain minutes (type>0) i30", 30, col(13).filter((v) => v > 0).length);
compare("sample count idx26", 26, rows.length);
compare("battery (V) vs idx27", 27, avg(col(16)));

console.log("\nFull stats row for", localDay, ":\n", JSON.stringify(row));

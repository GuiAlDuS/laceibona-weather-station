import { API_BASE } from "./config.js";
import { fixObsMonth, fixUvMonth } from "./sensor-fix.js";

const TTL_MS = 5 * 60_000;
const cache = new Map(); // "kind:month key" -> { at, promise }
// The monthly document kinds: the API path each is served under and the sensor correction applied as it loads.
const KINDS = { obs: fixObsMonth, uv: fixUvMonth };

// The n most recent local (UTC-6) month keys, oldest first, ending with the current month.
export function monthKeys(n, now = Date.now()) {
  const d = new Date(now - 6 * 3600_000);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7)).reverse();
}

// How many month keys run from `first` ("YYYY-MM") to the current local month, both included.
export function monthsSince(first, now = Date.now()) {
  const d = new Date(now - 6 * 3600_000);
  return Math.max(1, (d.getUTCFullYear() - +first.slice(0, 4)) * 12 + d.getUTCMonth() + 1 - +first.slice(5, 7) + 1);
}

async function fetchMonth(kind, key) {
  const res = await fetch(`${API_BASE}/api/${kind}/${key}`);
  if (res.status === 404) return null; // no data that month
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return KINDS[kind](await res.json());
}

// obs:YYYY-MM documents (or another kind's) for the last n months (months with no data are dropped). Shared by
// every chart that needs them, so each month is fetched once per TTL.
export function getMonths(n, kind = "obs") {
  return Promise.all(
    monthKeys(n).map((key) => {
      const id = `${kind}:${key}`;
      const hit = cache.get(id);
      if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
      const promise = fetchMonth(kind, key);
      cache.set(id, { at: Date.now(), promise });
      promise.catch(() => cache.delete(id));
      return promise;
    }),
  ).then((docs) => docs.filter(Boolean));
}

import { API_BASE } from "./config.js";

const TTL_MS = 5 * 60_000;
const cache = new Map(); // month key -> { at, promise }

// The n most recent local (UTC-6) month keys, oldest first, ending with the current month.
export function monthKeys(n, now = Date.now()) {
  const d = new Date(now - 6 * 3600_000);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7)).reverse();
}

async function fetchMonth(key) {
  const res = await fetch(`${API_BASE}/api/obs/${key}`);
  if (res.status === 404) return null; // no data that month
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// obs:YYYY-MM documents for the last n months (months with no data are dropped). Shared by every chart
// that needs them, so each month is fetched once per TTL.
export function getMonths(n) {
  return Promise.all(
    monthKeys(n).map((key) => {
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
      const promise = fetchMonth(key);
      cache.set(key, { at: Date.now(), promise });
      promise.catch(() => cache.delete(key));
      return promise;
    }),
  ).then((docs) => docs.filter(Boolean));
}

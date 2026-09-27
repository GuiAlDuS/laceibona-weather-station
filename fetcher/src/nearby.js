// Current conditions at two nearby Weather Underground stations, for the "Nearby stations, now" map.
// WU's PWS terms (Weather Company Terms of Use, section 18) allow personal, non-commercial display with attribution,
// and no modified or derived data: values are passed on exactly as reported, only picked out of the response.
// Nothing accumulates: they ride along in the `current` document, which each 5-minute run overwrites
// (2 stations x 288 runs = 576 calls a day, against the key's 1,500).

const WU_CURRENT = "https://api.weather.com/v2/pws/observations/current";
export const NEIGHBOURS = ["IESPAR72", "IPUNTA186"];

const val = (v) => (typeof v === "number" ? v : null);

// One station's reading, in WU's metric units (°C, km/h, mm/h, mm).
export function pickObservation(body) {
  const o = body?.observations?.[0];
  if (!o) return null;
  const m = o.metric ?? {};
  return {
    id: o.stationID,
    lat: val(o.lat),
    lon: val(o.lon),
    obs_time: o.obsTimeUtc ?? null,
    temp: val(m.temp),
    rain_rate: val(m.precipRate),
    rain_today: val(m.precipTotal),
    wind_speed: val(m.windSpeed),
    wind_gust: val(m.windGust),
    wind_dir: val(o.winddir),
  };
}

// Readings older than this are dropped rather than carried forward, so a station (or a revoked key) that stays
// silent leaves the map instead of sitting there faded forever.
const KEEP_MS = 6 * 3600_000;

// Each station's fresh reading, or its previous one (from the last `current` document) when the fresh fetch fails,
// as long as that is under KEEP_MS old. The map fades a reading once it is stale.
export function withFallback(fresh, previous, nowMs) {
  return NEIGHBOURS.map((id) => fresh.find((s) => s.id === id) ?? (previous ?? []).find((s) => s.id === id && s.obs_time && nowMs - Date.parse(s.obs_time) < KEEP_MS)).filter(Boolean);
}

// A station that fails or has no reading is left out here; withFallback decides what to show instead.
export async function fetchNeighbours(key) {
  if (!key) return [];
  const one = async (id) => {
    const res = await fetch(`${WU_CURRENT}?stationId=${id}&format=json&units=m&numericPrecision=decimal&apiKey=${key}`);
    return res.ok && res.status !== 204 ? pickObservation(await res.json()) : null;
  };
  const results = await Promise.allSettled(NEIGHBOURS.map(one));
  return results.map((r) => (r.status === "fulfilled" ? r.value : null)).filter(Boolean);
}

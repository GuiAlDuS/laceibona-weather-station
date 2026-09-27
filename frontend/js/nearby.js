// Shapes the `current` document into the stations on the "Nearby stations, now" map: ours from our own Tempest
// reading, the neighbours exactly as Weather Underground reported them (see fetcher/src/nearby.js). Pure; no DOM.
import { kmh } from "./conditions.js";

// A station is faded and marked on the map once its reading is this old.
export const NEARBY_STALE_MIN = 30;

export function nearbyStations(doc, position) {
  if (!doc) return [];
  const ours = {
    id: "IESPAR102",
    ours: true,
    lat: position.lat,
    lon: position.lon,
    obs_time: doc.updated_at ?? null,
    temp: doc.temp ?? null,
    rain_rate: doc.rain_rate ?? null,
    rain_today: doc.today?.rain_mm ?? null,
    wind_speed: kmh(doc.wind_avg),
    wind_gust: kmh(doc.wind_gust),
    wind_dir: doc.wind_dir ?? null,
  };
  const others = (doc.nearby ?? []).filter((s) => typeof s.lat === "number" && typeof s.lon === "number").map((s) => ({ ...s, ours: false }));
  return [ours, ...others];
}

// No arrow when the air is still or the vane reports no direction.
export const isCalm = (s) => s.wind_speed === null || s.wind_speed === 0 || s.wind_dir === null;

// Where the wind-speed label (at the arrow's tail) sits, so the name can go on the other side: the tail points to
// where the wind comes from, so a southerly (90-270°) puts it below the dial.
export const tailBelow = (s) => !isCalm(s) && s.wind_dir > 90 && s.wind_dir < 270;

// Screen offsets that push dials apart when two stations sit closer than `min` px (La Ceibona and Esparza are
// 3.5 km apart, a few dozen px on a phone): each pair that is too close moves apart along the line between them,
// half the shortfall each. Points are [x, y] px; returns an [dx, dy] per point, [0, 0] when nothing is close.
export function spreadApart(points, min) {
  const off = points.map(() => [0, 0]);
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j][0] - points[i][0];
      const dy = points[j][1] - points[i][1];
      const dist = Math.hypot(dx, dy);
      if (dist >= min) continue;
      const [ux, uy] = dist > 0 ? [dx / dist, dy / dist] : [1, 0];
      const push = (min - dist) / 2;
      off[i] = [off[i][0] - ux * push, off[i][1] - uy * push];
      off[j] = [off[j][0] + ux * push, off[j][1] + uy * push];
    }
  }
  return off;
}

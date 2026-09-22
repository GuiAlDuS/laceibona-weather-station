// Wind rose from wind columns (hourly in `obs:*`, per-minute in `wind24h`) (`ws` m/s, `wd` degrees). Pure functions; no DOM.
export const SECTORS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const MS_TO_KMH = 3.6;
export const CALM_BELOW = 0.5; // m/s; slower hours have no meaningful direction
export const CALM_BELOW_KMH_TEXT = "1.8 km/h"; // the same cut-off as shown to the reader
export const SPEED_BINS = [ // `max` in m/s (the data unit); labels in km/h (what the reader sees)
  { label: "1.8–3.6 km/h", max: 1 },
  { label: "3.6–7.2 km/h", max: 2 },
  { label: "7.2–10.8 km/h", max: 3 },
  { label: "10.8 km/h or more", max: Infinity },
];

// docs: any documents with `cols.ws` and `cols.wd`. Samples missing either value are not counted.
export function windRose(docs) {
  const sectors = SECTORS.map((name) => ({ name, total: 0, bins: SPEED_BINS.map(() => 0) }));
  let calm = 0;
  let hours = 0;
  for (const doc of docs) {
    const { ws, wd } = doc.cols;
    for (let i = 0; i < ws.length; i++) {
      if (typeof ws[i] !== "number" || typeof wd[i] !== "number") continue;
      hours++;
      if (ws[i] < CALM_BELOW) {
        calm++;
        continue;
      }
      const s = sectors[Math.round(wd[i] / 22.5) % 16];
      s.bins[SPEED_BINS.findIndex((b) => ws[i] < b.max)]++;
      s.total++;
    }
  }
  const pct = (n) => (hours ? (100 * n) / hours : 0);
  return {
    hours,
    calmPercent: pct(calm),
    sectors: sectors.map((s) => ({ name: s.name, percent: pct(s.total), bins: s.bins.map(pct) })),
    maxPercent: Math.max(0, ...sectors.map((s) => pct(s.total))),
  };
}

// 10-minute rain, station pressure, solar radiation, humidity and temperature for the last 7 days, from the `fine7d` document
// (fetcher/src/fine.js). Pure functions; no DOM.
const LOCAL_OFFSET_S = -6 * 3600;
export const RATE_PER_BUCKET = 6; // a 10-minute bucket's mm of rain -> its mean rate in mm/h

// doc: the `fine7d` KV document. Returns buckets oldest first, each { t (unix s), date, hour, minute, rain (mm in
// the bucket), rate (mm/h, null with no reading), solar (W/m2 mean), p (hPa mean), rh (% mean; null in documents from before it was stored), temp (°C mean; likewise) }.
export function fineBuckets(doc) {
  const out = [];
  for (let i = 0; i < doc.slots; i++) {
    const t = doc.start + i * doc.step;
    const local = new Date((t + LOCAL_OFFSET_S) * 1000);
    const rain = doc.cols.rain[i];
    out.push({
      t,
      date: local.toISOString().slice(0, 10),
      hour: local.getUTCHours(),
      minute: local.getUTCMinutes(),
      rain,
      rate: rain === null ? null : rain * RATE_PER_BUCKET,
      solar: doc.cols.solar[i],
      p: doc.cols.p[i],
      rh: doc.cols.rh?.[i] ?? null,
      temp: doc.cols.t?.[i] ?? null,
    });
  }
  return out;
}

// One row per day covered, oldest first: total rain, the day's peak 10-minute rate (and when), the temperature,
// pressure and humidity ranges, and the brightest 10 minutes of sun. Days with no readings at all are left out.
export function fineDaySummaries(buckets) {
  const byDate = new Map();
  for (const b of buckets) {
    if (!byDate.has(b.date)) byDate.set(b.date, []);
    byDate.get(b.date).push(b);
  }
  return [...byDate]
    .map(([date, bs]) => {
      const withRain = bs.filter((b) => b.rate !== null);
      const withP = bs.filter((b) => b.p !== null).map((b) => b.p);
      const withRh = bs.filter((b) => b.rh !== null).map((b) => b.rh);
      const withT = bs.filter((b) => b.temp !== null).map((b) => b.temp);
      const withSolar = bs.filter((b) => b.solar !== null).map((b) => b.solar);
      if (withRain.length === 0 && withP.length === 0) return null;
      const peak = withRain.reduce((m, b) => (m === null || b.rate > m.rate ? b : m), null);
      return {
        date,
        rain: withRain.reduce((s, b) => s + b.rain, 0),
        peak: peak?.rate ?? null,
        peakHour: peak?.hour ?? null,
        peakMinute: peak?.minute ?? null,
        pMin: withP.length ? Math.min(...withP) : null,
        pMax: withP.length ? Math.max(...withP) : null,
        rhMin: withRh.length ? Math.min(...withRh) : null,
        rhMax: withRh.length ? Math.max(...withRh) : null,
        tMin: withT.length ? Math.min(...withT) : null,
        tMax: withT.length ? Math.max(...withT) : null,
        solarMax: withSolar.length ? Math.max(...withSolar) : null,
      };
    })
    .filter(Boolean);
}

// The window's overall peak 10-minute rate, or null with no rain in the window.
export function finePeak(buckets) {
  return buckets.reduce((m, b) => (b.rate !== null && (m === null || b.rate > m.rate) ? b : m), null);
}

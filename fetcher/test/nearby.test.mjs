import { test } from "node:test";
import assert from "node:assert/strict";
import { pickObservation, fetchNeighbours, NEIGHBOURS } from "../src/nearby.js";

// Shape of api.weather.com/v2/pws/observations/current (units=m), trimmed.
const body = (o = {}) => ({
  observations: [{ stationID: "IESPAR72", obsTimeUtc: "2026-09-27T00:40:00Z", lat: 9.989762, lon: -84.668156, winddir: 83, metric: { temp: 25.8, windSpeed: 3.2, windGust: 6.1, precipRate: 0.99, precipTotal: 1.05 }, ...o }],
});

test("pickObservation passes WU's values through unchanged", () => {
  assert.deepEqual(pickObservation(body()), { id: "IESPAR72", lat: 9.989762, lon: -84.668156, obs_time: "2026-09-27T00:40:00Z", temp: 25.8, rain_rate: 0.99, rain_today: 1.05, wind_speed: 3.2, wind_gust: 6.1, wind_dir: 83 });
});

test("pickObservation keeps missing values as null and handles an empty body", () => {
  assert.equal(pickObservation(body({ winddir: null })).wind_dir, null);
  assert.equal(pickObservation({}), null);
  assert.equal(pickObservation(null), null);
});

test("fetchNeighbours leaves out a station that fails and needs a key", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => (url.includes(NEIGHBOURS[0]) ? new Response(JSON.stringify(body())) : new Response("nope", { status: 500 }));
  try {
    const got = await fetchNeighbours("k");
    assert.equal(got.length, 1);
    assert.equal(got[0].id, "IESPAR72");
    assert.deepEqual(await fetchNeighbours(undefined), []);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("withFallback keeps a failed station's last reading for up to 6 hours", async () => {
  const { withFallback } = await import("../src/nearby.js");
  const now = Date.parse("2026-09-27T12:00:00Z");
  const fresh = [{ id: "IESPAR72", obs_time: "2026-09-27T11:55:00Z", temp: 30 }];
  const recent = [{ id: "IPUNTA186", obs_time: "2026-09-27T09:00:00Z", temp: 28 }];
  const old = [{ id: "IPUNTA186", obs_time: "2026-09-27T05:00:00Z", temp: 22 }];
  assert.deepEqual(withFallback(fresh, recent, now).map((s) => s.id), ["IESPAR72", "IPUNTA186"]);
  assert.deepEqual(withFallback(fresh, old, now).map((s) => s.id), ["IESPAR72"]);
  assert.deepEqual(withFallback([], undefined, now), []);
});

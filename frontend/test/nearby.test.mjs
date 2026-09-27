import { test } from "node:test";
import assert from "node:assert/strict";
import { nearbyStations, isCalm, tailBelow } from "../js/nearby.js";

const doc = {
  updated_at: "2026-09-27T00:40:00Z",
  temp: 25.4,
  rain_rate: 0.7,
  wind_avg: 2,
  wind_gust: 5,
  wind_dir: 83,
  today: { rain_mm: 0.71 },
  nearby: [
    { id: "IESPAR72", lat: 9.99, lon: -84.67, obs_time: "2026-09-27T00:40:00Z", temp: 25.8, rain_rate: 0.99, rain_today: 1.05, wind_speed: 0, wind_gust: 0, wind_dir: 0 },
    { id: "BROKEN", lat: null, lon: null },
  ],
};

test("ours comes first from our own reading, in km/h; neighbours pass through", () => {
  const [ours, esparza, ...rest] = nearbyStations(doc, { lat: 9.98, lon: -84.7 });
  assert.equal(ours.ours, true);
  assert.equal(ours.temp, 25.4);
  assert.equal(ours.rain_today, 0.71);
  assert.equal(ours.wind_speed, 7.2);
  assert.equal(esparza.id, "IESPAR72");
  assert.equal(esparza.rain_today, 1.05);
  assert.equal(rest.length, 0, "a neighbour without a position is left off the map");
});

test("an older current document without neighbours still shows ours", () => {
  const { nearby, ...old } = doc;
  assert.equal(nearbyStations(old, { lat: 0, lon: 0 }).length, 1);
  assert.deepEqual(nearbyStations(null, { lat: 0, lon: 0 }), []);
});

test("calm and where the arrow's tail falls", () => {
  assert.equal(isCalm({ wind_speed: 0, wind_dir: 90 }), true);
  assert.equal(isCalm({ wind_speed: 3, wind_dir: null }), true);
  assert.equal(isCalm({ wind_speed: 3, wind_dir: 0 }), false);
  assert.equal(tailBelow({ wind_speed: 3, wind_dir: 180 }), true);
  assert.equal(tailBelow({ wind_speed: 3, wind_dir: 350 }), false);
  assert.equal(tailBelow({ wind_speed: 0, wind_dir: 180 }), false);
});

test("spreadApart pushes close dials apart and leaves distant ones alone", async () => {
  const { spreadApart } = await import("../js/nearby.js");
  assert.deepEqual(spreadApart([[0, 0], [200, 0]], 74), [[0, 0], [0, 0]]);
  const [a, b] = spreadApart([[100, 100], [140, 100]], 74);
  assert.deepEqual(a, [-17, 0]);
  assert.deepEqual(b, [17, 0]);
  assert.equal(spreadApart([[5, 5], [5, 5]], 74)[1][0], 37);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../src/api.js";

const env = (data) => ({ WEATHER_DATA: { get: async (k) => data[k] ?? null } });
const req = (path, method = "GET") => new Request(`https://x.test${path}`, { method });

test("/api/daily passes stored JSON through with CORS and cache headers", async () => {
  const res = await handleRequest(req("/api/daily"), env({ "daily:all": '{"days":[]}' }));
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '{"days":[]}');
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
  assert.match(res.headers.get("Cache-Control"), /max-age=300/);
});

test("/api/current returns a placeholder when nothing is stored", async () => {
  const res = await handleRequest(req("/api/current"), env({}));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { available: false });
});

test("/api/current returns stored value when present", async () => {
  const res = await handleRequest(req("/api/current"), env({ current: '{"temp":25}' }));
  assert.deepEqual(await res.json(), { temp: 25 });
});

test("/api/daily is 503 before the first fetch", async () => {
  const res = await handleRequest(req("/api/daily"), env({}));
  assert.equal(res.status, 503);
});

test("unknown path 404, bad method 405, OPTIONS 204", async () => {
  assert.equal((await handleRequest(req("/nope"), env({}))).status, 404);
  assert.equal((await handleRequest(req("/api/daily", "POST"), env({}))).status, 405);
  assert.equal((await handleRequest(req("/api/daily", "OPTIONS"), env({}))).status, 204);
});

test("/api/status reports no error when none is stored, and the stored error otherwise", async () => {
  assert.deepEqual(await (await handleRequest(req("/api/status"), env({}))).json(), { last_error: null });
  const res = await handleRequest(req("/api/status"), env({ "status:last_error": '{"job":"refreshCurrent","error":"boom"}' }));
  assert.deepEqual(await res.json(), { job: "refreshCurrent", error: "boom" });
});

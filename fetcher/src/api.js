const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
};

const json = (body, status, cacheSeconds) =>
  new Response(body, {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${cacheSeconds}`,
    },
  });

const KEYS = { "/api/daily": ["daily:all", 300], "/api/current": ["current", 60], "/api/status": ["status:last_error", 30] };

export async function handleRequest(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json(JSON.stringify({ error: "method not allowed" }), 405, 0);
  }

  const { pathname } = new URL(request.url);
  const route = KEYS[pathname];
  if (!route) return json(JSON.stringify({ error: "not found" }), 404, 60);

  const [key, cacheSeconds] = route;
  const value = await env.WEATHER_DATA.get(key);
  if (value === null) {
    if (key === "status:last_error") return json(JSON.stringify({ last_error: null }), 200, 30);
    // `current` is empty until the 5-minute fetcher has run once.
    const body = key === "current" ? { available: false } : { error: "no data yet" };
    return json(JSON.stringify(body), key === "current" ? 200 : 503, 30);
  }
  return json(value, 200, cacheSeconds);
}

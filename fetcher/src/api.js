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

const KEYS = { "/api/daily": ["daily:all", 300], "/api/current": ["current", 60], "/api/status": ["status:last_error", 30], "/api/wind24h": ["wind24h", 60], "/api/fine7d": ["fine7d", 120], "/api/forecast": ["forecast", 600] };

// Back-filled history: /api/obs/YYYY-MM -> obs:YYYY-MM, /api/lightning/YYYY -> lightning:YYYY.
// These documents change rarely, so they are cached longer, and a missing one is a plain 404.
function bulkRoute(pathname) {
  const m = /^\/api\/(obs\/\d{4}-(?:0[1-9]|1[0-2])|lightning\/\d{4})$/.exec(pathname);
  return m ? [m[1].replace("/", ":"), 3600, true] : null;
}

export async function handleRequest(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json(JSON.stringify({ error: "method not allowed" }), 405, 0);
  }

  const { pathname } = new URL(request.url);
  const route = KEYS[pathname] ?? bulkRoute(pathname);
  if (!route) return json(JSON.stringify({ error: "not found" }), 404, 60);

  const [key, cacheSeconds, optional] = route;
  const value = await env.WEATHER_DATA.get(key);
  if (value === null) {
    if (optional) return json(JSON.stringify({ error: "not found" }), 404, 300);
    if (key === "status:last_error") return json(JSON.stringify({ last_error: null }), 200, 30);
    // `current` is empty until the 5-minute fetcher has run once.
    const live = key === "current" || key === "wind24h" || key === "fine7d" || key === "forecast";
    const body = live ? { available: false } : { error: "no data yet" };
    return json(JSON.stringify(body), live ? 200 : 503, 30);
  }
  return json(value, 200, cacheSeconds);
}

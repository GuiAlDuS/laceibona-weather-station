# La Ceibona Weather Station

**Live site: https://laceibona-weather.pages.dev**

A public, always-on weather dashboard for a [WeatherFlow Tempest](https://tempest.earth/) station near Mojón de Esparza, Puntarenas, Costa Rica, running entirely on Cloudflare's free tier (Workers, KV, Pages). It does not depend on a home server, Home Assistant or the station's internet uplink once the data has been fetched.

```
Tempest API
    | every 5 min (cron)
Cloudflare Worker  (fetcher/)      -> writes ->  Cloudflare KV
    | serves /api/current, /api/daily, /api/status   <- reads
Cloudflare Pages  (frontend/)  plain HTML + Plotly.js, no build step
```

## What it shows

- **Current conditions**: temperature, humidity, wind, pressure trend, rain, UV, solar, lightning; flags stale data.
- **Cumulative water balance** (rain minus ETo) by day of year, year over year.
- **Monthly rain vs ETo** for the last 13 months.
- **Cumulative rain** and **cumulative lightning** by day of year, year over year.
- **Monthly solar irradiation** (kWh/m²) and a **year-over-year comparison** of temperature, ETo and solar irradiation over the same period of each year.

ETo is the FAO-56 Penman-Monteith daily reference evapotranspiration, computed from the station's own readings (`fetcher/src/eto.js`, validated against the worked example in FAO Irrigation and Drainage Paper 56).

## Layout

| Path | What |
|---|---|
| `fetcher/` | Cloudflare Worker: cron job, data transforms (`daily.js`, `current.js`, `eto.js`), read API (`api.js`) |
| `frontend/` | Static site: pure calculation modules (`js/*.js`), Plotly views, tests |
| `PROJECT.md` | Design notes, Tempest data-format findings, and known issues |

## Data notes worth knowing

- Tempest's `stats/station` endpoint returns positional arrays; the verified field map is in `PROJECT.md`.
- The raw observation array (`obs_st`) has 18 fields, including a wind sample interval at index 5.
- Stats wind is in m/s regardless of the units chosen in the Tempest app.

## Running the tests

```
cd fetcher  && npm install && node --test test/
cd frontend && node --test test/
```

## Deploying

You need a Cloudflare account, a Tempest station ID, device ID and personal access token.

```
cd fetcher
npx wrangler kv namespace create WEATHER_DATA        # put the ids in wrangler.toml
npx wrangler secret put TEMPEST_TOKEN                # never commit the token
npx wrangler deploy

cd ../frontend
./deploy.sh test    # preview URL;  ./deploy.sh main  for production
```

Set `STATION_ID` and `DEVICE_ID` in `fetcher/wrangler.toml`, and the API address in `frontend/js/config.js`.

## License

MIT, see [LICENSE](LICENSE). The vendored Plotly.js keeps its own MIT license (`frontend/vendor/LICENSE-plotly`).

## Credits

Plotly.js (MIT, license in `frontend/vendor/LICENSE-plotly`) is vendored in `frontend/vendor/`. Weather data comes from the WeatherFlow Tempest API.

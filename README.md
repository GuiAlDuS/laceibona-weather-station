# La Ceibona Weather Station

**Live site: https://laceibona-weather.pages.dev**

The station also reports to [Tempest](https://tempestwx.com/station/163576/) and to Weather Underground as [IESPAR102](https://www.wunderground.com/dashboard/pws/IESPAR102).

A public, always-on weather dashboard for a [WeatherFlow Tempest](https://tempest.earth/) station near Mojón de Esparza, Puntarenas, Costa Rica, running entirely on Cloudflare's free tier (Workers, KV, Pages). It does not depend on a home server, Home Assistant or the station's internet uplink once the data has been fetched.

```
Tempest API (our station)          Weather Underground API (two nearby stations)
    | every 5 min (cron)               | every 5 min, same cron run
    +----------------+-----------------+
                     |
Cloudflare Worker  (fetcher/)      -> writes ->  Cloudflare KV
    | serves /api/current (with the neighbours' latest readings), /api/wind24h, /api/fine7d,
    |        /api/forecast, /api/daily, /api/obs/YYYY-MM, /api/status                <- reads
Cloudflare Pages  (frontend/)  plain HTML + Plotly.js + Leaflet, no build step
```

## What it shows

A section menu on the left jumps between the groups below.

- **Now**: current conditions (temperature, humidity, wind, pressure trend, rain, UV, solar, lightning; flags stale data), a map of the latest temperature, rain and wind at our station and two nearby Weather Underground stations ([IESPAR72](https://www.wunderground.com/dashboard/pws/IESPAR72), Esparza, and [IPUNTA186](https://www.wunderground.com/dashboard/pws/IPUNTA186), Puntarenas), a wind rose for the last 24 hours, and the distance of each lightning strike over the last 24 hours.
- **Forecast**: rain probability, thunderstorm hours and temperature for the next 24 hours, then daily tiles for the following 5 days.
- **This week**: hourly temperature for the last 7 days, daily rain and ETo bars with hours of rain, and wind direction hour by hour.
- **A typical day**: month-by-hour heatmaps of temperature and wind speed, and a month-by-direction heatmap of wind direction.
- **Month by month**: rain vs ETo for the last 13 months, and box plots of monthly temperature and wind speed.
- **Year over year**: box plots of temperature per year (same calendar window), cumulative rain, cumulative lightning and the cumulative water balance (rain minus ETo) by day of year.
- **Extremes**: the station's records since it started, in three lists: temperature (highest, lowest, daily range, warmest night, coolest day), rain (wettest day, hour and month, longest wet and dry spells) and sun and air (daily irradiation, ETo, lowest humidity, most lightning in a day, windiest day, strongest gust). The wind records skip days with gusts of 80 km/h or more, when the wind sensor read unrealistically high for hours during and after heavy storms.

ETo is the FAO-56 Penman-Monteith daily reference evapotranspiration, computed from the station's own readings (`frontend/js/eto.js`, shared with the fetcher, validated against the worked example in FAO Irrigation and Drainage Paper 56).

## Layout

| Path | What |
|---|---|
| `fetcher/` | Cloudflare Worker: cron job, data transforms (`daily.js`, `current.js`, `eto.js`, `hourly.js`, `wind.js`), read API (`api.js`), and `scripts/backfill.mjs` for the one-off hourly history |
| `frontend/` | Static site: pure calculation modules (`js/*.js`), Plotly views, tests |
| `PROJECT.md` | Design notes, Tempest data-format findings, and known issues |

## Data notes worth knowing

- The light sensor read about 1.35× too high from 25 Aug to 30 Sep 2026. The API serves those readings as reported; the dashboard divides solar radiation and UV by 1.35 for those days and recomputes ETo (`frontend/js/sensor-fix.js`, explained on the site's `sensor-correction.html`).
- Tempest's `stats/station` endpoint returns positional arrays; the verified field map is in `PROJECT.md`.
- The raw observation array (`obs_st`) has 18 fields, including a wind sample interval at index 5.
- Stats wind is in m/s regardless of the units chosen in the Tempest app.

## Running the tests

```
cd fetcher  && npm install && node --test test/
cd frontend && node --test test/
```

## Deploying

You need a Cloudflare account, a Tempest station ID, device ID and personal access token, and a Weather Underground API key.

```
cd fetcher
npx wrangler kv namespace create WEATHER_DATA        # put the ids in wrangler.toml
npx wrangler secret put TEMPEST_TOKEN                # never commit the token
npx wrangler secret put WU_API_KEY                   # Weather Underground key, for the nearby-stations map
npx wrangler deploy

cd ../frontend
./deploy.sh test    # preview URL;  ./deploy.sh main  for production
```

Set `STATION_ID` and `DEVICE_ID` in `fetcher/wrangler.toml`, and the API address in `frontend/js/config.js`.

## License

MIT, see [LICENSE](LICENSE). The vendored Plotly.js keeps its own MIT license (`frontend/vendor/LICENSE-plotly`).

## Credits

Plotly.js (MIT, license in `frontend/vendor/LICENSE-plotly`) is vendored in `frontend/vendor/`. Weather data comes from the WeatherFlow Tempest API. The nearby stations' data is provided by [Weather Underground](https://www.wunderground.com/) and is shown as reported, without changes.

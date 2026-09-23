# La Ceibona Weather Dashboard — Cloudflare Build

## What this is

A public, always-on weather dashboard for a WeatherFlow Tempest station in
Costa Rica, rebuilt from scratch on Cloudflare's free tier so it never
depends on the home Raspberry Pi, Home Assistant, or Starlink being up.

This replaces an existing Home Assistant + Plotly dashboard that works well
but is fragile — its recorder database got tangled up during development to
the point of silently dropping an hour of statistics every day for two
weeks before the cause was found (see **Section 6**). The cloud rebuild is
a chance to keep every chart that mattered and drop everything that made
the HA version hard to reason about.

**Location:** La Ceibona, Mojón de Esparza, Puntarenas, Costa Rica
**Coordinates:** 9.98, -84.70 (deliberately rounded to ~1 km for the public repo)
**Timezone:** UTC-6, **no DST, ever** — the offset is constant year-round,
which simplifies every day-boundary calculation in this project compared
to a DST-affected location. Always compute "day" in local time (UTC-6),
never in UTC.

---

## 1. Architecture

```
Tempest API
    ↓ (cron, every 5 min)
Cloudflare Worker (fetcher)
    ↓ writes
Cloudflare KV
    ↑ reads
Cloudflare Worker (API layer — can be the same Worker)
    ↑ reads
Cloudflare Pages (static site, Plotly.js charts)
```

Everything free tier. No SQLite, no recorder, no database locking — that
entire category of problem doesn't exist in this architecture. Set a **$0
spending limit** on the Cloudflare account immediately; Workers/KV require
a card on file but the free tier hard-caps rather than auto-charges.

**Credentials needed before starting:** Tempest **Station ID** and
**Personal Access Token**, from `tempestwx.com → Settings → Data
Authorizations`. Store the token via `wrangler secret put`, never in
`wrangler.toml`.

---

## 2. Tempest API

**`stats/station` endpoint** — pre-aggregated daily stats. Use this for
almost everything. It eliminates an entire class of bug this project
almost inherited from the HA build (see 6.1) where daily rain totals had
to be reconstructed by hand from a lifetime-cumulative counter.

**`observations/station` endpoint** — raw observations, used only for
charts that need sub-daily resolution (heatmaps, boxplots, the 7-day daily
temperature lines).

**`obs_st` array field order:**
```
[ts, wind_lull, wind_avg, wind_gust, wind_dir, wind_sample_interval,
 pressure, temp, humidity, lux, uv, solar, rain, precip_type,
 lightning_dist, lightning_count, battery, report_interval]
```
18 fields. Verified against real data (2026-09-18): the earlier version of this
list omitted `wind_sample_interval` at index 5, shifting every later index by one.
```js
const F = {
  ts: 0, wind_lull: 1, wind_avg: 2, wind_gust: 3, wind_dir: 4,
  pressure: 6, temp: 7, humidity: 8, lux: 9, uv: 10,
  solar: 11, rain: 12, precip_type: 13,
  lightning_dist: 14, lightning_count: 15, battery: 16
};
```
Raw observations from `observations/device/{device_id}` are **1-minute** data
(1440 rows/day), and wind is in **m/s** even though the Tempest app is set to
km/h. Downsample to 5-minute buckets before storing, and keep the radiation
factor matched to whatever resolution is summed (60 for 1-min, 300 for 5-min).
Devices: Tempest `ST` = 391086 (wind sensor 4 m above ground), hub `HB` = 391085.

**`stats_day` row layout** (positional array, 34 fields; inferred and checked
against raw observations for 2026-09-18 — fields marked ? are unverified):
```
0 date | 1-3 pressure avg/max/min (hPa) | 4-6 temp avg/max/min (°C)
7-9 RH avg/max/min (%) | 10-12 lux avg/max/min | 13-15 UV avg/max/min
16-18 solar avg/max/min (W/m²) | 19-21 wind avg/gust/lull (m/s)
22 wind dir avg (deg, circular mean) | 23 wind sample interval (s)
24 lightning count | 26 sample count | 27 battery (V) | 28 rain (mm)
30 rain duration (min)
```
Verified exact against raw 1-min data (2026-09-18): pressure, temp, RH, lux max,
UV max, rain (10.54 mm), lightning count (110), rain minutes (160), battery.
Unknown: 25, 29, 31-33.
Some rows are all `null` (connectivity gaps).

**Solar bias — OPEN, decision: leave uncorrected until compared with HA.**
Checked on 2026-08-15, 09-10 and 09-18: stats lux avg = raw 1-min sum / `samples`
(ratio exactly 1440/1379 = 1.044), while the raw endpoint returns all 1440 rows.
Stats solar avg is +4.3%, +12.7% and +5.2% above raw on those days (09-10 has an
extra unexplained excess; its solar max is also 1648 vs 1491 raw).
The stats `samples` field (idx 26) has a step change: median ~1438 from
2024-12 to 2026-03, then ~1379 from 2026-04 onward. So stats averages since
~April 2026 are inflated ~4% relative to earlier months, which biases ETo
slightly high in 2026 vs 2025 and therefore the year-over-year water balance.
Candidate fix if HA confirms it: `solar_avg × samples/1440` for days with
samples ≥ 1300, or compute Rs from raw observations (Phase 5).

**Rain Check correction:** confirmed **not applied** at this location (99.93%
agreement between raw counter deltas and the API's `precipitation_yesterday`
value across 547 days, excluding one known day-boundary attribution
anomaly — see 6.5). Treat the raw sensor and the API value as
interchangeable; no need to prefer one.

---

## 3. KV storage schema

```
current           → latest obs snapshot, overwritten every 5 min
daily:all         → full daily stats history (from stats/station)
                    + computed ETo per day, rebuilt once daily
obs:YYYY-MM       → hourly observations, columnar (see fetcher/src/hourly.js).
                    Back-filled Dec 2024 - Sep 2026 by
                    fetcher/scripts/backfill.mjs; NOT yet appended live
lightning:YYYY    → one [ts, distance_km, count] per minute with strikes
wind24h           → per-minute wind speed/direction, last 24 h, every 5 min
fine7d            → rolling 7-day, 10-minute-resolution rain/pressure/solar
                    (fetcher/src/fine.js), refreshed every 10 min. Hourly `obs:`
                    was too coarse for this station's short convective bursts.
                    (write budget is now ~745/day: current + wind24h + fine7d + daily)
```

Write budget: ~288 (`current`) + 1 (`daily:all`) + 288 (`obs` append) ≈
**577 writes/day**, against a 1,000/day free limit. Comfortable margin.

`daily:all` should be small enough that most charts (monthly bars,
cumulative annual lines, water balance) read only this one key. Only the
heatmap/boxplot/daily-line charts should ever need to pull `obs:*`.

---

## 4. Critical lessons carried over from the HA build

These are real bugs already found and fixed once. Do not rediscover them.

### 4.1 — Three different sensor behaviors need three different handling strategies

**A. Lifetime cumulative counters** (e.g. total precipitation, total
lightning count) — these never reset; they only go up, forever. To get a
daily or monthly total: take the **positive delta** between consecutive
daily maximums. Never sum raw values directly — that double-counts. Watch
for backward jumps (sensor/process restarts) which should be treated as
"delta unknown for that gap," not subtracted.

**B. Resetting counters** (e.g. "precipitation duration today," which
resets to 0 at local midnight) — to get that day's true total, take the
**last value of the day**, never the max. Taking `MAX` across a day can
pick up a stale value left over from *before* the midnight reset if the
data point at exactly `00:00` is itself a rolled-up average spanning the
reset moment (this exact bug produced a "6 hours of rain today" reading on
a day with zero rain).

**C. Pulsing sensors** (e.g. lightning average distance) — the underlying
sensor holds a real value for ~60–70 seconds after a strike, then resets
to 0 until the next strike. If you time-average this over any window
(hourly mean, etc.), the zero-baseline dominates by sheer duration and
dilutes a genuine 34 km strike down to ~6 km. **Never average this kind of
sensor.** Use the max value in the window, or better, log only non-zero
raw pulses as discrete events going forward.

### 4.2 — FAO-56 Penman-Monteith ETo must be computed (Tempest has no ETo field)

Port this from the working Python implementation. Full formula below.
**The single most important gotcha:** the radiation term's conversion
factor depends on the time resolution of the input data — this alone
caused a **12× overestimate** in production once:

```js
// hourly data (3600 seconds per bucket):
const Rs = rs_sum_Wm2 * 3600 / 1_000_000;    // → MJ/m²/day

// 5-minute data (300 seconds per bucket):
const Rs = rs_sum_Wm2 * 300 / 1_000_000;     // → MJ/m²/day
```
`rs_sum_Wm2` is the sum of the bucket-mean W/m² readings (not Wh/m²); each
reading × its bucket length in seconds gives J/m². Always know which
resolution you're summing before choosing the factor.

**Full formula** (daily, FAO-56 Penman-Monteith):

```
Inputs (units): Tmax, Tmin [°C], RHmax, RHmin [%], u_raw = daily mean wind
        [m/s], pressure [hPa] (or estimate from elevation), Rs (solar sum for
        the day, see gotcha above), day-of-year J (local date), latitude [deg],
        elevation z [m]

Constants for this station: latitude = 9.98° (convert to radians: lat_rad),
elevation = 88 m, sensor height for wind = 4 m

Tmean   = (Tmax + Tmin) / 2                          // FAO-56 Eq. 9 definition; NOT the 24h mean
u2      = u_raw * (4.87 / ln(67.8*4 - 5.42))        // wind height correction to 2m (factor ≈ 0.872)
u2      = max(u2, 0.5)                               // FAO-56 / ASCE-EWRI: floor u2 at 0.5 m/s
Rs_MJ   = rs_sum_Wm2 * {300 or 3600} / 1_000_000     // see gotcha above
P       = pressure_hPa / 10                          // or estimate from elevation:
                                                       // 101.3 * ((293-0.0065*z)/293)^5.26
gamma   = 0.000665 * P
e0(T)   = 0.6108 * exp(17.27*T / (T+237.3))
es      = (e0(Tmax) + e0(Tmin)) / 2
ea      = (e0(Tmin)*RHmax/100 + e0(Tmax)*RHmin/100) / 2   // FAO-56 Eq. 17 (preferred);
                                                           // RHmean form (Eq. 19) is less accurate
delta   = 4098 * e0(Tmean) / (Tmean+237.3)^2

dr      = 1 + 0.033*cos(2π/365 * J)
decl    = 0.409*sin(2π/365*J - 1.39)                 // solar declination
ws      = acos(-tan(lat_rad)*tan(decl))              // sunset hour angle
Ra      = (24*60/π) * 0.0820 * dr *
          (ws*sin(lat_rad)*sin(decl) + cos(lat_rad)*cos(decl)*sin(ws))
Rso     = (0.75 + 2e-5*z) * Ra
Rns     = 0.77 * Rs_MJ
sigma   = 4.903e-9
Rnl     = sigma * ((Tmax_K^4 + Tmin_K^4)/2) *
          (0.34 - 0.14*sqrt(max(ea,0))) *
          (1.35 * min(Rs_MJ/Rso, 1) - 0.35)
Rn      = Rns - Rnl
G       = 0   // daily timestep, soil heat flux assumed zero

ETo = (0.408*delta*(Rn-G) + gamma*(900/(Tmean+273))*u2*(es-ea))
      / (delta + gamma*(1+0.34*u2))
```

**Validate this port against known-good values** from the existing
`sensor.eto_diario` history before trusting it for anything downstream —
this was a required step in the original build and should be here too.

### 4.3 — Things that do NOT need to carry over

The SQLite locking issues, `statistics_meta` corruption, the noon-gap
investigation, and every YAML-quoting quirk (e.g. unquoted `y:` being
parsed as the boolean `true`) were all specific to Home Assistant's
recorder and the plotly-graph-card YAML dialect. **None of that applies
here.** This is a clean rebuild in plain JavaScript against KV — that
whole category of bug is structurally impossible in this architecture.

---

## 5. Charts to build (in rough priority order)

**Tier 1 — from `daily:all` only, no `obs:*` needed:**
- Current conditions panel
- Monthly rain bars (rolling ~13 months)
- Monthly ETo vs Rain (grouped bars)
- Cumulative rain by day-of-year, year-over-year comparison lines
- Cumulative lightning by day-of-year, year-over-year
- **Cumulative water balance (Rain − ETo) by day-of-year, year-over-year**
  — this was the single most diagnostically useful chart in the whole HA
  build (it's what revealed the 2026 El Niño drought clearly); prioritize it
- ~~Rain-hours + intensity, monthly~~ — **dropped by the owner** (also removed
  from the HA dashboard); do not build it.
- ~~Daily/monthly/annual solar irradiation bars~~ — **monthly bars built, then dropped by the owner**; do not rebuild
- Annual temperature/ETo/irradiation summary bars

**Tier 2 — needs `obs:*`:**
- Daily temperature lines (7 days, hour-by-hour, gray→red by recency)
- Temperature heatmap (month × hour)
- Wind speed heatmap (month × hour)
- Wind direction frequency heatmap — wrap the y-axis so both "S" labels sit
  at top and bottom and N/trade-wind directions cluster in the middle
- Wind direction daily scatter, jittered, colored by speed
- Monthly + annual temperature boxplots
- Monthly wind speed boxplot

**Tier 3 — lower priority / accept imperfect parity:** *(complete)*
- [x] Wind rose — hand-drawn SVG (the vendored Plotly bundle has no
  `barpolar`), 16 directions x 4 speed bands, **last 24 hours only** (owner's
  choice), fed by the `wind24h` KV key (`GET /api/wind24h`, per-minute
  speed/direction, rewritten every 5 min). Intentionally approximate versus
  the HA `windrose-card`.
- ~~Lightning distance-by-year, categorized~~ — **built, then dropped by the
  owner**; do not rebuild. (Per-strike-minute distances are in `lightning:YYYY`
  and served at `/api/lightning/YYYY`, so it is cheap to revive.)
- ~~Annual temperature/ETo/irradiation summary bars~~ (Tier 1 "Year over
  year") — **also dropped by the owner**.

**Deliberately out of scope:** SPEI (drought index). Already
investigated at length — the station's record (~1.5–2 years) is far too
short to calibrate a seasonally-varying bias correction against any
long reference series; revisit no sooner than ~2035. The water balance
chart above is the right substitute.

---

## 6. Known data quirks specific to this station (context, not bugs to fix)

**6.1 — Two ~7-day connectivity gaps**, July 2025 and July 2026. Cause
known, not worth chasing further. Just don't be alarmed if backfill logic
hits a week-long hole in the record.

**6.2 — One anomalous rain day**, ~Sept 2025, where a single day in the
raw counter shows ~143mm that WeatherFlow's own day-boundary accounting
distributes slightly differently across two adjacent days. Net monthly
total agrees either way; only daily attribution differs. Not a bug.

**6.3 — Severe drought event**, onset ~Dec 2025/Jan 2026, tied to a
strong El Niño. 2026 rainfall through most of the year ran at roughly
**20% of the 2025 baseline** by the station's own gauge (ERA5 reanalysis
shows a milder ~40–75%, which is a known reanalysis characteristic in
sharply bimodal tropical climates, not a station fault). Worth having as
interpretive context on the water balance chart.

**6.4 — Elevation is 88 m**, not the placeholder value used earlier in
development. Already reflected in the ETo formula in 4.2.

**6.5 — Rain Check is not applied at this location** (see Section 2).

---

## 7. Build checklist

**Phase 1 — Fetcher + first data in KV**
- [ ] `npm install -g wrangler`, `wrangler login`
- [ ] `mkdir weather-dashboard && cd weather-dashboard && mkdir fetcher frontend`
- [ ] `cd fetcher && wrangler kv namespace create "WEATHER_DATA"` (+ `--preview`)
- [ ] `wrangler.toml`: cron trigger every 5 min, KV binding, `STATION_ID` var
- [ ] `wrangler secret put TEMPEST_TOKEN`
- [ ] Write `scheduled()` handler: fetch `stats/station`, write `daily:all`
- [ ] `wrangler deploy`, then manually trigger and verify with
      `wrangler kv key get --binding=WEATHER_DATA "daily:all"`

**Phase 2 — ETo port and validation**
- [x] Port the FAO-56 formula (Section 4.2) to JS — `fetcher/src/eto.js`,
      validated against FAO-56 Example 18 (3.88 vs book 3.9), tests in `fetcher/test/`
- [x] Compute ETo for a range of known past days (616 usable days, monthly
      means 3.3–5.4 mm/day, dry season highest)
- [ ] Compare against the existing Python-computed `sensor.eto_diario`
      values before trusting it for anything downstream — PENDING (HA offline);
      pressure comes from the elevation estimate, solar from `avg × 86400 / 1e6`
      (stats avg runs ~5% above raw, see §2), so expect a small high bias

**Phase 3 — Backfill**
- [x] `daily:all` now holds named-field day records from 2024-12-21 to today with
      ETo per complete day (`fetcher/src/daily.js`). No separate backfill script:
      `stats/station` returns the full history, so the daily cron rebuilds it all.
      Days with < 1200 samples, gap rows and today are `complete:false`, `eto:null`.
      `rain_min` (stats idx 30) is verified as rain duration in minutes.

**Phase 4 — Frontend, Tier 1 charts first**
- [x] Worker read endpoint (`fetcher/src/api.js`): `GET /api/daily` and
      `GET /api/current` at https://laceibona-fetcher.gds506.workers.dev
      (CORS open, 5 min / 1 min cache; `current` returns `{"available":false}`
      until the 5-minute fetcher exists)
- [x] Frontend scaffold in `frontend/` (plain HTML + ES modules, Plotly 4.1.1
      cartesian bundle vendored in `frontend/vendor/`, no build step). Pure chart
      logic lives in `frontend/js/`, tested with `node --test frontend/test`.
      Deploy with `frontend/deploy.sh [branch]`: default branch `test` gives the
      preview URL https://test.laceibona-weather.pages.dev; `main` is production
      (https://laceibona-weather.pages.dev), not deployed yet.
- [x] Tier 1: cumulative water balance (rain − ETo) by day of year, year over year
      (includes the solar-bias data caveat as a note under the chart)
- [x] Tier 1: monthly rain vs ETo grouped bars (last 13 months; totals sum only
      days with complete data; partial/gap months flagged with † and coverage in
      the tooltip). Logic in `frontend/js/monthly.js`.
- [x] Tier 1: cumulative rain by day of year, year over year. Counts every day
      with a rain reading (no ETo needed); year totals match Tempest's own
      (2025: 4,859 mm; 2026 to date 20% of 2025 at the same date).
      Shared line-chart code in `frontend/js/line-chart.js`.
- [x] Tier 1: cumulative lightning by day of year, year over year (totals match
      Tempest's stats: 23,145 in 2025). Shares `cumulative.js` / `cumulative-view.js`.
- [x] Tier 1: current conditions panel (`frontend/js/conditions.js`,
      `current-view.js`). Fed by the `current` KV key, built by
      `fetcher/src/current.js` from today's raw 1-minute obs
      (`observations/device/391086` since local midnight; metric, wind m/s).
      The page shows wind in km/h (matching the Tempest app), refreshes every
      60 s, and shows a stale-data banner when the last observation is > 15 min old.
- **RESOLVED — 5-minute cron (activation delay).** The cron (`*/5 * * * *`, single
  trigger; the handler also rebuilds `daily:all` in the 07:00 UTC slot) produced no
  runs for ~80 minutes after it was re-added on 2026-09-21, then ran every 5 minutes
  from 17:20:11 UTC on. What was established (probes + Cloudflare's GraphQL
  `workersInvocationsScheduled` dataset, queried with `wrangler auth token`):
  - **A new or changed cron schedule takes roughly 20-30 minutes before its first
    run** (main Worker: 19.5 min after creation; two fresh probe Workers: ~29 min).
    Do not judge a cron change until ~30 min have passed, and avoid changing the
    schedule while waiting: I kept editing it, and finally deleted it at 17:00,
    which most likely kept it from ever activating.
  - Re-deploying the Worker with an *unchanged* schedule does **not** interrupt an
    active cron (redeployed at 17:37; the 17:40 tick still ran).
  - It is not caused by having a `fetch` handler (a scheduled-only probe and a
    scheduled+fetch probe both fired at 17:40:11).
  - Analytics lag several minutes behind reality; the `current.fetched_at` field and
    `GET /api/status` (last job error) are the faster health checks.
  - The `wrangler.toml` `[triggers]` header must stay above `crons` (twice lost it
    while scripting edits).
  Logs are enabled (`[observability] enabled = true`). The 07:00 UTC `daily:all`
  rebuild path is covered by `fetcher/test/scheduled.test.mjs` but has not yet run
  in production (first chance: 2026-09-22 07:00 UTC).
- [x] Tier 1: monthly solar irradiation bars and a year-over-year
      comparison (mean temperature, ETo/day, solar kWh/m²/day) over the same
      1 Jan–latest-date window in each year. **Both were later removed by the owner** (code deleted in
      commit d82c312, see Phase 6); the solar-bias caveat still shows on the water balance note. Standalone "monthly rain bars" was judged covered by the
      monthly rain vs ETo chart. **Tier 1 is complete.**
- [x] Production deployment to Pages: https://laceibona-weather.pages.dev (`./deploy.sh main`).
- [ ] Build Tier 1 charts (Section 5) before touching `obs:*`-dependent ones

**Phase 5 — `obs:*` fetching + Tier 2/3 charts**
- [x] Back-fill hourly `obs:YYYY-MM` and `lightning:YYYY` (Dec 2024 - Sep 2026)
      and serve them at `/api/obs/YYYY-MM` and `/api/lightning/YYYY`
- [x] Fetcher appends finished hours to `obs:YYYY-MM` hourly (self-healing, up to
      36 h back); `wind24h` also carries hourly temperature incl. the hour in progress
- [x] Build Tier 2 charts (all 7; live on production Pages)
- [x] Tier 3 (wind rose done; the other two items dropped by the owner)

**Phase 6 — Dashboard as shipped (Sept 2026)** — live at https://laceibona-weather.pages.dev

Page order, with a sticky left menu (top bar on narrow screens) over five groups:
- **Now**: current conditions; wind rose (last 24 h, from `wind24h`, SVG).
- **This week**: temperature last 7 days (one categorical colour per day, older days fade:
  each day back keeps 70% opacity of the next, floor 20%; the hour in progress comes from
  `wind24h.hourly`); rain intensity last 7 days (10-minute bars from `fine7d`, shown as an
  hourly rate, with a station pressure line, night shading, and a solar radiation overlay
  behind a toggle); rain + ETo bars over a rain-duration line in hours (two aligned
  panels, no dual axis; today has no ETo because it is only computed for finished days);
  wind direction day by day (hourly dots at their actual hour, viridis by speed).
- **A typical day**: month x hour heatmaps of temperature and wind speed (midnight at the
  top; wind uses viridis, yellow = windiest), month x direction heatmap (16 sectors, south at
  top and bottom, calm hours excluded).
- **Month by month**: rain vs ETo (13 months); box plots of monthly temperature and wind speed.
- **Year over year**: temperature box plot per year over the same 1 Jan - latest-date window;
  cumulative rain; cumulative lightning; cumulative water balance.

Wind speed is shown in km/h everywhere on the dashboard (heatmap, monthly box plot, daily
scatter, wind rose bins and calm cut-off); it is still stored in m/s and converted only at
display time (`MS_TO_KMH` in `frontend/js/windrose.js`).

**Spanish translation (Sept 2026):** the whole dashboard is also served in Spanish at
`/es/`, sharing one JS bundle with the English site at `/`. `frontend/js/i18n.js` picks the
language once per page load from the URL path (`LANG`), and every module that produces text
calls its `t(english, spanish)` helper inline at the call site — both strings live next to
the logic that builds them, rather than in a separate keyed dictionary, since this dashboard's
text changes almost every session. `i18n.js` also holds the locale-aware month/weekday
abbreviations, number formatting, and the 16-point compass (`sectorLabel`; Spanish uses O for
Oeste in place of W: SO, ONO, NO, NNO, ...). `LANG` falls back to English when there is no
`location` global, so every existing Node test (which asserts English strings) keeps passing
unchanged. `frontend/es/index.html` is a hand-translated copy of the static markup, sharing
`style.css`/`js/`/`vendor/` via absolute paths; `deploy.sh` copies the `es/` folder alongside
the rest. A language switch (`.lang-switch`, "EN / ES") sits fixed top-right on wide screens;
on narrow screens it becomes its own full-width sticky bar stacked above the section nav bar,
not a fixed pill, because a fixed pill there permanently covers whatever section link happens
to scroll underneath it.

Owner decisions worth remembering:
- **Dropped, do not rebuild**: rain-hours/intensity *monthly*, lightning distance by year,
  annual summary bars, solar irradiation bars, daily temperature range (line and box versions:
  "doesn't show anything interesting"). Not to be confused with the shipped **weekly, 10-minute**
  rain intensity chart above, which the owner asked for separately.
- Charts are reviewed one at a time on the `test` Pages branch (`./deploy.sh test`, alias
  https://test.laceibona-weather.pages.dev) before `./deploy.sh main`.
- Worker cron (every 5 min): `current` + `wind24h` each run, `fine7d` every second run (10 min),
  `obs:YYYY-MM` append in the first tick of each hour, `daily:all` at 07:00 UTC. About 745 KV
  writes/day of the 1,000 free.
- `/api/lightning/YYYY` and its `lightning:*` data are kept although no chart uses them.
- Plotly gotchas hit: the cartesian bundle has no `barpolar`; date-axis ticks are formatted in
  the viewer's timezone (count days on a numeric axis instead); ids must not clash (`wb-` is the
  water balance).
- Still open from earlier phases: the ETo comparison against the old HA values, and the
  solar-bias caveat (stats averages ~4% high since April 2026).

**Phase 7 — Live-data and polish fixes (Sept 2026)**
- **Rain-week "today" bar goes live**: `daily:all` (and so the rain + ETo weekly chart, the
  monthly rain vs ETo chart, and both cumulative/water-balance charts) is only rebuilt once a
  day at 01:00 local, so an open tab could show a "today" rain figure hours out of date. Fixed
  two ways: (1) `current`'s `today` object gained `rain_min` (count of this-minute-has-rain
  1-minute samples since local midnight, mirroring `daily.js`'s `rain_min` for finished days) —
  `fetcher/src/current.js`; (2) `frontend/js/rainweek.js`'s `withLiveToday(rows, current)`
  overlays `current.today.rain_mm`/`rain_min` onto just the last (in-progress) row, leaving the
  other six finished days and `eto` (never available for today) untouched; `app.js` re-runs this
  overlay and re-renders the chart on every 60 s Current Conditions poll, no extra fetch. (3)
  `load()` (the `daily:all` fetch driving all four of those charts) is now also polled every
  5 min (`setInterval(load, 300_000)`, matching the `/api/daily` server cache TTL) instead of
  only once per page load, so the 01:00 daily rebuild itself shows up without a reload.
- **Wind rose time window**: added a 24 h / 12 h / 6 h toggle next to the wind rose. `wind24h`
  already carries a full 24 h of per-minute data, so no new endpoint was needed — the Worker
  just gained a `cols.ts` (unix seconds, same order as `ws`/`wd`) in `fetcher/src/wind.js`, and
  `frontend/js/windrose.js`'s `sliceWindow(doc, hours)` cuts the requested window client-side,
  relative to the doc's own last sample rather than wall-clock time. Switching windows re-slices
  already-fetched data and re-renders; it never refetches.
- **Spanish month names on the year-over-year charts**: `frontend/js/line-chart.js` (shared by
  cumulative rain, cumulative lightning, and cumulative water balance) used Plotly's `tickformat:
  "%b"` / `hoverformat: "%b %d"`, which Plotly always renders in English — there is no Spanish
  Plotly locale bundle vendored, deliberately, since this project hand-rolls i18n everywhere
  else. Fixed by building the axis tick labels from the app's own localized `MONTHS` array
  (`tickmode: "array"` + `tickvals`/`ticktext`, matching how every other chart already does month
  labels) and switching the Spanish hover date to numeric `%d/%m` so no D3-formatted month name
  can leak through; the English page's hover format is unchanged.
- **X-axis label crowding**: intermittently, a chart's two-line category-axis tick label (month
  name + `†` + 2-digit year, or a day label + optional second "so far" line) rendered tall enough
  to crowd the `.muted.small` note text sitting right below the chart, because those layouts used
  a **fixed pixel `margin.b`** with no `automargin` — Plotly never measured the actual label and
  grew the margin to fit; it just trusted a guessed constant. Added `automargin: true` to the
  x-axis of all six affected charts: both month×hour heatmaps, wind direction by month, monthly
  rain vs ETo, both monthly box plots, and the rain + ETo weekly chart.
- **GitHub link**: a footer at the bottom of the page (inside `<main>`, so it shares the content
  column's width) links to the repo, with an inline SVG GitHub mark (`fill="currentColor"`, no
  external asset) — `.site-footer`/`.github-link` in `style.css`.
- The fetcher Worker has no separate test environment (single `wrangler.toml` target, single
  `WEATHER_DATA` KV namespace) — only the Pages frontend has a `test` branch. Backend changes in
  this phase were additive-only (new fields, nothing removed) and deployed straight to the one
  Worker; the frontend was still built and reviewed on `test` first as usual.

**Phase 8 — Visual redesign and a Forecast section (Sept 2026)**

- **Redesign, "instrument readout" direction**: moved away from the rounded, bordered, SaaS-style
  cards toward a flatter, more scientific/minimal look, done in three reviewed steps (type/color,
  layout, components):
  - Self-hosted IBM Plex Sans (body/labels) and IBM Plex Mono (every number: hero value, stat
    tiles, table cells, toggle labels) as `.woff2` files vendored under `frontend/vendor/fonts/`
    (`vendor/LICENSE-ibm-plex`), matching the project's existing no-external-CDN pattern for
    Plotly. `--text-primary` retuned from `#0b0b0b` to `#17171a` (a deliberate ink, not a
    tinted-near-black default); `--border` retuned to match. Chart color tokens (`--series-*`,
    `--seq-*`, `--grid`, `--baseline`) were left untouched.
  - `.card` changed from a rounded/bordered/background box to a flat block: sections within a
    group are separated by a hairline top rule (`.card + .card`) instead of a filled surface; the
    first card in each group has no rule, relying on the group heading as the separator. The
    current-conditions stat tiles (`.tile`) kept their bordered box treatment, since those are
    genuinely discrete tiles, not full sections.
  - Toggle buttons (`.toggle-btn`/`.toggle-group`) dropped the pill shape for a flat rectangular
    segmented-control look (shared border, single hairline between options in a group); labels
    moved to the mono font.
  - Added a monospace "station ID" line under the location line in the header — coordinates,
    elevation, station type, and (added later in this phase) a recording-since date pulled from
    `/api/daily`'s `first_day` field and a link to the public Tempest station page
    (`https://tempestwx.com/station/163576/`).
  - **Section dividers**: top-level groups (Now, Forecast, This week, ...) now get a heavier top
    rule in the site's one accent blue (`--series-1`, 2px) with more space above it, and
    `h2.group-title` switched to the mono font — reusing the same "structural metadata" register
    as the station-ID line and toggle labels, to visually separate "new section" from "next chart
    in this section" (the thin neutral `.card + .card` rule).
- **New Forecast group** (added right after Now, before This week — forward-looking, so it
  belongs in neither the live "Now" panel nor the retrospective "This week" charts):
  - Backend: `fetcher/src/forecast.js` (`buildForecast`) calls Tempest's `/better_forecast`
    endpoint (same Bearer token as every other endpoint; confirmed empirically, since Tempest's
    own docs show `?token=` query-param auth but the Bearer header this project already uses
    works fine here too) and writes a `forecast` KV key: `days` (today + next 6, named JSON
    fields — `day_start_local`, `conditions`, `icon`, `temp_high/low`, `precip_probability`,
    `precip_type`) and `hours` (today's remaining hours only — Tempest's hourly array naturally
    starts from "now", never backfills to local midnight — same field shape plus `hour` 0-23
    local and `temp`). Refreshed twice an hour (`minute % 30 < 5`), served at `/api/forecast`
    (600 s cache, `{"available":false}` before the first run, same convention as `current`).
  - Frontend: `frontend/js/forecast.js` (pure) + `frontend/js/forecast-view.js` (DOM). Daily tiles
    reuse the current-conditions `.tile`/`.cc-grid` components (shared via `common.js`, which
    current-view.js's `el`/`num`/`tile` helpers moved into so both modules could use them).
    Hourly is a bar chart (rain probability, colored by storm risk) with a temperature line on a
    second y-axis and night shading, modeled directly on the existing weekly rain-intensity
    chart's grammar (`rainfine-view.js`) rather than inventing a new chart type. A plain-language
    outlook sentence ("Rain likely 13:00–16:00, thunderstorms possible 13:00–21:00.") is
    generated from contiguous-hour ranges (`contiguousRanges` in `forecast.js`).
  - Tempest's `conditions` text is English-only free text, never shown as-is on the Spanish page;
    a small fixed lookup table in `forecast-view.js` translates the `icon` field instead, which is
    a documented 19-value enum.
  - **Gotcha, verified against real data**: the hourly forecast's `precip_type` is a **whole-day**
    flag, not per-hour — it read `"storm"` on every hour of a thunderstorm-forecast day, including
    a 10%-probability "Partly Cloudy" hour at 23:00. Only `icon` actually varies hour to hour, so
    `isStormHour` keys off `icon` containing `"thunderstorm"` only, never `precip_type`. Don't
    reintroduce the `precip_type` check.
  - `day_start_local` and hourly `time` are true unix timestamps that land at 06:00 UTC for local
    (UTC-6) midnight — verified against real production data, same "shift by `LOCAL_OFFSET_S`"
    convention already used throughout this project, not a new one.
  - **`wrangler dev --remote --test-scheduled` is not reliable for verifying new cron jobs**: it
    did not reliably flush `ctx.waitUntil` KV writes before the `/__scheduled` HTTP response
    returned, even after 20-30 s waits and a forced-`true` job condition, with no error logged
    either. Verifying a new scheduled job against production KV is more reliable by deploying the
    (additive, safe) change for real and polling the live KV/API after the next natural cron tick,
    not through local dev against remote bindings.
  - The "no data showing" symptom reported during review turned out to be a stale browser tab, not
    a code bug — the full render path was re-run against the real API response in a small Node
    DOM-shim harness with no errors, and the deployed bundle was diffed byte-for-byte against
    local source, before concluding it was client-side caching. A hard refresh fixed it.
- Deployed to production: `./deploy.sh main` (frontend) and `wrangler deploy` (fetcher, additive
  only, no separate environment as noted above).

**Phase 9 — Forecast polish and a solar-irradiation-by-year chart (Sept 2026)**

- **Hourly forecast note clarified**: a reader asked whether the "Thunderstorm risk" bar color
  implied a separate risk on top of the rain-probability height. Reworded `fh-note` to say
  explicitly that bar height is always that hour's rain probability and red just marks *what kind*
  of rain is expected (a thunderstorm is itself a precipitation event, not an added-on risk).
- **Forecast section reordered and tightened**: "Today, hour by hour" now comes before the daily
  tiles (today's own forecast is fully covered by the hourly chart, so showing it twice added
  nothing), and the daily card was renamed "The next 5 days" and now excludes today entirely
  (`renderForecast(forecast.slice(1))` in `app.js`; `dayLabel`'s index 0 is now always "Tomorrow").
  Daily tile temperatures switched from 0 to 1 decimal place.
- **Reversed a prior "do not rebuild" decision, deliberately**: added "Total solar irradiation by
  year" to the end of Year over year — a bar chart of total kWh/m² per calendar year (same 1
  Jan-to-latest-common-date windowing as the temperature-by-year box plot, so a partial current
  year is compared fairly). Monthly solar bars and a temp/ETo/solar "annual summary" chart were
  explicitly dropped earlier (Phase 6/§5) and are still not to be rebuilt — this is a different
  shape (a single annual total, not monthly, not bundled with other metrics) requested for a
  different, now-explicit purpose: judging whether the site's solar resource is good enough to be
  worth installing panels, not general dashboard content. If a monthly breakdown is ever requested
  for the same purpose (it would show the seasonal low point that actually drives system sizing,
  which the annual total hides), that is a deliberate, purpose-driven exception to the Phase 6
  decision too, not a silent reversal — ask first, same as this one was raised before building.
  - **Computed from raw hourly `obs:` observations, not `daily:all`'s `solar_avg`**, specifically
    to sidestep the stats-endpoint solar bias documented in §2 (that bias is a `stats/station`
    sample-averaging artifact; the raw `observations/device` endpoint feeding the hourly documents
    never had it). `frontend/js/solar.js`'s `annualSolarTotals(docs)` sums each hour's mean W/m²
    reading as a hour's worth of Wh/m² (`/1000` for kWh/m²) — as of this writing: 2025 1,298 kWh/m²
    (5.0 kWh/m²/day), 2026 1,406 kWh/m² (5.4 kWh/m²/day) through 22 Sep, both comfortably above
    the ~2.5-3 kWh/m²/day that already supports widespread rooftop solar in much lower-resource
    markets like Germany.
  - Added `["sy", ...]` to `app.js`'s `OBS_CHARTS` array (the same generic prepare/draw/error-per-
    chart loop already driving the monthly and yearly temperature/wind charts), so it gets its
    reload, theme-redraw and error handling for free — no bespoke load function needed.

**Phase 10 — Rolling forecast, a chart-height fix, shared day ticks and lightning in the last 24 hours (Sept 2026)**

- **"Today, hour by hour" became "Next 24 hours"**: late in the day the today-only chart was mostly
  empty (Tempest's hourly forecast starts at the current hour, and the fetcher kept only today's
  date). The fetcher now also writes `next_hours` — the hourly forecast from the current hour on,
  24 + 2 entries so the page can drop hours that ended while the document sat in KV (30-minute
  refresh plus the 10-minute API cache) and still show a full 24. `hours` (today only) is kept
  unchanged for backward compatibility; `forecastHours()` falls back to it. The chart's x axis is
  now a date axis of zone-less local stamps (`localStamp()` in `forecast.js`), with a dotted
  midnight rule labelled "Tomorrow"; the outlook text and the table say "tomorrow" for runs that
  start after midnight. Options considered and not taken: a 12-hour window (all night after 18:00,
  so it would miss the next afternoon's storms), switching to tomorrow after a cutoff, and filling
  past hours with observations.
- **Tick labels spilling onto the note below (the real cause)**: the Phase 7 `automargin` fix did
  not hold because margins were never the problem. Eleven Plotly charts had no CSS height on
  desktop; with `responsive: true`, the 5-minute `Plotly.react` refresh collapsed their div to 0px
  while the absolutely positioned SVG stayed 450px, so the following note slid under the axis.
  Reproduced headless by letting virtual time run past two refreshes and measuring each div
  against its SVG. Fixed by giving every Plotly chart an explicit height in `style.css`
  (450px, the Plotly default they were already drawn at). **Any new Plotly chart must get an
  explicit CSS height on desktop and in the mobile rule.**
- **Shared day axis for the week charts**: "Rain intensity", "Rain and ETo" and "Wind direction,
  day by day" now mark every midnight with a tick and centre each day's name under its noon, every
  other name on narrow screens. `dayAxisTicks()` in `common.js` does it with Plotly minor ticks for
  the numeric day axes (the wind chart keeps its gridlines, now on the midnights); "Rain and ETo"
  is a category axis, where minor ticks don't apply, so `categoryDayTicks()` draws the same marks
  as pixel-length shapes. This also fixed that chart's day names overlapping on phones.
- **Lightning, last 24 hours** (Now section, after the wind rose): one dot per strike minute at
  the sensor's estimated distance, sized by strike count, with night shading and a midnight rule.
  The fetcher's 5-minute `wind24h` job already downloaded the last 24h of per-minute observations,
  so it now also writes `lightning` ([ts, distance km, count], the same rows as `lightning:YYYY`)
  at no extra API cost. Note `lightning:YYYY` is **back-fill only** — no cron job updates it.
  The chart note explains the sensor's fixed distance steps and ~40 km range; an empty day shows
  "No lightning detected in the last 24 hours" over the axes. This is a different chart from the
  dropped "lightning distance by year" (Phase 6), requested explicitly.
- Both backend changes were additive and deployed straight to the single Worker, as in Phase 7.

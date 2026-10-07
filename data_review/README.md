# Data review

Checks on the station's own readings, separate from the dashboard.

## Solar radiation and UV compared with nearby stations (Sept 2026)

From about 25 Aug 2026 our Tempest's light sensor reads bright midday values too high (see PROJECT.md). This compares our solar radiation and UV with two nearby Weather Underground stations, to see whether the difference between us jumps around that date:

| Station | Where | Sensor |
|---|---|---|
| IESPAR102 | La Ceibona (ours) | Tempest |
| IESPAR72 | Esparza downtown, higher up | Tempest |
| IPUNTA186 | Close by, near the sea | Davis Vantage Pro2 Plus |

Periods: June to September 2025 (baseline) and 1 June 2026 to the latest day.

**Result:** from about 25 Aug 2026 ours reads about 1.35× high at every light level, and neither neighbour changed; see `results/findings.md` (tables) and `results/report.html` (the same with charts).

**Outcome (5 Oct 2026):** Tempest support recalibrated the sensor overnight into 1 Oct. With data to 4 Oct the midday solar ratio against IESPAR72 is 1.01 before 25 Aug, 1.37 from 25 Aug to 30 Sep and 1.00 since (UV 1.00 / 1.35 / 1.03). The dashboard now divides those 37 days by 1.35 (`frontend/js/sensor-fix.js`; PROJECT.md Phase 15).

`sensor_peaks.py` writes `frontend/js/sensor-peaks.js`, each day's peak solar radiation from our own 1-minute readings (`tempest-minutes.mjs`), for the chart on the site's `sensor-correction.html`:

```
python3 data_review/sensor_peaks.py
```

`results/` is git-ignored: everything in it is built from other owners' Weather Underground data, which their terms allow for personal use only. The scripts rebuild `compare.json` and the two HTML reports; `findings.md` is written by hand and exists only locally.

Our own station's Weather Underground feed only starts on 23 Sep 2026, so our side comes from Tempest directly. IPUNTA186 only reports from 30 Jul 2026.

Files:

- `wu-history.mjs` downloads each station's 5-minute history from the Weather Underground API into `data/wu/<station>/<date>.json`. `data/` is git-ignored because it holds other owners' data; re-run the script to rebuild it. The API key (`WU_API_KEY`) lives in `fetcher/.dev.vars`.

  ```
  cd data_review
  node --env-file=../fetcher/.dev.vars wu-history.mjs --from 2025-06-01 --to 2025-09-30
  node --env-file=../fetcher/.dev.vars wu-history.mjs --from 2026-06-01
  ```

- `tempest-history.mjs` downloads our own raw 1-minute Tempest readings into `data/tempest/IESPAR102/<date>.json`, reduced to the same 5-minute intervals (needs `TEMPEST_TOKEN`, also in `fetcher/.dev.vars`):

  ```
  cd data_review
  node --env-file=../fetcher/.dev.vars tempest-history.mjs --from 2025-06-01 --to 2025-09-30
  node --env-file=../fetcher/.dev.vars tempest-history.mjs --from 2026-06-01
  ```

- `compare.py` reads both caches, prints the comparison and writes `results/compare.json`:

  ```
  python3 data_review/compare.py
  ```

- `report.py` runs `compare.py` and fills `report_template.html` into `results/report.html`, a page with charts:

  ```
  python3 data_review/report.py
  ```

## Temperature compared with nearby stations (Sept 2026)

`temperature.py` uses the same caches to work out what share of the day we are hotter or colder than each neighbour, by time of day (2026 only: IESPAR72 moved to downtown Esparza in the 2026 dry season). Results are in `results/findings.md`.

```
python3 data_review/temperature.py
```

`temperature_report.py` runs it and fills `temperature_template.html` into `results/temperature.html`, a page with charts:

```
python3 data_review/temperature_report.py
```

## WBGT: our formula against Tempest's own figure (Oct 2026)

The dashboard's heat chart needs a wet-bulb globe temperature (WBGT) for every hour since Dec 2024. Tempest reports one with its current readings but keeps no history of it and does not publish the formula. Home Assistant (the WeatherFlow Forecast integration, which copies Tempest's `wet_bulb_globe_temperature`) has recorded it since 26 Jan 2025, so that record is the reference.

Exports, read-only, from the Home Assistant machine (`data/ha/`, git-ignored):

```
ssh hassio@HOST "sqlite3 -readonly -csv /config/home-assistant_v2.db \"SELECT s.start_ts, s.mean, s.min, s.max FROM statistics s JOIN statistics_meta m ON m.id = s.metadata_id WHERE m.statistic_id = 'sensor.la_ceibona_sensors_wet_bulb_globe_temperature' ORDER BY s.start_ts\"" > data_review/data/ha/wbgt_hourly.csv
ssh hassio@HOST "sqlite3 -readonly -csv /config/home-assistant_v2.db \"SELECT replace(m.entity_id,'sensor.la_ceibona_sensors_',''), s.last_updated_ts, s.state FROM states s JOIN states_meta m ON m.metadata_id = s.metadata_id WHERE m.entity_id IN ('sensor.la_ceibona_sensors_wet_bulb_globe_temperature','sensor.la_ceibona_sensors_wet_bulb_temperature','sensor.la_ceibona_sensors_temperature','sensor.la_ceibona_sensors_humidity','sensor.la_ceibona_sensors_solar_radiation','sensor.la_ceibona_sensors_wind_speed','sensor.la_ceibona_sensors_station_pressure','sensor.la_ceibona_sensors_dew_point') ORDER BY s.last_updated_ts\"" > data_review/data/ha/states_recent.csv
```

Our hourly documents go in `data/obs/` (`curl -o data_review/data/obs/2026-04.json https://laceibona-fetcher.gds506.workers.dev/api/obs/2026-04`, one per month). Then:

```
node data_review/wbgt_compare.mjs --fit
```

Results (7 Oct 2026; 4,018 raw polls from 27 Sep to 7 Oct, 11,683 hourly means from Jan 2025):

- At night Tempest's WBGT is 0.7 × wet bulb + 0.3 × air temperature to the rounding, with the ordinary (psychrometric) wet bulb. So it is 0.7 wet bulb + 0.2 globe + 0.1 air with a globe temperature that only departs from the air in sunshine.
- A globe formula of the Dimiceli, Piltz and Amburn (2011) form, with four constants fitted to the raw polls (`frontend/js/wbgt.js`), reproduces Tempest's WBGT to 0.04 °C on them, and Home Assistant's hourly means over 20 months to 0.22 °C (bias −0.10; 0.21 in sunshine, no drift between seasons). The fitted constants are not Tempest's own and one is physically odd (almost no direct-beam share): they reproduce the number, they do not explain it.
- Liljegren's model (`liljegren.mjs`), the usual reference method, reads about 3 °C higher in sunshine here with its own minimum wind, and about 1.7 °C higher with the wind floored at 1 m/s. The station is sheltered (most hours under 1.5 m/s) and that model is very sensitive to calm air. It gives 4 to 8 hours a day in the top category against 1 to 5 with Tempest's method, and almost no seasonal dip.
- Chosen for the dashboard (owner's decision, 7 Oct 2026): Tempest's method, so the chart agrees with the Tempest app and the Home Assistant history. There is no globe thermometer here to say which is closer to the truth.
- September 2026 in Home Assistant shows 11.4 hours a day in the top category: Tempest computed it from the inflated light readings. The dashboard uses the corrected ones (4.8).
- Hourly means are enough for this chart: on 16 sample days, counting from 1-minute readings instead moved each category by under half an hour a day (totals within 0.3).


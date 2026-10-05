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

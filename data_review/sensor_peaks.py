"""Daily peak solar radiation from our own 1-minute readings, for the dashboard's page on the light-sensor
correction (frontend/sensor-correction.html).

Reads the cache written by tempest-minutes.mjs (data/tempest-min/) and writes frontend/js/sensor-peaks.js: each day's
highest 10-minute average, 1 June to 31 October, for 2025 and 2026. Only our own station's data, so the output can
be published. Run from anywhere: python3 data_review/sensor_peaks.py
"""
import json, glob, os, statistics as st
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "data", "tempest-min", "IESPAR102")
OUT = os.path.join(HERE, "..", "frontend", "js", "sensor-peaks.js")
FROM, TO = "06-01", "10-31"
MIN_MINUTES = 1300  # a day with fewer readings could have missed its peak

peaks = {}
for f in sorted(glob.glob(f"{SRC}/*.json")):
    day = os.path.basename(f)[:10]
    if not (FROM <= day[5:] <= TO):
        continue
    doc = json.load(open(f))
    i = doc["cols"].index("solar")
    slots = defaultdict(list)
    for r in doc["rows"]:
        if r[i] is not None:
            slots[r[0] // 600].append(r[i])
    if sum(len(v) for v in slots.values()) < MIN_MINUTES:
        continue
    peaks[day] = round(max(sum(v) / len(v) for v in slots.values() if len(v) >= 8))

with open(OUT, "w") as out:
    out.write("// Each day's highest 10-minute average of solar radiation (W/m²), as the station reported it, 1 June to 31 October.\n")
    out.write("// Written by data_review/sensor_peaks.py from our own 1-minute readings; do not edit by hand.\n")
    out.write(f"export const PEAKS = {json.dumps(peaks, separators=(',', ':'))};\n")

med = lambda a, b: (lambda v: f"{st.median(v):.0f} (top quarter of days {sorted(v)[int(.75 * len(v))]}, {len(v)} days)")([p for d, p in peaks.items() if a <= d <= b])
print(f"{len(peaks)} days, {min(peaks)} to {max(peaks)}")
for label, a, b in [("2025, 25 Aug-30 Sep", "2025-08-25", "2025-09-30"), ("2026, 1 Jun-24 Aug", "2026-06-01", "2026-08-24"), ("2026, 25 Aug-30 Sep", "2026-08-25", "2026-09-30"), ("2026, from 1 Oct", "2026-10-01", "2026-10-31")]:
    print(f"  median daily peak {label}: {med(a, b)}")

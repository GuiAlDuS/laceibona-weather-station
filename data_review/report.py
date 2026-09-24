"""Builds results/report.html: the solar/UV comparison with nearby stations, as a page with charts.

Runs compare.py for the numbers, reduces them to what the charts and tables need, and fills report_template.html.
    python3 data_review/report.py
"""
import datetime as dt, json, os, runpy, statistics as st
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
g = runpy.run_path(os.path.join(HERE, "compare.py"))
result, data, OURS, NEIGH, CUT = g["result"], g["data"], g["OURS"], g["NEIGH"], g["CUT"]


def rolling(series, days=7):
    """Centred rolling median over calendar days of {date: value}; needs 3 values in the window."""
    dates = sorted(series)
    out = {}
    for d in dates:
        c = dt.date.fromisoformat(d)
        win = [series[x] for x in dates if abs((dt.date.fromisoformat(x) - c).days) <= days // 2]
        if len(win) >= 3:
            out[d] = round(st.median(win), 3)
    return out


def period_median(series, sel):
    vals = [v for d, v in series.items() if sel(d)]
    return round(st.median(vals), 2) if vals else None


is25 = lambda d: d < "2026"
before = lambda d: "2026" <= d < CUT
after = lambda d: d >= CUT

page = {"cut": CUT, "stations": {}, "peaks": {}, "ratios": {}, "hours": {}, "tables": {}}

# Coverage per station.
for s, d in data.items():
    days = sorted({v[0][:10] for v in d.values()})
    page["stations"][s] = {"first": days[0], "last": days[-1], "days": len(days)}

# 1. Daily peak solar, per station: daily values and 7-day rolling median, split by year. A day whose peak is under
# 200 W/m² is an outage (the sensor reported little or nothing), not weather, and is left out.
MIN_PEAK = 200
for s in data:
    daily = {d: v["max"] for d, v in result["daily"]["solar"][s].items() if v["max"] and v["max"] >= MIN_PEAK}
    page["peaks"][s] = {"daily": daily, "smooth": rolling(daily)}

# 2. Daily midday ratio ours/neighbour, with rolling median.
for n in NEIGH:
    daily = {d: round(v["median"], 3) for d, v in result["ratio_daily"]["solar"][n].items()}
    page["ratios"][n] = {"daily": daily, "smooth": rolling(daily)}

# 3. Ratio by hour of day, per period.
for n in NEIGH:
    page["hours"][n] = {p: {h: round(v["median"], 3) for h, v in hs.items()} for p, hs in result["ratio_hour"]["solar"][n].items()}

# Tables: peaks and ratios per period, solar and UV.
periods = [("Jun–Sep 2025", is25), ("Jun 2026 – 24 Aug", before), ("25 Aug 2026 on", after)]
for name in ["solar", "uv"]:
    floor = MIN_PEAK if name == "solar" else 2  # UV index: the same outage days read under 2
    page["tables"][f"peak_{name}"] = {s: [period_median({d: v["max"] for d, v in result["daily"][name][s].items() if v["max"] and v["max"] >= floor}, sel) for _, sel in periods] for s in data}
    page["tables"][f"ratio_{name}"] = {n: [period_median({d: v["median"] for d, v in result["ratio_daily"][name][n].items()}, sel) for _, sel in periods] for n in NEIGH}
page["tables"]["periods"] = [p for p, _ in periods]

# Seasonal control: 2025 split at the same date.
rd = {d: v["median"] for d, v in result["ratio_daily"]["solar"]["IESPAR72"].items()}
page["tables"]["control"] = {
    "2025_before": period_median(rd, lambda d: d < "2025-08-25"),
    "2025_after": period_median(rd, lambda d: "2025-08-25" <= d < "2026"),
    "2026_before": period_median(rd, before),
    "2026_after": period_median(rd, after),
}

# The jump by brightness of the neighbour's reading (2026, before vs after).
bins = [(300, 500), (500, 700), (700, 900), (900, 1100)]
page["tables"]["brightness"] = {}
for n in NEIGH:
    per = defaultdict(lambda: defaultdict(list))
    for slot, (local, a, _) in data[OURS].items():
        o = data[n].get(slot)
        if not o or a is None or o[1] is None or a < 50 or o[1] < 300 or local[:4] != "2026":
            continue
        p = "before" if local[:10] < CUT else "after"
        for lo, hi in bins:
            if lo <= o[1] < hi:
                per[p][lo].append(a / o[1])
    page["tables"]["brightness"][n] = [
        {"bin": f"{lo:,}–{hi:,}", "before": round(st.median(per["before"][lo]), 2), "after": round(st.median(per["after"][lo]), 2)}
        for lo, hi in bins
        if len(per["before"][lo]) > 20 and len(per["after"][lo]) > 20
    ]

tpl = open(os.path.join(HERE, "report_template.html")).read()
out = os.path.join(HERE, "results", "report.html")
open(out, "w").write(tpl.replace("/*DATA*/null", json.dumps(page, separators=(",", ":"))))
print(f"wrote {out} ({os.path.getsize(out) // 1024} KB)")

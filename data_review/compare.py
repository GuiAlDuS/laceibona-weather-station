"""Compare solar radiation and UV between IESPAR102 (ours), IESPAR72 and IPUNTA186 from the cached WU history.

Reads the caches written by wu-history.mjs (data/wu/, the neighbours) and tempest-history.mjs (data/tempest/, ours:
our WU feed only starts on 23 Sep 2026), prints the key numbers and writes results/compare.json
(the series behind the report's charts). Run from anywhere: python3 data_review/compare.py
"""
import json, glob, os, statistics as st
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "data", "wu")
OURS, NEIGH = "IESPAR102", ["IESPAR72", "IPUNTA186"]
CUT = "2026-08-25"
OUT = os.path.join(HERE, "results", "compare.json")


def load(station):
    """{interval end epoch: (local 'YYYY-MM-DD HH:MM', solar, uv)}. Ours comes from Tempest, where each interval's
    last reading stands in for WU's single stored reading; the neighbours come from WU."""
    out = {}
    ours = station == OURS
    folder = os.path.join(HERE, "data", "tempest", station) if ours else os.path.join(ROOT, station)
    for f in sorted(glob.glob(f"{folder}/*.json")):
        for o in json.load(open(f)):
            end = -(-o["epoch"] // 300) * 300
            out[end] = (o["local"][:16], o["solarLast"] if ours else o["solarHigh"], o["uvLast"] if ours else o["uvHigh"])
    return out


data = {s: load(s) for s in [OURS] + NEIGH}
for s, d in data.items():
    days = {v[0][:10] for v in d.values()}
    print(f"{s}: {len(d)} readings over {len(days)} days")

pct = lambda xs, p: sorted(xs)[min(len(xs) - 1, int(p * len(xs)))] if xs else None


def daily(station, idx):
    """Per day: max and 95th percentile of the 10:00-13:00 readings (idx 1 = solar, 2 = uv)."""
    by = defaultdict(list)
    mx = defaultdict(float)
    for local, *vals in data[station].values():
        v = vals[idx - 1]
        if v is None:
            continue
        day, hour = local[:10], int(local[11:13])
        mx[day] = max(mx[day], v)
        if 10 <= hour < 13:
            by[day].append(v)
    return {d: {"max": mx[d], "p95": pct(by[d], 0.95)} for d in sorted(mx)}


result = {"daily": {}, "ratio_daily": {}, "ratio_hour": {}}
for idx, name in [(1, "solar"), (2, "uv")]:
    result["daily"][name] = {s: daily(s, idx) for s in data}

# Simultaneous ratios ours/neighbour, both readings bright enough to be sun, not cloud or dawn.
MIN = {"solar": 300, "uv": 3}
for idx, name in [(1, "solar"), (2, "uv")]:
    result["ratio_daily"][name] = {}
    result["ratio_hour"][name] = {}
    for n in NEIGH:
        per_day = defaultdict(list)
        per_hour = {"2025": defaultdict(list), "before": defaultdict(list), "after": defaultdict(list)}
        for slot, (local, *ov) in data[OURS].items():
            other = data[n].get(slot)
            if not other:
                continue
            a, b = ov[idx - 1], other[idx]
            if a is None or b is None or a < MIN[name] or b < MIN[name]:
                continue
            day, hour = local[:10], int(local[11:13])
            r = a / b
            if 10 <= hour < 13:
                per_day[day].append(r)
            period = "2025" if day < "2026" else ("before" if day < CUT else "after")
            per_hour[period][hour].append(r)
        result["ratio_daily"][name][n] = {d: {"median": st.median(v), "n": len(v)} for d, v in sorted(per_day.items()) if len(v) >= 3}
        result["ratio_hour"][name][n] = {p: {h: {"median": st.median(v), "n": len(v)} for h, v in sorted(hs.items()) if len(v) >= 10} for p, hs in per_hour.items()}

json.dump(result, open(OUT, "w"))


def period_stats(series, key):
    """Median over days of a daily value, per period."""
    out = {}
    for p, sel in [("Jun-Sep 2025", lambda d: d < "2026"), ("Jun 2026 to 24 Aug", lambda d: "2026" <= d < CUT), ("25 Aug 2026 on", lambda d: d >= CUT)]:
        vals = [v[key] for d, v in series.items() if sel(d) and v[key] is not None]
        out[p] = (round(st.median(vals), 2) if vals else None, round(pct(vals, 0.9), 2) if vals else None, len(vals))
    return out


for name in ["solar", "uv"]:
    print(f"\n== {name}: daily peak (median of days, 90th pct of days, days) ==")
    for s in data:
        print(f"  {s:10s}", period_stats(result["daily"][name][s], "max"))
    print(f"== {name}: midday ratio ours/neighbour (median of daily medians, p90, days) ==")
    for n in NEIGH:
        print(f"  vs {n:10s}", period_stats(result["ratio_daily"][name][n], "median"))
    print(f"== {name}: ratio by hour (median) ==")
    for n in NEIGH:
        rh = result["ratio_hour"][name][n]
        hours = sorted({h for p in rh.values() for h in p})
        print(f"  vs {n}: hour " + " ".join(f"{h:>5d}" for h in hours))
        for p in ["2025", "before", "after"]:
            print(f"    {p:7s}       " + " ".join(f"{rh[p][h]['median']:5.2f}" if h in rh[p] else "    -" for h in hours))

"""Temperature: La Ceibona vs nearby stations, share of the day hotter/colder.

Pairs our Tempest 5-minute temperatures with each neighbour's WU 5-minute
history (same caches as compare.py). Only 2026 for the comparison: IESPAR72
moved to downtown Esparza in the 2026 dry season, so its 2025 data is a
different site (kept only to show the move).

    python3 data_review/temperature.py

temperature_report.py imports compute() for the HTML report.
"""
import collections
import datetime as dt
import glob
import json
import os
import statistics as st

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
OURS = "IESPAR102"
NEIGH = ["IESPAR72", "IPUNTA186"]
YEAR = "2026"
THRESHOLD = 0.5  # °C; smaller gaps count as "about the same"
DAY_HOURS = range(10, 15)  # 10:00–14:59, for the weekly daytime gap
NIGHT_HOURS = [20, 21, 22, 23, 0, 1, 2, 3, 4]


def load(path, year=None):
    """{5-minute slot epoch: (local time, °C, solar W/m²)}."""
    out = {}
    for f in sorted(glob.glob(os.path.join(DATA, path, f"{year or ''}*.json"))):
        for o in json.load(open(f)):
            if o.get("tempAvg") is not None:
                out[o["epoch"] // 300 * 300] = (o["local"], o["tempAvg"], o.get("solarHigh"))
    return out


def shares(diffs):
    n = len(diffs)
    hot = sum(x > THRESHOLD for x in diffs) / n
    cold = sum(x < -THRESHOLD for x in diffs) / n
    return {"hotter": round(100 * hot, 2), "same": round(100 * (1 - hot - cold), 2), "colder": round(100 * cold, 2)}


def quantiles(v):
    q = st.quantiles(v, n=4)
    return round(q[0], 2), round(st.median(v), 2), round(q[2], 2)


def pairs(ours, theirs):
    """[(local time, ours − theirs)] for every 5 minutes both reported."""
    return [(loc, t - theirs[k][1]) for k, (loc, t, _) in ours.items() if k in theirs]


def sky_classes(ref):
    """Each day's sky, from the reference station's daily solar energy split in thirds."""
    energy = collections.defaultdict(float)
    for loc, _, s in ref.values():
        if s is not None:
            energy[loc[:10]] += s * 300 / 3.6e6  # kWh/m²
    vals = sorted(energy.values())
    lo, hi = vals[len(vals) // 3], vals[2 * len(vals) // 3]
    return {d: "cloudy" if e < lo else "sunny" if e > hi else "mixed" for d, e in energy.items()}, (round(lo, 2), round(hi, 2))


def compute():
    ours = load(f"tempest/{OURS}", YEAR)
    theirs = {s: load(f"wu/{s}", YEAR) for s in NEIGH}
    # Sky from IESPAR72's light sensor: ours reads ~1.35× high since 25 Aug 2026 (see findings.md).
    sky, sky_cut = sky_classes(theirs["IESPAR72"])
    res = {"threshold": THRESHOLD, "sky_cut": sky_cut, "share": {}, "hours": {}, "sky": {}, "coverage": {}}

    for s in NEIGH:
        p = pairs(ours, theirs[s])
        days = sorted({loc[:10] for loc, _ in p})
        res["coverage"][s] = {"first": days[0], "last": days[-1], "days": len(days), "pairs": len(p)}
        res["share"][s] = {**shares([x for _, x in p]), "median": round(st.median(x for _, x in p), 2)}

        by_hour = collections.defaultdict(list)
        for loc, x in p:
            by_hour[int(loc[11:13])].append(x)
        res["hours"][s] = [{"h": h, **shares(by_hour[h]), "q": quantiles(by_hour[h])} for h in range(24)]

        res["sky"][s] = {}
        for cls in ["cloudy", "mixed", "sunny"]:
            sel = [(loc, x) for loc, x in p if sky.get(loc[:10]) == cls]
            hours = collections.defaultdict(list)
            for loc, x in sel:
                hours[int(loc[11:13])].append(x)
            res["sky"][s][cls] = {
                "days": len({loc[:10] for loc, _ in sel}),
                **shares([x for _, x in sel]),
                "median_by_hour": [round(st.median(hours[h]), 2) for h in range(24)],
            }

    # A typical day at all three: median temperature per half hour, over the 5 minutes all three reported.
    common = [k for k in ours if all(k in theirs[s] for s in NEIGH)]
    slots = {s: collections.defaultdict(list) for s in [OURS, *NEIGH]}
    for k in common:
        loc = ours[k][0]
        half = int(loc[11:13]) * 2 + int(loc[14:16]) // 30
        slots[OURS][half].append(ours[k][1])
        for s in NEIGH:
            slots[s][half].append(theirs[s][k][1])
    cdays = sorted({ours[k][0][:10] for k in common})
    res["typical"] = {
        "first": cdays[0], "last": cdays[-1], "days": len(cdays),
        "median": {s: [round(st.median(slots[s][i]), 2) for i in range(48)] for s in slots},
    }

    # The move: weekly daytime and night gap to IESPAR72, both years (2025 = the old site).
    ours_all, esp_all = load(f"tempest/{OURS}"), load("wu/IESPAR72")
    daily = collections.defaultdict(lambda: ([], []))
    for loc, x in pairs(ours_all, esp_all):
        h = int(loc[11:13])
        if h in DAY_HOURS:
            daily[loc[:10]][0].append(x)
        elif h in NIGHT_HOURS:
            daily[loc[:10]][1].append(x)
    weeks = collections.defaultdict(lambda: ([], []))
    for d, (day, night) in daily.items():
        date = dt.date.fromisoformat(d)
        monday = (date - dt.timedelta(days=date.weekday())).isoformat()
        if len(day) >= 30:  # at least half of 10:00–14:59
            weeks[monday][0].append(st.median(day))
        if len(night) >= 50:
            weeks[monday][1].append(st.median(night))
    res["move"] = [
        {"week": w, "days": len(dy), "day": round(st.median(dy), 2), "night": round(st.median(nt), 2) if nt else None}
        for w, (dy, nt) in sorted(weeks.items())
        if len(dy) >= 4  # skip weeks with outages
    ]
    return res


if __name__ == "__main__":
    res = compute()
    for s in NEIGH:
        c, sh = res["coverage"][s], res["share"][s]
        print(f"== vs {s}, {YEAR}: {c['days']} days, {c['pairs']} paired 5-min intervals")
        print(f"   hotter {sh['hotter']:.0f}%  colder {sh['colder']:.0f}%  median {sh['median']:+.2f} °C")
        hours = res["hours"][s]
        for h0 in range(0, 24, 3):
            # Hours hold the same number of 5-minute intervals, give or take gaps, so average the three.
            hot = st.mean(hours[h]["hotter"] for h in range(h0, h0 + 3))
            cold = st.mean(hours[h]["colder"] for h in range(h0, h0 + 3))
            print(f"   {h0:02d}-{h0 + 3:02d} h  hotter {hot:3.0f}%  colder {cold:3.0f}%")
        for cls, v in res["sky"][s].items():
            print(f"   {cls:6s} days ({v['days']:3d}): hotter {v['hotter']:3.0f}%  colder {v['colder']:3.0f}%")

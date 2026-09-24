# Solar radiation and UV: La Ceibona vs nearby stations

Run on 24 Sep 2026 with `compare.py` (numbers below are its output). Our data: Tempest 1-minute readings reduced to 5-minute intervals (`tempest-history.mjs`). Neighbours: Weather Underground 5-minute history (`wu-history.mjs`). Coverage: IESPAR102 (ours) 233 days, IESPAR72 225 days (June–Sept 2025 and 2026), IPUNTA186 56 days (it only reports from 30 Jul 2026).

## Conclusion

From about **25 August 2026 our light sensor reads roughly 1.35× higher** than before, for solar radiation and UV alike. Neither neighbour shows any change on that date, and the same weeks of 2025 show none either, so it is not the season or the sky: it is our sensor (or something right at it). The increase is about the same at every brightness level and most hours of the day, which looks like a change of gain or calibration rather than a reflection, which would come and go with the sun's angle.

## Evidence

**1. Each day's peak solar radiation (W/m², median over days)**

| Station | Jun–Sep 2025 | Jun 2026 – 24 Aug | 25 Aug 2026 on |
|---|---|---|---|
| IESPAR102 (ours) | 1,041 | 1,058 | **1,425** |
| IESPAR72 (Tempest, Esparza) | 1,169 | 1,039 | 1,089 |
| IPUNTA186 (Davis, seaside) | – | 1,127 | 1,132 |

Our daily peak jumped by about 35%; the neighbours moved by 0–5%.

**2. Our midday reading ÷ the neighbour's, at the same 5 minutes** (10:00–13:00, both above 300 W/m²; median of daily medians)

| vs | 2025, Jun–24 Aug | 2025, 25 Aug–Sep | 2026, Jun–24 Aug | 2026, 25 Aug on |
|---|---|---|---|---|
| IESPAR72 | 0.89 | 0.88 | 1.01 | **1.37** |
| IPUNTA186 | – | – | 0.92 | **1.22** |

The 2025 columns are the seasonal control: last year nothing happened at 25 August. (The shift from 0.89 in 2025 to 1.01 in early 2026 is on IESPAR72's side: its own peaks fell from about 1,170 to 1,040 W/m² while ours stayed near 1,050.)

UV behaves the same: ours ÷ IESPAR72 went 1.00 → 1.35, and ours ÷ IPUNTA186 1.04 → 1.37.

**3. The jump at every brightness level** (2026, ours ÷ neighbour, before → after 25 Aug, by the neighbour's reading)

| Neighbour reading | vs IESPAR72 | vs IPUNTA186 |
|---|---|---|
| 300–500 W/m² | ×1.35 | ×1.30 |
| 500–700 W/m² | ×1.39 | ×1.30 |
| 700–900 W/m² | ×1.32 | ×1.25 |
| 900–1,100 W/m² | ×1.31 | ×1.41 |

**4. When it started.** Our daily peak goes from about 1,000–1,200 W/m² to 1,380–1,480 from 25 Aug and stays there. A few earlier days (16, 18 and 20 Aug) already show the high ratio, so it may have started intermittently about a week before.

## Correction to an earlier reading

The first look at our own data (23 Sep) concluded that only bright midday readings were inflated and that readings below about 800 W/m² were unchanged. With the neighbours as a reference, that is not the case: moderate readings are about 1.35× too high as well. The first look could not tell cloud from sensor at moderate levels; the comparison can.

## Limits

- The neighbours use different sensors and sites, so only changes in the ratio mean something, not the absolute values.
- IPUNTA186 has only 24 days before 25 Aug, and no 2025.
- Local clouds make single days noisy (e.g. 2 Sep, ratio 2.04); the medians over weeks are what count.

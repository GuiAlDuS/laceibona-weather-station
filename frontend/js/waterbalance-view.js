import { $, nf, mm, MONTHS, longDate, fillLegend, SOLAR_NOTE } from "./common.js";
import { renderYearLines, colorFor } from "./line-chart.js";
import { monthEnds, summarize } from "./balance.js";

export function renderWaterBalanceChart(series) {
  return renderYearLines({ el: $("wb-chart"), series, key: "balance", format: (v) => mm(v).replace(" mm", "") });
}

export function renderWaterBalanceText(series) {
  const latest = series.at(-1).year;
  fillLegend(
    $("wb-legend"),
    [...series].reverse().map((y) => ({ label: y.year, color: colorFor(y.year, latest) })),
    "line",
  );

  const s = summarize(series);
  const el = $("wb-summary");
  el.replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = mm(s.balance);
  el.append(`${s.year} to ${longDate(s.throughDate)}: `, strong);
  if (s.prev) el.append(` · ${s.prevYear} at the same date: ${mm(s.prev.balance)}`);
  el.append(` · rain ${nf.format(Math.round(s.rain))} mm, ETo ${nf.format(Math.round(s.eto))} mm`);

  const parts = series.filter((y) => y.skipped > 0).map((y) => `${y.skipped} in ${y.year}`);
  const skipped = parts.length ? `Days without complete sensor data are left out of both rain and ETo (${parts.join(", ")}). ` : "";
  $("wb-note").textContent = `${skipped}ETo is FAO-56 Penman-Monteith computed from the station's own readings. ${SOLAR_NOTE}`;

  const t = $("wb-table");
  t.replaceChildren();
  const head = t.createTHead().insertRow();
  const corner = document.createElement("th");
  corner.textContent = "Month end (mm)";
  head.append(corner);
  for (const y of series) {
    const th = document.createElement("th");
    th.textContent = y.year;
    head.append(th);
  }
  const ends = series.map(monthEnds);
  const body = t.createTBody();
  MONTHS.forEach((name, i) => {
    const row = body.insertRow();
    row.insertCell().textContent = name;
    ends.forEach((e) => {
      const p = e[String(i + 1).padStart(2, "0")];
      row.insertCell().textContent = p ? mm(p.balance).replace(" mm", "") : "";
    });
  });
}

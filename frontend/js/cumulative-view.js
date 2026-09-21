import { $, nf, MONTHS, longDate, fillLegend } from "./common.js";
import { renderYearLines, colorFor } from "./line-chart.js";
import { summarizeCumulative, monthEndsCumulative } from "./cumulative.js";

// prefix: element id prefix; unit: axis/label unit; lead: first sentence of the note.
export const RAIN = { prefix: "rn", unit: "mm", lead: "Daily totals from the station's rain gauge, added up from 1 January." };
export const LIGHTNING = { prefix: "lt", unit: "strikes", lead: "Lightning strikes detected by the station's sensor, added up from 1 January." };

const fmt = (cfg, v) => `${nf.format(Math.round(v))} ${cfg.unit}`;

export function renderCumulativeChart(cfg, series) {
  return renderYearLines({ el: $(`${cfg.prefix}-chart`), series, key: "cum", format: (v) => nf.format(Math.round(v)), unit: cfg.unit });
}

export function renderCumulativeText(cfg, series) {
  const p = cfg.prefix;
  const latest = series.at(-1).year;
  fillLegend(
    $(`${p}-legend`),
    [...series].reverse().map((y) => ({ label: y.year, color: colorFor(y.year, latest) })),
    "line",
  );

  const s = summarizeCumulative(series);
  const el = $(`${p}-summary`);
  el.replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = fmt(cfg, s.total);
  el.append(`${s.year} to ${longDate(s.throughDate)}: `, strong);
  if (s.prevTotal !== null) {
    el.append(` · ${s.prevYear} at the same date: ${fmt(cfg, s.prevTotal)}`);
    if (s.percentOfPrev !== null) el.append(` · ${Math.round(s.percentOfPrev)}% of ${s.prevYear}`);
  }

  const gaps = series.filter((y) => y.missing > 0).map((y) => `${y.missing} in ${y.year}`);
  $(`${p}-note`).textContent =
    cfg.lead +
    (gaps.length ? ` Days with no reading are not counted (${gaps.join(", ")}).` : "") +
    " The most recent day is still in progress.";

  const t = $(`${p}-table`);
  t.replaceChildren();
  const head = t.createTHead().insertRow();
  const corner = document.createElement("th");
  corner.textContent = `Month end (${cfg.unit})`;
  head.append(corner);
  for (const y of series) {
    const th = document.createElement("th");
    th.textContent = y.year;
    head.append(th);
  }
  const ends = series.map(monthEndsCumulative);
  const body = t.createTBody();
  MONTHS.forEach((name, i) => {
    const row = body.insertRow();
    row.insertCell().textContent = name;
    ends.forEach((e) => {
      const pt = e[String(i + 1).padStart(2, "0")];
      row.insertCell().textContent = pt ? nf.format(Math.round(pt.cum)) : "";
    });
  });
}

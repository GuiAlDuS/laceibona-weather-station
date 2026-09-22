import { $, nf, MONTHS, longDate, fillLegend } from "./common.js";
import { t } from "./i18n.js";
import { renderYearLines, colorFor } from "./line-chart.js";
import { summarizeCumulative, monthEndsCumulative } from "./cumulative.js";

// prefix: element id prefix; unit: axis/label unit; lead: first sentence of the note.
export const RAIN = { prefix: "rn", unit: "mm", lead: t("Daily totals from the station's rain gauge, added up from 1 January.", "Totales diarios del pluviómetro de la estación, acumulados desde el 1 de enero.") };
export const LIGHTNING = { prefix: "lt", unit: t("strikes", "rayos"), lead: t("Lightning strikes detected by the station's sensor, added up from 1 January.", "Rayos detectados por el sensor de la estación, acumulados desde el 1 de enero.") };

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
  el.append(t(`${s.year} to ${longDate(s.throughDate)}: `, `${s.year} al ${longDate(s.throughDate)}: `), strong);
  if (s.prevTotal !== null) {
    el.append(t(` · ${s.prevYear} at the same date: ${fmt(cfg, s.prevTotal)}`, ` · ${s.prevYear} en la misma fecha: ${fmt(cfg, s.prevTotal)}`));
    if (s.percentOfPrev !== null) el.append(t(` · ${Math.round(s.percentOfPrev)}% of ${s.prevYear}`, ` · ${Math.round(s.percentOfPrev)}% de ${s.prevYear}`));
  }

  const gaps = series.filter((y) => y.missing > 0).map((y) => `${y.missing} ${t("in", "en")} ${y.year}`);
  $(`${p}-note`).textContent =
    cfg.lead +
    (gaps.length ? t(` Days with no reading are not counted (${gaps.join(", ")}).`, ` Los días sin lectura no se cuentan (${gaps.join(", ")}).`) : "") +
    t(" The most recent day is still in progress.", " El día más reciente aún está en curso.");

  const table = $(`${p}-table`);
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  const corner = document.createElement("th");
  corner.textContent = t(`Month end (${cfg.unit})`, `Fin de mes (${cfg.unit})`);
  head.append(corner);
  for (const y of series) {
    const th = document.createElement("th");
    th.textContent = y.year;
    head.append(th);
  }
  const ends = series.map(monthEndsCumulative);
  const body = table.createTBody();
  MONTHS.forEach((name, i) => {
    const row = body.insertRow();
    row.insertCell().textContent = name;
    ends.forEach((e) => {
      const pt = e[String(i + 1).padStart(2, "0")];
      row.insertCell().textContent = pt ? nf.format(Math.round(pt.cum)) : "";
    });
  });
}

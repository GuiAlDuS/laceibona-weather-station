import { $, el, num, nf, longDate, MONTHS } from "./common.js";
import { t } from "./i18n.js";
import { WET_DAY_MM } from "./extremes.js";

const BODIES = ["xt-body", "xr-body", "xs-body"];

const hours = (h) => `${h}–${h + 1} h`;
const when = (r) => (typeof r.hour === "number" ? `${longDate(r.date)}, ${hours(r.hour)}` : longDate(r.date));
const fromTo = (r) => t(`${longDate(r.date)}, from ${num(r.tmin)} to ${num(r.tmax)} °C`, `${longDate(r.date)}, de ${num(r.tmin)} a ${num(r.tmax)} °C`);
const monthYear = (key) => `${MONTHS[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}`;
const duration = (min) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
const spell = (s) => [t(`${s.days} days`, `${s.days} días`), `${longDate(s.from)} → ${longDate(s.to)}`];

// One record as a row: its name (with an optional line saying what it measures) on the left, the value and when it
// happened on the right. `record` null (nothing to build it from) shows a dash.
function row(label, sub, record, value, detail) {
  const item = el("div", "ex-row");
  const dt = el("dt", null, label);
  if (sub) dt.append(el("span", "ex-sub", sub));
  const dd = el("dd");
  dd.append(el("span", "ex-value", record ? value(record) : "—"));
  if (record) dd.append(el("span", "ex-sub", detail(record)));
  item.append(dt, dd);
  return item;
}

export function renderExtremes(x) {
  const T = x.temperature;
  const R = x.rain;
  const S = x.sunAir;
  const W = x.wind;
  const kmh = (r) => `${num(r.value)} km/h`;
  const deg = (r) => `${num(r.value)} °C`;
  const mmOf = (digits) => (r) => `${digits ? num(r.value, digits) : nf.format(Math.round(r.value))} mm`;
  const kwh = (r) => `${num(r.value, 2)} kWh/m²`;
  const perDay = t("/day", "/día");

  $("xt-body").replaceChildren(
    row(t("Highest", "Más alta"), null, T.highest, deg, when),
    row(t("Lowest", "Más baja"), null, T.lowest, deg, when),
    row(t("Largest daily range", "Mayor amplitud diaria"), null, T.widestRange, deg, fromTo),
    row(t("Smallest daily range", "Menor amplitud diaria"), null, T.narrowestRange, deg, fromTo),
    row(t("Warmest night", "Noche más cálida"), t("highest minimum", "mínima más alta"), T.warmestNight, deg, when),
    row(t("Coolest day", "Día más fresco"), t("lowest maximum", "máxima más baja"), T.coolestDay, deg, when),
  );
  $("xr-body").replaceChildren(
    row(t("Wettest day", "Día más lluvioso"), null, R.wettestDay, mmOf(1), when),
    row(t("Wettest hour", "Hora más lluviosa"), null, R.wettestHour, mmOf(1), when),
    row(t("Wettest month", "Mes más lluvioso"), null, R.wettestMonth, mmOf(0), (r) => monthYear(r.month)),
    row(t("Longest rain in a day", "Lluvia más larga en un día"), t("time with rain", "tiempo con lluvia"), R.longestRain, (r) => duration(r.value), when),
    row(t("Longest wet spell", "Racha lluviosa más larga"), `≥ ${WET_DAY_MM} mm${perDay}`, R.wetSpell, (r) => spell(r)[0], (r) => spell(r)[1]),
    row(t("Longest dry spell", "Racha seca más larga"), `< ${WET_DAY_MM} mm${perDay}`, R.drySpell, (r) => spell(r)[0], (r) => spell(r)[1]),
  );
  $("xs-body").replaceChildren(
    row(t("Highest daily irradiation", "Mayor irradiación diaria"), null, S.mostSun, kwh, when),
    row(t("Lowest daily irradiation", "Menor irradiación diaria"), null, S.leastSun, kwh, when),
    row(t("Highest daily ETo", "Mayor ETo diaria"), null, S.highestEto, (r) => `${num(r.value)} mm`, when),
    row(t("Lowest humidity", "Humedad más baja"), null, S.lowestHumidity, (r) => `${num(r.value, 0)} %`, when),
    row(t("Most lightning in a day", "Más rayos en un día"), t("as counted by Tempest", "según el conteo de Tempest"), S.mostLightning, (r) => nf.format(r.value), when),
    row(t("Windiest day", "Día más ventoso"), t("mean speed", "velocidad media"), W.windiestDay, kmh, when),
    row(t("Strongest gust", "Ráfaga más fuerte"), null, W.strongestGust, kmh, when),
  );
  const notes = [
    t(
      "The windiest day and the strongest gust skip days with gusts of 80 km/h or more: on those the wind sensor read unrealistically high for hours, during and after heavy storms.",
      "El día más ventoso y la ráfaga más fuerte omiten los días con ráfagas de 80 km/h o más: en ellos el sensor de viento leyó valores poco realistas durante horas, en tormentas fuertes y después de ellas.",
    ),
    t("Sunshine and ETo count from 1 Jan 2025.", "El sol y la ETo cuentan desde el 1 ene 2025."),
  ];
  if (R.drySpell?.noData) notes.push(t(`The longest dry spell includes ${R.drySpell.noData} days without data, taken as dry.`, `La racha seca más larga incluye ${R.drySpell.noData} días sin datos, que se toman como secos.`));
  $("ex-foot").textContent = notes.join(" ");
  if (x.from && x.to) $("ex-period").textContent = t(`Records from ${longDate(x.from)} to ${longDate(x.to)}.`, `Registros del ${longDate(x.from)} al ${longDate(x.to)}.`);
}

export function renderExtremesUnavailable(message) {
  for (const id of BODIES) {
    const p = el("p", "muted", message);
    const item = el("div", "ex-row");
    item.append(p);
    $(id).replaceChildren(item);
  }
}

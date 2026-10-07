import { t } from "./i18n.js";
import { HEAT_LEVELS } from "./wbgthours.js";

// "Hours of heat a day, by WBGT level": the heat categories (wbgthours.js) with their colours and names, for the
// stacked monthly bars of levelhours-view.js. Each label carries the WBGT its category starts at.
const c1 = (v) => t(v.toFixed(1), v.toFixed(1).replace(".", ","));
const LOOK = {
  caution: ["--risk-1", t("Caution", "Precaución")],
  moderate: ["--risk-2", t("Moderate", "Moderado")],
  high: ["--risk-3", t("High", "Alto")],
  veryHigh: ["--risk-4", t("Very high", "Muy alto")],
  extreme: ["--risk-5", t("Extreme", "Extremo")],
};
const floor = c1(HEAT_LEVELS[0].from);

export const WBGT_HOURS = {
  prefix: "hw",
  levels: HEAT_LEVELS.map((l) => ({ key: l.key, colorToken: LOOK[l.key][0], label: `${LOOK[l.key][1]} (${c1(l.from)} °C+)` })),
  strong: ["veryHigh", "extreme"],
  most: (month, h) => t(`Most hours of very high or extreme heat: ${month} (${h} h a day).`, `Más horas de calor muy alto o extremo: ${month} (${h} h al día).`),
  fewest: (month, h) => t(`Fewest: ${month} (${h} h a day).`, `Menos: ${month} (${h} h al día).`),
  totalHead: t(`WBGT ${floor} °C or more, h`, `WBGT de ${floor} °C o más, h`),
  note: t(
    `Each bar is an average day of the month: how many of its hours fell in each heat category, with the strongest at the bottom. The wet-bulb globe temperature (WBGT) measures heat stress in the sun: it combines air temperature, humidity, wind and sunshine, so it reads lower than the air temperature in dry, breezy shade and close to it in humid, still, sunny weather. The station has no globe thermometer, so each hour's WBGT is worked out from its average temperature, humidity, wind, solar radiation and pressure, with a formula fitted to reproduce the WBGT that Tempest itself reports (within about 0.2 °C). It is an estimate: Liljegren's model, the usual reference method, gives about 3 °C more in full sun at this station. The categories are the US Army's heat categories 1 to 5, each starting at the WBGT shown in the legend; hours below ${floor} °C are not drawn. Days missing more than an hour of readings, such as sensor outages or today, are left out. `,
    `Cada barra es un día promedio del mes: cuántas de sus horas cayeron en cada categoría de calor, con la más fuerte abajo. La temperatura de globo y bulbo húmedo (WBGT) mide el estrés por calor al sol: combina temperatura del aire, humedad, viento y sol, así que marca menos que la temperatura del aire a la sombra con aire seco y brisa, y casi lo mismo con humedad, aire quieto y sol. La estación no tiene termómetro de globo, por lo que el WBGT de cada hora se calcula a partir de sus promedios de temperatura, humedad, viento, radiación solar y presión, con una fórmula ajustada para reproducir el WBGT que reporta el propio Tempest (con cerca de 0,2 °C de diferencia). Es una estimación: el modelo de Liljegren, el método de referencia habitual, da unos 3 °C más a pleno sol en esta estación. Las categorías son las categorías de calor 1 a 5 del Ejército de EE. UU., cada una a partir del WBGT indicado en la leyenda; las horas por debajo de ${floor} °C no se dibujan. Los días a los que les falta más de una hora de lecturas, como cortes del sensor o el día de hoy, se excluyen. `,
  ),
};

import { t } from "./i18n.js";

// "Hours of sun a day, by UV level": the standard UV index risk levels (uvhours.js) with their colours and names,
// for the stacked monthly bars of levelhours-view.js.
export const UV_HOURS = {
  prefix: "uv",
  levels: [
    { key: "moderate", colorToken: "--risk-1", label: t("Moderate (3–5)", "Moderado (3–5)") },
    { key: "high", colorToken: "--risk-2", label: t("High (6–7)", "Alto (6–7)") },
    { key: "veryHigh", colorToken: "--risk-3", label: t("Very high (8–10)", "Muy alto (8–10)") },
    { key: "extreme", colorToken: "--risk-5", label: t("Extreme (11+)", "Extremo (11+)") },
  ],
  strong: ["veryHigh", "extreme"],
  most: (month, h) => t(`Most hours of very high or extreme UV: ${month} (${h} h a day).`, `Más horas de UV muy alto o extremo: ${month} (${h} h al día).`),
  fewest: (month, h) => t(`Fewest: ${month} (${h} h a day).`, `Menos: ${month} (${h} h al día).`),
  totalHead: t("UV 3 or more, h", "UV 3 o más, h"),
  note: t(
    "Each bar is an average day of the month: how long the UV index stayed at each risk level, with the strongest level at the bottom. Time at low UV (0–2) and the night are not drawn, so the bar's height is the time with a UV index of 3 or more. Counted from 10-minute averages of the station's readings between 06:00 and 18:00. Days missing more than an hour of those readings, such as sensor outages or today, are left out. ",
    "Cada barra es un día promedio del mes: cuánto tiempo estuvo el índice UV en cada nivel de riesgo, con el nivel más fuerte abajo. El tiempo con UV bajo (0–2) y la noche no se dibujan, así que la altura de la barra es el tiempo con un índice UV de 3 o más. Se cuenta a partir de promedios de 10 minutos de las lecturas de la estación entre las 06:00 y las 18:00. Los días a los que les falta más de una hora de esas lecturas, como cortes del sensor o el día de hoy, se excluyen. ",
  ),
};

import { $, token, fillLegend } from "./common.js";
import { t } from "./i18n.js";
import { SPEED_BINS, CALM_BELOW_KMH_TEXT } from "./windrose.js";

const seqColors = () => [token("--seq-1"), token("--seq-2"), token("--seq-3"), token("--seq-4")];

const NS = "http://www.w3.org/2000/svg";
const C = 200; // centre of the 400 x 400 viewBox
const R = 150; // radius of the outer ring
const HALF = 10; // half the angular width of a wedge, degrees (sectors are 22.5 wide, leaving a gap)

const el = (name, attrs = {}, text) => {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
};
const pt = (r, deg) => [C + r * Math.sin((deg * Math.PI) / 180), C - r * Math.cos((deg * Math.PI) / 180)];

function wedge(r0, r1, deg) {
  const [x0, y0] = pt(r1, deg - HALF);
  const [x1, y1] = pt(r1, deg + HALF);
  const [x2, y2] = pt(r0, deg + HALF);
  const [x3, y3] = pt(r0, deg - HALF);
  return `M${x0},${y0}A${r1},${r1} 0 0 1 ${x1},${y1}L${x2},${y2}A${r0},${r0} 0 0 0 ${x3},${y3}Z`;
}

const niceStep = (max) => [1, 2, 5, 10, 20].find((s) => max / s <= 4) ?? 20;
const f1 = (v) => `${v.toFixed(1)}%`;

export function renderWindRose(rose, periodText) {
  const svg = el("svg", { viewBox: "0 0 400 400", role: "img", "aria-label": t("Wind rose: how often the wind blows from each direction, by speed", "Rosa de los vientos: con qué frecuencia sopla el viento desde cada dirección, y a qué velocidad") });
  const step = niceStep(rose.maxPercent);
  const top = Math.ceil(rose.maxPercent / step) * step || step;
  const scale = (p) => (p / top) * R;
  const colors = seqColors();
  const grid = token("--grid");
  const muted = token("--text-muted");

  for (let p = step; p <= top; p += step) {
    svg.append(el("circle", { cx: C, cy: C, r: scale(p), fill: "none", stroke: grid, "stroke-width": 1 }));
    svg.append(el("text", { x: C + 4, y: C - scale(p) - 3, fill: muted, "font-size": 11 }, `${p}%`));
  }
  rose.sectors.forEach((s, i) => {
    const name = s.name;
    const deg = i * 22.5;
    if (i % 4 === 0) svg.append(el("line", { x1: C, y1: C, x2: pt(R, deg)[0], y2: pt(R, deg)[1], stroke: grid, "stroke-width": 1 }));
    const [lx, ly] = pt(R + (i % 4 === 0 ? 20 : 14), deg);
    svg.append(el("text", { x: lx, y: ly, fill: i % 4 === 0 ? token("--text-secondary") : muted, "font-size": i % 4 === 0 ? 13 : 10, "text-anchor": "middle", "dominant-baseline": "middle" }, name));

    let cum = 0;
    s.bins.forEach((p, b) => {
      if (p <= 0) return;
      const path = el("path", { d: wedge(scale(cum), scale(cum + p), deg), fill: colors[SPEED_BINS.length - 1 - b], stroke: token("--surface"), "stroke-width": 1 });
      path.append(el("title", {}, t(`From ${name}, ${SPEED_BINS[b].label}: ${f1(p)} of the time`, `Desde ${name}, ${SPEED_BINS[b].label}: ${f1(p)} del tiempo`)));
      svg.append(path);
      cum += p;
    });
  });
  $("wr-chart").replaceChildren(svg);

  fillLegend(
    $("wr-legend"),
    [...SPEED_BINS].map((b, i) => ({ label: b.label, color: colors[SPEED_BINS.length - 1 - i] })),
    "rect",
  );
  const busiest = [...rose.sectors].sort((a, b) => b.percent - a.percent)[0];
  $("wr-summary").textContent = t(
    `Most often from ${busiest.name} (${f1(busiest.percent)} of the time). Calm (under ${CALM_BELOW_KMH_TEXT}): ${f1(rose.calmPercent)}.`,
    `Con más frecuencia desde ${busiest.name} (${f1(busiest.percent)} del tiempo). Calma (menos de ${CALM_BELOW_KMH_TEXT}): ${f1(rose.calmPercent)}.`,
  );
  $("wr-note").textContent = t(
    `Each wedge is the share of time the wind came from that direction, split by its one-minute average speed; ${periodText}. ` +
      "Gusts are not shown, so speeds read low. This is a close approximation of a classic wind rose, not an exact copy.",
    `Cada cuña es la proporción del tiempo en que el viento sopló desde esa dirección, dividida por su velocidad media de un minuto; ${periodText}. ` +
      "Las ráfagas no se muestran, por lo que las velocidades se leen bajas. Esto es una aproximación cercana a una rosa de los vientos clásica, no una copia exacta.",
  );

  const table = $("wr-table");
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const h of [t("From", "Desde"), ...SPEED_BINS.map((b) => b.label), t("Total", "Total")]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = table.createTBody();
  for (const s of rose.sectors) {
    const row = body.insertRow();
    row.insertCell().textContent = s.name;
    for (const p of s.bins) row.insertCell().textContent = f1(p);
    row.insertCell().textContent = f1(s.percent);
  }
}

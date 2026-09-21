export const $ = (id) => document.getElementById(id);
export const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const narrowScreen = window.matchMedia("(max-width: 600px)");

export const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
export const mm = (v) => {
  const r = Math.round(v);
  return `${r < 0 ? "−" : r > 0 ? "+" : ""}${nf.format(Math.abs(r))} mm`;
};
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const longDate = (iso) => `${+iso.slice(8)} ${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;

export const chartFont = () => ({
  family: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  color: token("--text-secondary"),
  size: 12,
});

export const hoverLabel = () => ({
  bgcolor: token("--surface"),
  bordercolor: token("--baseline"),
  font: { ...chartFont(), color: token("--text-primary") },
});

// entries: [{ label, color }]; shape "line" for line charts, "rect" for bars.
export function fillLegend(ul, entries, shape) {
  ul.replaceChildren();
  for (const e of entries) {
    const li = document.createElement("li");
    const key = document.createElement("span");
    key.className = `key ${shape}`;
    key.style.background = e.color;
    const text = document.createElement("span");
    text.textContent = e.label;
    li.append(key, text);
    ul.append(li);
  }
}

export function setStatus(id, message, onRetry) {
  const el = $(id);
  el.replaceChildren();
  if (message) el.append(message);
  if (onRetry) {
    const b = document.createElement("button");
    b.textContent = "Retry";
    b.addEventListener("click", onRetry);
    el.append(b);
  }
}

export const SOLAR_NOTE =
  "Data caveat: since April 2026 the station's daily solar averages appear to read about 4% high, which may overstate 2026 solar irradiation and ETo slightly (under review).";

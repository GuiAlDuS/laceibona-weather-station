// Language selection and locale-sensitive formatting, shared by every module that produces text.
// The site is two static pages (/ and /es/) sharing one JS bundle; the page's own path picks the
// language once at load, so nothing here needs a language argument threaded through call sites.
// `typeof location` is guarded because the pure data/view modules also run under `node --test`,
// with no `location` global — that falls back to English, matching every existing test's assertions.
export const LANG = typeof location !== "undefined" && location.pathname.replace(/^\/+/, "").split("/")[0] === "es" ? "es" : "en";

// t(english, spanish) -> whichever matches the page's language. Keeping both strings at the call
// site (rather than in a separate keyed dictionary) keeps them next to the logic that builds them,
// which matters here: this dashboard's text changes almost every session.
export const t = (en, es) => (LANG === "es" ? es : en);

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const MONTHS = LANG === "es" ? MONTHS_ES : MONTHS_EN;

const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_ES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export const WEEKDAYS = LANG === "es" ? WEEKDAYS_ES : WEEKDAYS_EN;

// 16-point compass, indexed the same way as `SECTORS` in windrose.js (0 = N, going clockwise).
// Spanish meteorological convention uses O for Oeste (west) in place of W.
const SECTORS_EN = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const SECTORS_ES = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
export const sectorLabel = (i) => (LANG === "es" ? SECTORS_ES : SECTORS_EN)[i];

export const nf = new Intl.NumberFormat(LANG === "es" ? "es-CR" : "en-US", { maximumFractionDigits: 0 });
// Both locales below print a 24-hour HH:MM with no locale-specific wording, which is all `stationTime`
// and the wind rose's period text need.
export const TIME_LOCALE = LANG === "es" ? "es-CR" : "en-GB";

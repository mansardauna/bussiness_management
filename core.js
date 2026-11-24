'use strict';
/* =====================================================================
   Ma Caisse — core: utilities, language, icons, data, components, charts
   All data stays on the device (IndexedDB). Depends on i18n.js (TR table).
   ===================================================================== */

/* ---------- Utilities ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
const z = n => String(n).padStart(2, '0');
const nowISO = (d = new Date()) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
const today = () => nowISO().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(iso.slice(0, 10) + 'T12:00'); d.setDate(d.getDate() + n); return nowISO(d).slice(0, 10); };
const rnd = (a, cur) => cur === 'CDF' ? Math.round(a) : Math.round(a * 100) / 100;
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

/* ---------- Language ----------
   Source strings are English. t("Text") looks the text up in TR (i18n.js) for French / Spanish.
   Plurals: 'one form|other form' chosen with vars.n. Variables: {name}. */
const LANGS = { en: ['English', 'en-US', 'eng'], fr: ['Français', 'fr-FR', 'fra'], es: ['Español', 'es-ES', 'spa'] };
const DATES = {
  en: { m: 'January February March April May June July August September October November December', m3: 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec', d: 'Sunday Monday Tuesday Wednesday Thursday Friday Saturday' },
  fr: { m: 'janvier février mars avril mai juin juillet août septembre octobre novembre décembre', m3: 'jan fév mar avr mai juin juil août sep oct nov déc', d: 'dimanche lundi mardi mercredi jeudi vendredi samedi' },
  es: { m: 'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre', m3: 'ene feb mar abr may jun jul ago sep oct nov dic', d: 'domingo lunes martes miércoles jueves viernes sábado' }
};
let LANG = 'en', NF0, NF1, NF2, MONTHS, MON3, DAYS;
const TR_MISSING = new Set();
function t(s, v) {
  let r = s;
  if (LANG !== 'en') {
    const e = typeof TR !== 'undefined' && TR[s], x = e && e[LANG === 'fr' ? 0 : 1];
    if (x) r = x; else TR_MISSING.add(s);
  }
  if (r.includes('|')) { const n = Math.abs(v && v.n != null ? +v.n : 0), f = r.split('|'); r = (LANG === 'fr' ? n >= 2 : n !== 1) ? f[1] : f[0]; }
  return v ? r.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m) : r;
}
function setLang(l) {
  LANG = LANGS[l] ? l : 'en';
  const loc = LANGS[LANG][1], D = DATES[LANG];
  NF0 = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 });
  NF1 = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 });
  NF2 = new Intl.NumberFormat(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  MONTHS = D.m.split(' ').map(cap); MON3 = D.m3.split(' ').map(cap); DAYS = D.d.split(' ').map(cap);
  document.documentElement.lang = LANG;
}
setLang('en');

const fmt = (a, cur) => cur === 'CDF' ? NF0.format(Math.round(a || 0)) + ' FC' : '$' + NF2.format(a || 0);
const short = (v, cur) => { const a = Math.abs(v || 0); const s = a >= 1e6 ? NF1.format(a / 1e6) + 'M' : a >= 1e4 ? NF0.format(a / 1e3) + 'k' : a >= 1e3 ? NF1.format(a / 1e3) + 'k' : NF0.format(a); return (v < 0 ? '−' : '') + (cur === 'CDF' ? s + ' FC' : '$' + s); };
const pct = v => NF0.format(Math.round(v)) + ' %';
const conv = (a, from, to, rate) => { rate = rate || S.settings.rate; if (from === to) return a; return from === 'USD' ? a * rate : a / rate; };
const other = cur => cur === 'USD' ? 'CDF' : 'USD';
const sum = arr => arr.reduce((a, b) => a + b, 0);
const dt = iso => new Date(iso.slice(0, 10) + 'T12:00');
const fdate = iso => { if (!iso) return ''; const [d, h] = iso.split('T'); const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}` + (h ? ' · ' + h : ''); };
const fday = iso => { if (!iso) return '—'; const d = dt(iso), m = MON3[d.getMonth()]; return LANG === 'en' ? `${m} ${d.getDate()}, ${d.getFullYear()}` : `${d.getDate()} ${m.toLowerCase()} ${d.getFullYear()}`; };
const fshort = iso => {
  if (!iso) return ''; const d = dt(iso), h = iso.slice(11, 16), m = MON3[d.getMonth()];
  return (iso.slice(0, 10) === today() ? t('Today') : LANG === 'en' ? `${m} ${d.getDate()}` : `${d.getDate()} ${m.toLowerCase()}`) + (h ? ' · ' + h : '');
};
const fdateLong = iso => {
  const d = dt(iso), w = DAYS[d.getDay()], m = MONTHS[d.getMonth()];
  if (LANG === 'en') return `${w}, ${m} ${d.getDate()}, ${d.getFullYear()}`;
  if (LANG === 'es') return `${w}, ${d.getDate()} de ${m.toLowerCase()} de ${d.getFullYear()}`;
  return `${w} ${d.getDate()} ${m.toLowerCase()} ${d.getFullYear()}`;
};
const daysBetween = (a, b) => Math.round((dt(b) - dt(a)) / 864e5);
const prevMonth = m => { let [y, mo] = m.split('-').map(Number); mo--; if (mo < 1) { mo = 12; y--; } return `${y}-${z(mo)}`; };
const hashStr = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

/* ---------- Icon set (24×24 strokes, Lucide style — embedded so it works offline) ---------- */
const ICONS = {
  dashboard: '<rect width="7" height="9" x="3" y="3" rx="1.5"/><rect width="7" height="5" x="14" y="3" rx="1.5"/><rect width="7" height="9" x="14" y="12" rx="1.5"/><rect width="7" height="5" x="3" y="16" rx="1.5"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M8 7h8"/><path d="M8 11h6"/>',
  package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  bottle: '<path d="M10 2h4"/><path d="M10.5 2v3.2L9 8.2V20a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V8.2l-1.5-3V2"/><path d="M9 12h6"/><path d="M9 16h6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
  briefcase: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  in: '<path d="M17 7 7 17"/><path d="M17 17H7V7"/>',
  out: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98"/><path d="m15.41 6.51-6.82 3.98"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  exchange: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  calculator: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M8 6h8"/><path d="M16 14v4"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  checkc: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  xc: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  landmark: '<path d="M3 22h18"/><path d="M6 18v-7"/><path d="M10 18v-7"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M12 2 20 7H4z"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  card: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>',
  mobile: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
  cash: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  dollar: '<circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/>',
  refresh: '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  up: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  dn: '<path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>',
  star: '<path d="M12 2 15.09 8.26 22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  store: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-2-1 2.7 2.7 0 0 1-2 1 2.7 2.7 0 0 1-2-1 2.7 2.7 0 0 1-2 1 2.7 2.7 0 0 1-2-1 2.7 2.7 0 0 1-2 1 2.7 2.7 0 0 1-2-1 2.7 2.7 0 0 1-2 1 2 2 0 0 1-2-2z"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="14" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/>',
  wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.86a10 10 0 0 1 14 0"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/>',
  wifioff: '<path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M5 12.86a10 10 0 0 1 5.17-2.69"/><path d="M19 12.86a10 10 0 0 0-2.01-1.52"/><path d="M2 8.82a15 15 0 0 1 4.18-2.65"/><path d="M22 8.82a15 15 0 0 0-11.29-3.76"/><path d="m2 2 20 20"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  tag: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  flask: '<path d="M10 2v7.31"/><path d="M14 9.3V2"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  smartphone: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
  qr: '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
  logo: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>'
};
const ic = (n, c = '') => `<svg class="i ${c}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ICONS.info}</svg>`;

/* ---------- Reference data ----------
   Stored values are stable ids (never translated); labels are translated when displayed. */
const CATS = {
  sales: ['Sales', 'cart', 'pri'], credit_in: ['Credit repayment', 'book', 'green'], invoice_in: ['Invoice payments', 'file', 'blue'],
  owner_in: ['Owner contribution', 'user', 'teal'], loan_in: ['Loan received', 'landmark', 'blue'], fx: ['Currency exchange', 'exchange', 'gray'], other_in: ['Other income', 'in', 'green'],
  purchase: ['Stock purchases', 'package', 'amber'], salaries: ['Salaries', 'users', 'pri'], subcontract: ['Subcontractors', 'briefcase', 'blue'], tax: ['Taxes & duties', 'landmark', 'red'],
  rent: ['Rent', 'store', 'amber'], transport: ['Transport', 'truck', 'teal'], utilities: ['Electricity / water', 'zap', 'amber'], phone: ['Phone / airtime', 'phone', 'blue'],
  fees: ['Mobile money / bank fees', 'smartphone', 'gray'], repairs: ['Repairs / maintenance', 'wrench', 'gray'], packaging: ['Packaging / crates', 'bottle', 'teal'],
  debt_out: ['Debt repayment', 'undo', 'red'], owner_out: ['Owner withdrawal', 'wallet', 'gray'], other_out: ['Other expenses', 'out', 'red']
};
const CATS_IN = ['sales', 'credit_in', 'invoice_in', 'owner_in', 'loan_in', 'fx', 'other_in'];
const CATS_OUT = ['purchase', 'salaries', 'subcontract', 'tax', 'rent', 'transport', 'utilities', 'phone', 'fees', 'repairs', 'packaging', 'debt_out', 'owner_out', 'fx', 'other_out'];
/* Money going out that is not an operating expense (excluded from profit) */
const NOT_CHARGE = ['purchase', 'debt_out', 'owner_out', 'fx'];
const catName = k => CATS[k] ? t(CATS[k][0]) : (k || '');
const catIc = k => CATS[k] ? [CATS[k][1], CATS[k][2]] : ['dollar', 'gray'];
const catOpts = list => list.map(k => [k, catName(k)]);
const REASONS = { sale: 'Sale', start: 'Opening stock', purchase: 'Purchase', count: 'Stock count', broken: 'Breakage', expired: 'Expired', theft: 'Theft / missing', personal: 'Personal use', gift: 'Gift / sample' };
const reasonName = l => (REASONS[l.reason] ? t(REASONS[l.reason]) : l.reason) + (l.who ? ' – ' + l.who : '');
const METHODS = { cash: ['Cash', 'cash'], mobile: ['Mobile Money', 'mobile'], pos: ['POS / Card', 'card'], bank: ['Bank', 'landmark'], ifb: ['IFB', 'qr'] };
const mName = m => METHODS[m] ? t(METHODS[m][0]) : m === 'credit' ? t('Credit') : '—';
const mTag = m => `<span class="mtag">${ic(METHODS[m]?.[1] || 'book', 'sm')}${mName(m)}</span>`;
const bizName = () => S.settings.biz || t('My Shop');
const footerText = () => S.settings.footer || t('Thank you for your business!');
const custName = n => n || t('Walk-in customer');

const DEFAULT = () => ({
  v: 2,
  settings: { biz: '', owner: '', phone: '', address: '', rate: 2850, mainCur: 'USD', lang: 'en', pin: '', autoLock: 5, footer: '', recNo: 1, invNo: 1, cc: '243', lastBackup: null, created: today() },
  products: [], tx: [], sales: [], credits: [], people: [], invoices: [], bottles: [], reminders: [], stockLog: [], contacts: [], closings: [], users: [], audit: []
});

/* ---------- Storage (IndexedDB, localStorage fallback) ---------- */
const DB = {
  db: null,
  open() {
    return new Promise(res => {
      let done = false; const end = ok => { if (!done) { done = true; res(ok); } };
      // Safety: if the database does not answer, the app still opens (fallback storage).
      setTimeout(() => { if (!done) { this.slow = true; end(false); } }, 4000);
      try {
        const r = indexedDB.open('macaissepro', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('photos'); };
        r.onsuccess = () => { if (done) { r.result.close(); return; } this.db = r.result; end(true); };
        r.onerror = () => end(false);
      } catch { end(false); }
    });
  },
  _t(store, mode, fn) {
    return new Promise((res, rej) => {
      const tr = this.db.transaction(store, mode); const req = fn(tr.objectStore(store));
      tr.oncomplete = () => res(req && req.result); tr.onerror = () => rej(tr.error); tr.onabort = () => rej(tr.error);
    });
  },
  get(s, k) { if (!this.db) { try { return Promise.resolve(JSON.parse(localStorage.getItem(s + ':' + k))); } catch { return Promise.resolve(null); } } return this._t(s, 'readonly', st => st.get(k)); },
  put(s, k, v) { if (!this.db) { localStorage.setItem(s + ':' + k, JSON.stringify(v)); return Promise.resolve(); } return this._t(s, 'readwrite', st => st.put(v, k)); },
  del(s, k) { if (!this.db) { localStorage.removeItem(s + ':' + k); return Promise.resolve(); } return this._t(s, 'readwrite', st => st.delete(k)); },
  keys(s) { if (!this.db) return Promise.resolve(Object.keys(localStorage).filter(k => k.startsWith(s + ':')).map(k => k.slice(s.length + 1))); return this._t(s, 'readonly', st => st.getAllKeys()); }
};

let S = DEFAULT();
/* Voided / deleted records are kept (marked .void) for the activity log; calculations use these: */
const TX = () => S.tx.filter(x => !x.void), CR = () => S.credits.filter(c => !c.void), INV = () => S.invoices.filter(f => !f.void);
function commit() { return DB.put('kv', 'state', S).catch(e => toast(t('Could not save: {e}', { e: e.message }), 'bad')); }

/* Version 1 stored French labels as categories and stock reasons: convert them to ids. */
const LEGACY_CAT = { 'Ventes': 'sales', 'Remboursement crédit': 'credit_in', 'Factures encaissées': 'invoice_in', 'Apport du propriétaire': 'owner_in', 'Prêt reçu': 'loan_in', 'Change': 'fx', 'Autres entrées': 'other_in', 'Achat marchandises': 'purchase', 'Salaires': 'salaries', 'Sous-traitants': 'subcontract', 'Impôts & taxes': 'tax', 'Loyer': 'rent', 'Transport': 'transport', 'Électricité / eau': 'utilities', 'Communication / crédit tél.': 'phone', 'Frais mobile money / banque': 'fees', 'Réparations / entretien': 'repairs', 'Emballages / casiers': 'packaging', 'Remboursement dette': 'debt_out', 'Retrait du propriétaire': 'owner_out', 'Autres frais': 'other_out' };
const LEGACY_REASON = { 'vente': 'sale', 'départ': 'start', 'inventaire': 'count', 'casse': 'broken', 'périmé': 'expired', 'vol / disparu': 'theft', 'consommation personnelle': 'personal', 'cadeau / échantillon': 'gift' };
function migrate(s) {
  const d = DEFAULT(), ver = s.v || 1, hadLang = !!(s.settings && s.settings.lang);
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  s.settings = { ...d.settings, ...s.settings };
  if (ver < 2) {
    if (s.settings.biz === 'Mon Commerce') s.settings.biz = '';
    if (s.settings.footer === 'Merci pour votre confiance !') s.settings.footer = '';
    if (!hadLang) s.settings.lang = 'fr';  // version 1 was French-only: keep existing users in French
    for (const x of [...s.tx, ...s.credits]) if (x.cat && LEGACY_CAT[x.cat]) x.cat = LEGACY_CAT[x.cat];
    for (const l of s.stockLog) {
      if (LEGACY_REASON[l.reason]) l.reason = LEGACY_REASON[l.reason];
      else if (/^achat/.test(l.reason || '')) { l.who = (l.reason.split(' – ')[1] || ''); l.reason = 'purchase'; }
    }
    for (const b of s.bottles) if (b.client === 'Client comptant') b.client = '';
    s.v = 2;
  }
  return s;
}

/* ---------- UI state ---------- */
const ui = {
  caisse: { kind: 'day', val: today() }, caisseTab: 'all',
  rap: { kind: 'month', val: today().slice(0, 7) }, rapCur: null,
  credTab: 'client', venteTab: 'pos', factTab: 'open', persTab: 'employe', rappTab: 'todo', posCat: '', dashRange: '30', scan: null
};
const cart = { items: {}, back: {}, cur: null };

/* =====================================================================
   COMPONENTS
   ===================================================================== */
const TONES = ['pri', 'green', 'amber', 'blue', 'teal', 'red'];
const tone = s => TONES[hashStr(s) % TONES.length];
const initials = s => (String(s || '?').trim().split(/\s+/).filter(w => /\p{L}/u.test(w[0] || '')).slice(0, 2).map(w => w[0]).join('') || String(s || '?').trim()[0] || '?').toUpperCase();
const prodIcon = p => p.bottle ? 'bottle'
  : /drink|beverage|water|juice|beer|soda|boisson|eau|jus|bi[eè]re|bebida|agua|zumo|jugo|cerveza|refresco/i.test(p.cat + ' ' + p.name) ? 'bottle'
  : /hygi|soap|savon|jab[oó]n|soin|care|cuidado/i.test(p.cat) ? 'sparkles'
  : /food|grocery|sugar|oil|flour|rice|alim|nourr|sucre|huile|farine|riz|comida|az[uú]car|aceite|harina|arroz/i.test(p.cat) ? 'store' : 'package';
const av = (name, cls = '') => `<span class="av t-${tone(name)} ${cls}">${esc(initials(name))}</span>`;
const who = (name, sub = '', cls = '') => `<div class="who">${av(name, cls)}<div><b>${esc(name)}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
const iconWho = (icon, tn, title, sub = '') => `<div class="who"><span class="av sq t-${tn}">${ic(icon, 'sm')}</span><div><b>${esc(title)}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
const pill = (text, tn = 'gray', cls = '') => `<span class="pill t-${tn} ${cls}">${text}</span>`;
const ph = (title, sub, acts = '') => `<div class="ph"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${acts ? `<div class="acts">${acts}</div>` : ''}</div>`;
const btn = (label, act, o = {}) => (typeof allowedAct === 'function' && !allowedAct(act)) ? '' : `<button type="button" class="btn ${o.cls || ''}" data-act="${act}" ${o.data || ''}>${o.icon ? ic(o.icon) : ''}${label ? `<span>${label}</span>` : ''}</button>`;
const trendChip = (cur, prev) => {
  if (!prev) return cur ? `<span class="trend up">${ic('up')}${t('new')}</span>` : '';
  const p = (cur - prev) / Math.abs(prev) * 100, r = Math.round(p * 10) / 10;
  const cls = Math.abs(r) < 0.5 ? 'flat' : r > 0 ? 'up' : 'down';
  return `<span class="trend ${cls}">${ic(r >= 0 ? 'up' : 'dn')}${r > 0 ? '+' : ''}${NF1.format(r)} %</span>`;
};
const kpi = o => `<${o.act ? `button type="button" data-act="${o.act}" ${o.data || ''}` : 'div'} class="card kpi ${o.active ? 'active' : ''}">
  <div class="lbl"><span class="ki t-${o.tone || 'pri'}">${ic(o.icon)}</span>${o.label}</div>
  <div class="val ${o.vcls || ''}" title="${esc(o.value)}">${o.value}</div>
  <div class="ft">${o.trend || ''}${o.sub ? `<span>${o.sub}</span>` : ''}</div></${o.act ? 'button' : 'div'}>`;
const card = (title, body, o = {}) => `<section class="card ${o.cls || ''}">${title ? `<div class="card-h"><div><h3>${title}</h3>${o.sub ? `<p>${o.sub}</p>` : ''}</div>${o.tools ? `<div class="tools">${o.tools}</div>` : ''}</div>` : ''}${body}</section>`;
const emptyBox = (icon, title, text = '', cta = '', tn = 'pri') => `<div class="empty"><div class="ei t-${tn}">${ic(icon)}</div><b>${title}</b>${text ? `<p>${text}</p>` : ''}${cta}</div>`;
const segTabs = (key, list) => `<div class="seg">${list.map(([v, l, i]) => `<button type="button" class="${ui[key] === v ? 'on' : ''}" data-act="tab" data-k="${key}" data-v="${v}">${i ? ic(i, 'sm') : ''}${l}</button>`).join('')}</div>`;
const uTabs = (key, list) => `<div class="utabs">${list.map(([v, l, c]) => `<button type="button" class="${ui[key] === v ? 'on' : ''}" data-act="tab" data-k="${key}" data-v="${v}">${l}${c != null ? `<span class="c">${c}</span>` : ''}</button>`).join('')}</div>`;
function table(cols, rows, emptyHTML) {
  if (!rows.length) return emptyHTML || emptyBox('inbox', t('Nothing to show'), t('No data for this period.'));
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map(c => `<th class="${c.c || ''}">${c.l}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr${r.act ? ` class="click" data-act="${r.act}" data-id="${r.id}"` : ''}${r.attrs || ''}>${r.cells.map((x, i) => `<td class="${cols[i].c || ''}" data-l="${esc(cols[i].l)}">${x ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
/* Form fields */
const fld = (label, inner, hint = '') => `<label class="f"><span>${label}</span>${inner}${hint ? `<small>${hint}</small>` : ''}</label>`;
const inp = (name, val = '', attrs = '') => `<input class="inp" name="${name}" value="${esc(val)}" ${attrs}>`;
const money = (name, val, cur, attrs = '') => `<div class="ig"><span class="pre">${cur === 'CDF' ? 'FC' : '$'}</span><input class="inp ${attrs.includes('big') ? 'big' : ''}" name="${name}" value="${esc(val)}" inputmode="decimal" ${attrs.includes('placeholder=') ? '' : 'placeholder="0"'} ${attrs.replace('big', '')}></div>`;
const sel = (name, list, cur) => `<select class="inp" name="${name}">${list.map(v => Array.isArray(v) ? `<option value="${esc(v[0])}" ${v[0] === cur ? 'selected' : ''}>${esc(v[1])}</option>` : `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
const choices = (name, list, cur) => `<div class="choices">${list.map(([v, l, i]) => `<label><input type="radio" name="${name}" value="${esc(v)}" ${String(v) === String(cur) ? 'checked' : ''}><span>${i ? ic(i, 'sm') : ''}${l}</span></label>`).join('')}</div>`;
const curChoices = (cur, name = 'cur') => choices(name, [['USD', t('Dollars ($)'), 'dollar'], ['CDF', t('Francs (FC)'), 'cash']], cur);
const methChoices = (m = 'cash') => choices('method', Object.keys(METHODS).filter(k => k !== 'ifb' || (typeof ifbOn === 'function' && ifbOn())).map(k => [k, mName(k), METHODS[k][1]]), m);
const note = (icon, tn, html) => `<div class="note t-${tn}">${ic(icon, 'sm')}<div>${html}</div></div>`;
const prod = id => S.products.find(p => p.id === id);

function toast(msg, kind = '') {
  const el = $('#toast');
  el.innerHTML = `<span class="ti">${ic(kind === 'bad' ? 'alert' : kind === 'ok' ? 'check' : 'info')}</span><span>${esc(msg)}</span>`;
  el.className = 'toast show ' + kind;
  clearTimeout(toast.t); toast.t = setTimeout(() => el.className = 'toast ' + kind, 2800);
}

/* ---------- Photos ---------- */
const fileToDataURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
async function compressImage(file, max = 1400) {
  const url = await fileToDataURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.72);
}
async function savePhoto(fileOrData) {
  if (!fileOrData) return null;
  if (fileOrData instanceof File && !fileOrData.size) return null;
  const data = typeof fileOrData === 'string' ? fileOrData : await compressImage(fileOrData);
  const id = 'ph_' + uid(); await DB.put('photos', id, data); return id;
}
async function showPhoto(id) {
  const data = await DB.get('photos', id);
  if (!data) return toast(t('Photo not found'), 'bad');
  openModal(t('Document'), `<img class="photo" src="${data}" alt="${esc(t('Scanned document'))}">`, null, { icon: 'image' });
}

/* ---------- Modal ---------- */
let modalCb = null;
function openModal(title, body, onSubmit, o = {}) {
  const m = $('#modal'); const wasOpen = m.classList.contains('open');
  m.innerHTML = `<form class="dlg ${o.wide ? 'wide' : ''}" id="mform" autocomplete="off" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="dlg-h">${o.icon ? `<span class="hi t-${o.tone || 'pri'}">${ic(o.icon)}</span>` : ''}<div><h3>${esc(title)}</h3>${o.sub ? `<p>${o.sub}</p>` : ''}</div><button type="button" class="ib" data-act="closeModal" aria-label="${esc(t('Close'))}">${ic('x')}</button></div>
    <div class="dlg-b">${body}</div>
    ${onSubmit ? `<div class="dlg-f"><button type="button" class="btn ghost" data-act="closeModal">${t('Cancel')}</button><button class="btn ${o.cls || 'pri'}">${ic(o.okIcon || 'check')}<span>${o.ok || t('Save')}</span></button></div>` : ''}
  </form>`;
  m.classList.add('open'); modalCb = onSubmit || null;
  if (!wasOpen) history.pushState({ modal: 1 }, '');
  const a = $('#modal [autofocus]'); if (a && matchMedia('(pointer:fine)').matches) setTimeout(() => a.focus(), 60);
}
function closeModal(fromPop) {
  const m = $('#modal'); if (!m.classList.contains('open')) return;
  m.classList.remove('open'); m.innerHTML = ''; modalCb = null; ui.approval = null;
  if (!fromPop && history.state && history.state.modal) history.back();
}
window.addEventListener('popstate', () => closeModal(true));
function confirmBox(text, onYes, ok, cls = 'red', icon = 'alert') {
  openModal(t('Confirmation'), `<p style="margin:0;font-size:15px">${text}</p>`, () => onYes(), { ok: ok || t('Confirm'), cls, icon, tone: cls === 'red' ? 'red' : 'pri', okIcon: cls === 'red' ? 'trash' : 'check' });
}

/* =====================================================================
   CALCULATIONS
   ===================================================================== */
function balances() {
  const b = { USD: { total: 0, cash: 0, mobile: 0, pos: 0, bank: 0 }, CDF: { total: 0, cash: 0, mobile: 0, pos: 0, bank: 0 } };
  for (const x of TX()) { const s = x.type === 'in' ? 1 : -1; b[x.cur].total += s * x.amount; b[x.cur][x.method] = (b[x.cur][x.method] || 0) + s * x.amount; }
  return b;
}
const creditLeft = c => rnd(c.amount - sum(c.payments.map(p => p.amount)), c.cur);
const invTotal = f => { const sub = sum(f.items.map(i => i.qty * i.price)); return rnd(sub * (1 + (f.tax || 0) / 100), f.cur); };
const invPaid = f => sum(f.payments.map(p => p.amount));
const invLeft = f => rnd(invTotal(f) - invPaid(f), f.cur);
function bottleBalance() {
  const m = {};
  for (const b of S.bottles) {
    if (b.supplier) continue;
    const k = b.client + '§' + b.pid; m[k] = m[k] || { client: b.client, pid: b.pid, n: 0 }; m[k].n += (b.out || 0) - (b.back || 0);
  }
  return Object.values(m).filter(x => x.n !== 0);
}
/* match: date prefix ("2026-11") or function(date) */
function stats(match, cur) {
  const ok = typeof match === 'function' ? match : d => d.startsWith(match);
  const r = { in: 0, out: 0, sales: 0, cogs: 0, charges: 0, invoices: 0, losses: 0, count: 0, byOut: {}, byIn: {}, byProd: {}, byMethod: {} };
  for (const x of TX()) {
    if (!ok(x.date)) continue;
    const a = conv(x.amount, x.cur, cur, x.rate);
    if (x.type === 'in') { r.in += a; r.byIn[x.cat] = (r.byIn[x.cat] || 0) + a; if (x.cat === 'sales') r.byMethod[x.method] = (r.byMethod[x.method] || 0) + a; }
    else { r.out += a; r.byOut[x.cat] = (r.byOut[x.cat] || 0) + a; if (!NOT_CHARGE.includes(x.cat)) r.charges += a; }
  }
  for (const s of S.sales) {
    if (s.void || !ok(s.date)) continue;
    r.count++; r.sales += conv(s.total, s.cur, cur, s.rate);
    if (s.total - s.paid > 0) r.byMethod.credit = (r.byMethod.credit || 0) + conv(s.total - s.paid, s.cur, cur, s.rate);
    const ratio = s.sub ? s.total / s.sub : 1;
    for (const it of s.items) {
      const c = conv(it.cost * it.qty, it.costCur, cur, s.rate); r.cogs += c;
      const rev = conv(it.price * it.qty * ratio, s.cur, cur, s.rate);
      const p = r.byProd[it.name] = r.byProd[it.name] || { qty: 0, rev: 0, profit: 0 };
      p.qty += it.qty; p.rev += rev; p.profit += rev - c;
    }
  }
  for (const f of INV()) if (ok(f.date)) r.invoices += conv(invTotal(f), f.cur, cur, f.rate);
  for (const l of S.stockLog) if (ok(l.date) && l.delta < 0 && l.reason !== 'sale') r.losses += conv(-l.delta * l.cost, l.cur, cur, l.rate);
  r.revenue = r.sales + r.invoices;
  r.profit = r.revenue - r.cogs - r.charges - r.losses;
  r.margin = r.revenue ? r.profit / r.revenue : 0;
  return r;
}
/* Current month compared with the same period of last month */
function monthCompare(cur) {
  const d0 = today(), m = d0.slice(0, 7), pm = prevMonth(m), d = +d0.slice(8, 10);
  return { now: stats(m, cur), prev: stats(x => x.startsWith(pm) && +x.slice(8, 10) <= d, cur) };
}

/* ---------- Periods ---------- */
const PK = { day: 10, month: 7, year: 4 };
function periodLabel(p) {
  if (p.kind === 'day') return p.val === today() ? t('Today') : fday(p.val);
  if (p.kind === 'month') { const [y, m] = p.val.split('-'); return MONTHS[+m - 1] + ' ' + y; }
  return t('Year {y}', { y: p.val });
}
function shiftP(p, dir) {
  if (p.kind === 'day') p.val = addDays(p.val, dir);
  else if (p.kind === 'month') { let [y, m] = p.val.split('-').map(Number); m += dir; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } p.val = `${y}-${z(m)}`; }
  else p.val = String(+p.val + dir);
}
const periodTools = key => {
  const p = ui[key];
  return `<div class="seg">${['day', 'month', 'year'].map(k => `<button type="button" class="${p.kind === k ? 'on' : ''}" data-act="pkind" data-k="${key}" data-v="${k}">${{ day: t('Day'), month: t('Month'), year: t('Year') }[k]}</button>`).join('')}</div>
  <div class="pnav"><button type="button" class="ib" data-act="pshift" data-k="${key}" data-v="-1" aria-label="${esc(t('Previous period'))}">${ic('left', 'sm')}</button><b>${periodLabel(p)}</b><button type="button" class="ib" data-act="pshift" data-k="${key}" data-v="1" aria-label="${esc(t('Next period'))}">${ic('right', 'sm')}</button></div>`;
};

/* =====================================================================
   CHARTS
   ===================================================================== */
const CHARTS = {};
function niceMax(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
function smooth(p) {
  if (p.length < 2) return `M${p[0][0]},${p[0][1]}`;
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2, k = 0.17;
    d += ` C${(p1[0] + (p2[0] - p0[0]) * k).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) * k).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * k).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) * k).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
function lineChart(id, series, cur) {
  if (!series.some(s => s.v)) return emptyBox('chart', t('No data yet'), t('The chart will appear after the first sales.'));
  const W = innerWidth < 720 ? 360 : 680, H = innerWidth < 720 ? 210 : 250, L = innerWidth < 720 ? 40 : 52, R = 10, T = 16, B = 30, n = series.length;
  const hi = Math.max(...series.map(s => s.v)), lo0 = Math.min(0, ...series.map(s => s.v));
  const mx = niceMax(hi > 0 ? hi : 1), lo = lo0 < 0 ? -niceMax(-lo0) : 0;
  const X = i => n === 1 ? (L + W - R) / 2 : L + (W - L - R) * i / (n - 1);
  const Y = v => T + (H - T - B) * (mx - v) / (mx - lo);
  const pts = series.map((s, i) => [X(i), Y(s.v)]);
  const path = smooth(pts), base = Y(0);
  const step = Math.ceil(n / (W < 400 ? 6 : 10));
  const grid = [0, 1, 2, 3, 4].map(k => { const v = lo + (mx - lo) * k / 4, y = Y(v); return `<line class="gl" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text class="ax" x="${L - 8}" y="${y + 4}" text-anchor="end">${short(v, cur)}</text>`; }).join('');
  const xl = series.map((s, i) => (i % step === 0 || i === n - 1) ? `<text class="ax" x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(s.s)}</text>` : '').join('');
  CHARTS[id] = { series, cur, pts, W, H, def: n - 1 };
  return `<div class="lc" data-chart="${id}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('Chart'))}">
    <defs><linearGradient id="g-${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#5B5BD6" stop-opacity=".22"/><stop offset="1" stop-color="#5B5BD6" stop-opacity="0"/></linearGradient></defs>
    ${grid}${xl}
    <path d="${path} L${X(n - 1).toFixed(1)},${base} L${X(0).toFixed(1)},${base} Z" fill="url(#g-${id})"/>
    <path class="ln" d="${path}"/>
    <line class="guide" y1="${T}" y2="${H - B}"/><circle class="dot" r="5.5"/>
  </svg><div class="ctip"></div></div>`;
}
function chartTip(el, i) {
  const c = CHARTS[el.dataset.chart]; if (!c || !c.pts[i]) return;
  const [x, y] = c.pts[i], g = el.querySelector('.guide'), d = el.querySelector('.dot'), tip = el.querySelector('.ctip');
  g.setAttribute('x1', x); g.setAttribute('x2', x); d.setAttribute('cx', x); d.setAttribute('cy', y);
  tip.innerHTML = `${esc(c.series[i].l)}<b>${fmt(c.series[i].v, c.cur)}</b>`;
  const ew = el.clientWidth || c.W, tw = tip.offsetWidth || 0;
  tip.style.left = Math.min(ew - tw / 2, Math.max(tw / 2, x / c.W * ew)) + 'px'; tip.style.top = (y / c.H * 100) + '%'; tip.classList.toggle('below', y / c.H < 0.3);
}
function initCharts() { $$('.lc').forEach(el => { const c = CHARTS[el.dataset.chart]; if (c) chartTip(el, c.def); }); }
document.addEventListener('pointermove', e => {
  const el = e.target.closest && e.target.closest('.lc'); if (!el) return;
  const c = CHARTS[el.dataset.chart]; if (!c) return;
  const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * c.W;
  let best = 0; c.pts.forEach((p, i) => { if (Math.abs(p[0] - x) < Math.abs(c.pts[best][0] - x)) best = i; });
  chartTip(el, best);
});
function barChart(series, cur, hi) {
  if (!series.some(s => s.v)) return emptyBox('chart', t('No data yet'));
  const mx = Math.max(...series.map(s => s.v), 1);
  if (hi == null) { hi = 0; series.forEach((s, i) => { if (s.v > series[hi].v) hi = i; }); }
  return `<div class="bc">${series.map((s, i) => `<div class="bcol ${i === hi ? 'on' : ''}" title="${esc(s.l)}: ${fmt(s.v, cur)}"><div class="bwrap"><div class="bar" style="height:${Math.max(2, s.v / mx * 100)}%"><span class="bv">${short(s.v, cur)}</span></div></div><small>${esc(s.s)}</small></div>`).join('')}</div>`;
}
function hbars(obj, cur, cls = '') {
  const e = Object.entries(obj).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!e.length) return `<p class="muted sm" style="margin:0">${t('No data for this period.')}</p>`;
  const tot = sum(e.map(x => x[1]));
  return e.map(([k, v]) => {
    const [i, tn] = METHODS[k] ? [METHODS[k][1], 'pri'] : k === 'credit' ? ['book', 'amber'] : catIc(k);
    const label = METHODS[k] || k === 'credit' ? mName(k) : catName(k);
    return `<div class="hb ${cls}"><div class="top"><span><span class="ci t-${tn}">${ic(i)}</span>${esc(label)}</span><b>${fmt(v, cur)}<em>${Math.round(v / tot * 100)} %</em></b></div><div class="track"><i style="width:${v / tot * 100}%"></i></div></div>`;
  }).join('');
}
function donut(parts, cur) {
  const tot = sum(parts.map(p => p.v)); if (!tot) return `<p class="muted sm">${t('No data for this period.')}</p>`;
  const R = 46, C = 2 * Math.PI * R; let a = 0;
  const segs = parts.filter(p => p.v > 0).map(p => { const len = p.v / tot * C; const s = `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${p.color}" stroke-width="16" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-a).toFixed(2)}" transform="rotate(-90 60 60)"/>`; a += len; return s; }).join('');
  return `<div class="donut"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${R}" fill="none" stroke="#F0F1F5" stroke-width="16"/>${segs}<text x="60" y="57" text-anchor="middle" font-size="9" fill="#6B7087">${esc(t('Total'))}</text><text x="60" y="71" text-anchor="middle" font-size="13" font-weight="700" fill="#181B2A">${short(tot, cur)}</text></svg>
  <div class="legend">${parts.map(p => `<div><i style="background:${p.color}"></i>${esc(p.l)}<b>${Math.round(p.v / tot * 100)} %</b></div>`).join('')}</div></div>`;
}

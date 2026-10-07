// Statistiques de visites : logique pure (sans reseau, sans stockage), testable
// avec `npm test`. Utilisee par checkout-worker/traffic.ts (Durable Object).
// Aucune donnee personnelle ici : on ne manipule que des compteurs et un
// identifiant de visiteur deja « hache » (voir traffic.ts).

export const MAX_KEYS = 60;           // cles distinctes max par categorie et par jour (le reste -> « Autres »)
export const MAX_VISITORS = 20000;    // visiteurs distincts gardes en memoire pour la journee
export const LIVE_WINDOW_MS = 90 * 1000; // « en ce moment » = vu dans les 90 dernieres secondes (battement toutes les 30 s)

const SOURCES = [
  [/(^|\.)instagram\.com$|^l\.instagram\.com$/, 'Instagram'],
  [/(^|\.)google\.[a-z.]+$/, 'Google'],
  [/(^|\.)bing\.com$/, 'Bing'],
  [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
  [/(^|\.)ecosia\.org$|(^|\.)qwant\.com$|(^|\.)yahoo\.com$/, 'Autre moteur'],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$|^l\.facebook\.com$|(^|\.)messenger\.com$/, 'Facebook'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)youtube\.com$|^youtu\.be$/, 'YouTube'],
  [/(^|\.)pinterest\.[a-z.]+$/, 'Pinterest'],
  [/(^|\.)(twitter|x)\.com$|^t\.co$/, 'X / Twitter'],
  [/(^|\.)reddit\.com$/, 'Reddit'],
  [/(^|\.)bandcamp\.com$/, 'Bandcamp'],
  [/(^|\.)discord\.com$|(^|\.)discord\.gg$/, 'Discord'],
];
const UTM = { instagram: 'Instagram', ig: 'Instagram', google: 'Google', facebook: 'Facebook', fb: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', newsletter: 'Newsletter' };

// Provenance : source explicite (?utm_source / ?ref), sinon navigateur integre
// d'Instagram/Facebook (UA), sinon domaine du referent. Les liens de bio
// Instagram n'envoient souvent aucun referent : l'UA du navigateur integre les trahit.
export function classifySource({ referrer = '', utm = '', ua = '', ownHost = '' } = {}) {
  const u = String(utm || '').toLowerCase().trim();
  if (u && UTM[u]) return UTM[u];
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook';
  let host = '';
  try { host = new URL(referrer).hostname.toLowerCase(); } catch (e) { host = ''; }
  if (!host || host === String(ownHost).toLowerCase()) return 'Direct';
  for (const [re, name] of SOURCES) if (re.test(host)) return name;
  return host.replace(/^www\./, '').slice(0, 40);
}

export function deviceOf(ua = '') {
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return 'mobile';
  return 'desktop';
}

export function isBot(ua = '') {
  return !ua || /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|monitor|curl|wget|python-requests|httpclient|axios|node-fetch|go-http|uptime/i.test(ua);
}

// Chemin propre : sans parametres ni ancre, sans « index.html », 120 caracteres max.
// Renvoie null pour une page a ne PAS compter (admin, valeur invalide).
export function cleanPath(p) {
  let s = String(p || '');
  if (!s.startsWith('/')) return null;
  s = s.split('#')[0].split('?')[0].toLowerCase().replace(/\/index\.html$/, '/').replace(/\/{2,}/g, '/');
  if (/(^|\/)admin(\/|$)/.test(s)) return null;
  if (!/^[a-z0-9\-._~\/%]+$/.test(s)) return null;
  return s.slice(0, 120);
}

export function cleanCountry(c) {
  c = String(c || '').toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : 'XX';
}

// Jour calendaire (fuseau Paris) : « 2026-10-06 ».
export function dayKey(ts, tz = 'Europe/Paris') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
}

export function emptyDay() {
  return { views: 0, visitors: 0, pages: {}, sources: {}, countries: {}, devices: {} };
}

function bump(map, key, n = 1) {
  if (!(key in map) && Object.keys(map).length >= MAX_KEYS) key = 'Autres';
  map[key] = (map[key] || 0) + n;
}

// Compte une page vue. `isNewVisitor` : premier passage de ce visiteur aujourd'hui.
export function addView(day, { path, source, country, device, isNewVisitor }) {
  day.views += 1;
  bump(day.pages, path);
  if (isNewVisitor) {
    day.visitors += 1;
    bump(day.sources, source);   // provenance comptee par visite (1re page du jour), pas par page
    bump(day.countries, country);
    bump(day.devices, device);
  }
  return day;
}

// Visiteurs « en ce moment » : id (hache) -> derniere vue.
export class Presence {
  constructor(windowMs = LIVE_WINDOW_MS) { this.windowMs = windowMs; this.seen = new Map(); }
  touch(id, now) { this.seen.set(id, now); }
  count(now) {
    for (const [id, t] of this.seen) if (now - t > this.windowMs) this.seen.delete(id);
    return this.seen.size;
  }
}

function top(map, n) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
}

// Resume pour la page admin : `days` = { 'YYYY-MM-DD': jour } (les jours absents comptent 0).
export function summarize(days, { live = 0, topN = 10 } = {}) {
  const total = emptyDay();
  const series = [];
  for (const k of Object.keys(days).sort()) {
    const d = days[k] || emptyDay();
    series.push({ day: k, views: d.views, visitors: d.visitors });
    total.views += d.views; total.visitors += d.visitors;
    for (const f of ['pages', 'sources', 'countries', 'devices']) for (const [name, n] of Object.entries(d[f] || {})) total[f][name] = (total[f][name] || 0) + n;
  }
  return {
    live, views: total.views, visitors: total.visitors, series,
    pages: top(total.pages, topN), sources: top(total.sources, topN),
    countries: top(total.countries, topN), devices: top(total.devices, 3),
  };
}

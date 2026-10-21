// Mode d'accès au site (réglé dans l'admin : Réglages > Accès au site) : Ouvert / Fermé / Accès par code.
//  - Ouvert : rien ne change.
//  - Fermé ou Accès par code : l'accueil montre l'écran « Entrer » (bouton grisé « Bientôt de retour », ou champ pour le code) ;
//    toute autre page est renvoyée vers l'accueil, sauf les exceptions de shared/access-gate.js (admin, suivi, retour Stripe…).
//  - Le code juste pose le cookie « vg-acces » (valable jusqu'à ce que le code change ou que le site soit fermé).
// Si le Worker ne répond pas, le site reste OUVERT (une panne du Worker ne doit pas couper la boutique).
import { decide, gateScript, isExempt, NO_STORE, readCookie } from '../shared/access-gate.js';

const WORKER = 'https://vgthmind-shop-checkout.vgthm66.workers.dev';
const COOKIE = 'vg-acces';

// État d'accès gardé 60 s en mémoire (par cookie) : sans cela, chaque page ou ping de supervision coûtait une requête Worker + une lecture KV.
// Si le Worker ne répond plus, la dernière valeur connue est gardée (au plus 10 min) avant de laisser le site ouvert.
const STATE_TTL = 60_000, STATE_STALE = 600_000;
const stateCache = new Map();
export function resetStateCache() { stateCache.clear(); }
async function readState(token) {
  const k = token || '', now = Date.now(), hit = stateCache.get(k);
  if (hit && now - hit.t < STATE_TTL) return hit.v;
  const v = await fetchState(token);
  if (v) { if (stateCache.size > 50) stateCache.clear(); stateCache.set(k, { v, t: now }); return v; }
  return hit && now - hit.t < STATE_STALE ? hit.v : null;
}
async function fetchState(token) {
  try {
    const r = await fetch(WORKER + '/access' + (token ? '?c=' + encodeURIComponent(token) : ''), { cf: { cacheTtl: 5, cacheEverything: true }, signal: AbortSignal.timeout(2500) });
    if (!r.ok) return null;
    const j = await r.json();
    return j && typeof j.mode === 'string' ? j : null;
  } catch (e) { return null; }
}

function reply(body, status, extra) {
  return new Response(body, { status, headers: { 'Content-Type': 'application/json', ...NO_STORE, ...(extra || {}) } });
}

// POST /acces { code } : vérifie le code auprès du Worker et pose le cookie sur le domaine du site.
async function enter(request) {
  let code = '';
  try { const b = await request.json(); code = typeof b.code === 'string' ? b.code : ''; } catch (e) { /* corps vide */ }
  let r;
  try {
    r = await fetch(WORKER + '/access/enter', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-IP': request.headers.get('CF-Connecting-IP') || '' }, body: JSON.stringify({ code }), signal: AbortSignal.timeout(4000) });
  } catch (e) { return reply('{"ok":false,"error":"Service indisponible."}', 503); }
  const j = await r.json().catch(() => ({}));
  if (r.ok && j.ok && j.token) {
    return reply('{"ok":true}', 200, { 'Set-Cookie': COOKIE + '=' + encodeURIComponent(j.token) + '; Path=/; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax' });
  }
  return reply(JSON.stringify({ ok: false, error: j.error || 'Code incorrect.' }), r.status === 429 ? 429 : 401);
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  if (url.pathname === '/acces') return request.method === 'POST' ? enter(request) : reply('{"ok":false}', 405, { Allow: 'POST' });

  if (isExempt(url.pathname, url.search)) return next(); // admin, suivi, retour Stripe… : jamais verrouillés, inutile d'interroger le Worker
  const token = readCookie(request.headers.get('Cookie'), COOKIE);
  const state = await readState(token);
  if (!state) return next();
  const action = decide({ pathname: url.pathname, search: url.search, method: request.method, mode: state.mode, ok: state.ok === true });
  if (action === 'pass') return next();
  if (action === 'redirect') return new Response(null, { status: 302, headers: { Location: '/', ...NO_STORE } });

  // Accueil sous verrou : la vraie page d'accueil, avec les réglages d'accès injectés pour l'écran « Entrer ».
  const res = await next();
  const out = new Response(res.body, { status: 200, headers: res.headers });
  for (const h of ['ETag', 'Last-Modified', 'Content-Length']) out.headers.delete(h);
  for (const [k, v] of Object.entries(NO_STORE)) out.headers.set(k, v);
  return new HTMLRewriter().on('head', { element(el) { el.append(gateScript(state), { html: true }); } }).transform(out);
}

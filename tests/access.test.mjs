// Mode d'accès au site : Ouvert / Fermé / Accès par code (Worker checkout-worker/access.ts + Function Pages functions/_middleware.js).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const hooks = `
export async function resolve(spec, ctx, next) { if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject {}', shortCircuit: true }; if (/^[.]{1,2}[/]/.test(spec) && !/[.][a-z]+$/.test(spec)) return next(spec + '.ts', ctx); return next(spec, ctx); }`;
register('data:text/javascript,' + encodeURIComponent(hooks));

const WORKER = 'https://vgthmind-shop-checkout.vgthm66.workers.dev', SITE = 'https://vgthmind-shop.pages.dev', SECRET = 'secret-de-test';
let worker, mw, gate, kv, workerDown;
const mkKv = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, String(v)); }, delete: async (k) => { m.delete(k); }, list: async () => ({ keys: [] }), m }; };
const env = () => ({ SITE_BASE: SITE, ALLOWED_ORIGIN: SITE, ADMIN_GITHUB_LOGIN: 'x', SESSION_SECRET: SECRET, HOLDS: kv, STRIPE_SECRET_KEY: 'sk_test_abc', STRIPE_WEBHOOK_SECRET: 'whsec_test' });
const adminTok = () => { const exp = Math.floor(Date.now() / 1000) + 3600; return `vgs.${exp}.` + createHmac('sha256', SECRET).update(`vgs.${exp}.x`).digest('base64url'); };
const wcall = (path, init = {}) => worker.fetch(new Request(WORKER + path, init), env(), {});
const admin = (body) => wcall('/admin/access', body === undefined ? { headers: { Authorization: 'Bearer ' + adminTok() } } : { method: 'POST', headers: { Authorization: 'Bearer ' + adminTok(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

before(async () => {
  worker = (await import('../checkout-worker/index.ts')).default;
  mw = await import('../functions/_middleware.js');
  gate = await import('../shared/access-gate.js');
  // Pas de HTMLRewriter sous Node : un équivalent minimal (ajout en fin de <head>).
  globalThis.HTMLRewriter = class { on(sel, h) { this.h = h; return this; } async transform(res) { let add = ''; this.h.element({ append: (x) => { add += x; } }); return new Response((await res.text()).replace('</head>', add + '</head>'), res); } };
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (workerDown && url.startsWith(WORKER)) throw new Error('Worker injoignable');
    if (url.startsWith(WORKER)) return worker.fetch(new Request(url, { method: init.method, headers: init.headers, body: init.body }), env(), {});
    return new Response('{}', { status: 404 });
  };
});
const reset = () => { kv = mkKv(); workerDown = false; };

// Une visite du site : la Function Pages devant la page statique.
const HOME = '<!doctype html><html><head><title>vgthmind</title></head><body><main>PRODUITS</main></body></html>';
const visit = async (path, { method = 'GET', cookie = '', body } = {}) => {
  let reached = false;
  const request = new Request(SITE + path, { method, headers: cookie ? { Cookie: cookie } : {}, body });
  const res = await mw.onRequest({ request, next: async () => { reached = true; return new Response(HOME, { headers: { 'Content-Type': 'text/html', ETag: '"x"' } }); } });
  return { res, reached };
};
const setMode = async (mode, extra = {}) => { const r = await admin({ mode, ...extra }); assert.equal(r.status, 200, await r.clone().text()); return r.json(); };
const cookieOf = (res) => (res.headers.get('Set-Cookie') || '').split(';')[0];
const enterCode = async (code) => visit('/acces', { method: 'POST', body: JSON.stringify({ code }) });

const EXEMPT = ['/admin/menu.html', '/admin/connexion', '/admin/reglages-acces.html', '/demande/?id=D-ABC123&k=secret', '/demande?id=D-ABC123&k=secret', '/suivi/', '/suivi', '/merci/', '/paiement-annule/', '/assets/vg/vg-transitions-dev.js', '/assets/products-sized/a-540.webp', '/products.json', '/site-config.json', '/robots.txt', '/favicon.ico', '/site.webmanifest'];
const GATED = ['/products', '/products/', '/product/short-ge0001/', '/cart', '/category/all/', '/contact/', '/studio/', '/sur-demande/', '/demande/', '/demande/?id=D-ABC123', '/demande/?k=secret', '/sitemap.xml', '/products.xml', '/mentions-legales/', '/infos-conditions-generales/'];

test('ouvert (par défaut) : rien ne change, la page statique est servie telle quelle', async () => {
  reset();
  for (const p of ['/', ...GATED, ...EXEMPT]) { const { res, reached } = await visit(p); assert.ok(reached, p); assert.equal(res.status, 200, p); assert.doesNotMatch(await res.text(), /VG_GATE/, p); }
  const w = await (await wcall('/access')).json();
  assert.deepEqual([w.mode, w.ok], ['open', false]);
});

test('admin : lecture, écriture, validation ; refus sans session', async () => {
  reset();
  assert.equal((await wcall('/admin/access')).status, 401);
  assert.equal((await wcall('/admin/access', { method: 'POST', body: '{"mode":"closed"}' })).status, 401);
  const d = await (await admin()).json();
  assert.deepEqual([d.mode, d.has_code], ['open', false]);
  assert.equal((await admin({ mode: 'ferme' })).status, 400);
  assert.equal((await admin({ mode: 'code' })).status, 400, 'code obligatoire pour le mode code');
  assert.equal((await admin({ code: 'abc' })).status, 400, 'code trop court');
  assert.equal((await admin({ msg_fr: 'x'.repeat(501) })).status, 400);
  const ok = await setMode('code', { code: 'Sésame 1', msg_fr: 'Retour lundi', msg_en: 'Back Monday' });
  assert.deepEqual([ok.mode, ok.has_code, ok.msg_fr, ok.msg_en], ['code', true, 'Retour lundi', 'Back Monday']);
  assert.equal(JSON.stringify([...kv.m.values()]).includes('Sésame'), false, 'le code n\'est jamais gardé en clair');
  assert.equal(JSON.stringify(await (await admin()).json()).includes('Sésame'), false);
  const empty = await setMode('closed', { msg_fr: '  ', msg_en: '' });
  assert.match(empty.msg_fr, /pause/); assert.match(empty.msg_en, /back soon/i);
});

test('fermé : l\'accueil montre l\'écran « Entrer » sans cache ni indexation ; les autres pages renvoient à l\'accueil', async () => {
  reset(); await setMode('closed', { msg_fr: 'Retour lundi', msg_en: 'Back Monday' });
  const home = await visit('/');
  assert.equal(home.res.status, 200);
  const html = await home.res.text();
  assert.match(html, /window\.VG_GATE=\{"mode":"closed","msg_fr":"Retour lundi","msg_en":"Back Monday"\}/);
  assert.match(html, /name="robots" content="noindex/);
  assert.match(html, /PRODUITS/, 'c\'est bien la vraie page d\'accueil');
  assert.match(home.res.headers.get('Cache-Control'), /no-store/);
  assert.equal(home.res.headers.get('CDN-Cache-Control'), 'no-store');
  assert.match(home.res.headers.get('X-Robots-Tag'), /noindex/);
  assert.equal(home.res.headers.get('ETag'), null);
  for (const p of GATED) {
    const { res, reached } = await visit(p);
    assert.equal(reached, false, p); assert.equal(res.status, 302, p); assert.equal(res.headers.get('Location'), '/', p);
    assert.match(res.headers.get('Cache-Control'), /no-store/, p); assert.match(res.headers.get('X-Robots-Tag'), /noindex/, p);
  }
  assert.equal((await visit('/', { method: 'POST' })).res.status, 302);
});

test('fermé ou sous code : admin, suivi par lien secret, retour Stripe, fichiers du site restent accessibles', async () => {
  for (const mode of ['closed', 'code']) {
    reset(); await setMode(mode, { code: 'sesame1' });
    for (const p of EXEMPT) { const { res, reached } = await visit(p); assert.ok(reached, mode + ' ' + p); assert.equal(res.status, 200, mode + ' ' + p); assert.doesNotMatch(await res.text(), /VG_GATE/, p); }
  }
});

test('le webhook Stripe et les routes du Worker ne sont jamais bloquées par le mode d\'accès', async () => {
  reset();
  const probe = async () => { const r = await wcall('/webhook', { method: 'POST', body: '{}' }); return r.status; };
  const open = await probe();
  await setMode('closed'); assert.equal(await probe(), open);
  await setMode('code', { code: 'sesame1' }); assert.equal(await probe(), open);
  assert.ok(open >= 400 && open < 500 && open !== 302, 'le webhook répond (signature absente refusée), pas de redirection : ' + open);
});

test('accès par code : mauvais code refusé, bon code = cookie, accès normal ; le cookie tient jusqu\'au changement de code', async () => {
  reset(); await setMode('code', { code: 'Sésame 1', msg_fr: 'Lancement lundi' });
  const home = await (await visit('/')).res.text();
  assert.match(home, /"mode":"code"/);
  const bad = await enterCode('nope');
  assert.equal(bad.res.status, 401); assert.equal(bad.res.headers.get('Set-Cookie'), null);
  assert.equal((await enterCode('')).res.status, 401);
  const good = await enterCode(' Sésame 1 ');
  assert.equal(good.res.status, 200);
  const sc = good.res.headers.get('Set-Cookie'); assert.match(sc, /^vg-acces=/); assert.match(sc, /HttpOnly/); assert.match(sc, /Secure/); assert.match(sc, /SameSite=Lax/);
  const ck = cookieOf(good.res);
  for (const p of ['/', '/products', '/product/x/', '/cart']) { const v = await visit(p, { cookie: ck }); assert.ok(v.reached, p); assert.doesNotMatch(await v.res.text(), /VG_GATE/, p); }
  assert.equal((await visit('/products', { cookie: 'vg-acces=1.' + 'a'.repeat(43) })).res.status, 302, 'cookie falsifié');
  assert.equal((await visit('/products', { cookie: 'vg-acces=garbage' })).res.status, 302);
  // Même code ré-enregistré sans le modifier : les visiteurs restent connectés ; code changé : tous déconnectés.
  await setMode('code', { msg_fr: 'Autre message' });
  assert.ok((await visit('/products', { cookie: ck })).reached);
  await setMode('code', { code: 'nouveau code' });
  assert.equal((await visit('/products', { cookie: ck })).res.status, 302);
  assert.equal((await enterCode('Sésame 1')).res.status, 401, 'l\'ancien code ne marche plus');
  assert.equal((await enterCode('nouveau code')).res.status, 200);
});

test('fermer le site déconnecte les visiteurs entrés ; le cookie ne rouvre pas un site fermé ni après réouverture en mode code', async () => {
  reset(); await setMode('code', { code: 'sesame1' });
  const ck = cookieOf((await enterCode('sesame1')).res);
  assert.ok((await visit('/products', { cookie: ck })).reached);
  await setMode('closed');
  assert.equal((await visit('/products', { cookie: ck })).res.status, 302);
  assert.equal((await enterCode('sesame1')).res.status, 401, 'fermé : aucun code ne marche');
  await setMode('code');
  assert.equal((await visit('/products', { cookie: ck })).res.status, 302, 'l\'ancien cookie reste invalide après fermeture');
  assert.equal((await enterCode('sesame1')).res.status, 200, 'le code, lui, reste le même');
  await setMode('open');
  assert.ok((await visit('/products')).reached);
});

test('le code n\'est pas devinable à la chaîne : 8 essais faux par visiteur puis blocage, même avec le bon code', async () => {
  reset(); await setMode('code', { code: 'sesame1' });
  for (let i = 0; i < 8; i++) assert.equal((await enterCode('faux' + i)).res.status, 401);
  assert.equal((await enterCode('sesame1')).res.status, 429);
});

test('Worker injoignable : le site reste ouvert (une panne ne coupe pas la boutique)', async () => {
  reset(); await setMode('closed');
  workerDown = true;
  const { res, reached } = await visit('/products');
  assert.ok(reached); assert.equal(res.status, 200);
  assert.equal((await visit('/acces', { method: 'POST', body: '{"code":"x"}' })).res.status, 503);
});

test('exceptions : liste exacte (pure)', () => {
  for (const p of EXEMPT) { const [pathname, search = ''] = p.split('?'); assert.equal(gate.isExempt(pathname, search ? '?' + search : ''), true, p); }
  for (const p of GATED) { const [pathname, search = ''] = p.split('?'); assert.equal(gate.isExempt(pathname, search ? '?' + search : ''), false, p); }
  assert.equal(gate.decide({ pathname: '/products', search: '', method: 'GET', mode: 'open', ok: false }), 'pass');
  assert.equal(gate.decide({ pathname: '/', search: '', method: 'GET', mode: 'closed', ok: true }), 'home', 'fermé : le cookie ne compte pas');
  assert.equal(gate.decide({ pathname: '/', search: '', method: 'GET', mode: 'code', ok: true }), 'pass');
});

test('écran « Entrer » (assets/vg-src) : bouton grisé fermé, champ du code, entrée directe après le bon code', () => {
  const js = readFileSync(new URL('../assets/vg-src/vg-transitions-dev.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../assets/vg-src/vg-transitions-dev.css', import.meta.url), 'utf8');
  for (const s of ['window.VG_GATE', 'Bientôt de retour', 'Back soon', "fetch('/acces'", 'vg-gate-autoplay', 'Code incorrect', 'Wrong code']) assert.ok(js.includes(s), s);
  assert.match(js, /if \(!GATE && wasSeen\(\)\) return;/, 'fermé/sous code : l\'écran revient à chaque visite');
  assert.match(js, /if \(!GATE\) markSeen\(\);/);
  for (const s of ['.vg-enter-off', '.vg-gate-form', '.vg-gate-msg', '.vg-gate-err']) assert.ok(css.includes(s), s);
});

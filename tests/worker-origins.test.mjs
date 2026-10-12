// Migration Cloudflare Pages : le Worker sert plusieurs sites (ancien aperçu /shop, .pages.dev, vgthmind.org).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

const hooks = `
export async function resolve(spec, ctx, next) { if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject {}', shortCircuit: true }; if (/^[.]{1,2}[/]/.test(spec) && !/[.][a-z]+$/.test(spec)) return next(spec + '.ts', ctx); return next(spec, ctx); }`;
register('data:text/javascript,' + encodeURIComponent(hooks));

const OLD = 'https://vgthmind.github.io', PAGES = 'https://vgthmind-shop.pages.dev', WWW = 'https://www.vgthmind.org';
const config = JSON.parse(readFileSync(new URL('../admin/shipping-config.json', import.meta.url), 'utf8'));
const catalog = [{ permalink: 'p1', name: 'P1', price: 50, url: '/p/p1', images: [], quantity: 1, shipping: [{ amount_alone: 0, country: { code: 'FR' } }, { amount_alone: 29 }], weight_g: 500, mode: 'colis', alone: false, shipping_derived: true }];
let worker, kv, stripeBodies, hits;
const mkKv = () => { const m = new Map(); return { get: async (k) => (k === 'shipping:config' ? JSON.stringify(config) : m.get(k) ?? null), put: async (k, v) => { m.set(k, String(v)); }, delete: async (k) => { m.delete(k); }, list: async () => ({ keys: [] }), m }; };
const env = () => ({
  STRIPE_SECRET_KEY: 'sk_test_abc', SITE_BASE: OLD + '/shop', ALLOWED_ORIGIN: [OLD, PAGES, WWW].join(','), ADMIN_GITHUB_LOGIN: 'x',
  GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 'sec',
  HOLDS: kv,
  STOCK: { idFromName: () => 'main', get: () => ({ reserve: async () => ({ ok: true }), release: async () => {} }) },
  TRAFFIC: { idFromName: () => 'main', get: () => ({ hit: async (h) => { hits.push(h); } }) },
});

before(async () => {
  worker = (await import('../checkout-worker/index.ts')).default;
  globalThis.fetch = async (url, opt = {}) => {
    url = String(url);
    if (url.endsWith('/products.json')) return new Response(JSON.stringify(catalog));
    if (url === 'https://github.com/login/oauth/access_token') return new Response('{}');
    if (url.endsWith('/admin/shipping-config.json')) return new Response(JSON.stringify(config));
    if (url.startsWith('https://api.stripe.com/v1/checkout/sessions')) { stripeBodies.push(new URLSearchParams(opt.body)); return new Response(JSON.stringify({ url: 'https://stripe.test/pay' })); }
    throw new Error('fetch inattendu ' + url);
  };
});
const reset = () => { kv = mkKv(); stripeBodies = []; hits = []; };
const call = (path, init = {}) => worker.fetch(new Request('https://w.invalid' + path, init), env(), {});

test('CORS : renvoie le site appelant s’il est autorisé, sinon le premier de la liste', async () => {
  reset();
  for (const o of [OLD, PAGES, WWW]) assert.equal((await call('/stock', { method: 'OPTIONS', headers: { Origin: o } })).headers.get('Access-Control-Allow-Origin'), o);
  assert.equal((await call('/stock', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })).headers.get('Access-Control-Allow-Origin'), OLD);
});

test('paiement : retour Stripe vers le site d’où vient le client (/shop seulement pour l’ancien aperçu)', async () => {
  for (const [o, base] of [[OLD, OLD + '/shop'], [PAGES, PAGES], [WWW, WWW], ['https://evil.example', OLD + '/shop']]) {
    reset();
    await call('/checkout', { method: 'POST', headers: { Origin: o }, body: JSON.stringify({ items: [{ slug: 'p1', qty: 1 }], country: 'FR', cart_id: 'cart-12345678' }) });
    assert.equal(stripeBodies.length, 1, o);
    assert.equal(stripeBodies[0].get('success_url'), base + '/merci/?session_id={CHECKOUT_SESSION_ID}', o);
    assert.equal(stripeBodies[0].get('cancel_url'), base + '/paiement-annule/?session_id={CHECKOUT_SESSION_ID}', o);
  }
});

test('connexion admin : accès « repo » (dépôt privé) et réponse remise au seul site qui l’a demandée', async () => {
  reset();
  const r = await call('/auth?provider=github&site_id=www.vgthmind.org');
  const gh = new URL(r.headers.get('Location'));
  assert.equal(gh.searchParams.get('scope'), 'repo');
  const state = gh.searchParams.get('state');
  assert.equal(kv.m.get('oauth:' + state), WWW);
  // GitHub simulé refuse le code : on vérifie seulement l'origine visée par la page de retour.
  const page = await (await call('/callback?state=' + state + '&code=x')).text();
  assert.match(page, /"https:\/\/www\.vgthmind\.org"/);
  assert.doesNotMatch(page, /vgthmind\.github\.io/);
});

test('connexion admin : site inconnu = premier site autorisé (jamais un site étranger)', async () => {
  reset();
  const r = await call('/auth?provider=github&site_id=evil.example');
  const state = new URL(r.headers.get('Location')).searchParams.get('state');
  assert.equal(kv.m.get('oauth:' + state), OLD);
});

test('statistiques : visites acceptées depuis chaque site autorisé, refusées ailleurs', async () => {
  reset();
  const t = (o) => call('/t', { method: 'POST', headers: { Origin: o, 'User-Agent': 'Mozilla/5.0 (iPhone)' }, body: JSON.stringify({ p: '/product/p1/' }) });
  await t(PAGES); await t(WWW); await t('https://evil.example');
  assert.deepEqual(hits.map((h) => h.own), ['vgthmind-shop.pages.dev', 'www.vgthmind.org']);
});

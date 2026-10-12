// Sécurité du Worker (index.ts) : routes admin fermées sans session, en-têtes de sécurité,
// signature des webhooks Stripe, prix/quantités/stock recalculés côté serveur, limite de réservations.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHmac } from 'node:crypto';

const hooks = `
export async function resolve(spec, ctx, next) { if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject {}', shortCircuit: true }; if (/^[.]{1,2}[/]/.test(spec) && !/[.][a-z]+$/.test(spec)) return next(spec + '.ts', ctx); return next(spec, ctx); }`;
register('data:text/javascript,' + encodeURIComponent(hooks));

const line = [{ amount_alone: 4, country: { code: 'FR' } }, { amount_alone: 8 }];
const catalog = [
  { permalink: 'ok1', name: 'Pièce', price: 30, url: '/p/ok1', images: [], quantity: 1, shipping: line },
  { permalink: 'zero', name: 'Sans prix', price: 0, url: '/p/zero', images: [], quantity: 1, shipping: line },
];

const SECRET = 'secret-de-test-session';
const WHSEC = 'whsec_testtesttesttest';
let worker, StockDO, kv, stripeCalls, reserveArgs;
const env = {
  STRIPE_SECRET_KEY: 'sk_test_abc', STRIPE_WEBHOOK_SECRET: WHSEC, SESSION_SECRET: SECRET, GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 's',
  SITE_BASE: 'http://site.invalid', ALLOWED_ORIGIN: 'http://site.invalid', ADMIN_GITHUB_LOGIN: 'vgthmind',
  HOLDS: {
    get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.puts++; kv.set(k, v); }, delete: async (k) => { kv.delete(k); },
    list: async () => ({ keys: [] }),
  },
  STOCK: {
    idFromName: () => 'main',
    get: () => ({
      reserve: async (...a) => { reserveArgs = a; return { ok: true, problems: [] }; }, release: async () => {},
      adminView: async () => ({}), snapshot: async () => ({}), setStock: async () => {}, confirm: async () => ({ already: false }),
    }),
  },
};
const reset = () => { kv = new Map(); kv.puts = 0; stripeCalls = []; reserveArgs = null; };

before(async () => {
  const mod = await import('../checkout-worker/index.ts');
  worker = mod.default; StockDO = mod.StockDO;
  globalThis.fetch = async (url, opt = {}) => {
    url = String(url);
    if (url.endsWith('/products.json')) return new Response(JSON.stringify(catalog));
    if (url.startsWith('https://api.stripe.com/')) { stripeCalls.push([url, opt.body]); return new Response(JSON.stringify({ url: 'https://stripe.test/pay', data: [] })); }
    throw new Error('fetch inattendu ' + url);
  };
});

const call = (method, path, { body, headers } = {}) => worker.fetch(new Request('http://w.invalid' + path, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), env, { waitUntil() {} });
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const session = (exp) => `vgs.${exp}.${b64url(createHmac('sha256', SECRET).update(`vgs.${exp}.vgthmind`).digest())}`;
const now = () => Math.floor(Date.now() / 1000);

const ADMIN_ROUTES = [
  ['POST', '/admin/renew'], ['GET', '/admin/stock'], ['POST', '/admin/stock'], ['GET', '/admin/backups'],
  ['GET', '/admin/backup'], ['POST', '/admin/backup'], ['GET', '/admin/inconnue'],
  ['GET', '/orders'], ['POST', '/orders/preparing'], ['POST', '/orders/shipped'], ['POST', '/orders/shipped-mail'],
];

test('chaque route admin refuse (401) sans session, avec une fausse session ou une session expirée', async () => {
  reset();
  const forged = 'vgs.' + (now() + 3600) + '.' + 'A'.repeat(43);
  for (const [m, p] of ADMIN_ROUTES) {
    for (const auth of [undefined, 'Bearer ' + forged, 'Bearer ' + session(now() - 10), 'Bearer ' + session(now() + 40 * 86400)]) {
      const r = await call(m, p, { headers: auth ? { authorization: auth } : {}, body: m === 'POST' ? { id: 'cs_test_x', stock: { ok1: 0 } } : undefined });
      assert.equal(r.status, 401, `${m} ${p} avec ${auth ? auth.slice(0, 20) : 'rien'}`);
    }
  }
  assert.equal(kv.puts, 0, 'aucune écriture sans session');
});

test('une vraie session (7 jours) ouvre les routes admin', async () => {
  reset();
  const auth = { authorization: 'Bearer ' + session(now() + 7 * 86400) };
  assert.equal((await call('GET', '/admin/stock', { headers: auth })).status, 200);
  const renewed = await (await call('POST', '/admin/renew', { headers: auth })).json();
  const exp = Number(renewed.session.split('.')[1]);
  assert.ok(exp - now() <= 7 * 86400 + 5 && exp - now() > 6 * 86400, 'session renouvelée pour 7 jours');
});

test('en-têtes de sécurité sur toutes les réponses (JSON, redirection, page)', async () => {
  reset();
  for (const r of [await call('GET', '/nope'), await call('GET', '/auth'), await call('GET', '/callback?state=x&code=y'), await call('OPTIONS', '/checkout')]) {
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
    assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  }
  assert.equal((await call('GET', '/nope')).headers.get('access-control-allow-origin'), 'http://site.invalid');
});

test('OAuth : état signé sans écriture KV, état falsifié ou périmé refusé', async () => {
  reset();
  const r = await call('GET', '/auth');
  assert.equal(r.status, 302);
  const state = new URL(r.headers.get('location')).searchParams.get('state');
  assert.match(state, /^\d+\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
  assert.equal(kv.puts, 0);
  const bad = state.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
  const page = await (await call('GET', '/callback?code=abc&state=' + encodeURIComponent(bad))).text();
  assert.match(page, /authorization:github:error/);
  const old = Math.floor(Date.now() / 1000) - 3600, id = '00000000-0000-0000-0000-000000000000';
  const oldState = `${old}.${id}.${b64url(createHmac('sha256', SECRET).update(`oauth.${old}.${id}`).digest())}`;
  assert.match(await (await call('GET', '/callback?code=abc&state=' + oldState)).text(), /expirée/);
});

function stripeHeader(payload, t = now(), secret = WHSEC) {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;
}

test('webhook : signature fausse, autre secret, horodatage vieux ou invalide = refus ; bonne signature = accepté', async () => {
  reset();
  const payload = JSON.stringify({ type: 'ping', data: { object: { id: 'x' } } });
  const send = (sig) => call('POST', '/webhook', { body: payload, headers: { 'stripe-signature': sig } });
  assert.equal((await send('')).status, 400);
  assert.equal((await send(stripeHeader(payload, now(), 'whsec_autre'))).status, 400);
  assert.equal((await send(stripeHeader(payload, now() - 600))).status, 400);
  assert.equal((await send(stripeHeader(payload + ' ', now()))).status, 400);
  assert.equal((await send(stripeHeader(payload).replace(/t=\d+/, 't=abc'))).status, 400);
  assert.equal(kv.puts, 1, 'une seule note de diagnostic pour une rafale de refus');
  assert.equal((await send(stripeHeader(payload))).status, 200);
});

test('checkout : prix 0 refusé, quantités négatives/énormes ramenées, prix du catalogue', async () => {
  reset();
  const r = await call('POST', '/checkout', { body: { items: [{ slug: 'zero', qty: 1 }], country: 'FR', cart_id: 'cart-12345678' } });
  assert.equal(r.status, 409);
  assert.equal(stripeCalls.length, 0);
  await call('POST', '/checkout', { body: { items: [{ slug: 'ok1', qty: -5, price: 1 }], country: 'FR', cart_id: 'cart-12345678' } });
  assert.equal(reserveArgs[1][0].qty, 1);
  const p = new URLSearchParams(stripeCalls[0][1]);
  assert.equal(p.get('line_items[0][price_data][unit_amount]'), '3000');
  assert.equal(p.get('line_items[0][quantity]'), '1');
  await call('POST', '/checkout', { body: { items: [{ slug: 'ok1', qty: 1e12 }], country: 'FR', cart_id: 'cart-12345678' } });
  assert.equal(reserveArgs[1][0].qty, 99);
});

test('checkout : requête trop lourde refusée (413)', async () => {
  const r = await call('POST', '/checkout', { body: '{}', headers: { 'content-length': String(5 * 1024 * 1024) } });
  assert.equal(r.status, 413);
});

function fakeDO() {
  const data = new Map();
  const storage = {
    list: async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix))),
    get: async (k) => data.get(k), put: async (k, v) => { data.set(k, v); }, delete: async (k) => { data.delete(k); },
  };
  const o = new StockDO(); o.ctx = { storage }; return o;
}

test('stock : pièce à 0 refusée, quantité > stock refusée, pas de double vente', async () => {
  const d = fakeDO();
  assert.equal((await d.reserve('cart-a', [{ slug: 'p', qty: 1 }], { p: 0 })).ok, false);
  assert.equal((await d.reserve('cart-a', [{ slug: 'q', qty: 3 }], { q: 2 })).ok, false);
  assert.equal((await d.reserve('cart-a', [{ slug: 'u', qty: 1 }], { u: 1 })).ok, true);
  const other = await d.reserve('cart-b', [{ slug: 'u', qty: 1 }], { u: 1 });
  assert.equal(other.ok, false); assert.equal(other.problems[0].reason, 'reservee');
});

test('stock : au plus 3 paiements en cours par connexion', async () => {
  const d = fakeDO();
  for (const c of ['c1', 'c2', 'c3']) assert.equal((await d.reserve(c, [{ slug: c, qty: 1 }], { [c]: 1 }, 'ip1')).ok, true);
  const r = await d.reserve('c4', [{ slug: 'c4', qty: 1 }], { c4: 1 }, 'ip1');
  assert.equal(r.ok, false); assert.equal(r.limited, true);
  assert.equal((await d.reserve('c1', [{ slug: 'c1', qty: 1 }], { c1: 1 }, 'ip1')).ok, true, 'le même panier peut réessayer');
  assert.equal((await d.reserve('c5', [{ slug: 'c5', qty: 1 }], { c5: 1 }, 'ip2')).ok, true, 'une autre connexion passe');
});

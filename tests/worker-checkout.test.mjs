// Worker complet (index.ts) : /shipping/quote et /checkout, avec Stripe, le catalogue et le stock simulés.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

// « cloudflare:workers » n’existe que chez Cloudflare : on le remplace par une classe vide ; les imports sans extension (bundler) sont lus en .ts.
const hooks = `
export async function resolve(spec, ctx, next) { if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject {}', shortCircuit: true }; if (/^[.]{1,2}[/]/.test(spec) && !/[.][a-z]+$/.test(spec)) return next(spec + '.ts', ctx); return next(spec, ctx); }`;
register('data:text/javascript,' + encodeURIComponent(hooks));

const config = JSON.parse(readFileSync(new URL('../admin/shipping-config.json', import.meta.url), 'utf8'));
const line = (fr, intl) => [{ amount_alone: fr, country: { code: 'FR' } }, ...(intl == null ? [] : [{ amount_alone: intl }])];
const catalog = [
  { permalink: 'old1', name: 'Vieille', price: 30, url: '/p/old1', images: [], quantity: 1, shipping: line(4, 8), weight_g: 100, mode: 'colis' },
  { permalink: 'old2', name: 'Vieille FR', price: 30, url: '/p/old2', images: [], quantity: 1, shipping: line(6) },
  { permalink: 'new1', name: 'Nouvelle', price: 50, url: '/p/new1', images: [], quantity: 1, shipping: line(0, 29), weight_g: 500, mode: 'colis', alone: false, shipping_derived: true },
  { permalink: 'new2', name: 'Nouvelle 2', price: 40, url: '/p/new2', images: [], quantity: 1, shipping: line(0, 29), weight_g: 400, mode: 'colis', alone: false, shipping_derived: true },
];

let worker, stripeBodies, released;
const env = {
  STRIPE_SECRET_KEY: 'sk_test_abc', SITE_BASE: 'http://site.invalid', ALLOWED_ORIGIN: 'http://site.invalid', ADMIN_GITHUB_LOGIN: 'x',
  HOLDS: { get: async (k) => (k === 'shipping:config' ? JSON.stringify(config) : null), put: async () => {}, delete: async () => {}, list: async () => ({ keys: [] }) },
  STOCK: { idFromName: () => 'main', get: () => ({ reserve: async () => ({ ok: true }), release: async () => { released++; } }) },
};

before(async () => {
  worker = (await import('../checkout-worker/index.ts')).default;
  globalThis.fetch = async (url, opt = {}) => {
    url = String(url);
    if (url.endsWith('/products.json')) return new Response(JSON.stringify(catalog));
    if (url.startsWith('https://api.stripe.com/v1/checkout/sessions')) { stripeBodies.push(new URLSearchParams(opt.body)); return new Response(JSON.stringify({ url: 'https://stripe.test/pay' })); }
    throw new Error('fetch inattendu ' + url);
  };
});

const post = (path, body) => worker.fetch(new Request('http://w.invalid' + path, { method: 'POST', body: JSON.stringify(body) }), env, {});
const items = (...s) => s.map((slug) => ({ slug, qty: 1 }));
const reset = () => { stripeBodies = []; released = 0; };

test('quote : pays par pays pour une nouvelle pièce', async () => {
  const got = {};
  for (const c of ['FR', 'BE', 'DE', 'CA']) { const j = await (await post('/shipping/quote', { items: items('new1'), country: c })).json(); assert.equal(j.ok, true, c); got[c] = j.cents; }
  assert.deepEqual(got, { FR: 0, BE: 1500, DE: 1500, CA: 2900 });
});

test('quote : ancienne pièce seule = son port fixe (France 4, Canada 8)', async () => {
  assert.equal((await (await post('/shipping/quote', { items: items('old1'), country: 'FR' })).json()).cents, 400);
  assert.equal((await (await post('/shipping/quote', { items: items('old1'), country: 'CA' })).json()).cents, 800);
});

test('quote : refus (pays bloqué, sans pays, pièce France seulement, pièce inconnue)', async () => {
  const q = async (b) => (await post('/shipping/quote', b)).json();
  assert.equal((await q({ items: items('new1'), country: 'RU' })).error, 'country_not_served');
  assert.equal((await q({ items: items('new1') })).error, 'country_required');
  assert.equal((await q({ items: items('old2'), country: 'CA' })).error, 'france_uniquement');
  assert.equal((await q({ items: items('nope'), country: 'FR' })).error, 'introuvable');
  assert.equal((await post('/shipping/quote', { items: [], country: 'FR' })).status, 400);
  assert.equal((await q({ items: items('new1'), country: 'ZZZZ' })).error, 'country_required');
});

test('checkout Belgique : port belge, adresse limitée à la Belgique', async () => {
  reset();
  const r = await post('/checkout', { items: items('new1'), country: 'be', cart_id: 'cart-12345678' });
  assert.equal(r.status, 200); const s = stripeBodies[0];
  assert.equal(s.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '1500');
  assert.deepEqual([...s.entries()].filter(([k]) => k.startsWith('shipping_address_collection')).map(([, v]) => v), ['BE']);
  assert.equal(s.get('metadata[country]'), 'BE');
});

test('checkout Canada : 29 €, adresse limitée au Canada', async () => {
  reset();
  await post('/checkout', { items: items('new1'), country: 'CA', cart_id: 'cart-12345678' });
  const s = stripeBodies[0];
  assert.equal(s.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '2900');
  assert.deepEqual([...s.entries()].filter(([k]) => k.startsWith('shipping_address_collection')).map(([, v]) => v), ['CA']);
});

test('checkout France : port France, adresse limitée à la France', async () => {
  reset();
  await post('/checkout', { items: items('old1'), country: 'FR', cart_id: 'cart-12345678' });
  const s = stripeBodies[0];
  assert.equal(s.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '400');
  assert.deepEqual([...s.entries()].filter(([k]) => k.startsWith('shipping_address_collection')).map(([, v]) => v), ['FR']);
});

test('checkout ancienne pièce, Canada : port fixe d’avant (8 €)', async () => {
  reset();
  await post('/checkout', { items: items('old1'), country: 'CA', cart_id: 'cart-12345678' });
  assert.equal(stripeBodies[0].get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '800');
});

test('checkout mixte : poids total, un seul colis', async () => {
  reset();
  await post('/checkout', { items: items('old1', 'new1'), country: 'DE', cart_id: 'cart-12345678' });
  assert.equal(stripeBodies[0].get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '1500');
});

test('checkout : pays refusé = pas de session Stripe, réservation relâchée', async () => {
  reset();
  const r = await post('/checkout', { items: items('new1'), country: 'RU', cart_id: 'cart-12345678' });
  assert.equal(r.status, 409); assert.equal((await r.json()).code, 'country_not_served');
  assert.equal(stripeBodies.length, 0); assert.equal(released, 1);
  const r2 = await post('/checkout', { items: items('old1'), country: 'BY', cart_id: 'cart-12345678' });
  assert.equal(r2.status, 409); assert.equal(stripeBodies.length, 0);
});

test('checkout international sans pays : refusé pour une nouvelle pièce, ancien comportement pour une ancienne', async () => {
  reset();
  const r = await post('/checkout', { items: items('new1'), region: 'intl', cart_id: 'cart-12345678' });
  assert.equal(r.status, 409); assert.equal((await r.json()).code, 'country_required'); assert.equal(stripeBodies.length, 0);
  const r2 = await post('/checkout', { items: items('old1'), region: 'intl', cart_id: 'cart-12345678' });
  assert.equal(r2.status, 200);
  assert.equal(stripeBodies[0].get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '800');
  assert.ok([...stripeBodies[0].entries()].filter(([k]) => k.startsWith('shipping_address_collection')).length > 100); // liste complète, comme avant
});

test('checkout : pièce France seulement vers l’international refusée', async () => {
  reset();
  const r = await post('/checkout', { items: items('old2'), country: 'CA', cart_id: 'cart-12345678' });
  assert.equal(r.status, 409); assert.equal(stripeBodies.length, 0);
});

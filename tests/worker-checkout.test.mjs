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
  { permalink: 'big1', name: 'Grande', price: 100, url: '/p/big1', images: [], quantity: 1, shipping: line(0, 29), weight_g: 500, mode: 'colis', alone: false, shipping_derived: true },
  { permalink: 'soon1', name: 'Bientôt', price: 60, url: '/p/soon1', images: [], quantity: 1, status: 'coming-soon', shipping: line(0, 29), weight_g: 300, mode: 'colis', alone: false, shipping_derived: true },
  { permalink: 'new2', name: 'Nouvelle 2', price: 40, url: '/p/new2', images: [], quantity: 1, shipping: line(0, 29), weight_g: 400, mode: 'colis', alone: false, shipping_derived: true },
];

let worker, stripeBodies, released, tosRefused = false;
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
    if (url.startsWith('https://api.stripe.com/v1/checkout/sessions')) { const b = new URLSearchParams(opt.body); stripeBodies.push(b); if (tosRefused && b.has('consent_collection[terms_of_service]')) return new Response(JSON.stringify({ error: { message: 'You cannot collect consent to your terms of service until a URL is set.' } }), { status: 400 }); return new Response(JSON.stringify({ url: 'https://stripe.test/pay' })); }
    throw new Error('fetch inattendu ' + url);
  };
});

const post = (path, body) => worker.fetch(new Request('http://w.invalid' + path, { method: 'POST', body: JSON.stringify(body) }), env, {});
const items = (...s) => s.map((slug) => ({ slug, qty: 1 }));
const reset = () => { stripeBodies = []; released = 0; tosRefused = false; };

test('quote : pays par pays pour une pièce (grille : zone A 18 €, reste du monde 39 €, relevés au vrai coût arrondi à l’euro)', async () => {
  const got = {};
  for (const c of ['FR', 'BE', 'DE', 'CA']) { const j = await (await post('/shipping/quote', { items: items('new1'), country: c })).json(); assert.equal(j.ok, true, c); got[c] = j.cents; }
  assert.deepEqual(got, { FR: 1000, BE: 2000, DE: 2000, CA: 3000 }); // 500 g + carton 138 g = 638 g -> tranche 1 kg ; France : pièce à 50 € (< 60 €) = vrai tarif 9,29 € arrondi à 10 €
  const big = await (await post('/shipping/quote', { items: items('big1'), country: 'FR' })).json();
  assert.equal(big.cents, 0); // même colis à 100 € : livraison offerte en France dès 60 €
});

test('quote : une ancienne pièce passe aussi par la grille (plus de port fixe : France payante sous 60 €, Canada 30 €)', async () => {
  assert.equal((await (await post('/shipping/quote', { items: items('old1'), country: 'FR' })).json()).cents, 600); // 30 € de pièce, 238 g : colis 5,49 € -> 6 €
  assert.equal((await (await post('/shipping/quote', { items: items('old1'), country: 'CA' })).json()).cents, 3000); // 238 g, 1 pièce vers le Canada : 30 €
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
  assert.equal(s.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '2000');
  assert.deepEqual([...s.entries()].filter(([k]) => k.startsWith('shipping_address_collection')).map(([, v]) => v), ['BE']);
  assert.equal(s.get('metadata[country]'), 'BE');
});

test('checkout Canada : 30 € pour 1 pièce, adresse limitée au Canada', async () => {
  reset();
  await post('/checkout', { items: items('new1'), country: 'CA', cart_id: 'cart-12345678' });
  const s = stripeBodies[0];
  assert.equal(s.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '3000');
  assert.deepEqual([...s.entries()].filter(([k]) => k.startsWith('shipping_address_collection')).map(([, v]) => v), ['CA']);
});

test('checkout France (pièce à 100 €) : livraison offerte, adresse limitée à la France', async () => {
  reset();
  await post('/checkout', { items: items('big1'), country: 'FR', cart_id: 'cart-12345678' });
  const s = stripeBodies[0];
  assert.equal(s.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '0');
  assert.deepEqual([...s.entries()].filter(([k]) => k.startsWith('shipping_address_collection')).map(([, v]) => v), ['FR']);
});

test('checkout Réunion : vrai tarif La Poste au poids, sans livraison offerte', async () => {
  reset();
  await post('/checkout', { items: items('new1'), country: 'RE', cart_id: 'cart-12345678' });
  assert.equal(stripeBodies[0].get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '1900'); // 638 g -> 1 kg OM1
});

test('checkout plusieurs pièces : poids total, un seul colis', async () => {
  reset();
  await post('/checkout', { items: items('old1', 'new1'), country: 'DE', cart_id: 'cart-12345678' });
  assert.equal(stripeBodies[0].get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '2000'); // 600 g + carton = 738 g -> 1 kg
});

test('checkout : pays refusé = pas de session Stripe, réservation relâchée', async () => {
  reset();
  const r = await post('/checkout', { items: items('new1'), country: 'RU', cart_id: 'cart-12345678' });
  assert.equal(r.status, 409); assert.equal((await r.json()).code, 'country_not_served');
  assert.equal(stripeBodies.length, 0); assert.equal(released, 0); // refusé avant toute réservation
  const r2 = await post('/checkout', { items: items('old1'), country: 'BY', cart_id: 'cart-12345678' });
  assert.equal(r2.status, 409); assert.equal(stripeBodies.length, 0);
});

test('checkout international sans pays : refusé (jamais un prix au hasard)', async () => {
  reset();
  const r = await post('/checkout', { items: items('new1'), region: 'intl', cart_id: 'cart-12345678' });
  assert.equal(r.status, 409); assert.equal((await r.json()).code, 'country_required'); assert.equal(stripeBodies.length, 0);
  const r2 = await post('/checkout', { items: items('old1'), region: 'intl', cart_id: 'cart-12345678' });
  assert.equal(r2.status, 409); assert.equal((await r2.json()).code, 'country_required'); assert.equal(stripeBodies.length, 0);
});

test('checkout : pièce France seulement vers l’international refusée', async () => {
  reset();
  const r = await post('/checkout', { items: items('old2'), country: 'CA', cart_id: 'cart-12345678' });
  assert.equal(r.status, 409); assert.equal(stripeBodies.length, 0);
});

test('checkout : une pièce « bientôt disponible » est refusée (jamais de page Stripe)', async () => {
  reset();
  const r = await post('/checkout', { items: items('soon1'), country: 'fr', cart_id: 'cart-12345678' });
  assert.equal(r.status, 409);
  assert.deepEqual((await r.json()).problems, [{ slug: 'soon1', reason: 'bientot' }]);
  assert.equal(stripeBodies.length, 0);
});

test('pays livrés : liste blanche (Japon, Australie, Suisse, Norvège, outre-mer acceptés ; Russie, Biélorussie, Chine refusées)', async () => {
  for (const c of ['JP', 'AU', 'CH', 'NO', 'GB', 'US', 'CA', 'RE']) {
    reset();
    const r = await post('/checkout', { items: items('new1'), country: c, cart_id: 'cart-12345678' });
    assert.equal(r.status, 200, c); assert.equal(stripeBodies.length, 1, c);
  }
  for (const c of ['RU', 'BY', 'CN', 'ZZ']) {
    reset();
    const r = await post('/checkout', { items: items('new1'), country: c, cart_id: 'cart-12345678' });
    assert.equal(r.status, 409, c); assert.equal(stripeBodies.length, 0, c);
  }
});

test('CGV : case à cocher obligatoire ; si Stripe refuse (adresse des CGV absente), repli sur la phrase sans case', async () => {
  reset();
  await post('/checkout', { items: items('new1'), country: 'BE', cart_id: 'cart-12345678', lang: 'fr' });
  assert.equal(stripeBodies[0].get('consent_collection[terms_of_service]'), 'required');
  assert.ok(stripeBodies[0].get("custom_text[terms_of_service_acceptance][message]").startsWith("J'accepte les [conditions de vente]"));
  reset(); tosRefused = true;
  const r = await post('/checkout', { items: items('new1'), country: 'BE', cart_id: 'cart-12345678', lang: 'en' });
  assert.equal(r.status, 200); assert.equal(stripeBodies.length, 2);
  assert.equal(stripeBodies[1].get('consent_collection[terms_of_service]'), null);
  assert.match(stripeBodies[1].get('custom_text[submit][message]'), /^By paying, you accept/);
});

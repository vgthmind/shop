import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkoutShipping } from '../checkout-worker/shipping-worker.ts';

const config = JSON.parse(readFileSync(new URL('../admin/shipping-config.json', import.meta.url), 'utf8'));
const env = (cfg = config) => ({ HOLDS: { get: async () => JSON.stringify(cfg), put: async () => {} }, SITE_BASE: 'http://x.invalid' });
const line = (fr, intl) => [{ amount_alone: fr, country: { code: 'FR' } }, ...(intl == null ? [] : [{ amount_alone: intl }])];
const old = (slug, fr = 4, intl = 8) => ({ permalink: slug, price: 30, weight_g: 100, shipping: line(fr, intl) });
const fresh = (slug, extra = {}) => ({ permalink: slug, price: 50, weight_g: 500, mode: 'colis', alone: false, shipping_derived: true, shipping: line(9, 20), ...extra });
const w = (...s) => new Map(s.map((x) => [x, 1]));

test('anciennes pièces : port fixe, le plus élevé du panier, inchangé', async () => {
  const r = await checkoutShipping(env(), [old('a', 4, 8), old('b', 6, 12)], w('a', 'b'), 'fr');
  assert.deepEqual([r.ok, r.cents, r.source], [true, 600, 'legacy']);
  assert.equal((await checkoutShipping(env(), [old('a', 4, 8), old('b', 6, 12)], w('a', 'b'), 'intl')).cents, 1200);
});

test('nouvelle pièce : port calculé sur la grille, pas 0 €', async () => {
  const ca = await checkoutShipping(env(), [fresh('n')], w('n'), 'intl', 'CA');
  assert.deepEqual([ca.ok, ca.source, ca.cents], [true, 'grid', 2900]);
  // France : Colissimo offert (réglage de la grille), lettre à 4 €
  assert.equal((await checkoutShipping(env(), [fresh('n')], w('n'), 'fr')).cents, 0);
  assert.equal((await checkoutShipping(env(), [fresh('n', { weight_g: 50, mode: 'lettre' })], w('n'), 'fr')).cents, 400);
});

test('le port du Worker = le calcul admin (même grille, même pièce)', async () => {
  const calc = (await import('../admin/shipping-calc.js')).default;
  const exp = calc.quoteOrFallback(config, { items: [{ slug: 'n', qty: 1, weight_g: 500, mode: 'colis' }], subtotal: 50 }, 'FR');
  assert.equal((await checkoutShipping(env(), [fresh('n')], w('n'), 'fr')).cents, exp.totalCents);
  const ca = calc.quoteOrFallback(config, { items: [{ slug: 'n', qty: 1, weight_g: 500, mode: 'colis' }], subtotal: 50 }, 'CA');
  assert.equal((await checkoutShipping(env(), [fresh('n')], w('n'), 'intl', 'CA')).cents, ca.totalCents);
});

test('international sans pays : pire cas des zones livrées', async () => {
  const r = await checkoutShipping(env(), [fresh('n')], w('n'), 'intl');
  const ca = await checkoutShipping(env(), [fresh('n')], w('n'), 'intl', 'CA');
  assert.equal(r.ok, true); assert.ok(r.cents >= ca.cents); assert.equal(r.country, null);
});

test('la quantité compte (2 exemplaires pèsent plus qu’un)', async () => {
  const one = await checkoutShipping(env(), [fresh('n', { weight_g: 900 })], new Map([['n', 1]]), 'fr');
  const two = await checkoutShipping(env(), [fresh('n', { weight_g: 900 })], new Map([['n', 3]]), 'fr');
  assert.ok(two.cents >= one.cents);
});

test('panier mixte : le plus élevé entre port fixe et grille', async () => {
  const g = await checkoutShipping(env(), [fresh('n')], w('n'), 'fr');
  const r = await checkoutShipping(env(), [old('a', 99, 99), fresh('n')], w('a', 'n'), 'fr');
  assert.deepEqual([r.source, r.cents], ['mixed', Math.max(9900, g.cents)]);
});

test('sans poids ni port : refus, jamais gratuit', async () => {
  const r = await checkoutShipping(env(), [fresh('n', { weight_g: undefined })], w('n'), 'fr');
  assert.equal(r.ok, false); assert.equal(r.error, 'missing_weight'); assert.deepEqual(r.slugs, ['n']);
});

test('pays non livré refusé', async () => {
  const r = await checkoutShipping(env(), [fresh('n')], w('n'), 'intl', 'RU');
  assert.equal(r.ok, false); assert.equal(r.error, 'country_not_served');
});

test('grille introuvable : erreur claire, pas de port à 0', async () => {
  const bad = { HOLDS: { get: async () => null }, SITE_BASE: 'http://x.invalid' };
  const prev = globalThis.fetch; globalThis.fetch = async () => { throw new Error('réseau coupé'); };
  try {
    const r = await checkoutShipping(bad, [fresh('n')], w('n'), 'fr');
    assert.equal(r.ok, false); assert.equal(r.error, 'config_unavailable');
    // une ancienne pièce seule n'a pas besoin de la grille
    assert.equal((await checkoutShipping(bad, [old('a')], w('a'), 'fr')).cents, 400);
  } finally { globalThis.fetch = prev; }
});

test('port fixe à 0 sur une fiche = pas un port gratuit : retombe sur la grille', async () => {
  const p = { permalink: 'z', price: 10, weight_g: 300, mode: 'colis', shipping: line(0, 0) };
  const r = await checkoutShipping(env(), [p], w('z'), 'intl', 'DE');
  assert.deepEqual([r.source, r.cents], ['grid', 1500]);
});

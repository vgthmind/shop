import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { checkoutShipping } from '../checkout-worker/shipping-worker.ts';

const calc = createRequire(import.meta.url)('../admin/shipping-calc.js');
const config = JSON.parse(readFileSync(new URL('../admin/shipping-config.json', import.meta.url), 'utf8'));
const env = (cfg = config) => ({ HOLDS: { get: async () => JSON.stringify(cfg), put: async () => {} }, SITE_BASE: 'http://x.invalid' });
const line = (fr, intl) => [{ amount_alone: fr, country: { code: 'FR' } }, ...(intl == null ? [] : [{ amount_alone: intl }])];
const old = (slug, fr = 4, intl = 8, extra = {}) => ({ permalink: slug, price: 30, shipping: line(fr, intl), ...extra });
const fresh = (slug, extra = {}) => ({ permalink: slug, price: 50, weight_g: 500, mode: 'colis', alone: false, shipping_derived: true, shipping: line(9, 20), ...extra });
const w = (...s) => new Map(s.map((x) => [x, 1]));
const grid = (items, country) => calc.quoteShipping(config, { items, subtotal: 100 }, country).totalCents;

test('anciennes pièces seules : port fixe d’avant, France ou n’importe quel pays livré', async () => {
  const ps = [old('a', 4, 8), old('b', 6, 12)];
  assert.deepEqual(await checkoutShipping(env(), ps, w('a', 'b'), 'fr'), { ok: true, cents: 600, source: 'legacy', country: null, free: false });
  assert.equal((await checkoutShipping(env(), ps, w('a', 'b'), 'intl')).cents, 1200); // ancien front sans pays
  for (const c of ['CA', 'BE', 'DE']) assert.equal((await checkoutShipping(env(), ps, w('a', 'b'), 'intl', c)).cents, 1200, c);
  assert.equal((await checkoutShipping(env(), ps, w('a', 'b'), 'fr', 'FR')).cents, 600);
});

test('une ancienne pièce avec poids, seule : toujours son port fixe (pas la grille)', async () => {
  const p = old('a', 4, 8, { weight_g: 48, mode: 'lettre' });
  assert.equal((await checkoutShipping(env(), [p], w('a'), 'fr', 'FR')).cents, 400);
  assert.equal((await checkoutShipping(env(), [p], w('a'), 'intl', 'CA')).cents, 800);
});

test('pays refusé reste refusé, même pour une ancienne pièce', async () => {
  for (const c of ['RU', 'BY']) {
    const r = await checkoutShipping(env(), [old('a')], w('a'), 'intl', c);
    assert.deepEqual([r.ok, r.error], [false, 'country_not_served'], c);
  }
});

test('nouvelle pièce : le port dépend du pays choisi (Belgique, Allemagne, Canada, Suisse…)', async () => {
  const p = fresh('n');
  const got = {};
  for (const c of ['FR', 'BE', 'DE', 'CA', 'US', 'CH', 'GB']) {
    const r = await checkoutShipping(env(), [p], w('n'), c === 'FR' ? 'fr' : 'intl', c);
    assert.equal(r.ok, true, c); assert.equal(r.country, c);
    assert.equal(r.cents, grid([{ slug: 'n', qty: 1, weight_g: 500, mode: 'colis' }], c), c); // = calcul admin
    got[c] = r.cents;
  }
  assert.equal(got.FR, 0); assert.equal(got.BE, 1500); assert.equal(got.DE, 1500); assert.equal(got.CA, 2900);
  assert.ok(got.BE < got.CA);
});

test('nouvelle pièce, international sans pays : refusé (jamais un prix au hasard)', async () => {
  const r = await checkoutShipping(env(), [fresh('n')], w('n'), 'intl');
  assert.deepEqual([r.ok, r.error], [false, 'country_required']);
});

test('nouvelle pièce, pays non livré ou bloqué : refusé', async () => {
  for (const c of ['RU', 'BY']) assert.equal((await checkoutShipping(env(), [fresh('n')], w('n'), 'intl', c)).error, 'country_not_served', c);
  const off = structuredClone(config); off.zones.forEach((z) => { if (z.id === 'C') z.enabled = false; });
  assert.equal((await checkoutShipping(env(off), [fresh('n')], w('n'), 'intl', 'CA')).error, 'country_not_served');
});

test('lettre en France : 4 €', async () => {
  assert.equal((await checkoutShipping(env(), [fresh('n', { weight_g: 50, mode: 'lettre' })], w('n'), 'fr', 'FR')).cents, 400);
});

test('la quantité compte', async () => {
  const p = fresh('n', { weight_g: 900 });
  const one = await checkoutShipping(env(), [p], new Map([['n', 1]]), 'intl', 'DE');
  const three = await checkoutShipping(env(), [p], new Map([['n', 3]]), 'intl', 'DE');
  assert.equal(three.cents, grid([{ slug: 'n', qty: 3, weight_g: 900, mode: 'colis' }], 'DE')); assert.ok(three.cents >= one.cents);
});

test('panier mixte : poids total (ancienne pièce avec poids + nouvelle), un seul colis', async () => {
  const o = old('a', 99, 99, { weight_g: 300, mode: 'colis' }), n = fresh('n', { weight_g: 400 });
  const r = await checkoutShipping(env(), [o, n], w('a', 'n'), 'intl', 'DE');
  const together = grid([{ slug: 'a', qty: 1, weight_g: 300, mode: 'colis' }, { slug: 'n', qty: 1, weight_g: 400, mode: 'colis' }], 'DE');
  assert.deepEqual([r.ok, r.source, r.cents], [true, 'grid', together]);
  assert.notEqual(r.cents, 9900); // le port fixe 99 € de l’ancienne pièce n’est plus appliqué
  const fr = await checkoutShipping(env(), [o, n], w('a', 'n'), 'fr', 'FR');
  assert.equal(fr.cents, 0);
});

test('panier mixte : ancienne pièce SANS poids garde son port fixe (le plus élevé des deux)', async () => {
  const o = old('a', 5, 18), n = fresh('n'); // pas de weight_g sur o
  const de = await checkoutShipping(env(), [o, n], w('a', 'n'), 'intl', 'DE');
  assert.deepEqual([de.source, de.cents], ['mixed', Math.max(1800, 1500)]);
  const fr = await checkoutShipping(env(), [o, n], w('a', 'n'), 'fr', 'FR');
  assert.deepEqual([fr.source, fr.cents], ['mixed', 500]);
});

test('nouvelle pièce sans poids : refus, jamais gratuit', async () => {
  const r = await checkoutShipping(env(), [fresh('n', { weight_g: undefined })], w('n'), 'fr', 'FR');
  assert.deepEqual([r.ok, r.error, r.slugs], [false, 'missing_weight', ['n']]);
});

test('grille introuvable : nouvelle pièce refusée, ancienne pièce passe', async () => {
  const bad = { HOLDS: { get: async () => null }, SITE_BASE: 'http://x.invalid' };
  const prev = globalThis.fetch; globalThis.fetch = async () => { throw new Error('réseau coupé'); };
  try {
    assert.equal((await checkoutShipping(bad, [fresh('n')], w('n'), 'fr', 'FR')).error, 'config_unavailable');
    assert.equal((await checkoutShipping(bad, [old('a')], w('a'), 'fr', 'FR')).cents, 400);
    assert.equal((await checkoutShipping(bad, [old('a')], w('a'), 'intl', 'CA')).cents, 800); // pas de grille : repli sur l’ancien comportement
  } finally { globalThis.fetch = prev; }
});

test('port fixe à 0 sur la fiche = pas un port gratuit : traité comme une pièce du studio', async () => {
  const p = { permalink: 'z', price: 10, weight_g: 300, mode: 'colis', shipping: line(0, 0) };
  const r = await checkoutShipping(env(), [p], w('z'), 'intl', 'DE');
  assert.deepEqual([r.source, r.cents], ['grid', 1500]);
});

test('code pays en minuscules accepté', async () => {
  assert.equal((await checkoutShipping(env(), [fresh('n')], w('n'), 'intl', 'de')).cents, 1500);
});

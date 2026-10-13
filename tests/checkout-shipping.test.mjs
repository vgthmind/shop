import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { checkoutShipping } from '../checkout-worker/shipping-worker.ts';

const calc = createRequire(import.meta.url)('../admin/shipping-calc.js');
const config = JSON.parse(readFileSync(new URL('../admin/shipping-config.json', import.meta.url), 'utf8'));
const env = (cfg = config) => ({ HOLDS: { get: async () => JSON.stringify(cfg), put: async () => {} }, SITE_BASE: 'http://x.invalid' });
const line = (fr, intl) => [{ amount_alone: fr, country: { code: 'FR' } }, ...(intl == null ? [] : [{ amount_alone: intl }])];
const piece = (slug, extra = {}) => ({ permalink: slug, price: 50, weight_g: 500, mode: 'colis', alone: false, shipping_derived: true, shipping: line(9, 20), ...extra });
const w = (...s) => new Map(s.map((x) => [x, 1]));
const grid = (items, country) => calc.quoteShipping(config, { items, subtotal: 100 }, country).totalCents;

test('toutes les pièces passent par la grille : le port dépend du pays choisi (Belgique, Allemagne, Canada, Suisse, Outre-mer…)', async () => {
  const p = piece('n'); // 500 g + carton 138 g = 638 g -> tranche 1 kg
  const got = {};
  for (const c of ['FR', 'BE', 'DE', 'CA', 'US', 'CH', 'GB', 'RE']) {
    const r = await checkoutShipping(env(), [p], w('n'), c === 'FR' ? 'fr' : 'intl', c);
    assert.equal(r.ok, true, c); assert.equal(r.country, c); assert.equal(r.source, 'grid');
    assert.equal(r.cents, grid([{ slug: 'n', qty: 1, weight_g: 500, mode: 'colis' }], c), c); // = calcul admin
    got[c] = r.cents;
  }
  assert.deepEqual(got, { FR: 0, BE: 2000, DE: 2000, CA: 3000, US: 3000, CH: 2000, GB: 2400, RE: 1900 });
});

test('ports fixes hérités de BigCartel : ignorés (la grille décide), même avec un port fixe énorme sur la fiche', async () => {
  const p = piece('a', { shipping_derived: undefined, shipping: line(99, 99) });
  assert.equal((await checkoutShipping(env(), [p], w('a'), 'fr', 'FR')).cents, 0);
  assert.equal((await checkoutShipping(env(), [p], w('a'), 'intl', 'CA')).cents, 3000);
});

test('pièce sans poids : refus, jamais gratuit, même avec un port fixe sur la fiche', async () => {
  const r = await checkoutShipping(env(), [piece('n', { weight_g: undefined, shipping: line(5, 8) })], w('n'), 'fr', 'FR');
  assert.deepEqual([r.ok, r.error, r.slugs], [false, 'missing_weight', ['n']]);
});

test('pays refusé reste refusé ; international sans pays : refusé (jamais un prix au hasard)', async () => {
  for (const c of ['RU', 'BY']) {
    const r = await checkoutShipping(env(), [piece('a')], w('a'), 'intl', c);
    assert.deepEqual([r.ok, r.error], [false, 'country_not_served'], c);
  }
  const r = await checkoutShipping(env(), [piece('n')], w('n'), 'intl');
  assert.deepEqual([r.ok, r.error], [false, 'country_required']);
  const off = structuredClone(config); off.zones.forEach((z) => { if (z.id === 'C') z.enabled = false; });
  assert.equal((await checkoutShipping(env(off), [piece('n')], w('n'), 'intl', 'CA')).error, 'country_not_served');
});

test('lettre seule : 4 € en France ; à l’étranger lettre suivie internationale au vrai tarif arrondi (8 €) ; avec une autre pièce ou vers l’outre-mer : colis', async () => {
  const l = piece('l', { weight_g: 50, mode: 'lettre' });
  assert.equal((await checkoutShipping(env(), [l], w('l'), 'fr', 'FR')).cents, 400);
  for (const c of ['BE', 'GB', 'NO', 'CA', 'US', 'JP']) assert.equal((await checkoutShipping(env(), [l], w('l'), 'intl', c)).cents, 800, c); // 70 g -> 100 g = 7,65 €
  const other = piece('o', { weight_g: 500, mode: 'colis' });
  assert.equal((await checkoutShipping(env(), [l, other], w('l', 'o'), 'intl', 'BE')).cents, 2000); // avec une autre pièce : un seul colis
  assert.equal((await checkoutShipping(env(), [l], w('l'), 'intl', 'RE')).cents, 1300); // outre-mer : colis (186 g -> 500 g = 12,02 €, arrondi)
});

test('la quantité compte', async () => {
  const p = piece('n', { weight_g: 900 });
  const one = await checkoutShipping(env(), [p], new Map([['n', 1]]), 'intl', 'DE');
  const three = await checkoutShipping(env(), [p], new Map([['n', 3]]), 'intl', 'DE');
  assert.equal(three.cents, grid([{ slug: 'n', qty: 3, weight_g: 900, mode: 'colis' }], 'DE')); assert.ok(three.cents >= one.cents);
});

test('panier de plusieurs pièces : poids total, UN seul colis (plus de « envoi seul »)', async () => {
  const a = piece('a', { weight_g: 570 }), b = piece('b', { weight_g: 420 }), c = piece('c', { weight_g: 550 });
  const all = w('a', 'b', 'c');
  const together = (country) => grid([{ slug: 'a', qty: 1, weight_g: 570 }, { slug: 'b', qty: 1, weight_g: 420 }, { slug: 'c', qty: 1, weight_g: 550 }], country);
  for (const [cc, expected] of [['DE', 2300], ['RE', 2600], ['CA', 5500]]) {
    const r = await checkoutShipping(env(), [a, b, c], all, 'intl', cc);
    assert.deepEqual([r.ok, r.cents], [true, together(cc)], cc);
    assert.equal(r.cents, expected, cc); // 1540 g + carton 138 g = 1678 g -> tranche 2 kg
  }
  assert.equal((await checkoutShipping(env(), [a, b, c], all, 'fr', 'FR')).cents, 0);
});

test('plus jamais à perte : le port facturé couvre le vrai tarif La Poste, 1 à 5 pièces, tous pays hors France', async () => {
  const ps = ['a', 'b', 'c', 'd', 'e'].map((s) => piece(s, { weight_g: 550 }));
  for (const c of ['BE', 'DE', 'CH', 'GB', 'NO', 'CA', 'US', 'JP', 'RE', 'NC']) {
    for (let k = 1; k <= 5; k++) {
      const items = ps.slice(0, k).map((p) => ({ slug: p.permalink, qty: 1, weight_g: 550 }));
      const q = calc.quoteShipping(config, { items, subtotal: 100 }, c);
      const r = await checkoutShipping(env(), ps.slice(0, k), w(...ps.slice(0, k).map((p) => p.permalink)), 'intl', c);
      if (k === 1 && (c === 'CA' || c === 'US')) { assert.equal(r.cents, 3000); continue; } // pièce seule : forfait 30 € voulu, différence à la charge du vendeur
      assert.ok(r.cents >= q.costCents, `${c} ${k} pièce(s) : ${r.cents} < coût ${q.costCents}`);
    }
  }
});

test('grille introuvable : toute commande refusée (aucun repli sur un ancien port)', async () => {
  const bad = { HOLDS: { get: async () => null }, SITE_BASE: 'http://x.invalid' };
  const prev = globalThis.fetch; globalThis.fetch = async () => { throw new Error('réseau coupé'); };
  try {
    assert.equal((await checkoutShipping(bad, [piece('n')], w('n'), 'fr', 'FR')).error, 'config_unavailable');
    assert.equal((await checkoutShipping(bad, [piece('n')], w('n'), 'intl', 'CA')).error, 'config_unavailable');
  } finally { globalThis.fetch = prev; }
});

test('code pays en minuscules accepté', async () => {
  assert.equal((await checkoutShipping(env(), [piece('n')], w('n'), 'intl', 'de')).cents, 2000);
});

test('panier mixte lettre + colis en France : un seul colis, port offert ; lettre seule 4 €', async () => {
  const l = piece('l', { weight_g: 50, mode: 'lettre' }), c = piece('c', { weight_g: 500, mode: 'colis' });
  assert.equal((await checkoutShipping(env(), [l, c], w('l', 'c'), 'fr', 'FR')).cents, 0);
  assert.equal((await checkoutShipping(env(), [l], w('l'), 'fr', 'FR')).cents, 400);
});

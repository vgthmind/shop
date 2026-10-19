import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const calc = require('../admin/shipping-calc.js');
const V = require('../assets/vg-shipping-view.js');
const config = JSON.parse(readFileSync(new URL('../admin/shipping-config.json', import.meta.url), 'utf8'));
config.items = { a: { weight_g: 150 } };
const cart = [{ slug: 'a', price: 20, qty: 1 }];

test('pays choisi : prix de livraison et total', () => {
  const v = V.buildView(calc, config, cart, 'FR', 'fr');
  assert.equal(v.state, 'ok'); assert.equal(v.blocked, false);
  assert.equal(v.shipping, 0); assert.equal(v.total, 20);
  assert.equal(v.summary, 'Livraison : offerte');
  assert.equal(V.buildView(calc, config, cart, 'CA', 'en').summary, 'Shipping : €30.00'); // 1 pièce vers le Canada : 30 €
});
test('plusieurs colis annoncés', () => {
  const big = structuredClone(config); big.items = { a: { weight_g: 570, alone: true } };
  const v = V.buildView(calc, big, [{ slug: 'a', price: 10, qty: 2 }], 'FR', 'en');
  assert.match(v.summary, /\(2 parcels\)/);
});
test('livraison offerte', () => {
  const c = structuredClone(config); c.free_shipping = { enabled: true, threshold: 15, zones: [] };
  const v = V.buildView(calc, c, cart, 'FR', 'fr');
  assert.equal(v.free, true); assert.equal(v.total, 20); assert.equal(v.summary, 'Livraison : offerte');
});
test('pays non livré : texte clair FR et EN, bouton bloqué', () => {
  const c = structuredClone(config); c.blocked_countries = ['JP'];
  const fr = V.buildView(calc, c, cart, 'JP', 'fr'), en = V.buildView(calc, c, cart, 'JP', 'en');
  assert.equal(fr.state, 'not_served'); assert.equal(fr.blocked, true);
  assert.match(fr.message, /Je ne livre pas encore en Japon/); assert.match(en.message, /I don't ship to Japan/);
});
test('pas de pays / grille pas chargée / grille invalide', () => {
  assert.equal(V.buildView(calc, config, cart, '', 'fr').state, 'choose');
  assert.equal(V.buildView(calc, null, cart, 'FR', 'fr').state, 'loading');
  assert.equal(V.buildView(calc, { zones: 'x' }, cart, 'FR', 'fr').state, 'error');
});
test('liste de pays : France, Canada en tête, noms localisés', () => {
  const l = V.countryList('fr');
  assert.deepEqual(l.slice(0, 2).map((c) => c.code), ['FR', 'CA']);
  assert.equal(l[0].name, 'France'); assert.ok(l.length > 200);
  assert.equal(V.countryList('en').find((c) => c.code === 'DE').name, 'Germany');
});
test('langue : fr-CA -> fr, tout le reste -> en', () => {
  assert.equal(V.langOf('fr-CA'), 'fr'); assert.equal(V.langOf('de'), 'en'); assert.equal(V.langOf(undefined), 'en');
});

test('fromQuote : prix du Worker affiché, états de blocage', () => {
  assert.equal(V.fromQuote(null, 20, '', 'fr').state, 'choose');
  assert.equal(V.fromQuote(null, 20, 'BE', 'fr').state, 'loading');
  const ok = V.fromQuote({ ok: true, total: 15 }, 20, 'BE', 'fr');
  assert.deepEqual([ok.state, ok.blocked, ok.shipping, ok.total, ok.summary], ['ok', false, 15, 35, 'Livraison : 15,00 €']);
  assert.equal(V.fromQuote({ ok: true, total: 0 }, 20, 'FR', 'en').summary, 'Shipping : free');
  const ru = V.fromQuote({ ok: false, error: 'country_not_served' }, 20, 'RU', 'fr');
  assert.deepEqual([ru.state, ru.blocked], ['not_served', true]); assert.match(ru.message, /Russie/);
  assert.match(V.fromQuote({ ok: false, error: 'france_uniquement' }, 20, 'CA', 'en').message, /France only/);
  assert.equal(V.fromQuote({ ok: false, error: 'country_required' }, 20, 'CA', 'fr').state, 'choose');
  const net = V.fromQuote({ ok: false, error: 'network' }, 20, 'CA', 'fr');
  assert.deepEqual([net.state, net.blocked], ['error', true]);
});

test('panier : le sélecteur de pays formate les montants dans la langue de la page (régression « €84.00 » en français)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../assets/vg-shipping-picker.js', import.meta.url), 'utf8');
  const calls = src.match(/V\.money\([^)]*\)/g) || [];
  assert.ok(calls.length >= 4);
  for (const c of calls) assert.match(c, /,\s*lang\)/, c + ' sans langue');
});

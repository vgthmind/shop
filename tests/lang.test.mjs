// Bouton de langue EN | FR : pages empilées complètes, pas de texte bilingue « EN / FR » resté dans le panier.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('chaque page empilée a un bloc English ET un bloc Français', () => {
  for (const f of readdirSync(new URL('../theme/pages/', import.meta.url))) {
    const h = read('theme/pages/' + f);
    if (!h.includes('vg-lang-sep')) continue;
    assert.ok(/vg-lang-sep"><span>English/.test(h), f + ' : English manquant');
    assert.ok(/vg-lang-sep"><span>Fran/.test(h), f + ' : Français manquant');
  }
});

test('panier : plus de chaîne « anglais / français » en dur (tout passe par L(en, fr))', () => {
  const js = read('assets/vg-shop-cart.js');
  assert.ok(!/'[^'\n]*[a-z] \/ [A-ZÉ][^'\n]*'/.test(js.replace(/Customs\/Upcycling/g, '')), 'chaîne bilingue restée dans vg-shop-cart.js');
  assert.ok(js.includes('window.vgL'));
});

test('vg-lang.js : anglais par défaut, localStorage vg-lang, bouton EN | FR', () => {
  const js = read('assets/vg-lang.js');
  assert.ok(js.includes("'fr' : 'en'"), 'anglais par défaut');
  assert.ok(js.includes("vg-lang") && js.includes('vg-lang-toggle'));
  assert.ok(read('theme/custom/head.html').includes('data-vg-lang'), 'langue posée avant l\'affichage');
});

test('les adresses ne changent pas : aucune page /fr/ ou /en/', () => {
  assert.ok(!/\/fr\/|\/en\//.test(read('assets/vg-lang.js').replace(/\/\^fr\/i/g, '')));
});

// --- Lot « traductions » (2026-10-12) ---
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);

test('nom anglais facultatif : filtre name_i18n (deux langues si différent, nom seul sinon)', () => {
  const filters = req('../generator/filters.js');
  assert.equal(filters.name_i18n({ name: 'Pantalon rouge' }), 'Pantalon rouge');
  assert.equal(filters.name_i18n({ name: 'Cache-cou', name_en: 'Cache-cou' }), 'Cache-cou');
  assert.equal(filters.name_i18n({ name: 'Pantalon rouge', name_en: 'Red <b>trousers' }), '<span data-l="fr">Pantalon rouge</span><span data-l="en">Red &lt;b&gt;trousers</span>');
});

test('nom anglais facultatif : admin (formulaire, Sveltia) et catalogue', () => {
  const F = req('../admin/piece-form.js');
  const base = { name: 'Pantalon', price: 100, quantity: 1, categories: ['pants'], description_en: 'x', weight_g: 500, mode: 'colis' };
  assert.equal(F.buildPiece(Object.assign({}, base, { name_en: ' Trousers ' }), ['pants']).product.name_en, 'Trousers');
  assert.equal('name_en' in F.buildPiece(Object.assign({}, base, { name_en: '' }), ['pants']).product, false);
  assert.equal('name_en' in F.buildPiece(Object.assign({}, base, { name_en: 'Pantalon' }), ['pants']).product, false);
  assert.ok(read('admin/config.yml').includes('name: "name_en"'));
  assert.ok(read('generator/build-catalog.js').includes('name_en'));
});

test('vg-lang.js : Latest Drop traduit en FR (Dernier drop), Customs / Merch restent en anglais, prix €84.00 en EN, onglets et textes cachés traduits', () => {
  const js = read('assets/vg-lang.js');
  assert.ok(js.includes("'Latest Drop': 'Dernier drop'") && !js.includes("'Merch':") && !js.includes("'Customs/Upcycling':"), 'Latest Drop traduit ; Customs et Merch restent en anglais');
  assert.ok(js.includes('window.vgMoney') && js.includes("'€' + n.toLocaleString('en-GB'"));
  for (const k of ['Open mobile navigation', 'Close navigation', 'Submit search form', 'Search products…', 'Breadcrumb', 'vgthmind Home']) assert.ok(js.includes("'" + k + "'"), k);
  for (const k of ['Boutique — créations vgthmind', 'Infos & conditions de vente', 'Suivre ma commande']) assert.ok(js.includes(k), k);
});

test('suivi : une seule langue pour tout le site (plus de FR · EN séparé)', () => {
  assert.ok(!read('generator/shop-pages/suivi.html').includes('data-lang'));
  const cart = read('assets/vg-shop-cart.js');
  assert.ok(!cart.includes('vg-track-lang') && cart.includes("window.vgLang === 'fr' ? 'fr' : 'en'"));
});

test('boutons de retour et mentions légales', () => {
  assert.ok(/data-l="fr">Retour au panier/.test(read('generator/shop-pages/paiement-annule.html')));
  assert.ok(/data-l="fr">Retour à la boutique/.test(read('generator/shop-pages/merci.html')));
  const ml = read('theme/pages/mentions-legales.html');
  assert.ok(!/GitHub/.test(ml) && ml.includes('Cloudflare, Inc.') && ml.includes('101 Townsend St') && ml.includes('+1 (650) 319-8930'));
});

test('lien sous le titre des fiches : « ← Boutique » / « ← Shop » ; textes alternatifs en EN avec le nom anglais', () => {
  assert.ok(/back.textContent = '.{1,8} Boutique'/.test(read('theme/custom/body.html')));
  const js = read('assets/vg-lang.js');
  assert.ok(js.includes("'Boutique': 'Shop'"));
  assert.ok(js.includes('window.vgNamesEn') && read('generator/build.js').includes('window.vgNamesEn='));
});

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

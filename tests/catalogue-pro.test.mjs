// Catalogue pro (/pro/) : données construites depuis les fiches + data/catalogue-pro.json, et demande « boutique » côté Worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { build, frPart } = require('../generator/catalogue-pro.js');

test('catalogue pro : pièces du site + hors site, statuts et gammes', () => {
  const d = build(ROOT);
  const ids = d.items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'identifiants uniques');
  for (const it of d.items) {
    assert.ok(['ensembles', 'hauts', 'bas', 'accessoires', 'musique', 'surmesure'].includes(it.type), it.id + ' type');
    assert.ok(['collection', 'couture-peinture', 'couture', 'custom', 'serie'].includes(it.gamme), it.id + ' gamme');
    assert.ok(['dispo', 'demande', 'boutique', 'vendu'].includes(it.statut), it.id + ' statut');
    assert.ok(it.photos.length > 0, it.id + ' photo');
    assert.ok(['vente', 'location', 'vente+location'].includes(it.offre), it.id + ' offre');
  }
  assert.ok(!ids.includes('test') && !ids.includes('test1e'), 'pièces de test exclues');
  const cfg = require('../data/catalogue-pro.json');
  for (const [slug, o] of Object.entries(cfg.overrides)) if (o.statut === 'boutique') assert.equal(d.items.find((i) => i.id === slug).statut, 'boutique');
});

test('catalogue pro : description française seule', () => {
  assert.equal(frPart('Black hoodie\nSize M\n\nHoodie noir\nTaille M'), 'Hoodie noir\nTaille M');
});

test('demande « boutique » : boutique et sélection obligatoires', async () => {
  const core = await import('../checkout-worker/requests-core.ts');
  const ok = core.parseSubmission({ type: 'boutique', firstName: 'A', lastName: 'B', email: 'a@b.fr', country: 'FR', shop: 'Shop', selection: '1. X', shopKind: 'Dépôt-vente' });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.fields.shop, 'Shop');
  assert.equal(ok.value.fields.selection, '1. X');
  const bad = core.parseSubmission({ type: 'boutique', firstName: 'A', lastName: 'B', email: 'a@b.fr', country: 'FR' });
  assert.equal(bad.ok, false);
  assert.ok(bad.fields.includes('shop') && bad.fields.includes('selection'));
  assert.equal(core.TYPE_LABELS.boutique, 'Pro · Sélection catalogue (vente / location)');
});

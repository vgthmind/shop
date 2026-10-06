import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { quoteShipping } = createRequire(import.meta.url)('../admin/shipping-calc.js');
const base = JSON.parse(readFileSync(new URL('../admin/shipping-config.json', import.meta.url), 'utf8'));
const cfg = (o = {}) => ({ ...structuredClone(base), items: { p: { size: 'petit' }, m: { size: 'moyen' }, g: { size: 'gros' }, l: { weight_g: 100 } }, ...o });
const q = (items, country, extra = {}, c = cfg()) => quoteShipping(c, { items, ...extra }, country);

test('une petite pièce en France = 1re tranche', () => {
  const r = q([{ slug: 'p', qty: 1 }], 'FR');
  assert.equal(r.ok, true); assert.equal(r.zone, 'FR');
  assert.equal(r.parcels.length, 1); assert.equal(r.parcels[0].weight_g, 230); // 150 + tare 80
  assert.equal(r.totalCents, 450);
});
test('poids propre à la pièce prioritaire sur le format', () => {
  const r = q([{ slug: 'l', qty: 1 }], 'FR');
  assert.equal(r.parcels[0].weight_g, 180);
});
test('zones : UE, Canada, hors UE, reste du monde', () => {
  const it = [{ slug: 'm', qty: 1 }]; // 580 g -> tranche 1000
  assert.equal(q(it, 'DE').zone, 'UE'); assert.equal(q(it, 'DE').totalCents, 1500);
  assert.equal(q(it, 'ca').zone, 'CA'); assert.equal(q(it, 'CA').totalCents, 2500);
  assert.equal(q(it, 'GB').zone, 'EU-HORS-UE');
  assert.equal(q(it, 'JP').zone, 'MONDE'); assert.equal(q(it, 'JP').totalCents, 3000);
});
test('plusieurs pièces dans un même colis (somme des poids)', () => {
  const r = q([{ slug: 'p', qty: 3 }], 'FR'); // 450+80 = 530 g
  assert.equal(r.parcels.length, 1); assert.equal(r.parcels[0].pieces, 3); assert.equal(r.totalCents, 800);
});
test('max pièces par colis : 5 petites -> 2 colis', () => {
  const r = q([{ slug: 'p', qty: 5 }], 'FR'); // max 4 par colis
  assert.equal(r.parcels.length, 2);
  assert.deepEqual(r.parcels.map((p) => p.pieces).sort(), [1, 4]);
  assert.equal(r.totalCents, 800 + 450);
});
test('gros colis : une grosse pièce compte 3 places', () => {
  const r = q([{ slug: 'g', qty: 1 }, { slug: 'p', qty: 1 }], 'FR'); // 3+1 = 4 places, 1500+150+80 = 1730 g
  assert.equal(r.parcels.length, 1); assert.equal(r.totalCents, 1100);
  assert.equal(q([{ slug: 'g', qty: 1 }, { slug: 'p', qty: 2 }], 'FR').parcels.length, 2); // 5 places > 4
  const r2 = q([{ slug: 'g', qty: 2 }], 'FR'); // 6 places > 4 -> 2 colis
  assert.equal(r2.parcels.length, 2);
});
test('limite de poids par colis force un 2e colis', () => {
  const r = q([{ slug: 'm', qty: 4 }], 'FR'); // 4x500 = 2000 + tare 80 > ... limite 2000 sur les pièces seules : 4 ok
  assert.equal(r.parcels.length, 1);
  const r2 = q([{ slug: 'g', qty: 1 }, { slug: 'm', qty: 2 }], 'FR'); // 1500+500 =2000 ok, +500 -> 2e colis
  assert.equal(r2.parcels.length, 2);
});
test('au-delà de la dernière tranche : supplément par kilo', () => {
  const c = cfg({ max_weight_g_per_parcel: 0, max_pieces_per_parcel: 99 });
  const r = q([{ slug: 'g', qty: 2 }], 'FR', {}, c); // 3000+80 = 3080 g : 11 € + 2 kg entamés*3 = 17 €
  assert.equal(r.parcels.length, 1); assert.equal(r.totalCents, 1100 + 2 * 300);
});
test('livraison offerte au-delà du montant (zones listées seulement)', () => {
  const c = cfg(); c.free_shipping = { enabled: true, threshold: 100, zones: ['FR'] };
  const it = [{ slug: 'p', qty: 1 }];
  assert.equal(q(it, 'FR', { subtotal: 99.99 }, c).total, 4.5);
  const r = q(it, 'FR', { subtotal: 100 }, c); assert.equal(r.free, true); assert.equal(r.total, 0);
  assert.equal(q(it, 'DE', { subtotal: 500 }, c).free, false);
});
test('livraison offerte désactivée par défaut', () => {
  assert.equal(q([{ slug: 'p', qty: 1 }], 'FR', { subtotal: 9999 }).free, false);
});
test('pays non prévu : refus clair (pas de zone « reste du monde »)', () => {
  const c = cfg(); c.zones = c.zones.filter((z) => z.id !== 'MONDE');
  const r = q([{ slug: 'p', qty: 1 }], 'JP', {}, c);
  assert.equal(r.ok, false); assert.equal(r.error, 'country_not_served');
});
test('panier vide, grille invalide, pièce inconnue = format par défaut', () => {
  assert.equal(q([], 'FR').error, 'empty_cart');
  assert.equal(quoteShipping({}, { items: [{ slug: 'p' }] }, 'FR').error, 'bad_config');
  const r = q([{ slug: 'inconnue', qty: 1 }], 'FR'); assert.equal(r.parcels[0].weight_g, 580);
});
test('centimes entiers (pas d\'erreur flottante)', () => {
  const c = cfg(); c.zones[0].brackets = [{ max_g: 9999, price: 0.1 }];
  const r = q([{ slug: 'p', qty: 3 }], 'FR', {}, c); assert.equal(r.totalCents, 10);
});
test('la grille d\'exemple est marquée « À REMPLACER »', () => {
  assert.match(base._ATTENTION, /À REMPLACER PAR MES VRAIS TARIFS/);
});

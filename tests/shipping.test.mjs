import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { quoteShipping, quoteOrFallback, quoteByZone, modeAdvice } = createRequire(import.meta.url)('../admin/shipping-calc.js');
const base = JSON.parse(readFileSync(new URL('../admin/shipping-config.json', import.meta.url), 'utf8'));
const cfg = (fn) => { const c = structuredClone(base); if (fn) fn(c); return c; };
// Poids SANS emballage ; carton 138 g, enveloppe 20 g ajoutés par le calcul.
const w = (slug, weight_g, extra = {}) => ({ slug, qty: 1, weight_g, ...extra });
const q = (items, country, extra = {}, c = base) => quoteShipping(c, { items, ...extra }, country);

test('réglages : carton 138 g, enveloppe 20 g, modifiables', () => {
  assert.equal(base.packaging.carton_g, 138); assert.equal(base.packaging.envelope_g, 20);
  assert.equal(q([w('a', 112)], 'FR').parcels[0].weight_g, 250);
  const c = cfg((x) => { x.packaging.carton_g = 200; });
  assert.equal(q([w('a', 112)], 'FR', {}, c).parcels[0].weight_g, 312);
});
test('tranche appliquée telle quelle (carton compris) : 250 / 251 / 500 / 501 g en France', () => {
  assert.equal(q([w('a', 112)], 'FR').costCents, 549);  // 250 g
  assert.equal(q([w('a', 113)], 'FR').costCents, 759);  // 251 g
  assert.equal(q([w('a', 362)], 'FR').costCents, 759);  // 500 g
  assert.equal(q([w('a', 363)], 'FR').costCents, 929);  // 501 g
});
test('1 short de 420 g en France : coût 9,29 €, offert au client, perte 9,29 €', () => {
  const r = q([w('short', 420)], 'FR'); // 558 g -> tranche 750 g
  assert.equal(r.parcels.length, 1); assert.equal(r.parcels[0].weight_g, 558);
  assert.equal(r.costCents, 929); assert.equal(r.totalCents, 0); assert.equal(r.gapCents, -929); assert.equal(r.tier, 'FR');
});
test('1 pièce au Canada : 570 g + carton = 708 g, tarif zone C 39,19 €, client 29 €', () => {
  const r = q([w('jean', 570)], 'CA');
  assert.equal(r.zone, 'C'); assert.equal(r.tier, 'MONDE'); assert.equal(r.parcels.length, 1);
  assert.equal(r.costCents, 3919); assert.equal(r.totalCents, 2900); assert.equal(r.gapCents, -1019);
});
test('2 pièces qui partagent un colis : poids additionnés, UN seul carton', () => {
  const r = q([w('a', 420), w('b', 270)], 'DE'); // 690 + 138 = 828 g -> 1 kg
  assert.equal(r.parcels.length, 1); assert.equal(r.parcels[0].weight_g, 828); assert.equal(r.parcels[0].pieces, 2);
  assert.equal(r.zone, 'A'); assert.equal(r.tier, 'UE');
  assert.equal(r.costCents, 1939); assert.equal(r.totalCents, 1500); assert.equal(r.gapCents, -439);
});
test('2 pièces volumineuses (« part seule ») au Canada : 2 colis, forfait + vrai coût du 2e', () => {
  const r = q([{ slug: 'jean', qty: 2, weight_g: 570, alone: true }], 'CA');
  assert.equal(r.parcels.length, 2);
  assert.deepEqual(r.parcels.map((p) => p.weight_g), [708, 708]);
  assert.equal(r.costCents, 3919 * 2);
  assert.equal(r.totalCents, 2900 + 3919); assert.equal(r.gapCents, 2900 + 3919 - 3919 * 2);
});
test('une pièce « part seule » + une pièce qui partage : 2 colis (carton chacun)', () => {
  const r = q([w('gros', 900, { alone: true }), w('petit', 200)], 'DE'); // 1038 g et 338 g
  assert.equal(r.parcels.length, 2);
  assert.deepEqual(r.parcels.map((p) => p.weight_g), [1038, 338]);
  assert.equal(r.parcels[0].paidCents, 1500); assert.equal(r.parcels[1].paidCents, 1499); // 338 g -> 500 g = 14,99
});
test('le 1er colis (forfait) est le plus lourd de la commande', () => {
  const r = q([w('leger', 100, { alone: true }), w('lourd', 700, { alone: true })], 'DE');
  assert.deepEqual(r.parcels.map((p) => p.items[0].slug), ['lourd', 'leger']);
  assert.equal(r.parcels[0].paidCents, 1500); assert.equal(r.parcels[1].paidCents, r.parcels[1].priceCents);
});
test('réglage « par colis » : chaque colis paie le forfait', () => {
  const c = cfg((x) => { x.customer_pricing.basis = 'per_parcel'; });
  const r = q([{ slug: 'a', qty: 2, weight_g: 300, alone: true }], 'DE', {}, c);
  assert.equal(r.totalCents, 3000);
  assert.equal(q([{ slug: 'a', qty: 2, weight_g: 300, alone: true }], 'DE').totalCents, 1500 + 1499); // par commande : 438 g -> 500 g
});
test('France : colis offerts quel que soit le nombre de colis', () => {
  const r = q([{ slug: 'a', qty: 3, weight_g: 400, alone: true }], 'FR');
  assert.equal(r.parcels.length, 3); assert.equal(r.totalCents, 0); assert.ok(r.costCents > 0);
});
test('plus de colis si le poids max de la zone est dépassé (pièces qui partagent)', () => {
  const r = q([w('a', 12000), w('b', 12000), w('c', 12000)], 'NO'); // zone B : 20 kg max
  assert.equal(r.ok, true); assert.equal(r.parcels.length, 3);
  assert.equal(q([w('a', 21000)], 'NO').error, 'too_heavy');
  assert.equal(q([w('a', 19900)], 'NO').error, 'too_heavy'); // + carton > 20 kg
});
test('lettre suivie en France : cache-cou 48 g + enveloppe 20 g = 68 g, tranche 100 g', () => {
  const r = q([w('cache-cou', 48, { mode: 'lettre' })], 'FR');
  assert.equal(r.parcels[0].kind, 'lettre'); assert.equal(r.parcels[0].weight_g, 68);
  assert.equal(r.costCents, 347); assert.equal(r.totalCents, 400); assert.equal(r.gapCents, 53);
});
test('lettre : tranches 20 g / 100 g / 2 kg (enveloppe comprise)', () => {
  assert.equal(q([w('a', 1, { mode: 'lettre' })], 'FR').costCents, 347); // 21 g -> tranche 100 g
  assert.equal(q([w('a', 1980, { mode: 'lettre' })], 'FR').costCents, 1156);          // 2000 g
  assert.equal(q([w('a', 1981, { mode: 'lettre' })], 'FR').parcels[0].kind, 'colis'); // 2001 g : trop lourd -> colis
});
test('lettre hors France : colis', () => {
  const r = q([w('a', 100, { mode: 'lettre' })], 'DE');
  assert.equal(r.parcels[0].kind, 'colis'); assert.equal(r.costCents, 1499);
});
test('lettre : 1 pièce max -> 2 pièces lettre partent en colis (un seul colis)', () => {
  const r = q([w('a', 100, { mode: 'lettre' }), w('b', 100, { mode: 'lettre' })], 'FR'); // 338 g
  assert.equal(r.parcels.length, 1); assert.equal(r.parcels[0].kind, 'colis'); assert.equal(r.costCents, 759);
  const c = cfg((x) => { x.lettre.max_pieces = 2; });
  assert.equal(q([w('a', 100, { mode: 'lettre' }), w('b', 100, { mode: 'lettre' })], 'FR', {}, c).parcels[0].kind, 'lettre');
});
test('panier mixte lettre + colis : tout en colis, un seul carton', () => {
  const r = q([w('cache-cou', 48, { mode: 'lettre' }), w('short', 420)], 'FR'); // 468 + 138 = 606 g
  assert.equal(r.parcels.length, 1); assert.equal(r.parcels[0].kind, 'colis'); assert.equal(r.parcels[0].weight_g, 606);
  assert.equal(r.costCents, 929); assert.equal(r.totalCents, 0);
});
test('le mode lettre est respecté même si le colis est moins cher ; l\'admin le signale', () => {
  const item = w('p', 240, { mode: 'lettre' }); // lettre 260 g -> 7,71 € ; colis 378 g -> 7,59 €
  const r = q([item], 'FR');
  assert.equal(r.parcels[0].kind, 'lettre'); assert.equal(r.costCents, 771);
  const a = modeAdvice(base, item);
  assert.deepEqual(a, { lettre_cost: 7.71, colis_cost: 7.59, colis_cheaper: true });
  assert.equal(modeAdvice(base, w('cc', 48, { mode: 'lettre' })).colis_cheaper, false);
  assert.equal(modeAdvice(base, w('x', 100)), null); // pas en mode lettre : rien à signaler
});
test('zones : A (UE, Suisse), Royaume-Uni (A + 4 €), B, C ; paliers client UE / reste du monde', () => {
  const it = [w('a', 560)]; // 698 g -> tranche 1000 g partout
  assert.equal(q(it, 'DE').zone, 'A'); assert.equal(q(it, 'DE').costCents, 1939); assert.equal(q(it, 'DE').tier, 'UE');
  assert.equal(q(it, 'CH').zone, 'A'); assert.equal(q(it, 'CH').tier, 'MONDE'); assert.equal(q(it, 'CH').totalCents, 2900);
  assert.equal(q(it, 'GB').zone, 'UK'); assert.equal(q(it, 'GB').costCents, 2339); assert.equal(q(it, 'GB').tier, 'MONDE');
  assert.equal(q(it, 'NO').zone, 'B'); assert.equal(q(it, 'NO').costCents, 2839);
  assert.equal(q(it, 'ca').zone, 'C'); assert.equal(q(it, 'US').costCents, 3919); assert.equal(q(it, 'JP').zone, 'C');
});
test('Royaume-Uni = zone A + 4 € sur chaque tranche', () => {
  const a = base.zones.find((z) => z.id === 'A').brackets, uk = base.zones.find((z) => z.id === 'UK').brackets;
  assert.equal(a.length, uk.length);
  a.forEach((b, i) => { assert.equal(b.max_g, uk[i].max_g); assert.equal(Math.round((uk[i].price - b.price) * 100), 400); });
});
test('Monaco et Andorre : tarif et palier France', () => {
  const r = q([w('a', 100)], 'MC'); assert.equal(r.zone, 'FR'); assert.equal(r.tier, 'FR'); assert.equal(r.totalCents, 0);
});
test('poids lu dans config.items si absent du panier ; « part seule » aussi', () => {
  const c = cfg((x) => { x.items = { p: { weight_g: 300, alone: true } }; });
  const r = q([{ slug: 'p', qty: 2 }], 'FR', {}, c);
  assert.equal(r.parcels.length, 2); assert.equal(r.parcels[0].weight_g, 438);
});
test('pièce sans poids : erreur claire, jamais de poids inventé', () => {
  const r = q([{ slug: 'inconnue', qty: 1 }], 'FR');
  assert.equal(r.ok, false); assert.equal(r.error, 'missing_weight'); assert.deepEqual(r.slugs, ['inconnue']);
});
test('pays bloqués : Russie, Biélorussie, destinations suspendues', () => {
  ['RU', 'BY', 'KP', 'SY', 'YE', 'HT'].forEach((c) => assert.equal(q([w('a', 100)], c).error, 'country_not_served', c));
});
test('Outre-mer désactivé : refusé, et ne retombe PAS en zone C ; activable', () => {
  ['GP', 'MQ', 'RE', 'NC', 'PF'].forEach((c) => assert.equal(q([w('a', 100)], c).error, 'country_not_served', c));
  const c2 = cfg((x) => { x.zones.find((z) => z.id === 'OM1').enabled = true; });
  const r = q([w('a', 100)], 'RE', {}, c2); assert.equal(r.ok, true); assert.equal(r.costCents, 1202); // 238 g -> 500 g
});
test('livraison offerte au-delà d\'un seuil : désactivée par défaut, activable', () => {
  assert.equal(q([w('a', 100)], 'DE', { subtotal: 9999 }).free, false);
  const c = cfg((x) => { x.free_shipping = { enabled: true, threshold: 100, zones: ['A'] }; });
  assert.equal(q([w('a', 100)], 'DE', { subtotal: 100 }, c).totalCents, 0);
  assert.equal(q([w('a', 100)], 'CA', { subtotal: 100 }, c).free, false);
});
test('quoteByZone : une pièce seule, une ligne par zone livrée (OM masquées), coût / client / écart', () => {
  const z = quoteByZone(base, { slug: 'a', weight_g: 400 }); // 538 g
  assert.deepEqual(z.map((x) => x.zone), ['FR', 'A', 'UK', 'B', 'C']);
  assert.deepEqual(z.map((x) => x.cost), [9.29, 19.39, 23.39, 28.39, 39.19]);
  assert.deepEqual(z.map((x) => x.total), [0, 15, 29, 29, 29]);
  assert.deepEqual(z.map((x) => x.gap), [-9.29, -4.39, 5.61, 0.61, -10.19]);
  assert.equal(quoteByZone(base, { slug: 'a', weight_g: 48, mode: 'lettre' })[0].kind, 'lettre');
});
test('centimes entiers', () => {
  const r = q([w('a', 100), w('b', 333)], 'DE');
  [r.costCents, r.totalCents, r.gapCents].forEach((v) => assert.ok(Number.isInteger(v)));
});
test('panier vide, grille invalide', () => {
  assert.equal(q([], 'FR').error, 'empty_cart');
  assert.equal(quoteShipping({}, { items: [w('a', 1)] }, 'FR').error, 'bad_config');
});
test('la grille porte ses sources et n\'est plus un exemple', () => {
  assert.ok(base._sources.colissimo.startsWith('https://www.laposte.fr/'));
  assert.ok(base._sources.lettre_verte_suivie.startsWith('https://www.laposte.fr/'));
  assert.equal(JSON.stringify(base).includes('REMPLACER'), false);
  assert.equal(base.free_shipping.enabled, false);
  assert.equal(base.customer_pricing.basis, 'per_order');
  assert.deepEqual(base.customer_pricing.tiers.map((t) => t.first_flat ?? t.lettre_flat), [4, 15, 29]);
});

test('pièce sans poids : repli sur le port historique de la fiche (France, UE, monde), jamais 0 € par erreur', () => {
  const it = [{ slug: 'ancienne', qty: 1, legacy: { fr: 4, intl: 8 } }];
  const fr = quoteOrFallback(base, { items: it }, 'FR'), ue = quoteOrFallback(base, { items: it }, 'DE'), ca = quoteOrFallback(base, { items: it }, 'CA');
  [fr, ue, ca].forEach((r) => { assert.equal(r.ok, true); assert.equal(r.fallback, true); });
  assert.equal(fr.totalCents, 400); assert.equal(ue.totalCents, 800); assert.equal(ca.totalCents, 800);
  // panier de deux anciennes pièces : le port le plus élevé (comme le site actuel)
  const two = [{ slug: 'a', qty: 1, legacy: { fr: 4, intl: 8 } }, { slug: 'b', qty: 2, legacy: { fr: 5, intl: 9 } }];
  assert.equal(quoteOrFallback(base, { items: two }, 'FR').totalCents, 500);
  assert.equal(quoteOrFallback(base, { items: two }, 'US').totalCents, 900);
});
test('repli : ni poids ni port historique = erreur (pas de port gratuit) ; pays refusé reste refusé', () => {
  const none = quoteOrFallback(base, { items: [{ slug: 'x', qty: 1 }] }, 'FR');
  assert.equal(none.ok, false); assert.equal(none.error, 'missing_weight');
  const zero = quoteOrFallback(base, { items: [{ slug: 'x', qty: 1, legacy: { fr: 0, intl: null } }] }, 'DE');
  assert.equal(zero.ok, false);
  assert.equal(quoteOrFallback(base, { items: [{ slug: 'x', qty: 1, legacy: { fr: 4, intl: 8 } }] }, 'RU').error, 'country_not_served');
  const mixed = quoteOrFallback(base, { items: [{ slug: 'a', qty: 1, legacy: { fr: 4, intl: 8 } }, { slug: 'b', qty: 1 }] }, 'FR');
  assert.equal(mixed.ok, false); assert.deepEqual(mixed.slugs, ['b']);
});
test('repli : pas utilisé quand le poids est connu', () => {
  const r = quoteOrFallback(base, { items: [{ slug: 'p', qty: 1, weight_g: 420, legacy: { fr: 4, intl: 8 } }] }, 'FR');
  assert.equal(r.fallback, undefined); assert.equal(r.costCents, 929);
});

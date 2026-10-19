import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../admin/menu-stats.js');
const UI = require('../admin/vg-admin-ui.js');

const NOW = Date.parse('2026-10-14T10:00:00Z');
const day = (n) => Math.floor((NOW - n * 864e5) / 1000);
const orders = [
  { total: 100, created: day(2), livemode: true, items: [{ name: 'A', amount: 100 }] },
  { total: 50, created: day(5), livemode: true, shipped: true, items: [{ name: 'B', amount: 50 }] },
  { total: 80, created: day(10), livemode: true, refunded: { amount: 80, full: true }, items: [{ name: 'A', amount: 80 }] },
  { total: 60, created: day(12), livemode: true, refunded: { amount: 10, full: false }, items: [{ name: 'B', amount: 60 }] },
  { total: 40, created: day(3), livemode: true, kind: 'deposit' },
  { total: 999, created: day(1), livemode: false, items: [{ name: 'T', amount: 999 }] },
];

test('à expédier : réelles, non expédiées, non remboursées, hors acomptes', () => {
  assert.equal(S.toShip(orders), 2);
});
test('ventes : réelles seulement, remboursements déduits, 30 jours', () => {
  const s = S.salesStats(orders, NOW);
  assert.equal(s.test, false);
  assert.equal(s.n30, 3);
  assert.equal(s.ca30, 100 + 50 + 50);
  assert.equal(s.top[0].name, 'B');
  assert.equal(s.months.length, 1);
});
test('ventes : sans vente réelle, chiffres de test signalés', () => {
  const s = S.salesStats([orders[5]], NOW);
  assert.equal(s.test, true); assert.equal(s.n30, 1);
});
test('prochain drop : pièces programmées à la même minute', () => {
  const at = new Date(NOW + 2 * 36e5).toISOString();
  const d = S.nextDrop([{ slug: 'a', at }, { slug: 'b', at }, { slug: 'c', at: new Date(NOW + 9e8).toISOString() }, { slug: 'old', at: new Date(NOW - 1000).toISOString() }], NOW);
  assert.equal(d.count, 2);
  assert.equal(S.nextDrop([], NOW), null);
  assert.equal(S.inWords(NOW + 2 * 36e5, NOW), 'dans 2 h');
});
test('menu : 5 entrées (Accueil, Commandes, Demandes, Pièces, Réglages), chaque page de l\'admin appartient à une entrée', () => {
  assert.deepEqual(UI.ENTRIES.map((e) => e.id), ['dash', 'orders', 'requests', 'pieces', 'settings']);
  assert.deepEqual(UI.ENTRIES.map((e) => e.href), ['menu.html', 'commandes.html', 'demandes.html', 'catalogue.html', 'reglages.html']);
  assert.equal(UI.activeFor('/admin/nouvelle-piece.html'), 'pieces');
  assert.equal(UI.activeFor('/admin/catalogue'), 'pieces');
  assert.equal(UI.activeFor('/admin/commandes.html'), 'orders');
  assert.equal(UI.activeFor('/admin/demandes'), 'requests');
  for (const p of ['reglages', 'reglages-livraison', 'reglages-promos', 'reglages-acces', 'reglages-demandes', 'reglages-videos', 'reglages-compta', 'reglages-sauvegardes', 'reglages-visites', 'reglages-sante', 'reglages-aide']) assert.equal(UI.activeFor('/admin/' + p + '.html'), 'settings', p);
  assert.equal(UI.activeFor('/admin/'), 'dash');
});

import { readFileSync } from 'node:fs';
test('Réglages : le bouton Se déconnecter n\'a pas l\'id « logout » (vg-admin-auth.js masque #logout)', () => {
  const html = readFileSync(new URL('../admin/reglages.html', import.meta.url), 'utf8');
  assert.ok(!/id="logout"/.test(html));
  assert.match(html, /id="plus-logout"[^>]*>Se déconnecter/);
});

test('périodes de l\'Accueil : 7 j, 30 j, ce mois, cette année ; conversion et ventes de la période', () => {
  const now = Date.UTC(2026, 9, 19, 12); // 19 octobre 2026
  assert.equal(S.periodStart('7', now), now - 7 * 864e5);
  assert.equal(new Date(S.periodStart('month', now)).getMonth(), 9);
  assert.equal(new Date(S.periodStart('month', now)).getDate(), 1);
  assert.equal(new Date(S.periodStart('year', now)).getMonth(), 0);
  assert.ok(S.periodDays('year', now) >= 290 && S.periodDays('year', now) <= 366);
  assert.equal(S.periodDays('7', now), 7);
  const sec = (d) => Math.floor(d / 1000);
  const orders = [
    { total: 100, livemode: true, created: sec(now - 2 * 864e5), items: [{ name: 'A', amount: 100 }] },
    { total: 50, livemode: true, created: sec(now - 20 * 864e5), items: [{ name: 'B', amount: 50 }] },
    { total: 80, livemode: true, created: sec(now - 3 * 864e5), refunded: { full: true }, items: [{ name: 'C', amount: 80 }] },
    { total: 60, livemode: true, kind: 'deposit', created: sec(now - 1 * 864e5), items: [] }
  ];
  const w7 = S.salesBetween(orders, S.periodStart('7', now), now), w30 = S.salesBetween(orders, S.periodStart('30', now), now);
  assert.deepEqual([w7.n, w7.ca, w30.n, w30.ca], [1, 100, 2, 150]);
  assert.deepEqual(w30.top.map((p) => p.name), ['A', 'B']);
  assert.equal(S.conversion(2, 80), 2.5);
  assert.equal(S.conversion(2, 0), null);
  assert.equal(S.salesBetween([{ total: 10, livemode: false, created: sec(now), items: [] }], 0, now + 1).test, true);
});

test('santé : seules les lignes « -- » de /status sont des problèmes', () => {
  assert.deepEqual(S.healthProblems('OK clé posée\n-- DEPLOY_HOOK_URL posée\n   mode : test\n-- stock : erreur\n'), ['DEPLOY_HOOK_URL posée', 'stock : erreur']);
  assert.deepEqual(S.healthProblems('OK a\nOK b\n'), []);
});

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
test('menu : 6 entrées, chaque page de l\'admin appartient à une entrée', () => {
  assert.deepEqual(UI.ENTRIES.map((e) => e.id), ['dash', 'pieces', 'orders', 'requests', 'promos', 'more']);
  assert.equal(UI.activeFor('/admin/stock.html'), 'pieces');
  assert.equal(UI.activeFor('/admin/trafic'), 'dash');
  assert.equal(UI.activeFor('/admin/commandes.html'), 'orders');
  assert.equal(UI.activeFor('/admin/expedition.html'), 'more');
  assert.equal(UI.activeFor('/admin/'), 'dash');
});

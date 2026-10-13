import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const VGInvoice = createRequire(import.meta.url)('../assets/vg-invoice.js');

const inv = {
  number: 'W-2026-001', ref: 'VG-ABC123', test: false, date: 1790000000, currency: 'EUR',
  seller: { name: 'vgthmind', line2: 'Vitry-sur-Seine, France', siret: '952 025 369 00028', email: 'contact@vgthmind.org' },
  customer: { name: 'Alex', email: 'a@b.c', address: ['1 rue Test'], country: 'BE' },
  lines: [{ name: 'Pièce', qty: 1, unit: 100, amount: 100 }], shipping: 20, discount: 0, total: 120, vat: 'TVA non applicable, art. 293 B du CGI',
  credit: { number: 'AV-W-2026-001', original: 'W-2026-001', at: 1790100000, amount: 120, full: true },
};
const strip = (h) => h.replace(/ | /g, ' ');

test('facture normale : inchangée', () => {
  const h = strip(VGInvoice.html(inv, 'fr'));
  assert.match(h, /W-2026-001/); assert.match(h, /Total payé/); assert.doesNotMatch(h, /Avoir/);
});
test('avoir total : numéro AV-, renvoi à la facture, montants négatifs', () => {
  const h = strip(VGInvoice.html(inv, 'fr', 'credit'));
  assert.match(h, /AV-W-2026-001/); assert.match(h, /Avoir relatif à la facture N° W-2026-001/); assert.match(h, /Total remboursé/);
  assert.match(h, /−120,00 €|-120,00 €/);
});
test('avoir partiel : une seule ligne de remboursement partiel', () => {
  const h = strip(VGInvoice.html({ ...inv, credit: { ...inv.credit, full: false, amount: 30 } }, 'en', 'credit'));
  assert.match(h, /Credit note/); assert.match(h, /Partial refund/); assert.match(h, /30\.00/);
});

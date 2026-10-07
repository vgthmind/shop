import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const X = createRequire(import.meta.url)('../admin/export-csv.js');
const at = (y, m, d, h = 12) => Date.UTC(y, m - 1, d, h) / 1000;
const orders = [
  { id: 'a', ref: 'VG-AAA111', created: at(2026, 1, 15), livemode: true, total: 30.5, shipping: 8, discount: 2, items: [{ name: 'CD vgtape', qty: 1 }, { name: 'Cache-cou', qty: 2 }],
    name: 'Camille Durand', email: 'c@example.com', address: { city: 'Lyon' }, phone: '+33600' },
  { id: 'b', ref: 'VG-BBB222', created: at(2026, 3, 31, 23), livemode: true, total: 1234.5, shipping: 0, discount: 0, items: [{ name: '=HYPERLINK("x")', qty: 1 }] }, // 01/04 à Paris (UTC+2)
  { id: 'c', ref: 'VG-CCC333', created: at(2026, 4, 2), livemode: true, total: 10, shipping: 4, discount: 0, items: [{ name: 'Pièce; "spéciale"', qty: 1 }] },
  { id: 'd', ref: 'VG-TEST01', created: at(2026, 4, 3), livemode: false, total: 99, shipping: 0, discount: 0, items: [] },
  { id: 'e', ref: 'VG-OLD', created: at(2025, 12, 31), livemode: true, total: 5, shipping: 0, discount: 0, items: [] },
];
const col = (csv) => csv.split('\r\n').filter(Boolean);

test('mois, trimestre, année : bonnes commandes (fuseau Paris, test exclu)', () => {
  const ids = (p, t) => X.select(orders, p, t).map((o) => o.id);
  assert.deepEqual(ids({ type: 'month', year: 2026, month: 1 }), ['a']);
  assert.deepEqual(ids({ type: 'quarter', year: 2026, quarter: 1 }), ['a']);
  assert.deepEqual(ids({ type: 'quarter', year: 2026, quarter: 2 }), ['b', 'c']); // b : 31/03 23h UTC = 01/04 Paris
  assert.deepEqual(ids({ type: 'year', year: 2026 }), ['a', 'b', 'c']);
  assert.deepEqual(ids({ type: 'year', year: 2026 }, true), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids({ type: 'year', year: 2025 }), ['e']);
});
test('format Excel FR : BOM, point-virgule, virgule décimale, CRLF, dates JJ/MM/AAAA', () => {
  const r = X.buildCsv(orders, { type: 'month', year: 2026, month: 1 });
  assert.ok(r.csv.startsWith('﻿Date;N° de pièce (commande);Désignation;'));
  const l = col(r.csv);
  assert.equal(l[1], '15/01/2026;VG-AAA111;CD vgtape ; Cache-cou ×2;Vente de marchandises;Carte bancaire (Stripe);22,50;8,00;2,00;30,50'.replace('CD vgtape ; Cache-cou ×2', '"CD vgtape ; Cache-cou ×2"'));
  assert.ok(r.csv.includes('\r\n') && !/[^\r]\n/.test(r.csv));
  assert.equal(r.filename, 'ventes-2026-01.csv');
});
test('ligne TOTAL avec somme exacte', () => {
  const r = X.buildCsv(orders, { type: 'quarter', year: 2026, quarter: 2 });
  const last = col(r.csv).pop();
  assert.ok(last.startsWith('TOTAL 2026-T2;;2 vente(s);;;'));
  assert.ok(last.endsWith(';1244,50')); assert.equal(r.total, 1244.5); assert.equal(r.count, 2);
});
test('guillemets doublés et formules neutralisées', () => {
  const l = col(X.buildCsv(orders, { type: 'quarter', year: 2026, quarter: 2 }).csv);
  assert.ok(l[1].includes("\"'=HYPERLINK(\"\"x\"\")\""));
  assert.ok(l[2].includes('"Pièce; ""spéciale"""'));
});
test('aucune donnée client dans le CSV', () => {
  const csv = X.buildCsv(orders, { type: 'year', year: 2026 }).csv;
  for (const s of ['Camille', 'Durand', 'example.com', 'Lyon', '+33600']) assert.ok(!csv.includes(s), s);
});
test('période vide : en-tête + total à 0', () => {
  const r = X.buildCsv(orders, { type: 'month', year: 2030, month: 5 });
  assert.equal(r.count, 0); assert.equal(col(r.csv).length, 2); assert.ok(col(r.csv)[1].endsWith(';0,00'));
});

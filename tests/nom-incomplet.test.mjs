// Nom de livraison à un seul mot : badge admin (name_incomplete) et ligne d'avertissement dans l'alerte vendeur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import fs from 'node:fs';

const hooks = `
export async function resolve(spec, ctx, next) { if (/^[.]{1,2}[/]/.test(spec) && !/[.][a-z]+$/.test(spec)) return next(spec + '.ts', ctx); return next(spec, ctx); }`;
register('data:text/javascript,' + encodeURIComponent(hooks));
const { isNameIncomplete, sellerEmail } = await import('../checkout-worker/emails.ts');

const order = (over = {}) => ({
  ref: 'VG-TEST01', name: 'Jeanne Dupont', email: 'a@b.fr', country: 'FR', lang: 'fr', address: ['Jeanne Dupont', '1 rue X', '66000 Perpignan', 'France'],
  items: [{ name: 'Pièce', qty: 1, amount: '1,00 EUR', image: '' }], shipping: '6,00 EUR', discount: '', total: '7,00 EUR', test: false,
  stripeUrl: 'https://dashboard.stripe.com/payments/pi_x', cgvUrl: 'https://x/cgv', orderUrl: 'https://x/suivi', ...over,
});

test('isNameIncomplete : un seul mot (ou vide) = incomplet', () => {
  for (const n of ['Jeanne', '  Jeanne ', '', '   ', undefined]) assert.equal(isNameIncomplete(n), true, JSON.stringify(n));
  for (const n of ['Jeanne Dupont', 'Jean-Pierre Martin', 'Anne  de la Tour']) assert.equal(isNameIncomplete(n), false, n);
});

test('alerte vendeur : ligne d\'avertissement seulement si le nom est incomplet', () => {
  const warn = '⚠ Nom incomplet : demander nom et prénom au client avant l\'envoi';
  const bad = sellerEmail(order({ name: 'Jeanne', nameIncomplete: true }));
  assert.ok(bad.text.includes(warn) && bad.html.includes('Nom incomplet'));
  const ok = sellerEmail(order());
  assert.ok(!ok.text.includes('Nom incomplet') && !ok.html.includes('Nom incomplet'));
});

test('admin Commandes : badge « Nom incomplet » dans la liste et le détail', () => {
  const html = fs.readFileSync(new URL('../admin/commandes.html', import.meta.url), 'utf8');
  assert.equal((html.match(/o\.name_incomplete/g) || []).length, 2);
  assert.ok(html.includes('Nom incomplet : demander nom et prénom au client avant l’envoi'));
});

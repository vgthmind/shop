import test from 'node:test';
import assert from 'node:assert/strict';
import { vatMention } from '../checkout-worker/invoice.ts';

test('mention de TVA : 293 B jusqu\'au 31/12/2026, CIBS à partir du 01/01/2027, texte modifiable', () => {
  assert.equal(vatMention(Date.UTC(2026, 11, 31, 22, 59, 0)), 'TVA non applicable, art. 293 B du CGI');
  assert.equal(vatMention(Date.UTC(2026, 9, 20)), 'TVA non applicable, art. 293 B du CGI');
  assert.equal(vatMention(Date.UTC(2026, 11, 31, 23, 0, 0)), 'TVA non applicable, art. L. 233-3 du CIBS');
  assert.equal(vatMention(Date.UTC(2027, 5, 1)), 'TVA non applicable, art. L. 233-3 du CIBS');
  assert.equal(vatMention(Date.UTC(2027, 5, 1), ' Texte du décret '), 'Texte du décret');
  assert.equal(vatMention(Date.UTC(2026, 5, 1), 'Texte du décret'), 'TVA non applicable, art. 293 B du CGI');
});

import { buildEnvelope } from '../checkout-worker/accounting-core.js';
test('enveloppe compta : charge utile ASCII (accents échappés), même contenu une fois relue', async () => {
  const env = JSON.parse(await buildEnvelope('s', { type: 'sale', key: 'k', row: { designation: 'Pièce peinte à l’aérographe — 100 %' } }));
  assert.ok(/^[\x00-\x7f]*$/.test(env.payload));
  assert.equal(JSON.parse(env.payload).row.designation, 'Pièce peinte à l’aérographe — 100 %');
});

test('mail de commande : mention de TVA datée comme les factures (FR et EN)', async () => {
  const { customerEmail } = await import('../checkout-worker/emails.ts');
  const o = { ref: 'VG-1', name: 'A B', email: 'a@x.fr', address: ['1 rue'], items: [{ name: 'P', qty: 1, amount: '10 €' }], shipping: '0 €', total: '10 €', orderUrl: 'https://x/o', cgvUrl: 'https://x/c', country: 'FR' };
  for (const lang of ['fr', 'en']) { const m = customerEmail({ ...o, lang }); assert.ok(m.text.includes('293 B'), lang); assert.ok(!m.text.includes('CIBS'), lang); }
  const real = Date.now; Date.now = () => Date.UTC(2027, 2, 1);
  try { const m = customerEmail({ ...o, lang: 'fr' }); assert.ok(m.text.includes('L. 233-3 du CIBS') && !m.text.includes('293 B')); assert.ok(customerEmail({ ...o, lang: 'fr', vatAfter: 'Texte décret' }).text.includes('Texte décret')); } finally { Date.now = real; }
});

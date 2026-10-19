import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n){ if(/^[.]{1,2}[/]/.test(s)&&!/[.][a-z]+$/.test(s)) return n(s+'.ts',c); return n(s,c);}`));
const { customerEmail, shippedEmail } = await import('../checkout-worker/emails.ts');
const o = { ref: 'VG-FACQGR', name: 'Alex Martin', email: 'a@b.fr', phone: '', country: 'FR', lang: 'fr', address: ['1 rue A'], items: [{ name: 'Hoodie', qty: 1, amount: '140,00 €' }], shipping: '0,00 €', discount: '', total: '140,00 €', test: false, orderUrl: 'https://x/suivi', cgvUrl: 'https://x/cgv' };

test('pièce sur demande : commande ET demande dans les mails de confirmation et d’expédition', () => {
  for (const m of [customerEmail({ ...o, requestId: 'D-N9RDHR' }), shippedEmail({ ...o, requestId: 'D-N9RDHR' }, 'TEST123')]) {
    assert.match(m.html, /Commande VG-FACQGR — Demande D-N9RDHR/);
    assert.match(m.text, /Commande VG-FACQGR — Demande D-N9RDHR/);
  }
  assert.doesNotMatch(shippedEmail({ ...o, requestId: 'D-N9RDHR', lang: 'en' }, 'T').text, /Demande/);
  assert.match(shippedEmail({ ...o, requestId: 'D-N9RDHR', lang: 'en' }, 'T').text, /Order VG-FACQGR — Request D-N9RDHR/);
  assert.doesNotMatch(shippedEmail(o, 'T').html, /Demande/, 'commande normale : inchangé');
});

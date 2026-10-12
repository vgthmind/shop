import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n){ if(/^[.]{1,2}[/]/.test(s)&&!/[.][a-z]+$/.test(s)) return n(s+'.ts',c); return n(s,c);}`));
const { handleContact } = await import('../checkout-worker/contact.ts');

const mk = () => { const store = new Map(); const sent = []; return { sent, d: { kv: { get: async (k) => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } }, from: 'x <a@b.fr>', ip: '1.2.3.4', now: 1e12, send: async (...a) => { sent.push(a); return true; } } }; };
const ok = { name: 'Ana', email: 'ana@ex.fr', subject: 'Bonjour', message: 'Une question sur une pièce', website: '', t: 9000 };

test('contact : envoi valide vers contact@, reply-to client, HTML échappé', async () => {
  const { d, sent } = mk();
  const r = await handleContact({ ...ok, message: '<b>hey</b> salut' }, d);
  assert.equal(r.status, 200);
  assert.equal(sent[0][1], 'contact@vgthmind.org'); assert.equal(sent[0][5], 'ana@ex.fr');
  assert.ok(!sent[0][3].includes('<b>hey'));
});
test('contact : champ piège ou envoi trop rapide = faux succès sans mail', async () => {
  for (const extra of [{ website: 'http://spam' }, { t: 500 }]) { const { d, sent } = mk(); const r = await handleContact({ ...ok, ...extra }, d); assert.equal(r.status, 200); assert.equal(sent.length, 0); }
});
test('contact : champs invalides', async () => {
  const { d } = mk();
  const r = await handleContact({ ...ok, email: 'nope', message: 'a' }, d);
  assert.equal(r.status, 400); assert.deepEqual(r.data.fields, ['email', 'message']);
});
test('contact : limite 3 envois / heure / IP', async () => {
  const { d, sent } = mk();
  for (let i = 0; i < 3; i++) assert.equal((await handleContact(ok, d)).status, 200);
  assert.equal((await handleContact(ok, d)).status, 429); assert.equal(sent.length, 3);
});
test('contact : échec Resend = 502 ; retour à la ligne retiré du sujet', async () => {
  const { d, sent } = mk(); d.send = async (...a) => { sent.push(a); return false; };
  const r = await handleContact({ ...ok, subject: 'a\r\nBcc: x@y.z' }, d);
  assert.equal(r.status, 502); assert.ok(!/[\r\n]/.test(sent[0][2]));
});

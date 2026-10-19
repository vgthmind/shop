import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n){ if(/^[.]{1,2}[/]/.test(s)&&!/[.][a-z]+$/.test(s)) return n(s+'.ts',c); return n(s,c);}`));
const { checkTurnstile } = await import('../checkout-worker/turnstile.ts');
const f = (success, ok = true) => async () => ({ ok, json: async () => ({ success }) });

test('turnstile : sans secret = désactivé', async () => assert.equal(await checkTurnstile(undefined, '', '1.1.1.1', f(false)), true));
test('turnstile : secret + jeton absent = refusé', async () => assert.equal(await checkTurnstile('s', '', '1.1.1.1', f(true)), false));
test('turnstile : jeton valide / refusé par Cloudflare', async () => {
  assert.equal(await checkTurnstile('s', 'tok', '1.1.1.1', f(true)), true);
  assert.equal(await checkTurnstile('s', 'tok', '1.1.1.1', f(false)), false);
});
test('turnstile : panne réseau de Cloudflare = on laisse passer', async () => {
  assert.equal(await checkTurnstile('s', 'tok', 'x', async () => { throw new Error('net'); }), true);
  assert.equal(await checkTurnstile('s', 'tok', 'x', f(false, false)), true);
});

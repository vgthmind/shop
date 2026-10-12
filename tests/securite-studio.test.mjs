// Sécurité du studio photo : seuls des fichiers image raisonnables partent dans le dépôt public,
// slug sans caractères piégés, mot de passe du détourage jamais envoyé à un serveur saisi à la main.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const PUB = readFileSync(new URL('../admin/studio-publish.js', import.meta.url), 'utf8');
const ENG = readFileSync(new URL('../admin/studio-engine.js', import.meta.url), 'utf8');
const ENDPOINT = 'https://vgthmind-shop-checkout.vgthm66.workers.dev';

async function publisher() {
  const calls = [];
  const fetch = async (url, opt = {}) => { calls.push(url); return { ok: false, status: 500, json: async () => ({ message: 'non appelé' }) }; };
  let onMsg = null;
  const win = { open: () => ({ postMessage() {} }), addEventListener: (t, f) => { onMsg = f; }, removeEventListener() {}, VG_RETRY_MS: 0, location: { hostname: 'x' } };
  const ctx = vm.createContext({ window: win, fetch, btoa, atob, TextEncoder, TextDecoder, Uint8Array, setTimeout, location: win.location, console });
  vm.runInContext(PUB, ctx);
  const P = win.VGStudioPublish;
  const logged = P.login(); onMsg({ origin: ENDPOINT, data: 'authorization:github:success:{"token":"t"}' }); await logged;
  return { P, calls };
}
const base = { slug: 'ch_9', isNew: true, piece: { name: 'CH_9', slug: 'ch_9', price: 10 }, replace: true };

test('publication : fichiers non image refusés avant tout envoi', async () => {
  const { P, calls } = await publisher();
  for (const name of ['0.svg', '0.html', '0.js', '../0.webp', '0.webp.exe', 'a b.png']) {
    await assert.rejects(P.publish({ ...base, files: [{ name, data: new Uint8Array([1]) }] }), /Fichier refusé/, name);
  }
  await assert.rejects(P.publish({ ...base, files: [{ name: '0.webp', data: new Uint8Array(25 * 1024 * 1024 + 1) }] }), /Photo trop lourde/);
  assert.equal(calls.length, 0, 'rien n’est parti vers GitHub');
});

test('publication : slug avec caractères piégés refusé', async () => {
  const { P, calls } = await publisher();
  for (const slug of ['a?b', 'a#b', 'a%2e', '"x"', '<x>', 'a:b', 'x'.repeat(101)]) {
    await assert.rejects(P.publish({ ...base, slug, files: [{ name: '0.webp', data: new Uint8Array([1]) }] }), /Slug invalide/, slug);
  }
  assert.equal(calls.length, 0);
});

test('détourage : mot de passe jamais envoyé à un serveur autre que le tunnel', async () => {
  const ls = { 'vg-detourage-token': 'abcdefghijklmnopqrstuvwx', 'vg-detourage-url': 'https://serveur-inconnu.example.com' };
  const localStorage = { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } };
  const location = { hash: '', search: '', pathname: '/shop/admin/studio-photo.html', hostname: 'vgthmind.github.io' };
  const seen = [];
  const fetch = async (url, opt) => { seen.push((opt.headers || {})['X-VG-Token']); return { ok: url.endsWith('/health'), status: url.endsWith('/health') ? 200 : 500, json: async () => ({ ready: true }) }; };
  const win = { localStorage, location, history: { replaceState() {} }, navigator: { userAgent: 'x', platform: 'x', maxTouchPoints: 0 }, document: {} };
  const ctx = vm.createContext({ window: win, localStorage, location, history: win.history, navigator: win.navigator, URLSearchParams, AbortController, fetch, setTimeout, clearTimeout, Date, document: win.document });
  vm.runInContext(ENG, ctx);
  await assert.rejects(win.VGStudioEngine.create('remote').segment({ width: 2, height: 2, toBlob: (cb) => cb({ size: 1 }) }));
  assert.ok(seen.length > 0); assert.deepEqual(seen.filter(Boolean), []);
});

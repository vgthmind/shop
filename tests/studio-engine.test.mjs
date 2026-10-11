import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../admin/studio-engine.js', import.meta.url), 'utf8');

function boot({ hash = '', stored = {}, fetch, hostname = 'vgthmind.github.io' } = {}) {
  const ls = { ...stored };
  const localStorage = { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } };
  const hist = { url: null };
  const location = { hash, search: '', pathname: '/shop/admin/studio-photo.html', hostname };
  const win = { localStorage, location, history: { replaceState: (a, b, u) => { hist.url = u; location.hash = ''; } }, navigator: { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 }, document: {} };
  const ctx = vm.createContext({ window: win, localStorage, location, history: win.history, navigator: win.navigator, URLSearchParams, AbortController, fetch, setTimeout, clearTimeout, Date, document: win.document });
  vm.runInContext(SRC, ctx);
  return { E: win.VGStudioEngine, ls, hist };
}
const TOKEN = 'abcdefghijklmnopqrstuvwx';
const canvas = { width: 2, height: 2, toBlob: (cb) => cb({ size: 1 }) };
const json = (status, data) => ({ ok: status < 400, status, json: async () => data });

test('lien du lanceur : adresse et mot de passe rangés, effacés de la barre d’adresse', () => {
  const { E, ls, hist } = boot({ hash: `#srv=${encodeURIComponent('https://calm-fox-9.trycloudflare.com')}&k=${TOKEN}`, fetch: async () => json(200, {}) });
  assert.equal(E.getUrl(), 'https://calm-fox-9.trycloudflare.com');
  assert.equal(ls['vg-detourage-url'], 'https://calm-fox-9.trycloudflare.com'); assert.equal(ls['vg-detourage-token'], TOKEN);
  assert.equal(hist.url, '/shop/admin/studio-photo.html');
});

test('adresse non https ou bizarre dans le lien : ignorée', () => {
  for (const bad of ['https://evil.example', 'https://x.trycloudflare.com.evil.example', 'http://evil.example', 'https://evil.example/path?x', 'javascript:alert(1)', 'https://a b']) {
    const { E } = boot({ hash: `#srv=${encodeURIComponent(bad)}`, fetch: async () => json(200, {}) });
    assert.equal(E.getUrl(), 'http://localhost:7860', bad);
  }
});

test('mot de passe mal formé : ignoré', () => {
  const { ls } = boot({ hash: '#k=court', fetch: async () => json(200, {}) });
  assert.equal(ls['vg-detourage-token'], undefined);
});

test('le mot de passe part avec /health et /cut vers le tunnel', async () => {
  const seen = [];
  const fetch = async (url, opt) => { seen.push([url, (opt.headers || {})['X-VG-Token']]); return url.endsWith('/health') ? json(200, { ready: true }) : json(401, {}); };
  const { E } = boot({ hash: `#srv=${encodeURIComponent('https://calm-fox-9.trycloudflare.com')}&k=${TOKEN}`, fetch });
  await assert.rejects(E.create('remote').segment(canvas), (e) => e.code === 'unavailable' && /refuse le mot de passe/.test(e.message));
  assert.deepEqual(seen.map((s) => s[1]), [TOKEN, TOKEN]);
});

test('serveur local (localhost) : aucun mot de passe envoyé', async () => {
  const seen = [];
  const fetch = async (url, opt) => { seen.push((opt.headers || {})['X-VG-Token']); return url.endsWith('/health') ? json(200, { ready: true }) : json(500, {}); };
  const { E } = boot({ stored: { 'vg-detourage-token': TOKEN }, fetch });
  await assert.rejects(E.create('remote').segment(canvas), /erreur \(500\)/);
  assert.deepEqual(seen, [undefined, undefined]);
});

test('trop d’essais refusés (429) : message dédié', async () => {
  const fetch = async (url) => (url.endsWith('/health') ? json(200, { ready: true }) : json(429, {}));
  const { E } = boot({ hash: `#srv=${encodeURIComponent('https://calm-fox-9.trycloudflare.com')}&k=${TOKEN}`, fetch });
  await assert.rejects(E.create('remote').segment(canvas), /Trop d’essais/);
});

test('serveur de détourage qui renvoie une erreur de chargement du modèle : message clair', async () => {
  const fetch = async () => json(200, { ready: false, error: 'modèle absent' });
  const { E } = boot({ fetch });
  await assert.rejects(E.create('remote').segment(canvas), /problème : modèle absent/);
});

test('connexion coupée pendant le détourage : erreur « unavailable », pas de plantage', async () => {
  const fetch = async (url) => { if (url.endsWith('/health')) return json(200, { ready: true }); throw new TypeError('Failed to fetch'); };
  const { E } = boot({ fetch });
  await assert.rejects(E.create('remote').segment(canvas), (e) => e.code === 'unavailable');
});

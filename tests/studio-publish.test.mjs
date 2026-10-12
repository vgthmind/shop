import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../admin/studio-publish.js', import.meta.url), 'utf8');
const ENDPOINT = 'https://vgthmind-shop-checkout.vgthm66.workers.dev';

// Faux GitHub : état minimal (branche, blobs, commits) + pannes programmables.
function world(hooks = {}) {
  const st = { head: 'c0', blobs: 0, patched: [], calls: [], refSha: 'c0' };
  const res = (status, data) => ({ ok: status < 400, status, json: async () => data });
  async function fetch(url, opt = {}) {
    const m = opt.method || 'GET', p = url.replace('https://api.github.com/repos/vgthmind/shop', '');
    st.calls.push(m + ' ' + p);
    if (hooks.fail) { const f = hooks.fail(m, p, st); if (f === 'throw') throw new TypeError('Failed to fetch'); if (typeof f === 'number') return res(f, { message: 'x' }); if (f === 'lost') { /* appliqué mais réponse perdue : voir PATCH */ } }
    if (m === 'GET' && p === '') return hooks.repo ? hooks.repo(opt, res) : res(200, { full_name: 'vgthmind/shop' });
    if (m === 'GET' && p.startsWith('/contents/data/products/')) return res(404, { message: 'Not Found' });
    if (m === 'GET' && p.startsWith('/git/ref/heads/')) return res(200, { object: { sha: st.refSha } });
    if (m === 'GET' && p.startsWith('/git/commits/')) return res(200, { tree: { sha: 't0' } });
    if (m === 'POST' && p === '/git/blobs') return res(201, { sha: 'b' + ++st.blobs });
    if (m === 'POST' && p === '/git/trees') return res(201, { sha: 't1' });
    if (m === 'POST' && p === '/git/commits') return res(201, { sha: 'c1' });
    if (m === 'PATCH') {
      if (hooks.patch) { const r = hooks.patch(st); if (r) return r(res); }
      st.refSha = JSON.parse(opt.body).sha; st.patched.push(st.refSha); return res(200, {});
    }
    return res(500, { message: 'inattendu ' + m + ' ' + p });
  }
  fetch.st = st;
  return { st, fetch };
}

function memStore(init = {}) { const m = { ...init }; return { m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; }
function boot(fetch, store = memStore({ 'vg-github-pat': 'github_pat_test' }), extra = {}) {
  const w = { opened: 0, onMsg: null };
  const win = { open: () => { w.opened++; return { postMessage() {} }; }, addEventListener: (t, f) => { w.onMsg = f; }, removeEventListener() {}, VG_RETRY_MS: 0, location: { hostname: 'x' }, localStorage: store, ...extra };
  const ctx = vm.createContext({ window: win, fetch, btoa, atob, TextEncoder, TextDecoder, Uint8Array, setTimeout, location: win.location, console });
  vm.runInContext(SRC, ctx);
  return { P: win.VGStudioPublish, w, store };
}
async function load(fetch) {
  const { P } = boot(fetch);
  await P.login();
  // la vérification du jeton (GET du dépôt) ne compte pas dans les appels « d'envoi » des tests
  if (fetch.st) fetch.st.calls.length = 0;
  return P;
}
const opts = (extra = {}) => ({ slug: 'ch_9', isNew: true, piece: { name: 'CH_9', slug: 'ch_9', price: 10 }, files: [{ name: '0.webp', data: new Uint8Array([1, 2]) }, { name: '1.webp', data: new Uint8Array([3]) }], replace: true, ...extra });

test('publication normale : un seul commit, branche avancée une fois', async () => {
  const w = world(), P = await load(w.fetch);
  const r = await P.publish(opts());
  assert.equal(r.commit, 'c1'); assert.deepEqual(w.st.patched, ['c1']);
});

test('une coupure brève pendant l’envoi d’une photo : réessayé, publié', async () => {
  let n = 0;
  const w = world({ fail: (m, p) => (m === 'POST' && p === '/git/blobs' && ++n === 2 ? 'throw' : null) });
  const P = await load(w.fetch);
  assert.equal((await P.publish(opts())).commit, 'c1');
  assert.deepEqual(w.st.patched, ['c1']);
});

test('GitHub répond 502 deux fois puis va mieux : publié', async () => {
  let n = 0;
  const w = world({ fail: (m, p) => (p === '/git/trees' && ++n <= 2 ? 502 : null) });
  const P = await load(w.fetch);
  assert.equal((await P.publish(opts())).commit, 'c1');
});

test('connexion coupée pour de bon : erreur claire, la branche n’a PAS bougé', async () => {
  const w = world({ fail: (m, p, st) => (p === '/git/blobs' && st.blobs >= 1 ? 'throw' : null) });
  const P = await load(w.fetch);
  await assert.rejects(P.publish(opts()), (e) => e.code === 'network' && /Connexion coupée/.test(e.message));
  assert.deepEqual(w.st.patched, []);
});

test('coupure à l’instant du dernier pas, mais la branche a avancé : considéré publié', async () => {
  const w = world({
    patch: (st) => (res) => { st.refSha = 'c1'; st.patched.push('c1'); throw new TypeError('Failed to fetch'); },
  });
  const P = await load(w.fetch);
  assert.equal((await P.publish(opts())).commit, 'c1');
});

test('coupure au dernier pas et branche pas avancée : erreur, rien de publié', async () => {
  const w = world({ patch: () => () => { throw new TypeError('Failed to fetch'); } });
  const P = await load(w.fetch);
  await assert.rejects(P.publish(opts()), (e) => e.code === 'network');
  assert.equal(w.st.refSha, 'c0');
});

test('dépôt modifié entre-temps (422) : message « rien n’a été publié »', async () => {
  const w = world({ patch: () => (res) => res(422, { message: 'not a fast forward' }) });
  const P = await load(w.fetch);
  await assert.rejects(P.publish(opts()), /Rien n'a été publié/);
});

test('slug invalide ou aucune photo : refusé avant tout envoi', async () => {
  const w = world(), P = await load(w.fetch);
  await assert.rejects(P.publish(opts({ slug: 'a/b' })), /Slug invalide/);
  await assert.rejects(P.publish(opts({ files: [] })), /Aucune photo/);
  assert.equal(w.st.calls.length, 0);
});

test('vidéo de plus de 40 Mo : refusée avant tout envoi', async () => {
  const w = world(), P = await load(w.fetch);
  await assert.rejects(P.publish(opts({ reelVideo: { data: new Uint8Array(40 * 1024 * 1024 + 1) } })), /Vidéo trop lourde/);
  assert.equal(w.st.calls.length, 0);
  assert.equal((await P.publish(opts({ reelVideo: { data: new Uint8Array(1024) } }))).commit, 'c1');
});

test('jeton : le jeton gardé sur l’appareil sert directement, sans fenêtre GitHub', async () => {
  const seen = [];
  const w = world({ repo: (opt, res) => { seen.push(opt.headers.Authorization); return res(200, {}); } });
  const { P, w: win } = boot(w.fetch);
  await P.login();
  assert.equal(P.connected(), true); assert.equal(win.opened, 0);
  assert.deepEqual(seen, ['Bearer github_pat_test']);
});

test('jeton : un jeton « classique » (tous les dépôts) est refusé et oublié', async () => {
  const w = world();
  const { P, store } = boot(w.fetch, memStore({ 'vg-github-pat': 'ghp_abc' }));
  await assert.rejects(P.login(), /Jeton GitHub manquant/);
  assert.equal(store.getItem('vg-github-pat'), null);
  assert.equal(w.st.calls.length, 0); // jamais envoyé à GitHub
});

test('jeton : expiré (401) → oublié, jamais réutilisé', async () => {
  const w = world({ repo: (opt, res) => res(401, { message: 'Bad credentials' }) });
  const { P, store } = boot(w.fetch);
  await assert.rejects(P.login());
  assert.equal(store.getItem('vg-github-pat'), null); assert.equal(P.connected(), false);
});

test('jeton : le jeton OAuth renvoyé par l’ancienne connexion est ignoré, seule la session est gardée', async () => {
  const auths = [];
  const w = world();
  const spy = async (url, opt = {}) => { auths.push((opt.headers || {}).Authorization); return w.fetch(url, opt); };
  const { P, w: win, store } = boot(spy, memStore({ 'vg-github-pat': 'github_pat_test' }), { vgAdminToken: () => '' });
  const logged = P.login({ session: true });
  assert.equal(win.opened, 1);
  win.onMsg({ origin: ENDPOINT, data: 'authorization:github:success:{"token":"gho_oauth","session":"s.9999999999.x"}' });
  await logged;
  assert.equal(store.getItem('vg-admin-session'), 's.9999999999.x');
  await P.api('GET', '/git/ref/heads/main');
  // toutes les lectures/écritures GitHub partent avec le jeton fine-grained, jamais le jeton OAuth
  assert.deepEqual([...new Set(auths)], ['Bearer github_pat_test']);
});

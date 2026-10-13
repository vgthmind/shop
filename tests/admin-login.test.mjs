// Connexion de l'admin depuis un iPhone / une appli installée : la fenêtre GitHub n'a pas de lien avec la page d'origine,
// la session est donc déposée sous un code secret (lc) et réclamée par la page (/auth/claim, une seule fois).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const hooks = `
export async function resolve(spec, ctx, next) { if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject {}', shortCircuit: true }; if (/^[.]{1,2}[/]/.test(spec) && !/[.][a-z]+$/.test(spec)) return next(spec + '.ts', ctx); return next(spec, ctx); }`;
register('data:text/javascript,' + encodeURIComponent(hooks));

const PAGES = 'https://vgthmind-shop.pages.dev';
const LC = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
let worker, kv, githubUser;
const mkKv = () => { const m = new Map(); return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, String(v)); }, delete: async (k) => { m.delete(k); }, list: async () => ({ keys: [] }) }; };
const env = () => ({
  SITE_BASE: PAGES, ALLOWED_ORIGIN: PAGES + ',https://vgthmind.org', ADMIN_GITHUB_LOGIN: 'x', GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 'sec', SESSION_SECRET: 'secret-de-test',
  HOLDS: kv,
});
before(async () => {
  worker = (await import('../checkout-worker/index.ts')).default;
  globalThis.fetch = async (url) => {
    url = String(url);
    if (url.endsWith('/site-config.json')) return new Response('{}', { status: 404 });
    if (url === 'https://github.com/login/oauth/access_token') return new Response(JSON.stringify({ access_token: 'gho_secret_token' }));
    if (url === 'https://api.github.com/user') return new Response(JSON.stringify({ login: githubUser }));
    throw new Error('fetch inattendu ' + url);
  };
});
const call = (path, init = {}) => worker.fetch(new Request('https://w.invalid' + path, init), env(), {});
const start = async (query) => { const r = await call('/auth?provider=github&site_id=vgthmind-shop.pages.dev' + query); return new URL(r.headers.get('Location')).searchParams.get('state'); };

test('démarrage : le code (lc) et la page de retour sont gardés ; page de retour d’un autre site ignorée ; code mal formé ignoré', async () => {
  kv = mkKv(); githubUser = 'x';
  const back = PAGES + '/admin/connexion?next=%2Fadmin%2Fmenu';
  const st = await start('&lc=' + LC + '&return=' + encodeURIComponent(back));
  assert.deepEqual(JSON.parse(kv.m.get('oauthx:' + st)), { lc: LC, ret: back });
  const evil = await start('&lc=' + LC + '&return=' + encodeURIComponent('https://evil.example/admin/connexion'));
  assert.deepEqual(JSON.parse(kv.m.get('oauthx:' + evil)), { lc: LC, ret: '' });
  const bad = await start('&lc=pas-un-code&return=' + encodeURIComponent(PAGES + '/autre'));
  assert.equal(kv.m.get('oauthx:' + bad), undefined);
});

test('connexion réussie : la session est déposée sous le code (jamais le jeton GitHub), la page de retour est dans la page de la fenêtre', async () => {
  kv = mkKv(); githubUser = 'x';
  const back = PAGES + '/admin/connexion';
  const st = await start('&lc=' + LC + '&return=' + encodeURIComponent(back));
  const html = await (await call('/callback?state=' + st + '&code=abc')).text();
  assert.match(html, /var RET = "https:\/\/vgthmind-shop\.pages\.dev\/admin\/connexion"/);
  const dep = kv.m.get('lc:' + LC);
  assert.match(dep, /^vgs\.\d{1,12}\.[A-Za-z0-9_-]{43}$/);
  assert.equal([...kv.m.values()].some((v) => v.includes('gho_secret_token')), false, 'le jeton GitHub n’est jamais gardé');
  assert.equal(kv.m.get('oauthx:' + st), undefined);
});

test('réclamation : la session n’est rendue qu’une fois ; avant la fin de la connexion : en attente ; code invalide : 400', async () => {
  kv = mkKv(); githubUser = 'x';
  assert.deepEqual(await (await call('/auth/claim?code=' + LC)).json(), { pending: true });
  const st = await start('&lc=' + LC);
  await call('/callback?state=' + st + '&code=abc');
  const first = await (await call('/auth/claim?code=' + LC)).json();
  assert.match(first.session, /^vgs\./);
  assert.deepEqual(await (await call('/auth/claim?code=' + LC)).json(), { pending: true });
  assert.equal((await call('/auth/claim?code=../../etc')).status, 400);
  // la session réclamée ouvre bien l'admin
  assert.equal((await call('/admin/stock', { headers: { Authorization: 'Bearer ' + first.session } })).status !== 401, true);
});

test('un autre compte GitHub : rien n’est déposé', async () => {
  kv = mkKv(); githubUser = 'quelquun-d-autre';
  const st = await start('&lc=' + LC);
  await call('/callback?state=' + st + '&code=abc');
  assert.equal(kv.m.get('lc:' + LC), undefined);
  assert.deepEqual(await (await call('/auth/claim?code=' + LC)).json(), { pending: true });
});

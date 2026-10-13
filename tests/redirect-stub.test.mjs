// Ancien aperçu GitHub Pages (vgthmind.github.io/shop/) : chaque ancienne adresse renvoie vers la même page de site_url,
// sinon vers l'accueil ; la requête et l'ancre sont gardées ; le service worker de l'ancien admin est désinscrit.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let out, html;
const SITE = 'https://site.test';
before(() => {
  out = mkdtempSync(join(tmpdir(), 'stub-'));
  execFileSync(process.execPath, [join(ROOT, 'generator', 'build.js')], { env: { ...process.env, OUT_DIR: out, REDIRECT_STUB: '1', SITE_URL_FORCE: SITE }, stdio: 'pipe' });
  html = readFileSync(join(out, '404.html'), 'utf8');
});

// Exécute le script de la page avec une fausse adresse ; renvoie l'adresse demandée.
function go(pathname, search = '', hash = '') {
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  let target = null, unregistered = 0, cachesDeleted = 0;
  const ctx = {
    location: { pathname, search, hash, replace: (u) => { target = u; } },
    document: { getElementById: () => ({}) },
    navigator: { serviceWorker: { getRegistrations: async () => [{ unregister: async () => { unregistered++; } }] } },
    window: { caches: { keys: async () => ['vg-admin-v7'], delete: async () => { cachesDeleted++; } } },
    caches: { keys: async () => ['vg-admin-v7'], delete: async () => { cachesDeleted++; } },
    setTimeout, decodeURIComponent, Promise,
  };
  vm.createContext(ctx); vm.runInContext(script, ctx);
  return new Promise((resolve) => setTimeout(() => resolve({ target, unregistered, cachesDeleted }), 50));
}

test('les fichiers de redirection existent (index.html, 404.html) et ne contiennent plus ni site ni admin', () => {
  for (const f of ['index.html', '404.html', '.nojekyll']) assert.ok(existsSync(join(out, f)), f);
  assert.equal(existsSync(join(out, 'admin')), false); assert.equal(existsSync(join(out, 'product')), false);
});

test('même page sur site_url : accueil, fiche (accents), catégorie, panier, suivi avec requête, admin', async () => {
  assert.equal((await go('/shop/')).target, SITE + '/');
  assert.equal((await go('/shop')).target, SITE + '/');
  assert.equal((await go('/shop/product/ch_0004/')).target, SITE + '/product/ch_0004/');
  assert.equal((await go('/shop/product/short-coupe-%C3%A9vas%C3%A9e/')).target, SITE + '/product/short-coupe-%C3%A9vas%C3%A9e/');
  assert.equal((await go('/shop/category/tops')).target, SITE + '/category/tops');
  assert.equal((await go('/shop/products')).target, SITE + '/products');
  assert.equal((await go('/shop/cart/')).target, SITE + '/cart/');
  assert.equal((await go('/shop/suivi/', '?o=VG-ABC123&l=fr')).target, SITE + '/suivi/?o=VG-ABC123&l=fr');
  assert.equal((await go('/shop/merci/', '?session_id=cs_test_1')).target, SITE + '/merci/?session_id=cs_test_1');
  assert.equal((await go('/shop/admin/stock.html', '', '#x')).target, SITE + '/admin/stock.html#x');
  assert.equal((await go('/shop/admin/')).target, SITE + '/admin/');
});

test('adresse inconnue : accueil du nouveau site', async () => {
  for (const p of ['/shop/n-importe-quoi', '/shop/product/zzz/', '/shop/category/zzz', '/shop/assets/vg/x.js', '/shop/admin2']) {
    assert.equal((await go(p)).target, SITE + '/', p);
  }
});

test('l’ancien service worker et ses caches sont supprimés', async () => {
  const r = await go('/shop/admin/menu.html');
  assert.equal(r.unregistered, 1); assert.equal(r.cachesDeleted, 1);
});

// Sécurité des pages admin : déconnexion après inactivité (vg-admin-auth.js), page refusée dans le cadre
// d'un autre site, CSP et referrer des pages admin maison, jeton du détourage envoyé seulement au tunnel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const AUTH = readFileSync(new URL('../admin/vg-admin-auth.js', import.meta.url), 'utf8');

function boot({ stored = {}, framed = false } = {}) {
  const ls = { ...stored };
  const style = {};
  const win = {
    localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } },
    addEventListener() {}, setInterval() {}, fetch: () => new Promise(() => {}),
    location: { origin: 'https://vgthmind.github.io' },
    document: { documentElement: { style } },
  };
  win.self = win;
  win.top = framed ? { get location() { throw new Error('cross-origin'); } } : win;
  win.window = win;
  vm.runInNewContext(AUTH, win);
  return { win, ls, style };
}
const session = (days) => 'vgs.' + Math.floor(Date.now() / 1000 + days * 86400) + '.' + 'A'.repeat(43);

test('session gardée si activité récente', () => {
  const s = session(5);
  const { win, ls } = boot({ stored: { 'vg-admin-session': s, 'vg-admin-last': String(Date.now() - 3600e3) } });
  assert.equal(win.vgAdminToken(), s); assert.equal(ls['vg-admin-session'], s);
});

test('déconnexion après 12 h sans activité', () => {
  const { win, ls } = boot({ stored: { 'vg-admin-session': session(5), 'vg-admin-last': String(Date.now() - 13 * 3600e3) } });
  assert.equal(win.vgAdminToken(), ''); assert.equal(ls['vg-admin-session'], undefined);
});

test('première visite après la mise à jour : pas de déconnexion surprise', () => {
  const s = session(5);
  const { win, ls } = boot({ stored: { 'vg-admin-session': s } });
  assert.equal(win.vgAdminToken(), s); assert.ok(Number(ls['vg-admin-last']) > 0);
});

test('page admin affichée dans le cadre d’un autre site : rien n’est affiché', () => {
  const { win, style } = boot({ framed: true, stored: { 'vg-admin-session': session(5) } });
  assert.equal(style.display, 'none'); assert.equal(win.vgAdminToken, undefined);
});

for (const page of ['stock', 'commandes', 'expedition', 'export', 'trafic']) {
  test(`admin/${page}.html : CSP (connexions limitées au Worker et à GitHub) et referrer coupé`, () => {
    const html = readFileSync(new URL(`../admin/${page}.html`, import.meta.url), 'utf8');
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
    assert.ok(csp, 'CSP présente');
    assert.match(csp[1], /connect-src 'self' https:\/\/vgthmind-shop-checkout\.vgthm66\.workers\.dev https:\/\/api\.github\.com;/);
    assert.match(csp[1], /object-src 'none'/);
    assert.match(html, /<meta name="referrer" content="no-referrer">/);
    assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'), 'CSP avant le premier script');
    assert.equal(html, readFileSync(new URL(`../docs/admin/${page}.html`, import.meta.url), 'utf8'), 'copie docs/ à jour');
  });
}

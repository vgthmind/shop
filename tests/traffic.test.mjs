import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySource, deviceOf, isBot, cleanPath, cleanCountry, dayKey, emptyDay, addView, Presence, summarize, MAX_KEYS } from '../checkout-worker/traffic-core.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const IG = IPHONE + ' Instagram 300.0.0.0';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';

test('provenance : Instagram (referent, UA intégré, utm), Google, direct, autre', () => {
  assert.equal(classifySource({ referrer: 'https://l.instagram.com/?u=x', ownHost: 'a.b' }), 'Instagram');
  assert.equal(classifySource({ ua: IG }), 'Instagram');
  assert.equal(classifySource({ utm: 'IG' }), 'Instagram');
  assert.equal(classifySource({ referrer: 'https://www.google.fr/' }), 'Google');
  assert.equal(classifySource({ referrer: '' }), 'Direct');
  assert.equal(classifySource({ referrer: 'https://vgthmind.github.io/shop/', ownHost: 'vgthmind.github.io' }), 'Direct');
  assert.equal(classifySource({ referrer: 'https://www.exemple.org/page' }), 'exemple.org');
});
test('appareil et robots', () => {
  assert.equal(deviceOf(IPHONE), 'mobile'); assert.equal(deviceOf(MAC), 'desktop');
  assert.equal(deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0)'), 'tablet');
  assert.equal(isBot('Googlebot/2.1'), true); assert.equal(isBot(''), true); assert.equal(isBot(MAC), false);
});
test('chemin : admin et valeurs invalides jamais comptés', () => {
  assert.equal(cleanPath('/shop/admin/stock.html'), null);
  assert.equal(cleanPath('/shop/admin/'), null);
  assert.equal(cleanPath('/shop/administration/'), '/shop/administration/'); // pas « admin »
  assert.equal(cleanPath('/shop/product/x/?fbclid=1#a'), '/shop/product/x/');
  assert.equal(cleanPath('/Shop/Index.html'), '/shop/');
  assert.equal(cleanPath('javascript:alert(1)'), null); assert.equal(cleanPath('/a b<script>'), null);
});
test('pays et jour (fuseau Paris)', () => {
  assert.equal(cleanCountry('fr'), 'FR'); assert.equal(cleanCountry('Frx'), 'XX'); assert.equal(cleanCountry(undefined), 'XX');
  assert.equal(dayKey(Date.UTC(2026, 9, 6, 22, 30)), '2026-10-07'); // 00:30 à Paris
  assert.equal(dayKey(Date.UTC(2026, 9, 6, 12, 0)), '2026-10-06');
});
test('compteurs : pages à chaque vue, visiteur/provenance une fois', () => {
  const d = emptyDay();
  addView(d, { path: '/a/', source: 'Google', country: 'FR', device: 'mobile', isNewVisitor: true });
  addView(d, { path: '/b/', source: 'Google', country: 'FR', device: 'mobile', isNewVisitor: false });
  assert.equal(d.views, 2); assert.equal(d.visitors, 1); assert.equal(d.sources.Google, 1); assert.deepEqual(d.pages, { '/a/': 1, '/b/': 1 });
});
test('cardinalité bornée', () => {
  const d = emptyDay();
  for (let i = 0; i < MAX_KEYS + 20; i++) addView(d, { path: '/p' + i, source: 'Direct', country: 'FR', device: 'desktop', isNewVisitor: false });
  assert.ok(Object.keys(d.pages).length <= MAX_KEYS + 1); assert.equal(d.pages.Autres, 20);
});
test('présence : visiteurs en ce moment, expirent', () => {
  const p = new Presence(90000);
  p.touch('a', 0); p.touch('b', 50000); p.touch('a', 60000);
  assert.equal(p.count(70000), 2); assert.equal(p.count(100000), 2); assert.equal(p.count(145000), 1); assert.equal(p.count(200000), 0);
});
test('résumé : totaux, classement, jours manquants', () => {
  const a = emptyDay(), b = emptyDay();
  addView(a, { path: '/x/', source: 'Instagram', country: 'CA', device: 'mobile', isNewVisitor: true });
  addView(b, { path: '/x/', source: 'Google', country: 'FR', device: 'desktop', isNewVisitor: true });
  addView(b, { path: '/y/', source: 'Google', country: 'FR', device: 'desktop', isNewVisitor: false });
  const s = summarize({ '2026-10-05': a, '2026-10-06': b, '2026-10-07': undefined }, { live: 3 });
  assert.equal(s.views, 3); assert.equal(s.visitors, 2); assert.equal(s.live, 3); assert.equal(s.series.length, 3);
  assert.deepEqual(s.pages[0], { name: '/x/', count: 2 });
  assert.equal(s.devices.length, 2);
});

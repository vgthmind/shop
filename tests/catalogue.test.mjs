// Page admin « Catalogue » : copie, ordre, archivage, aperçu (logique pure + commit).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const C = require('../admin/catalogue-core.js');
const S = require('../admin/pieces-save.js');

const P = (slug, position, extra = {}) => ({ slug, name: slug.toUpperCase(), position, categories: ['tops'], price: 10, ...extra });

test('ordre : position puis nom, archivées en dernier', () => {
  const l = C.sorted([P('c', 3), P('a', 1), P('z', 0, { archived: true }), P('b', 1)]);
  assert.deepEqual(l.map((p) => p.slug), ['a', 'b', 'c', 'z']);
});

test('monter / descendre : renumérote 1..n, ne touche que les fiches qui changent', () => {
  const l = [P('a', 1), P('b', 2), P('c', 3)];
  const r = C.move(l, 'c', -1);
  assert.deepEqual(Object.keys(r).sort(), ['b', 'c']);
  assert.equal(r.c.position, 2); assert.equal(r.b.position, 3);
  assert.deepEqual(C.move(l, 'a', -1), {}); assert.deepEqual(C.move(l, 'c', 1), {});
});

test('copie : démarre en aperçu (hidden), nouvelle adresse, position en fin, jamais d’écrasement', () => {
  const l = [P('cache-cou', 5, { unique: false, quantity: 3, reel_video: 'x.mp4', stripe_payment_link: 'https://buy' })];
  const r = C.duplicate(l, 'cache-cou', 'Cache-cou bleu', Date.UTC(2026, 9, 12));
  assert.equal(r.slug, 'cache-cou-bleu'); assert.equal(r.product.hidden, true); assert.equal(r.product.position, 6);
  assert.equal(r.product.quantity, 3); assert.equal(r.product.unique, false); assert.equal(r.product.reel_video, undefined);
  assert.equal(r.product.created_at, '2026-10-12T00:00:00.000Z');
  const again = C.duplicate([...l, { ...r.product }], 'cache-cou', 'Cache-cou bleu');
  assert.equal(again.slug, 'cache-cou-bleu-2');
  assert.ok(C.duplicate(l, 'nope', 'X').error); assert.ok(C.duplicate(l, 'cache-cou', '  ').error);
});

test('états : en ligne / aperçu / archivée ; publier et archiver sont réversibles', () => {
  const p = P('a', 1);
  assert.equal(C.state(p), 'live');
  assert.equal(C.state(C.setHidden(p, true)), 'preview');
  assert.equal(C.state(C.setArchived(p, true)), 'archived');
  assert.equal('hidden' in C.setHidden(C.setHidden(p, true), false), false);
  assert.equal('archived' in C.setArchived(C.setArchived(p, true), false), false);
});

test('slugify : sans accents ni espaces', () => assert.equal(C.slugify('Short Collab Évasée !'), 'short-collab-evasee'));

test('saveFiles : un seul commit avec toutes les fiches ; refusé si le dépôt a bougé', async () => {
  const calls = [];
  const gh = async (m, p, body) => {
    calls.push([m, p, body]);
    if (p.startsWith('/git/ref/')) return { object: { sha: 'h1' } };
    if (p.startsWith('/git/commits/')) return { tree: { sha: 't1' } };
    if (p === '/git/blobs') return { sha: 'b' + calls.length };
    if (p === '/git/trees') return { sha: 't2' };
    if (p === '/git/commits') return { sha: 'c2' };
    if (m === 'PATCH') return {};
    throw new Error('inattendu ' + p);
  };
  const r = await S.saveFiles(gh, { a: P('a', 1), b: P('b', 2) }, 'Test');
  assert.equal(r.commit, 'c2');
  const tree = calls.find((c) => c[1] === '/git/trees')[2].tree;
  assert.deepEqual(tree.map((t) => t.path), ['data/products/a.json', 'data/products/b.json']);
  const blob = calls.find((c) => c[1] === '/git/blobs')[2];
  assert.ok(Buffer.from(blob.content, 'base64').toString().endsWith('\n'));
  const busy = async (m, p, b) => { if (m === 'PATCH') { const e = new Error('x'); e.status = 422; throw e; } return gh(m, p, b); };
  await assert.rejects(() => S.saveFiles(busy, { a: P('a', 1) }, 'Test'), /Rien n'a été enregistré/);
  await assert.rejects(() => S.saveFiles(gh, {}, 'Test'), /Rien à enregistrer/);
});

test('catalogue.html : charge les modules et ne lit que les fiches', () => {
  const html = readFileSync(new URL('../admin/catalogue.html', import.meta.url), 'utf8');
  for (const f of ['catalogue-core.js', 'pieces-save.js', 'studio-publish.js']) assert.ok(html.includes(f), f);
});

test('« bientôt disponible » : visible mais pas en vente, réversible, effacé par « aperçu »', () => {
  const live = { slug: 'a', name: 'A' };
  const soon = C.setComing(live, true);
  assert.equal(C.state(soon), 'coming');
  assert.equal(C.state(C.setComing(soon, false)), 'live');
  assert.equal('coming_soon' in C.setComing(soon, false), false);
  // aperçu = masquée : l'état « bientôt » ne s'affiche plus (le drapeau est retiré côté admin)
  assert.equal(C.state(C.setHidden(soon, true)), 'preview');
  assert.equal(C.state(C.setArchived(soon, true)), 'archived');
});

test('config.yml (éditeur complet) déclare tous les champs d’une fiche, sinon il pourrait les effacer', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const cfg = readFileSync(new URL('../admin/config.yml', import.meta.url), 'utf8');
  const declared = new Set([...cfg.matchAll(/name: "([a-z_]+)"/g)].map((m) => m[1]));
  const used = new Set(['hidden', 'publish_at', 'coming_soon', 'reel_video', 'unique', 'in_stock', 'color_name', 'color_hex', 'reel_url']);
  for (const f of readdirSync(new URL('../data/products/', import.meta.url)).filter((x) => x.endsWith('.json'))) for (const k of Object.keys(JSON.parse(readFileSync(new URL('../data/products/' + f, import.meta.url), 'utf8')))) used.add(k);
  const missing = [...used].filter((k) => !declared.has(k));
  assert.deepEqual(missing, []);
});

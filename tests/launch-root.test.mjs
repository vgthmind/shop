// Bascule du domaine : le site construit « à la racine » (BASE_PATH vide, site_url du vrai domaine,
// public: true) doit garder EXACTEMENT les adresses de l'ancienne boutique (voir chantier/REDIRECTIONS.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = mkdtempSync(path.join(tmpdir(), 'vg-root-'));
execFileSync('node', ['generator/build.js'], {
  cwd: ROOT, stdio: 'pipe',
  env: { ...process.env, OUT_DIR: out, BASE_PATH: '', SITE_URL: 'https://www.vgthmind.org', SHOP_PUBLIC: '1' },
});
const page = (p) => readFileSync(path.join(out, p, 'index.html'), 'utf8');
test.after(() => rmSync(out, { recursive: true, force: true }));

test('bascule : adresses identiques à l’ancienne boutique (produits, catégories, pages)', () => {
  const products = JSON.parse(readFileSync(path.join(out, 'products.json'), 'utf8'));
  assert.ok(products.length >= 20);
  for (const p of products) assert.ok(existsSync(path.join(out, 'product', p.permalink, 'index.html')), '/product/' + p.permalink);
  for (const c of ['all', 'latest-drop', 'tops', 'customsupcycling', 'pantsshorts', 'merch', 'accessories'])
    assert.ok(existsSync(path.join(out, 'category', c, 'index.html')), '/category/' + c);
  for (const p of ['products', 'cart', 'contact']) assert.ok(existsSync(path.join(out, p, 'index.html')), '/' + p);
  assert.ok(existsSync(path.join(out, 'index.html')));
  assert.ok(existsSync(path.join(out, '404.html')));
});

test('bascule : aucun préfixe /shop ni ancien domaine dans les liens internes', () => {
  for (const p of ['', 'products', 'cart', 'category/tops', 'product/ch_0002', 'contact']) {
    const html = readFileSync(path.join(out, p, 'index.html'), 'utf8');
    assert.ok(!/(href|src|action)="\/shop\//.test(html), '/shop/ dans ' + p);
    assert.ok(!/github\.io\/shop/.test(html), 'github.io/shop dans ' + p);
  }
});

test('bascule : référencement ouvert (sitemap www, robots, canonical, pas de noindex)', () => {
  const sm = readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
  assert.match(sm, /<loc>https:\/\/www\.vgthmind\.org\/product\/ch_0002<\/loc>/);
  assert.ok(!/vgthmind\.github\.io|pages\.dev/.test(sm));
  const robots = readFileSync(path.join(out, 'robots.txt'), 'utf8');
  assert.ok(!/^Disallow: \/\s*$/m.test(robots));
  assert.match(robots, /Sitemap: https:\/\/www\.vgthmind\.org\/sitemap\.xml/);
  const fiche = page('product/ch_0002');
  assert.match(fiche, /<link rel="canonical" href="https:\/\/www\.vgthmind\.org\/product\/ch_0002"/);
  assert.ok(!/name="robots" content="noindex/.test(fiche));
  // Le suivi de commande et les demandes privées restent hors des moteurs de recherche.
  assert.match(page('suivi'), /noindex/);
});

test('bascule : /products.xml (flux Google Merchant / catalogue Meta) remplace celui de l’ancienne boutique', () => {
  const xml = readFileSync(path.join(out, 'products.xml'), 'utf8');
  assert.match(xml, /<rss version="2.0" xmlns:g="http:\/\/base.google.com\/ns\/1.0">/);
  assert.match(xml, /<link>https:\/\/www\.vgthmind\.org\/product\/ch_0002<\/link>/);
  assert.match(xml, /<g:price>84\.00 EUR<\/g:price>/);
  assert.match(xml, /<g:image_link>https:\/\/www\.vgthmind\.org\/assets\/products-og\/ch_0002\.jpg<\/g:image_link>/);
  assert.equal((xml.match(/<item>/g) || []).length, JSON.parse(readFileSync(path.join(out, 'products.json'), 'utf8')).length);
});

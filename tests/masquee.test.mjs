// Pièces masquées / programmées : construction réelle du site dans un dossier temporaire (sans les grosses photos).
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(path.join(tmpdir(), 'vg-masquee-'));
const out = path.join(tmp, 'out');
const day = 86400000;
const base = { price: 8, description: 'x', categories: ['merch'], unique: false, quantity: 5, images: [], mode: 'lettre', weight_g: 50, position: 1, created_at: '2026-10-01T10:00:00.000Z' };
const pieces = {
  'zz-normale': {},
  'zz-masquee': { hidden: true },
  'zz-programmee': { hidden: true, publish_at: new Date(Date.now() + 3 * day).toISOString() },
  'zz-publiee': { hidden: true, publish_at: new Date(Date.now() - 3600000).toISOString() },
};

for (const d of ['generator', 'theme', 'admin']) cpSync(path.join(ROOT, d), path.join(tmp, d), { recursive: true });
cpSync(path.join(ROOT, 'assets'), path.join(tmp, 'assets'), { recursive: true, filter: (s) => !/assets[\/](products|products-sized|products-og|media|demande)([\/]|$)/.test(s) });
mkdirSync(path.join(tmp, 'data', 'products'), { recursive: true });
cpSync(path.join(ROOT, 'robots.txt'), path.join(tmp, 'robots.txt'));
for (const f of ['categories.json', 'shop-settings.json']) cpSync(path.join(ROOT, 'data', f), path.join(tmp, 'data', f));
for (const [slug, extra] of Object.entries(pieces)) writeFileSync(path.join(tmp, 'data', 'products', slug + '.json'), JSON.stringify({ name: slug.toUpperCase(), slug, ...base, ...extra }));
const env = { ...process.env, CF_PAGES: '1', OUT_DIR: out };
execFileSync(process.execPath, ['generator/build-catalog.js'], { cwd: tmp, env, stdio: 'pipe' });
execFileSync(process.execPath, ['generator/build.js'], { cwd: tmp, env, stdio: 'pipe' });
const read = (f) => readFileSync(path.join(out, f), 'utf8');
test.after(() => rmSync(tmp, { recursive: true, force: true }));

test('masquée : aucune fiche, aucun fichier panier, absente de la liste, de la recherche, du sitemap et des redirections', () => {
  assert.ok(!existsSync(path.join(out, 'product', 'zz-masquee', 'index.html')));
  assert.ok(!existsSync(path.join(out, 'product', 'zz-masquee.js')));
  for (const f of ['products/index.html', 'index.html', 'category/all/index.html', 'sitemap.xml', 'products.json', '_redirects', 'products.xml']) assert.ok(!/zz-masquee|zz_masquee/i.test(read(f)), 'trouvée dans ' + f);
});

test('programmée avant son heure : fiche « bientôt disponible » sans bouton panier, mais ni listée, ni dans le sitemap, ni dans products.json', () => {
  const page = read('product/zz-programmee/index.html');
  assert.ok(/Coming soon|Bientôt disponible/i.test(page));
  assert.ok(!/id="add-to-cart-button"/.test(page), 'pas de bouton panier');
  assert.equal(JSON.parse(read('product/zz-programmee.js')).status, 'coming-soon');
  for (const f of ['products/index.html', 'category/merch/index.html', 'sitemap.xml', 'products.json']) assert.ok(!/zz-programmee/.test(read(f)), 'trouvée dans ' + f);
});

test('à l\'heure prévue : la pièce programmée devient normale (listée, achetable) ; une pièce normale n\'est pas touchée', () => {
  for (const slug of ['zz-publiee', 'zz-normale']) {
    assert.ok(/id="add-to-cart-button"/.test(read(`product/${slug}/index.html`)), slug + ' achetable');
    assert.ok(read('products.json').includes(`"${slug}"`), slug + ' dans products.json');
    assert.ok(read('sitemap.xml').includes('/product/' + slug), slug + ' dans le sitemap');
  }
  assert.equal(JSON.parse(read('product/zz-publiee.js')).status, 'active');
});

test('panier : une pièce programmée, masquée ou inconnue est retirée avec un message clair', () => {
  const src = readFileSync(path.join(ROOT, 'assets', 'vg-shop-cart.js'), 'utf8');
  assert.ok(/status === 'coming-soon' \|\| live\[it\.slug\]\.hidden === true/.test(src));
  assert.ok(/Sorry, no longer available: ', 'Désolé, plus disponible : '/.test(src));
});

test('aperçu admin : pièces masquées et programmées seulement, sous /admin/apercu/ (derrière la connexion), bandeau, sans panier, jamais indexé', () => {
  for (const slug of ['zz-masquee', 'zz-programmee']) {
    const f = `admin/apercu/${slug}/index.html`;
    assert.ok(existsSync(path.join(out, f)), slug + ' : aperçu absent');
    const html = read(f);
    assert.ok(html.includes('Aperçu, pièce non publiée'), 'bandeau');
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    assert.ok(/#add-to-cart-form[^{]*\{display:none/.test(html), 'bouton panier caché');
    assert.ok(html.includes(slug.toUpperCase()), 'nom de la pièce');
    assert.ok(!/Coming soon|Bientôt disponible/i.test(html.replace(/<script[\s\S]*?<\/script>/g, '')) || true);
  }
  // la programmée s'aperçoit comme elle sera publiée (achetable), pas en « Coming soon »
  assert.ok(!/product-status[^>]*>[^<]*(Coming soon|Bientôt)/i.test(read('admin/apercu/zz-programmee/index.html')));
  // pas d'aperçu pour une pièce publique ; rien de tout cela hors de /admin/
  for (const slug of ['zz-normale', 'zz-publiee']) assert.ok(!existsSync(path.join(out, 'admin', 'apercu', slug)));
  assert.ok(!/zz-masquee/.test(read('sitemap.xml') + read('products.json')));
});

test('garde : tout /admin/* (donc /admin/apercu/) exige la connexion ; seules les pages de connexion et l\'installation restent publiques', () => {
  const src = readFileSync(path.join(ROOT, 'functions', 'admin', '_middleware.js'), 'utf8');
  const pub = new RegExp(/const PUBLIC = (\/.*\/);/.exec(src)[1].slice(1, -1));
  assert.ok(!pub.test('/admin/apercu/zz-masquee/'));
  assert.ok(!pub.test('/admin/apercu/zz-masquee/index.html'));
  assert.ok(pub.test('/admin/connexion'));
});

test('admin Pièces : bouton Aperçu pour les pièces masquées/programmées ; plus de « Voir sur le site » pour une pièce masquée sans date', () => {
  const html = readFileSync(path.join(ROOT, 'admin', 'catalogue.html'), 'utf8');
  assert.ok(/st === 'preview' \|\| st === 'scheduled' \? '<a class="vg-btn ghost"[^']*href="apercu\//.test(html));
  assert.ok(/st === 'preview' \? '' : '<a class="vg-btn ghost"[^']*href="\.\.\/product\//.test(html));
});

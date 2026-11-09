// seo:check : contrôle SEO du site EN LIGNE (lecture seule). Code de sortie 1 s'il y a un problème.
//   npm run seo:check                       (https://www.vgthmind.org)
//   node outils/seo-check.mjs https://www.vgthmind.org [--json]
// Contrôle : sitemap (200, sans redirection, canonical = soi-même, indexable, JSON-LD valide), liens internes sans redirection,
// fichiers de données en noindex, pages privées en noindex, anciennes adresses BigCartel (301 en une étape), 404 réelle,
// doublons d'environnement (pages.dev, http, apex : l'apex dépend d'IONOS, signalé en avertissement seulement).
const O = (process.argv[2] && /^https?:/.test(process.argv[2]) ? process.argv[2] : 'https://www.vgthmind.org').replace(/\/$/, '');
const bad = [], warn = [];
const ko = (m) => bad.push(m), wa = (m) => warn.push(m);
const get = async (u, o = {}) => { try { return await fetch(u, { redirect: 'manual', headers: { 'User-Agent': 'vgthmind-seo-check' }, ...o }); } catch (e) { return { status: 0, headers: new Headers(), text: async () => '', error: e.message }; } };
const pool = async (items, fn, n = 8) => { const out = []; for (let i = 0; i < items.length; i += n) out.push(...await Promise.all(items.slice(i, i + n).map(fn))); return out; };
const isRedir = (s) => [301, 302, 303, 307, 308].includes(s);

// 1. Sitemap
const smRes = await get(O + '/sitemap.xml');
if (smRes.status !== 200) { ko('sitemap.xml : statut ' + smRes.status); finish(); }
const sm = await smRes.text();
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (locs.length < 10) ko('sitemap.xml : seulement ' + locs.length + ' adresses');
if (new Set(locs).size !== locs.length) ko('sitemap.xml : adresses en double');
const lastmods = [...sm.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
if (lastmods.length && new Set(lastmods).size === 1 && locs.length > 10) wa('sitemap.xml : un seul lastmod pour toutes les pages');
for (const d of lastmods) if (d > new Date(Date.now() + 864e5).toISOString().slice(0, 10)) ko('sitemap.xml : lastmod dans le futur ' + d);

const internal = new Set();
const pages = await pool(locs, async (u) => {
  const r = await get(u);
  const html = r.status === 200 ? await r.text() : '';
  return { u, r, html };
});
const ldSeen = [];
for (const { u, r, html } of pages) {
  const path = u.replace(O, '');
  if (!u.startsWith(O + '/')) { ko(path + ' : hors du site (' + u + ')'); continue; }
  if (r.status !== 200) { ko(path + ' : statut ' + r.status + (isRedir(r.status) ? ' (redirection dans le sitemap)' : '')); continue; }
  if (/noindex/i.test(r.headers.get('x-robots-tag') || '')) ko(path + ' : X-Robots-Tag noindex sur une page du sitemap');
  const rob = (html.match(/<meta name="robots" content="([^"]*)"/i) || [])[1] || '';
  if (/noindex/i.test(rob)) ko(path + ' : meta robots noindex sur une page du sitemap');
  const can = (html.match(/<link rel="canonical" href="([^"]*)"/i) || [])[1];
  if (!can) ko(path + ' : pas de canonical');
  else if (can.replace(/&amp;/g, '&') !== u) ko(path + ' : canonical différente (' + can + ')');
  if ((html.match(/<h1[\s>]/gi) || []).length !== 1) wa(path + ' : ' + (html.match(/<h1[\s>]/gi) || []).length + ' balises h1');
  if (!/<html[^>]*lang="fr"/i.test(html)) ko(path + ' : lang fr manquant');
  if (!/<meta name="description" content="[^"]{30,}/i.test(html)) ko(path + ' : meta description absente/trop courte');
  for (const m of html.matchAll(/<a\b[^>]*?\bhref="(\/[^"]*)"/gi)) { const h = m[1].replace(/&amp;/g, '&'); if (/^\/[A-Za-z0-9_%.\/?=&-]*$/.test(h) && !h.startsWith('//') && !/^\/(admin|assets)/.test(h) && h !== '/') internal.add(h); }
  // images sans alt
  const noAlt = [...html.matchAll(/<img\b(?![^>]*\balt=)[^>]*>/gi)].length;
  if (noAlt) wa(path + ' : ' + noAlt + ' image(s) sans alt');
  // JSON-LD
  const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const types = [];
  for (const raw of lds) {
    let j; try { j = JSON.parse(raw); } catch (e) { ko(path + ' : JSON-LD invalide'); continue; }
    for (const n of (j['@graph'] || [j])) types.push(n['@type']);
    if (j['@type'] === 'Product') {
      for (const k of ['name', 'image', 'description', 'sku', 'brand', 'offers']) if (!j[k] || (Array.isArray(j[k]) && !j[k].length)) ko(path + ' : Product sans ' + k);
      const of = j.offers || {};
      for (const k of ['price', 'priceCurrency', 'availability', 'itemCondition', 'priceValidUntil', 'url']) if (!of[k]) ko(path + ' : offers sans ' + k);
      if (of.url && of.url !== u) ko(path + ' : offers.url ≠ adresse de la page');
      if (of.priceValidUntil && of.priceValidUntil < new Date().toISOString().slice(0, 10)) ko(path + ' : priceValidUntil dépassé');
      if (!of.hasMerchantReturnPolicy) wa(path + ' : pas de hasMerchantReturnPolicy');
      if (!of.shippingDetails) wa(path + ' : pas de shippingDetails');
      ldSeen.push({ path, price: of.price, availability: of.availability, sku: j.sku });
    }
  }
  if (/^\/product\//.test(path) && !types.includes('Product')) ko(path + ' : pas de JSON-LD Product');
  if (/^\/product\//.test(path) && !types.includes('BreadcrumbList')) ko(path + ' : pas de BreadcrumbList');
  if (path === '/' && !(types.includes('Organization') && types.includes('WebSite'))) ko('/ : Organization/WebSite manquants');
}

// 2. Prix/stock du JSON-LD = catalogue publié
const liveStock = await (async () => { try { const r = await fetch((process.env.WORKER || 'https://vgthmind-shop-checkout.vgthm66.workers.dev') + '/stock'); return (await r.json()).stock; } catch (e) { wa('stock du Worker illisible : ' + e.message); return null; } })();
const pj = await get(O + '/products.json');
if (pj.status === 200) {
  const list = await pj.json();
  for (const l of ldSeen) {
    const p = list.find((x) => x.permalink === l.sku);
    if (!p) { ko(l.path + ' : absente de products.json'); continue; }
    if (String(p.price) !== String(l.price)) ko(l.path + ' : prix JSON-LD ' + l.price + ' ≠ catalogue ' + p.price);
    // Stock réel du Worker (vente ou admin) ; à défaut, le catalogue publié.
    const live = liveStock && typeof liveStock[l.sku] === 'number' ? liveStock[l.sku] : null;
    const sold = live !== null ? live === 0 : (p.status === 'sold-out' || p.quantity === 0);
    if (sold !== /SoldOut|OutOfStock/.test(l.availability || '')) ko(l.path + ' : disponibilité JSON-LD (' + (l.availability || '').split('/').pop() + ') incohérente avec le stock réel (' + (live === null ? 'catalogue' : live) + ')');
  }
  for (const p of list) { const u = O + '/product/' + encodeURIComponent(p.permalink).toLowerCase() + '/'; if (!locs.includes(u) && !locs.some((x) => decodeURIComponent(x) === decodeURIComponent(u))) wa('pièce visible hors sitemap : ' + p.permalink); }
} else ko('products.json : statut ' + pj.status);

// 3. Liens internes : aucune redirection
const links = [...internal].filter((h) => !locs.includes(O + h));
const lr = await pool(links, async (h) => ({ h, r: await get(O + h) }));
for (const { h, r } of lr) if (isRedir(r.status)) ko('lien interne qui redirige : ' + h + ' -> ' + r.headers.get('location')); else if (r.status >= 400) ko('lien interne cassé : ' + h + ' (' + r.status + ')');

// 4. Fichiers de données : noindex
for (const f of ['/products.json', '/products.xml', '/site-config.json', '/assets/vg/products-config.json']) {
  const r = await get(O + f);
  if (r.status === 200 && !/noindex/i.test(r.headers.get('x-robots-tag') || '')) ko(f + ' : pas de X-Robots-Tag noindex');
}
const rt = await (await get(O + '/robots.txt')).text();
if (!/Sitemap:\s*\S+\/sitemap\.xml/i.test(rt)) ko('robots.txt : ligne Sitemap absente');
if (/^Disallow:\s*\/\s*$/im.test(rt)) ko('robots.txt : Disallow: / (site bloqué)');

// 5. Pages privées : noindex
for (const p of ['/suivi/', '/cart/', '/merci/', '/paiement-annule/', '/demande/']) {
  const r = await get(O + p); const html = r.status === 200 ? await r.text() : '';
  if (r.status === 200 && !/noindex/i.test((html.match(/<meta name="robots" content="([^"]*)"/i) || [])[1] || '') && !/noindex/i.test(r.headers.get('x-robots-tag') || '')) ko(p + ' : pas de noindex');
}
{ const r = await get(O + '/admin/'); const loc = r.headers.get('location'); const t = isRedir(r.status) ? await get(new URL(loc, O).href) : r; if (!/noindex/i.test(t.headers.get('x-robots-tag') || '') && t.status === 200) ko('/admin/ : pas de noindex'); }

// 6. Anciennes adresses : une seule étape (301) vers une page 200, ou 404/410 propre
const oneHop = async (from, expectTo) => {
  const r = await get(O + from);
  if (!isRedir(r.status)) return ko(from + ' : attendu 301, reçu ' + r.status);
  if (r.status !== 301 && r.status !== 308) wa(from + ' : redirection ' + r.status + ' (301 préférable)');
  const to = new URL(r.headers.get('location'), O).href;
  const t = await get(to);
  if (t.status !== 200) ko(from + ' -> ' + to + ' : ' + t.status + ' (chaîne de plus d\'une étape ou page absente)');
  if (expectTo && !to.endsWith(expectTo)) ko(from + ' -> ' + to + ' (attendu ' + expectTo + ')');
};
await oneHop('/product/t-shirt-custom', '/product/custom-tee-shirt-col-en-v/');
await oneHop('/contact-914a3d', '/contact/');
for (const d of ['/assets/', '/assets/products-sized/', '/assets']) await oneHop(d, '/products/');
for (const p of ['/products', '/contact', '/category/tops', '/product/ch_0006']) { const r = await get(O + p); if (r.status !== 308 && r.status !== 301) ko(p + ' (sans slash) : ' + r.status); else if (!new URL(r.headers.get('location'), O).href.endsWith('/')) ko(p + ' : redirection vers une forme sans slash'); }
try {
  const { readFileSync } = await import('node:fs');
  const old = JSON.parse(readFileSync(new URL('../archives/catalog.bigcartel-import.json', import.meta.url), 'utf8'));
  const list = Array.isArray(old) ? old : old.products || [];
  await pool(list, async (o) => {
    const from = '/product/' + encodeURIComponent(o.permalink);
    const r = await get(O + from + '/');
    if (isRedir(r.status)) { const t = await get(new URL(r.headers.get('location'), O).href); if (t.status !== 200) ko(from + '/ : redirige vers une page ' + t.status); }
    else if (r.status !== 200) ko(from + '/ : statut ' + r.status);
  });
} catch (e) { wa('archives BigCartel illisibles : ' + e.message); }
{ const r = await get(O + '/cette-page-n-existe-pas-xyz/'); if (r.status !== 404) ko('page inexistante : statut ' + r.status + ' au lieu de 404'); }
{ const r = await get(O + '/product/cette-piece-n-existe-pas/'); if (r.status !== 404 && r.status !== 410) ko('fiche inexistante : statut ' + r.status + ' au lieu de 404/410'); }

// 7. Doublons d'environnement
if (O === 'https://www.vgthmind.org') {
  { const r = await get('http://www.vgthmind.org/'); if (r.status !== 301 && r.status !== 308) ko('http -> https : ' + r.status); }
  { const r = await get('https://vgthmind-shop.pages.dev/product/ch_0006/'); if (r.status !== 301 && !/noindex/i.test(r.headers.get('x-robots-tag') || '')) ko('pages.dev indexable (' + r.status + ')'); }
  { const r = await get('https://vgthmind.org/'); if (r.status !== 301) wa('apex vgthmind.org : ' + r.status + ' (à régler chez IONOS : redirection permanente 301 vers https://www.vgthmind.org)'); }
  { const r = await get('https://vgthmind.github.io/shop/'); const t = await r.text(); if (!/noindex/i.test(t)) ko('github.io/shop indexable'); }
}

finish();
function finish() {
  if (process.argv.includes('--json')) console.log(JSON.stringify({ site: O, pages: locs?.length, problemes: bad, avertissements: warn }, null, 2));
  else {
    console.log(`seo:check ${O} : ${typeof locs !== 'undefined' ? locs.length : 0} pages du sitemap`);
    for (const m of warn) console.log('  avert. ' + m);
    for (const m of bad) console.log('  PROBLÈME ' + m);
    console.log(bad.length ? `${bad.length} problème(s)` : 'OK : aucun problème');
  }
  process.exit(bad.length ? 1 : 0);
}

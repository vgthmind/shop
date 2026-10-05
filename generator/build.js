#!/usr/bin/env node
// Static site generator: renders the real BigCartel Liquid templates
// (theme/*.html, copied verbatim from the BigCartel DRAFT snapshot of
// 2026-10-05, see README) against our own catalog data (data/catalog.json),
// then adds what BigCartel itself injects around them (Custom CSS + Head code
// before </head>, Body code before </body>) from theme/custom/.
//
// Everything this site needs because it is NOT BigCartel (sub-folder base
// path, static JSON endpoints, noindex) is applied HERE, at build time, so
// theme/*.html and theme/custom/* stay byte-identical to the draft.
//
// Usage: node generator/build.js

'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const liquid = require('./liquid');
const filters = require('./filters');
const translations = require('./translations');

const ROOT = path.join(__dirname, '..');
const THEME_DIR = path.join(ROOT, 'theme');
const CUSTOM_DIR = path.join(THEME_DIR, 'custom');
const PAGES_DIR = path.join(THEME_DIR, 'pages');
const DATA_DIR = path.join(ROOT, 'data');
const OUT_DIR = path.join(ROOT, 'docs');

// The real BigCartel templates hardcode root-absolute links (/, /products,
// /product/<slug>...) because BigCartel always serves a store from its domain
// root. This preview is a GitHub Pages PROJECT page (vgthmind.github.io/shop/),
// so links in the HTML get a /shop prefix here, and assets/vg-shop-shim.js
// handles what scripts build at runtime. A future move to a dedicated domain
// is just BASE_PATH = '' and a rebuild. Override with env BASE_PATH.
const BASE_PATH = process.env.BASE_PATH !== undefined ? process.env.BASE_PATH : '/shop';

// Same file the BigCartel draft loads (Body <script src> + Layout preload).
// A copy is served by this site, wrapped so it sees location.pathname without
// the /shop prefix (see wrapScript) - the code itself is not modified.
const DEV_JS_URL = 'https://vgthmind.github.io/assets/bigcartel/vg-transitions-dev.js';
const DEV_KEYWORDS_URL = 'https://vgthmind.github.io/assets/bigcartel/search-keywords.json';
const LOCAL_DEV_JS = '/assets/vg/vg-transitions-dev.js';

// BigCartel's own scripts, loaded from BigCartel's CDN exactly like the
// draft does (jQuery is from cdnjs in the layout itself). Not copied into
// this repo: they are BigCartel's code.
const BC_THEME_JS = 'https://assets.bigcartel.com/theme_assets/91/2.3.4/theme.js?v=1';
const BC_API_JS = 'https://assets.bigcartel.com/api/6/api.eur.js?v=1';
filters.setThemeJsUrls({ theme: BC_THEME_JS, api: BC_API_JS });

// Custom pages of the draft, in its order (they make the header nav:
// PRODUCTS comes from the layout, then these).
const CUSTOM_PAGES = [
  { name: 'Info & Terms', url: '/infos-conditions-generales', permalink: 'infos-conditions-generales' },
  { name: 'Contact', url: '/contact-914a3d', permalink: 'contact-914a3d' },
  { name: 'Studio', url: '/studio', permalink: 'studio' },
];

function rel(...p) { return path.join(...p); }
function read(p) { return fs.readFileSync(p, 'utf8'); }

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url + (url.includes('?') ? '&' : '?') + 'build=' + Date.now(), { headers: { 'User-Agent': 'vgthmind-shop-build/1.0' } }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`${url} -> HTTP ${res.statusCode}`)); res.resume(); return; }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// --- base path ---------------------------------------------------------
function prefixUrls(html) {
  // Pass 1: root-relative URL right after a " or ' (href="/...", src="/...",
  // action="/...", a srcset's first URL, data-*='["/..."]'). "//" (CDN,
  // protocol-relative) is left alone.
  html = html.replace(/(["'])(\s*)\/(?!\/)/g, (m, q, ws) => `${q}${ws}${BASE_PATH}/`);
  // Pass 2: a srcset's later comma-separated URLs.
  html = html.replace(/srcset="[^"]*/g, (m) => m.replace(/,(\s*)\/(?!\/)/g, (mm, sp) => `,${sp}${BASE_PATH}/`));
  return html;
}

// Applies prefixUrls to the markup but NOT inside inline <script> bodies
// (their '/'-strings are code - split('/'), regexes, '/' === pathname - and
// are handled at runtime by the shim instead). A <script src="/..."> tag
// itself is still prefixed.
function withBasePath(html) {
  if (!BASE_PATH) return html;
  const out = [];
  const re = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi;
  let last = 0; let m;
  while ((m = re.exec(html))) {
    out.push(prefixUrls(html.slice(last, m.index)));
    out.push(prefixUrls(m[1]), m[2], m[3]);
    last = re.lastIndex;
  }
  out.push(prefixUrls(html.slice(last)));
  return out.join('');
}

// Runs a script with the shim's location (pathname seen without /shop).
// `window.location` is read through the same wrapper; nothing else changes.
function wrapScript(code) {
  if (!BASE_PATH) return code;
  return '(function (location) {\n' + code.replace(/\bwindow\.location\b/g, 'location') + '\n}).call(window, window.__vgLoc || window.location);';
}

function wrapInlineScripts(html) {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
    if (/\bsrc\s*=/.test(attrs) || !body.trim()) return m;
    return `<script${attrs}>${wrapScript(body)}</script>`;
  });
}

// --- data --------------------------------------------------------------
function loadCatalog() {
  const p = rel(DATA_DIR, 'catalog.json');
  if (!fs.existsSync(p)) throw new Error(`Missing ${p} - run generator/import-catalog.js first.`);
  const c = JSON.parse(read(p));
  // BigCartel's Liquid exposes product.has_default_option (one option, no
  // option groups -> hidden input, no "Select variant" dropdown); its
  // products.json doesn't.
  for (const pr of c.products) {
    if (pr.has_default_option === undefined) pr.has_default_option = !pr.has_option_groups && (pr.options || []).length === 1;
  }
  return c;
}

const STORE_SETTINGS = JSON.parse(read(rel(THEME_DIR, 'settings.json')));

function baseTheme() {
  // settings.json plus the theme.* keys real templates read that BigCartel
  // does NOT put in settings.json (uploaded image assets).
  // Same images as the draft (BigCartel theme_images 122404563 / 142638069),
  // downloaded once into assets/theme/.
  return Object.assign({}, STORE_SETTINGS, {
    images: { logo_image: { url: '/assets/theme/logo.png', width: 1600, height: 1200 } },
    image_sets: { slideshow: [{ url: '/assets/theme/cover.png', width: 1600, height: 1600 }] },
  });
}

function baseContext(catalog) {
  return {
    theme: baseTheme(),
    store: catalog.store,
    t: translations,
    cart: { item_count: 0, total: 0, items: [] },
    pages: { custom_pages: CUSTOM_PAGES, subscribe_page: null },
    categories: { active: catalog.categories },
    __imageMap: catalog.imageMap || {},
  };
}

// products.json / product/<slug>.js as BigCartel serves them, with our local
// photos (prefixed: these are data, not passed through withBasePath).
function localizeProduct(p, imageMap) {
  const q = JSON.parse(JSON.stringify(p));
  for (const img of q.images || []) {
    if (imageMap[img.url]) img.url = BASE_PATH + imageMap[img.url];
  }
  if (q.image && imageMap[q.image.url]) q.image.url = BASE_PATH + imageMap[q.image.url];
  return q;
}

// --- head / body injections (what BigCartel adds around the templates) ---
function headContent(page, product, imageMap) {
  if (!product) return '';
  const img = product.images && product.images[0] ? (imageMap[product.images[0].url] || product.images[0].url) : '';
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return [
    `<meta property="og:type" content="product">`,
    `<meta property="og:title" content="${esc(product.name)}">`,
    `<meta property="og:description" content="${esc((product.description || '').replace(/\s+/g, ' ').slice(0, 300))}">`,
    img ? `<meta property="og:image" content="${esc(img)}">` : '',
  ].join('\n    ');
}

function injectAround(html, parts) {
  // Head: noindex + Custom CSS + Head code, right before </head> (where
  // BigCartel puts them). The shim goes first in <head>, before any script.
  const shim = `<script>window.__VG_BASE = ${JSON.stringify(BASE_PATH)};\n${parts.shim}</script>`;
  html = html.replace(/<head>/i, (m) => `${m}\n${shim}`);
  // The layout's own transition boot (arrival check: flag href vs current
  // path) must see the same /shop-less path as vg-transitions-dev.js.
  // Only that script: the theme's other inline scripts declare globals
  // (themeColors, themeOptions...) that theme.js reads.
  html = html.replace(/<script>(\s*\(function \(\) \{\s*window\.addEventListener\('pageshow'[\s\S]*?)<\/script>/, (m, body) => {
    if (!/vg-transition-boot/.test(body)) return m;
    return `<script>${wrapScript(body)}</script>`;
  });
  const headExtra = [
    '<meta name="robots" content="noindex, nofollow">',
    `<style>\n${parts.customCss}\n</style>`,
    parts.headCode,
  ].join('\n');
  html = html.replace(/<\/head>/i, () => `${headExtra}\n</head>`);
  // Body code before </body>, its dev-JS <script src> pointed at our wrapped copy.
  const body = wrapInlineScripts(parts.bodyCode).replace(
    /<script src="https:\/\/vgthmind\.github\.io\/assets\/bigcartel\/vg-transitions-dev\.js[^"]*"><\/script>/,
    `<script src="${LOCAL_DEV_JS}"></script>`);
  const i = html.lastIndexOf('</body>');
  return html.slice(0, i) + body + '\n' + html.slice(i);
}

async function main() {
  const catalog = loadCatalog();
  const imageMap = catalog.imageMap || {};
  const T = (n) => read(rel(THEME_DIR, n));
  const layoutSrc = T('layout.html');
  const src = { home: T('home.html'), products: T('products.html'), product: T('product.html'), contact: T('contact.html'), cart: T('cart.html') };
  const parts = {
    shim: read(rel(ROOT, 'assets', 'vg-shop-shim.js')),
    customCss: read(rel(CUSTOM_DIR, 'custom-css.css')),
    headCode: read(rel(CUSTOM_DIR, 'head.html')),
    bodyCode: read(rel(CUSTOM_DIR, 'body.html')),
  };

  const devJs = await download(DEV_JS_URL);
  const keywords = await download(DEV_KEYWORDS_URL);

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const base = baseContext(catalog);
  const write = (relPath, html) => {
    const dest = rel(OUT_DIR, relPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, html);
  };
  // page_title is assigned at the top of the real layout (before
  // <!DOCTYPE html>), but page templates (products.html, cart.html) print it
  // too: compute it with the layout's own preamble first.
  const preamble = layoutSrc.slice(0, layoutSrc.indexOf('<!DOCTYPE'));
  const withTitle = (ctx) => Object.assign(ctx, { page_title: liquid.render(preamble + '{{ page_title }}', ctx, filters).trim() });
  const page = (relPath, templateSrc, ctx, product) => {
    withTitle(ctx);
    const pageContent = liquid.render(templateSrc, ctx, filters);
    const layoutCtx = Object.assign({}, ctx, { page_content: pageContent, head_content: headContent(ctx.page, product, imageMap) });
    const html = liquid.render(layoutSrc, layoutCtx, filters);
    write(relPath, withBasePath(injectAround(html, parts)));
  };

  page('index.html', src.home, Object.assign({}, base, {
    page: { name: 'Home', permalink: 'home', category: 'home', full_url: '/' },
    // home.html: {% paginate products from products.current by theme.featured_products %}
    products: { current: catalog.products },
  }));
  page('products/index.html', src.products, Object.assign({}, base, {
    page: { name: 'Products', permalink: 'products', category: 'products', full_url: '/products' },
    products: { current: catalog.products },
  }));
  for (const cat of catalog.categories) {
    if (cat.permalink === 'all') continue;
    const filtered = catalog.products.filter((p) => (p.categories || []).some((c) => c.permalink === cat.permalink));
    page(`category/${cat.permalink}/index.html`, src.products, Object.assign({}, base, {
      page: { name: cat.name, permalink: cat.permalink, category: 'products', full_url: `/category/${cat.permalink}` },
      products: { current: filtered },
    }));
  }
  for (const p of catalog.products) {
    page(`product/${p.permalink}/index.html`, src.product, Object.assign({}, base, {
      page: { name: p.name, permalink: p.permalink, category: 'product', full_url: `/product/${p.permalink}` },
      product: p,
    }), p);
  }
  page('contact/index.html', src.contact, Object.assign({}, base, {
    page: { name: 'Contact', permalink: 'contact', category: 'custom', full_url: '/contact' },
  }));
  page('cart/index.html', src.cart, Object.assign({}, base, {
    page: { name: 'Cart', permalink: 'cart', category: 'cart', full_url: '/cart' },
  }));
  // Custom pages (Info & Terms, Contact, Studio): the layout renders
  // page_content itself for category 'custom' (no page template).
  for (const cp of CUSTOM_PAGES) {
    const content = read(rel(PAGES_DIR, cp.permalink + '.html'));
    const ctx = Object.assign({}, base, {
      page: { name: cp.name, permalink: cp.permalink, category: 'custom', full_url: cp.url },
    });
    const layoutCtx = Object.assign({}, ctx, { page_content: content, head_content: '' });
    write(`${cp.permalink}/index.html`, withBasePath(injectAround(liquid.render(layoutSrc, layoutCtx, filters), parts)));
  }

  // Static stand-ins for BigCartel's JSON endpoints read by the scripts:
  // /products.json (Body: home category tiles; dev JS: pops, section 3),
  // /product/<slug>.js (api.js Product.find, used by theme.js on product
  // pages), /cart.js (api.js Cart, empty until step 3).
  const localized = catalog.products.map((p) => localizeProduct(p, imageMap));
  write('products.json', JSON.stringify(localized));
  for (const p of localized) write(`product/${p.permalink}.js`, JSON.stringify(p));
  write('cart.js', JSON.stringify({ item_count: 0, items: [], price: 0, total: 0, shipping: null, discount: null }));

  // Assets: theme.css is a Liquid template too (theme.* colours/fonts).
  fs.mkdirSync(rel(OUT_DIR, 'assets', 'vg'), { recursive: true });
  write('assets/theme.css', liquid.render(T('theme.css'), base, filters));
  write('assets/vg/vg-transitions-dev.js', wrapScript(devJs));
  write('assets/vg/search-keywords.json', keywords);
  const productImagesSrc = rel(ROOT, 'assets', 'products');
  if (fs.existsSync(productImagesSrc)) fs.cpSync(productImagesSrc, rel(OUT_DIR, 'assets', 'products'), { recursive: true });
  fs.cpSync(rel(ROOT, 'assets', 'theme'), rel(OUT_DIR, 'assets', 'theme'), { recursive: true });
  fs.copyFileSync(rel(ROOT, 'robots.txt'), rel(OUT_DIR, 'robots.txt'));
  // GitHub Pages: serve files and folders starting with "_" too, no Jekyll.
  write('.nojekyll', '');

  console.log(`Built ${catalog.products.length} products, ${catalog.categories.length} categories, ${CUSTOM_PAGES.length} pages into ${OUT_DIR}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

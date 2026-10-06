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
// Same for the CSS (copied as is; its url()s are absolute): the shop no
// longer changes when the portfolio's -dev CSS is edited, only on rebuild.
const DEV_CSS_URL = 'https://vgthmind.github.io/assets/bigcartel/vg-transitions-dev.css';
const LOCAL_DEV_CSS = '/assets/vg/vg-transitions-dev.css';
let DEV_CSS_VERSION = '0'; // content hash, set in main()

// BigCartel's own scripts, loaded from BigCartel's CDN exactly like the
// draft does (jQuery is from cdnjs in the layout itself). Not copied into
// this repo: they are BigCartel's code.
const BC_THEME_JS = 'https://assets.bigcartel.com/theme_assets/91/2.3.4/theme.js?v=1';
const BC_API_JS = 'https://assets.bigcartel.com/api/6/api.eur.js?v=1';
filters.setThemeJsUrls({ theme: BC_THEME_JS, api: BC_API_JS });

// Front-end cart (step 3, see assets/vg-shop-cart.js) - minimal styling in
// the site's chrome/beige palette, additive like the rest of this file,
// never part of theme/custom/custom-css.css (byte-identical to the draft).
const CART_CSS = `
.vg-cart-unavailable{font-size:.85em;opacity:.7;margin-top:4px;}
.vg-cart-qty{margin-right:10px;padding:4px 8px;border-radius:999px;border:1px solid rgba(0,0,0,.18);background:rgba(255,255,255,.6);font:inherit;}
.vg-cart-rendered .cart-footer{display:flex;flex-direction:column;align-items:flex-end;gap:6px;}
.vg-cart-region{display:flex;align-items:center;gap:10px;margin-bottom:6px;}
.vg-cart-region select{padding:6px 12px;border-radius:999px;border:1px solid rgba(0,0,0,.18);background:rgba(255,255,255,.6);font:inherit;}
.vg-cart-line{display:flex;justify-content:space-between;gap:16px;padding:2px 0;}
.vg-cart-total{font-weight:600;}
.vg-cart-rendered .cart-subtotal__amount,.vg-cart-rendered .cart-item-price span{white-space:nowrap;}
.vg-cart-rendered .cart-subtotal{flex-wrap:nowrap;}
.vg-cart-rendered .cart-submit{margin-top:10px;}
.vg-cart-note{font-size:.85em;opacity:.75;margin-top:12px;text-align:right;}
.vg-cart-checkout-all[disabled]{opacity:.45;cursor:not-allowed;}
.vg-cart-msg{margin-top:12px;padding:10px 14px;border-radius:12px;background:rgba(255,255,255,.55);border:1px solid rgba(0,0,0,.12);}
.vg-cart-msg[hidden],.vg-order-summary[hidden]{display:none;}
.vg-order-summary{max-width:640px;margin:16px 0 24px;}
.vg-order-summary ul{list-style:none;padding:0;margin:0;}
`.trim();

// Images que le thème/Body/dev JS chargent depuis le compte BigCartel
// (assets.bigcartel.com/theme_images|product_images, liés au compte) :
// servies depuis /shop/ pour que la boutique ne dépende plus de BigCartel.
// (theme.js / api.js restent sur le CDN : fichiers génériques du thème,
// pas liés au compte.) cover+clean.png est déjà en 404 chez BigCartel :
// remplacé par la 1re photo locale du CD.
const SITE_ORIGIN_URL = 'https://vgthmind.github.io';
const BC_IMAGE_MAP = [
  [/https:\/\/assets\.bigcartel\.com\/theme_images\/142638069\/Cover\.png(\?[^"'\s)]*)?/g, () => `${SITE_ORIGIN_URL}${BASE_PATH}/assets/theme/bc/cover.png`],
  [/https:\/\/assets\.bigcartel\.com\/theme_images\/122404563\/Illustration_sans_titre\+_1_\.PNG(\?[^"'\s)]*)?/g, () => `${BASE_PATH}/assets/theme/bc/logo-illustration.png`],
  [/https:\/\/assets\.bigcartel\.com\/product_images\/405517188\/cover\+clean\.png(\?[^"'\s)]*)?/g, () => `${BASE_PATH}/assets/products/cd-vgtape/0.png`],
];
function localizeBigCartelImages(text) {
  if (typeof text !== 'string' || text.indexOf('assets.bigcartel.com') === -1) return text;
  return BC_IMAGE_MAP.reduce((t, [re, to]) => t.replace(re, to), text);
}

const FAVICON_LINKS = [
  '<link rel="icon" href="/assets/theme/favicon.svg" type="image/svg+xml">',
  '<link rel="icon" href="/assets/theme/favicon.ico" type="image/x-icon">',
  '<link rel="apple-touch-icon" href="/assets/theme/apple-touch-icon.png">',
].join('\n');

// Custom pages of the draft, in its order (they make the header nav:
// PRODUCTS comes from the layout, then these).
const CUSTOM_PAGES = [
  { name: 'Info & Terms', url: '/infos-conditions-generales', permalink: 'infos-conditions-generales' },
  { name: 'Contact', url: '/contact-914a3d', permalink: 'contact-914a3d' },
  { name: 'Studio', url: '/studio', permalink: 'studio' },
];
// Stripe Checkout return pages (success_url / cancel_url of checkout-worker/).
const SHOP_PAGES_DIR = path.join(__dirname, 'shop-pages');
const SHOP_PAGES = [
  { name: 'Thank you', url: '/merci', permalink: 'merci' },
  { name: 'Payment cancelled', url: '/paiement-annule', permalink: 'paiement-annule' },
  // GitHub Pages sert 404.html pour toute adresse inconnue sous /shop/.
  { name: 'Page not found', url: '/404', permalink: '404', out: '404.html' },
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
  const desc = esc((product.description || '').replace(/\s+/g, ' ').trim().slice(0, 300));
  return [
    `<meta name="description" content="${desc}">`,
    `<meta property="og:type" content="product">`,
    `<meta property="og:title" content="${esc(product.name)}">`,
    `<meta property="og:description" content="${desc}">`,
    img ? `<meta property="og:image" content="${esc(img)}">` : '',
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(product.name)}">`,
    `<meta name="twitter:description" content="${desc}">`,
    img ? `<meta name="twitter:image" content="${esc(img)}">` : '',
  ].join('\n    ');
}

// The real Layout's own custom code (theme/custom - see injectAround) always
// prints a STORE-WIDE description/og:description/og:image/twitter:* first
// (it has no per-product data to work with). For a product page this
// generator's own headContent() above prints the real, product-specific
// versions of the very same tags right after - keeping both would leave two
// <meta property="og:description"> etc. in the page, and which one a given
// crawler/share-preview picks is not guaranteed to be "the last one". Drop
// the generic occurrence of each tag headContent() overrides so there is
// only ever one of each - theme/custom/head.html itself is untouched.
const PRODUCT_META_OVERRIDES = ['name="description"', 'property="og:description"', 'property="og:image"', 'name="twitter:description"', 'name="twitter:image"'];
function stripGenericMeta(html, names) {
  for (const n of names) {
    html = html.replace(new RegExp(`<meta ${n}[^>]*>\\n?`), '');
  }
  return html;
}

function injectAround(html, parts, product) {
  // Head: noindex + Custom CSS + Head code, right before </head> (where
  // BigCartel puts them). The shim goes first in <head>, before any script.
  const shim = `<script>window.__VG_BASE = ${JSON.stringify(BASE_PATH)};\n${parts.shim}</script>`;
  html = html.replace(/<head>/i, (m) => `${m}\n${shim}`);
  // Favicon : les memes fichiers que vgthmind.bigcartel.com (copies dans
  // assets/theme/ ; BigCartel les sert hors gabarit).
  html = html.replace(/<\/head>/i, (m) => `${FAVICON_LINKS}\n${m}`);
  // See headContent()/PRODUCT_META_OVERRIDES above: a product page already
  // got its real description/og/twitter tags from {{ head_content }}
  // (rendered into `html` by layout.html before this function runs) -
  // drop the store-wide ones the Layout's own custom code prints first, so
  // share previews/crawlers see the product's own, not the generic ones.
  if (product) html = stripGenericMeta(html, PRODUCT_META_OVERRIDES);
  // The real layout has no <html> tag (BigCartel's neither), so no page
  // language: Safari iPhone guesses one and offers "Translation available"
  // on every load. Declare English (the shop's main language) and opt out of
  // translation (the pages already have their own English / French parts).
  html = html.replace(/<!DOCTYPE html>/i, (m) => `${m}\n<html lang="en" translate="no">`);
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
    // vg-transitions-dev.css hides the menu's Home link with
    // a[href="/"]; here that link is /shop/, so Home stayed in the mobile
    // menu, which then grew taller than the screen on iPhone and its
    // bottom (categories) scrolled past the glass background. Same rule,
    // its "/" gets the /shop prefix from withBasePath like every URL here.
    BASE_PATH ? '<style>body #navigation-modal .page_list li:has(> a[href="/"]){display:none !important;}</style>' : '',
    // The "← Produits" link is in the HTML from the start (see page()); its
    // style, taken from the Body, must be there from the first paint too.
    `<style>\n${(parts.bodyCode.match(/^\.vg-back-link[^{\n]*\{[^}\n]*\}$/gm) || []).join('\n')}\n</style>`,
    // Front-end cart (step 3, see assets/vg-shop-cart.js) - additive, not
    // part of the real draft's Custom CSS.
    `<style>${CART_CSS}</style>`,
  ].join('\n');
  html = html.replace(/<\/head>/i, () => `${headExtra}\n</head>`);
  // The Layout's <link rel="preload"> must name the file the Body really
  // runs (our wrapped copy), as on BigCartel. Left on vgthmind.github.io it
  // preloaded a file nobody runs: our copy was only fetched after jQuery /
  // api.js / theme.js, so on iPhone the Body scripts (the "← Produits" link
  // above the product title...) ran well after the arrival and the title
  // and price jumped.
  html = html.replace(
    /(<link rel="preload" as="script" href=")https:\/\/vgthmind\.github\.io\/assets\/bigcartel\/vg-transitions-dev\.js[^"]*(")/,
    (m, a, b) => `${a}${LOCAL_DEV_JS}${b}`);
  html = html.replace(
    /https:\/\/vgthmind\.github\.io\/assets\/bigcartel\/vg-transitions-dev\.css\?v=[^"]*/g,
    () => `${LOCAL_DEV_CSS}?v=${DEV_CSS_VERSION}`);
  // Body code before </body>, its dev-JS <script src> pointed at our wrapped copy.
  const body = wrapInlineScripts(parts.bodyCode).replace(
    /<script src="https:\/\/vgthmind\.github\.io\/assets\/bigcartel\/vg-transitions-dev\.js[^"]*"><\/script>/,
    `<script src="${LOCAL_DEV_JS}"></script>`);
  // Front-end cart, after the Body/dev-JS scripts (step 3, see
  // assets/vg-shop-cart.js - not part of the real draft).
  const cartScript = '<script src="/assets/vg-shop-cart.js" defer></script>';
  const i = html.lastIndexOf('</body>');
  return html.slice(0, i) + body + '\n' + cartScript + '\n' + html.slice(i);
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
  const devCss = await download(DEV_CSS_URL);
  DEV_CSS_VERSION = require('crypto').createHash('sha1').update(devCss).digest('hex').slice(0, 10);
  const keywords = await download(DEV_KEYWORDS_URL);

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const base = baseContext(catalog);
  const write = (relPath, html) => {
    const dest = rel(OUT_DIR, relPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, localizeBigCartelImages(html));
  };
  // page_title is assigned at the top of the real layout (before
  // <!DOCTYPE html>), but page templates (products.html, cart.html) print it
  // too: compute it with the layout's own preamble first.
  const preamble = layoutSrc.slice(0, layoutSrc.indexOf('<!DOCTYPE'));
  const withTitle = (ctx) => Object.assign(ctx, { page_title: liquid.render(preamble + '{{ page_title }}', ctx, filters).trim() });
  const page = (relPath, templateSrc, ctx, product) => {
    withTitle(ctx);
    let pageContent = liquid.render(templateSrc, ctx, filters);
    // The Body adds a "← Produits" link above the title of category and
    // product pages, but only once its scripts run (after jQuery / api.js /
    // theme.js): on iPhone that is after the arrival, and the title and price
    // jumped. Same link, in the HTML from the start (the Body script sees it
    // and adds nothing).
    if (/^(category|product)\//.test(relPath)) {
      pageContent = pageContent.replace(/<h1\b/, '<a class="vg-back-link" href="/products">← Produits</a>$&');
    }
    const layoutCtx = Object.assign({}, ctx, { page_content: pageContent, head_content: headContent(ctx.page, product, imageMap) });
    const html = liquid.render(layoutSrc, layoutCtx, filters);
    write(relPath, withBasePath(injectAround(html, parts, product)));
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
    // "all" is a real page too (/category/all) - every product's categories
    // list already includes it (see generator/build-catalog.js), and the
    // nav (categories.active, theme/layout.html) links to it like any
    // other category: skipping it here left a 404'ing "ALL" link in the
    // header/footer/mobile menu on every single page (found by checking
    // every generated href against the actual docs/ output, not assumed).
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
  // /contact (formulaire natif BigCartel, sans backend ici) : renvoie vers
  // la vraie page Contact (Instagram + e-mail), celle de la navigation.
  const contactUrl = `${BASE_PATH}/contact-914a3d`;
  write('contact/index.html', '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex">'
    + `<meta http-equiv="refresh" content="0;url=${contactUrl}"><link rel="canonical" href="${contactUrl}">`
    + `<title>Contact | vgthmind</title><a href="${contactUrl}">Contact</a>`);
  page('cart/index.html', src.cart, Object.assign({}, base, {
    page: { name: 'Cart', permalink: 'cart', category: 'cart', full_url: '/cart' },
  }));
  // Custom pages (Info & Terms, Contact, Studio): the layout renders
  // page_content itself for category 'custom' (no page template).
  // + the checkout return pages (not in the draft, not in the nav): same
  // rendering, content in generator/shop-pages/, filled by vg-shop-cart.js.
  const pageSources = [
    ...CUSTOM_PAGES.map((cp) => Object.assign({ file: rel(PAGES_DIR, cp.permalink + '.html') }, cp)),
    ...SHOP_PAGES.map((sp) => Object.assign({ file: rel(SHOP_PAGES_DIR, sp.permalink + '.html') }, sp)),
  ];
  for (const cp of pageSources) {
    const content = read(cp.file);
    const ctx = Object.assign({}, base, {
      page: { name: cp.name, permalink: cp.permalink, category: 'custom', full_url: cp.url },
    });
    const layoutCtx = Object.assign({}, ctx, { page_content: content, head_content: '' });
    write(cp.out || `${cp.permalink}/index.html`, withBasePath(injectAround(liquid.render(layoutSrc, layoutCtx, filters), parts)));
  }

  // Static stand-ins for BigCartel's JSON endpoints read by the scripts:
  // /products.json (Body: home category tiles; dev JS: pops, section 3),
  // /product/<slug>.js (api.js Product.find, used by theme.js on product
  // pages - also read directly by assets/vg-shop-cart.js on add-to-cart),
  // /cart.js (api.js Cart - our own cart lives in localStorage instead,
  // see vg-shop-cart.js, this stays empty/unused but is kept since
  // theme.js/api.js, BigCartel's real scripts, may still request it).
  const localized = catalog.products.map((p) => localizeProduct(p, imageMap));
  write('products.json', JSON.stringify(localized));
  for (const p of localized) write(`product/${p.permalink}.js`, JSON.stringify(p));
  write('cart.js', JSON.stringify({ item_count: 0, items: [], price: 0, total: 0, shipping: null, discount: null }));

  // Assets: theme.css is a Liquid template too (theme.* colours/fonts).
  fs.mkdirSync(rel(OUT_DIR, 'assets', 'vg'), { recursive: true });
  write('assets/theme.css', liquid.render(T('theme.css'), base, filters));
  // Seul ajout au code du fichier : sized() (taille ?w= demandée au CDN
  // BigCartel) passe d'abord par window.__vgSized (shim : variante WebP
  // locale). Si le motif change côté portfolio, la copie reste telle quelle.
  const SIZED_HOOK = /function sized\(url, px\) \{\r?\n/;
  if (!SIZED_HOOK.test(devJs)) console.warn('build: sized() introuvable dans vg-transitions-dev.js, photos des pops en taille d\'origine');
  const devJsHooked = devJs.replace(SIZED_HOOK,
    (m) => `${m}    if (window.__vgSized) { var vgS = window.__vgSized(url, px); if (vgS) return vgS; }\n`);
  write('assets/vg/vg-transitions-dev.js', wrapScript(devJsHooked));
  write('assets/vg/vg-transitions-dev.css', devCss);
  // Mots-clés de recherche : fichier commun du portfolio + ceux saisis dans
  // l'admin pour chaque pièce (champ « Mots-clés de recherche »).
  const mergedKeywords = JSON.parse(keywords);
  for (const p of catalog.products) {
    const extra = (p.search_keywords || []).map((k) => String(k).trim()).filter(Boolean);
    if (extra.length) mergedKeywords[p.permalink] = [...new Set([...(mergedKeywords[p.permalink] || []), ...extra])];
  }
  write('assets/vg/search-keywords.json', JSON.stringify(mergedKeywords, null, 1));
  fs.copyFileSync(rel(ROOT, 'assets', 'vg-shop-cart.js'), rel(OUT_DIR, 'assets', 'vg-shop-cart.js'));
  const productImagesSrc = rel(ROOT, 'assets', 'products');
  if (fs.existsSync(productImagesSrc)) fs.cpSync(productImagesSrc, rel(OUT_DIR, 'assets', 'products'), { recursive: true });
  // Product photo widths (generator/resize-images.js), used by `constrain`.
  const sizedSrc = rel(ROOT, 'assets', 'products-sized');
  if (fs.existsSync(sizedSrc)) fs.cpSync(sizedSrc, rel(OUT_DIR, 'assets', 'products-sized'), { recursive: true });
  fs.cpSync(rel(ROOT, 'assets', 'theme'), rel(OUT_DIR, 'assets', 'theme'), { recursive: true });
  fs.copyFileSync(rel(ROOT, 'robots.txt'), rel(OUT_DIR, 'robots.txt'));
  // Admin (Sveltia CMS) : servi tel quel sous /shop/admin/ (page + config +
  // pages maison), jamais passé par le préfixe /shop (Sveltia lit
  // config.yml à côté de la page).
  fs.cpSync(rel(ROOT, 'admin'), rel(OUT_DIR, 'admin'), { recursive: true });

  // sitemap.xml - inert for now (robots.txt still has "Disallow: /" until
  // this is the official shop, see robots.txt), ready for launch day: a
  // crawler that ignores robots.txt entirely still gets correct, absolute
  // URLs rather than nothing.
  const SITE_ORIGIN = 'https://vgthmind.github.io';
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    `${BASE_PATH}/`, `${BASE_PATH}/products`,
    ...catalog.categories.map((c) => `${BASE_PATH}/category/${c.permalink}`),
    ...catalog.products.map((p) => `${BASE_PATH}${p.url}`),
    ...CUSTOM_PAGES.map((cp) => `${BASE_PATH}${cp.url}`),
  ];
  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => `  <url><loc>${SITE_ORIGIN}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')
    + '\n</urlset>\n';
  write('sitemap.xml', sitemap);

  // GitHub Pages: serve files and folders starting with "_" too, no Jekyll.
  write('.nojekyll', '');

  console.log(`Built ${catalog.products.length} products, ${catalog.categories.length} categories, ${CUSTOM_PAGES.length} pages into ${OUT_DIR}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

#!/usr/bin/env node
// Static site generator: renders the real BigCartel Liquid templates
// (theme/*.html) against our own catalog data (data/catalog.json) into
// plain HTML files, so the DOM matches closely enough that
// vg-transitions-dev.js/.css (loaded unmodified, same URL as the BigCartel
// draft) work without changes.
//
// NOT a faithful reproduction of the CURRENT BigCartel draft yet - see
// generator/README.md "État et limites connues" for the two blocking gaps
// (stale theme snapshot, no catalog import run against live data).
//
// Usage: node generator/build.js

'use strict';
const fs = require('fs');
const path = require('path');
const liquid = require('./liquid');
const filters = require('./filters');
const translations = require('./translations');

const ROOT = path.join(__dirname, '..');
const THEME_DIR = path.join(ROOT, 'theme');
const DATA_DIR = path.join(ROOT, 'data');
const OUT_DIR = path.join(ROOT, 'docs');

// The real BigCartel templates hardcode root-absolute links (/, /products,
// /contact, /cart, /assets/site.js, {{ product.url }} -> /product/<slug>...)
// because BigCartel always serves a store from its domain root. This site is
// deployed as a GitHub Pages PROJECT page instead (vgthmind.github.io/shop/,
// not the repo root), so every one of those needs a /shop prefix to resolve.
// Kept as a build-time constant (not baked into theme/*.html, which stays a
// faithful copy of the real templates) so a future move to a dedicated
// domain is just BASE_PATH = '' and a rebuild. Override with env BASE_PATH.
const BASE_PATH = process.env.BASE_PATH !== undefined ? process.env.BASE_PATH : '/shop';

function withBasePath(html) {
  if (!BASE_PATH) return html;
  // Pass 1: every root-relative URL quoted right after a " or ' - covers
  // href="/...", src="/...", action="/...", a srcset's first URL, and
  // JSON-literal entries like data-image-urls='["/assets/..."]'. "//"
  // (protocol-relative CDN URLs, e.g. cdnjs) is left alone by the
  // lookahead.
  html = html.replace(/(["'])(\s*)\/(?!\/)/g, (m, q, ws) => `${q}${ws}${BASE_PATH}/`);
  // Pass 2: a srcset's later comma-separated URLs aren't preceded by a
  // quote (one attribute value, bare "url Nw" entries joined by ", "), so
  // they need their own rewrite, scoped to inside srcset="..." only.
  html = html.replace(/srcset="[^"]*/g, (m) => m.replace(/,(\s*)\/(?!\/)/g, (mm, sp) => `,${sp}${BASE_PATH}/`));
  return html;
}

function readTheme(name) {
  return fs.readFileSync(path.join(THEME_DIR, name), 'utf8');
}

function loadCatalog() {
  const p = path.join(DATA_DIR, 'catalog.json');
  if (!fs.existsSync(p)) {
    throw new Error(`Missing ${p} - run generator/import-catalog.js (live) or the dev fixture first.`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const STORE_SETTINGS = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'settings.json'), 'utf8'));

function baseTheme() {
  // settings.json plus the handful of theme.* keys real templates read that
  // BigCartel does NOT put in settings.json (uploaded image assets) -
  // defaulted to "none configured" so the layout takes its text-logo /
  // no-slideshow branches instead of crashing on undefined.
  return Object.assign({}, STORE_SETTINGS, {
    images: { logo_image: null },
    image_sets: { slideshow: [] },
  });
}

const CUSTOM_PAGES = [
  { name: 'Info & Terms', url: '/infos-conditions-generales', permalink: 'infos-conditions-generales' },
  { name: 'Studio', url: '/studio', permalink: 'studio' },
];

function baseContext(catalog) {
  return {
    theme: baseTheme(),
    store: catalog.store,
    t: translations,
    cart: { item_count: 0, total: 0 },
    pages: { custom_pages: CUSTOM_PAGES, subscribe_page: null },
    categories: { active: catalog.categories },
    __imageMap: catalog.imageMap || {},
  };
}

function renderPage(templateName, pageCtx, layoutSrc, pageTemplateSrc) {
  const pageContent = liquid.render(pageTemplateSrc, pageCtx, filters);
  const layoutCtx = Object.assign({}, pageCtx, { page_content: pageContent });
  return liquid.render(layoutSrc, layoutCtx, filters);
}

function write(relPath, html) {
  const dest = path.join(OUT_DIR, relPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, withBasePath(html));
  console.log('  wrote', relPath);
}

function main() {
  const catalog = loadCatalog();
  const layoutSrc = readTheme('layout.html');
  const homeSrc = readTheme('home.html');
  const productsSrc = readTheme('products.html');
  const productSrc = readTheme('product.html');
  const contactSrc = readTheme('contact.html');

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const base = baseContext(catalog);

  // Home
  {
    const ctx = Object.assign({}, base, {
      page: { name: 'Home', permalink: 'home', category: 'home', full_url: '/' },
      featured_products: catalog.products.slice(0, 8),
    });
    write('index.html', renderPage('home', ctx, layoutSrc, homeSrc));
  }

  // Products (all)
  {
    const ctx = Object.assign({}, base, {
      page: { name: 'Products', permalink: 'products', category: 'products', full_url: '/products' },
      products: { current: catalog.products },
    });
    write('products/index.html', renderPage('products', ctx, layoutSrc, productsSrc));
  }

  // Category pages
  for (const cat of catalog.categories) {
    if (cat.permalink === 'all') continue; // "all" == /products itself
    const filtered = catalog.products.filter((p) => (p.categories || []).some((c) => c.permalink === cat.permalink));
    const ctx = Object.assign({}, base, {
      page: { name: cat.name, permalink: cat.permalink, category: 'products', full_url: `/category/${cat.permalink}` },
      products: { current: filtered },
    });
    write(`category/${cat.permalink}/index.html`, renderPage('products', ctx, layoutSrc, productsSrc));
  }

  // Product pages
  for (const p of catalog.products) {
    const ctx = Object.assign({}, base, {
      page: { name: p.name, permalink: p.permalink, category: 'product', full_url: `/product/${p.permalink}` },
      product: p,
    });
    write(`product/${p.permalink}/index.html`, renderPage('product', ctx, layoutSrc, productSrc));
  }

  // Contact (static text - real form has no backend yet, see README)
  {
    const ctx = Object.assign({}, base, {
      page: { name: 'Contact', permalink: 'contact', category: 'custom', full_url: '/contact' },
      page_content: '',
    });
    write('contact/index.html', renderPage('contact', ctx, layoutSrc, contactSrc));
  }

  // theme.css is copied through as-is for now (see README); assets/site.js
  // is OUR OWN script (not from BigCartel), copied from the repo's own
  // assets/ source dir, not the theme/ one. assets/products/ is what
  // import-catalog.js downloaded - OUT_DIR (docs/) is the actual GitHub
  // Pages publish root, so the generated pages' image URLs only resolve
  // once the photos are copied into it too, not just left at the repo root.
  fs.mkdirSync(path.join(OUT_DIR, 'assets'), { recursive: true });
  fs.copyFileSync(path.join(THEME_DIR, 'theme.css'), path.join(OUT_DIR, 'assets', 'theme.css'));
  fs.copyFileSync(path.join(ROOT, 'assets', 'site.js'), path.join(OUT_DIR, 'assets', 'site.js'));
  const productImagesSrc = path.join(ROOT, 'assets', 'products');
  if (fs.existsSync(productImagesSrc)) {
    fs.cpSync(productImagesSrc, path.join(OUT_DIR, 'assets', 'products'), { recursive: true });
  }

  // robots.txt at the repo root is never served by GitHub Pages - only
  // docs/ (the configured publish root) is. Without this copy the
  // Disallow: / this repo's README documents as "already in place" simply
  // isn't, on the actual live site.
  fs.copyFileSync(path.join(ROOT, 'robots.txt'), path.join(OUT_DIR, 'robots.txt'));

  console.log(`\nBuilt ${catalog.products.length} products, ${catalog.categories.length} categories into ${OUT_DIR}`);
}

main();

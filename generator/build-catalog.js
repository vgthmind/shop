#!/usr/bin/env node
// Turns the admin-editable catalog (data/products/*.json, one file per
// piece - what Sveltia CMS reads and writes, see admin/config.yml) into
// data/catalog.json, the BigCartel-shaped catalog generator/build.js
// consumes. This replaces generator/import-catalog.js in the regular build
// pipeline: the live BigCartel catalog was only ever a one-time starting
// point (see generator/migrate-to-admin-products.js), the admin files are
// now the source of truth. import-catalog.js still exists as a manual
// "re-seed from the live BigCartel store" tool, never run automatically.
//
// Usage: node generator/build-catalog.js

'use strict';
const fs = require('fs');
const path = require('path');
const { normalize } = require('./normalize-catalog');
const { sizeOf } = require('./image-size');

const ROOT = path.join(__dirname, '..');
const PRODUCTS_DIR = path.join(ROOT, 'data', 'products');
const CATEGORIES_PATH = path.join(ROOT, 'data', 'categories.json');
const CATALOG_PATH = path.join(ROOT, 'data', 'catalog.json');

const CATEGORIES = JSON.parse(fs.readFileSync(CATEGORIES_PATH, 'utf8'));
const byPermalink = new Map(CATEGORIES.map((c) => [c.permalink, c]));
const ALL = byPermalink.get('all');
const LATEST_DROP = byPermalink.get('latest-drop');

// Stable numeric id from a slug, so rebuilding doesn't reshuffle ids for
// unrelated reasons (nothing in this generator keys off them across builds,
// but BigCartel's own JSON shape expects every object to have one).
function idFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

function imageDims(localPath) {
  const abs = path.join(ROOT, localPath.replace(/^\//, ''));
  if (fs.existsSync(abs)) {
    try {
      const d = sizeOf(abs);
      if (d) return d;
    } catch (e) { /* fall through to the default below */ }
  }
  console.warn(`  (avertissement) dimensions introuvables pour ${localPath}, repli 1000x1000`);
  return { width: 1000, height: 1000 };
}

function buildProduct(admin, imageMap) {
  if (!admin.name || !admin.slug) throw new Error(`Produit sans nom/slug: ${JSON.stringify(admin)}`);
  const realCats = admin.categories || [];
  if (realCats.length === 0) throw new Error(`Produit "${admin.name}": aucune categorie (data/products/${admin.slug}.json)`);
  for (const perm of realCats) {
    if (!byPermalink.has(perm)) throw new Error(`Produit "${admin.name}": categorie "${perm}" inconnue (voir data/categories.json)`);
  }
  const images = (admin.images || []).map((url) => {
    const dims = imageDims(url);
    imageMap[url] = url; // identity: already-local paths, see generator/filters.js productImageUrl()
    return Object.assign({ url }, dims);
  });
  const categories = [...realCats.map((perm) => byPermalink.get(perm)), ALL];
  if (admin.latest_drop) categories.push(LATEST_DROP);

  // quantity: pieces in stock (1 = one-of-a-kind, the default). 0 = sold out
  // too, so the checkout Worker can count a small series down to zero.
  const quantity = Number.isInteger(admin.quantity) && admin.quantity >= 0 ? admin.quantity : 1;
  const inStock = admin.in_stock !== false && quantity > 0;
  const optionId = idFrom(admin.slug + ':option');
  return {
    id: idFrom(admin.slug),
    name: admin.name,
    permalink: admin.slug,
    position: admin.position != null ? admin.position : 0,
    // BigCartel's own API percent-encodes this field even though permalink
    // stays raw UTF-8 (verified on the live catalog: short-coupe-évasée's
    // permalink is unencoded, its url is /product/short-coupe-%C3%A9vas%C3%A9e)
    url: `/product/${encodeURIComponent(admin.slug)}`,
    status: inStock ? 'active' : 'sold-out',
    created_at: admin.created_at || new Date().toISOString(),
    has_password_protection: false,
    images,
    price: admin.price,
    default_price: admin.price,
    tax: 0,
    on_sale: false,
    description: admin.description || '',
    has_option_groups: false,
    options: [{
      id: optionId,
      name: admin.name,
      price: admin.price,
      sold_out: !inStock,
      has_custom_price: false,
      option_group_values: [],
      isLowInventory: inStock,
      isAlmostSoldOut: false,
    }],
    artists: [],
    categories,
    option_groups: [],
    // ships_intl:false = France only (no "everywhere else" line, as on
    // BigCartel for SC_0008/SC_0009): the cart and the checkout Worker
    // refuse these pieces for an international delivery.
    shipping: [
      { amount_alone: admin.shipping_fr || 0, amount_with_others: 0, country: { id: 15, name: 'France', code: 'FR' } },
      ...(admin.ships_intl === false ? [] : [{ amount_alone: admin.shipping_intl != null ? admin.shipping_intl : (admin.shipping_fr || 0), amount_with_others: 0 }]),
    ],
    // Not part of BigCartel's own shape: read by the front-end cart
    // (assets/vg-shop-cart.js) and left out of nothing templates render.
    stripe_payment_link: admin.stripe_payment_link || '',
    // Also ours: read by the cart (max per order) and the checkout Worker.
    quantity: inStock ? quantity : 0,
    // Merged into search-keywords.json by build.js (site search).
    search_keywords: Array.isArray(admin.keywords) ? admin.keywords : [],
  };
}

function main() {
  if (!fs.existsSync(PRODUCTS_DIR)) throw new Error(`Manquant: ${PRODUCTS_DIR}`);
  const files = fs.readdirSync(PRODUCTS_DIR).filter((f) => f.endsWith('.json'));
  const imageMap = {};
  const admins = files.map((f) => JSON.parse(fs.readFileSync(path.join(PRODUCTS_DIR, f), 'utf8')));
  const products = admins
    .map((a) => buildProduct(a, imageMap))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

  const catalog = normalize(products, { source: 'data/products/*.json (admin)', fetchedAt: new Date().toISOString() });
  // normalize() discovers categories in first-seen order while scanning
  // products, which depends on product/category array order and would
  // reshuffle the nav menu for no reason (e.g. "Latest Drop" ending up
  // after "Tops"). Pin it to data/categories.json's own order instead -
  // the one the header/mobile menu (theme/layout.html, categories.active)
  // actually shows - keeping only categories at least one product uses.
  const used = new Set(catalog.categories.map((c) => c.permalink));
  catalog.categories = CATEGORIES.filter((c) => used.has(c.permalink));
  catalog.imageMap = imageMap;

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  console.log(`Wrote ${CATALOG_PATH} (${catalog.products.length} produits, ${catalog.categories.length} categories) depuis ${files.length} fichier(s) admin.`);
}

main();

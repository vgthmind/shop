#!/usr/bin/env node
// One-off migration: turns the current data/catalog.json (built by the live
// BigCartel import, generator/import-catalog.js) into one admin-editable
// file per product under data/products/ - the shape generator/build-catalog.js
// reads and Sveltia CMS (admin/) edits from now on. Run once; not part of
// the regular build.
//
// Usage: node generator/migrate-to-admin-products.js

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// The original BigCartel-imported catalog (generator/import-catalog.js),
// kept untouched on disk so this migration can be re-run/audited later -
// data/catalog.json itself is now generator/build-catalog.js's output.
const CATALOG_PATH = process.argv[2] || path.join(ROOT, 'data', 'catalog.bigcartel-import.json');
const PRODUCTS_DIR = path.join(ROOT, 'data', 'products');

function shippingFor(p) {
  const fr = (p.shipping || []).find((s) => s.country && s.country.code === 'FR');
  const intl = (p.shipping || []).find((s) => !s.country);
  return {
    shipping_fr: fr ? fr.amount_alone : 0,
    shipping_intl: intl ? intl.amount_alone : (fr ? fr.amount_alone : 0),
  };
}

function realCategories(p) {
  // A piece can be in more than one real category at once (e.g. CH_0004 is
  // both "Tops" and "Customs/Upcycling") - "All" and "Latest Drop" are
  // handled separately (implicit / the latest_drop flag).
  return (p.categories || []).map((c) => c.permalink).filter((perm) => perm !== 'all' && perm !== 'latest-drop');
}

function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  fs.mkdirSync(PRODUCTS_DIR, { recursive: true });

  // The stale example entry from the abandoned first prototype (pre-"Nouveau
  // plan") doesn't belong in the real catalog.
  const stale = path.join(PRODUCTS_DIR, 'exemple-sacoche.json');
  if (fs.existsSync(stale)) fs.rmSync(stale);

  let count = 0;
  for (const p of catalog.products) {
    // product.status is the real BigCartel source of truth for the "Sold
    // out" badge (theme/products.html, product.html) - NOT always the same
    // as the single option's sold_out flag (found 2 real mismatches in the
    // live catalog: SMA_0002 and Custom Hoodie are status "sold-out" with
    // option.sold_out still false).
    const inStock = p.status !== 'sold-out';
    const admin = {
      name: p.name,
      slug: p.permalink,
      price: p.price,
      description: p.description || '',
      images: (p.images || []).map((img) => (catalog.imageMap && catalog.imageMap[img.url]) || img.url),
      categories: realCategories(p),
      latest_drop: (p.categories || []).some((c) => c.permalink === 'latest-drop'),
      unique: true,
      in_stock: inStock,
      position: p.position || 0,
      created_at: p.created_at,
      stripe_payment_link: '',
      ...shippingFor(p),
    };
    fs.writeFileSync(path.join(PRODUCTS_DIR, `${p.permalink}.json`), JSON.stringify(admin, null, 2) + '\n');
    count++;
  }
  console.log(`Ecrit ${count} fichier(s) dans ${PRODUCTS_DIR}.`);
}

main();

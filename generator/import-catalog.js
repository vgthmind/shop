#!/usr/bin/env node
// Imports the live BigCartel catalog: fetches /products.json, downloads
// every product image into assets/products/<permalink>/, and writes
// data/catalog.json in the shape generator/build.js expects.
//
// NOT RUN YET from the cloud session that wrote this file: this sandbox's
// network egress proxy blocks vgthmind.bigcartel.com and
// assets.bigcartel.com outright (org policy, confirmed via two independent
// paths - see the chat message this was reported in). Run this from an
// environment that can actually reach BigCartel (vgthmind' local machine, or a
// cloud session with that host allow-listed in its network settings).
//
// Usage: node generator/import-catalog.js [--store-url https://vgthmind.bigcartel.com]

'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const STORE_URL = (process.argv.find((a) => a.startsWith('--store-url=')) || '').split('=')[1]
  || 'https://vgthmind.bigcartel.com';

const ROOT = path.join(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'assets', 'products');
const CATALOG_PATH = path.join(ROOT, 'data', 'catalog.json');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'vgthmind-shop-importer/1.0' } }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`${url} -> HTTP ${res.statusCode}`)); res.resume(); return; }
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const file = fs.createWriteStream(destPath);
    https.get(url, { headers: { 'User-Agent': 'vgthmind-shop-importer/1.0' } }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`${url} -> HTTP ${res.statusCode}`)); res.resume(); return; }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (e) => { fs.unlink(destPath, () => {}); reject(e); });
  });
}

function extFromUrl(u) {
  const m = u.match(/\.(png|jpe?g|webp|gif)(\?|$)/i);
  return m ? m[1].toLowerCase() : 'jpg';
}

async function main() {
  console.log(`Fetching ${STORE_URL}/products.json ...`);
  const products = await fetchJson(`${STORE_URL}/products.json`);
  console.log(`Got ${products.length} products.`);

  const imageMap = {}; // remote url -> local path (relative, e.g. /assets/products/ch_0002/0.png)
  let downloaded = 0;
  for (const p of products) {
    for (let i = 0; i < (p.images || []).length; i++) {
      const img = p.images[i];
      const ext = extFromUrl(img.url);
      const localRel = `/assets/products/${p.permalink}/${i}.${ext}`;
      const localAbs = path.join(ROOT, localRel);
      if (!fs.existsSync(localAbs)) {
        console.log(`  downloading ${img.url} -> ${localRel}`);
        await downloadFile(img.url, localAbs);
        downloaded++;
      }
      imageMap[img.url] = localRel;
    }
  }
  console.log(`Downloaded ${downloaded} new image(s).`);

  const { normalize } = require('./normalize-catalog');
  const catalog = normalize(products, { source: `${STORE_URL}/products.json`, fetchedAt: new Date().toISOString() });
  catalog.imageMap = imageMap;

  fs.mkdirSync(path.dirname(CATALOG_PATH), { recursive: true });
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  console.log(`Wrote ${CATALOG_PATH} (${catalog.products.length} products, ${catalog.categories.length} categories).`);
}

main().catch((e) => { console.error(e); process.exit(1); });

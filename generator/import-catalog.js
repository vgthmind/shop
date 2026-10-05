#!/usr/bin/env node
// Imports the live BigCartel catalog: fetches /products.json, downloads
// every product image into assets/products/<permalink>/, and writes
// data/catalog.json in the shape generator/build.js expects.
//
// Usage: node generator/import-catalog.js [--store-url https://vgthmind.bigcartel.com]

'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const tls = require('tls');

const STORE_URL = (process.argv.find((a) => a.startsWith('--store-url=')) || '').split('=')[1]
  || 'https://vgthmind.bigcartel.com';

const ROOT = path.join(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'assets', 'products');
const CATALOG_PATH = path.join(ROOT, 'data', 'catalog.json');

// Node's https module does not honor HTTPS_PROXY on its own (unlike curl),
// and this sandbox requires outbound HTTPS to go through its local proxy.
// This Agent tunnels TLS connections through that proxy via HTTP CONNECT.
const PROXY_URL = process.env.HTTPS_PROXY || process.env.https_proxy || null;

class ConnectProxyAgent extends https.Agent {
  constructor(proxyUrl, options) {
    super(options);
    this.proxyUrl = new URL(proxyUrl);
  }
  createConnection(options, callback) {
    const proxyReq = http.request({
      host: this.proxyUrl.hostname,
      port: this.proxyUrl.port || 80,
      method: 'CONNECT',
      path: `${options.host}:${options.port || 443}`,
    });
    proxyReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        callback(new Error(`Proxy CONNECT to ${options.host} failed: HTTP ${res.statusCode}`));
        return;
      }
      const tlsSocket = tls.connect({ socket, servername: options.servername || options.host }, () => callback(null, tlsSocket));
      tlsSocket.on('error', callback);
    });
    proxyReq.on('error', callback);
    proxyReq.end();
  }
}

const proxyAgent = PROXY_URL ? new ConnectProxyAgent(PROXY_URL) : undefined;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { agent: proxyAgent, headers: { 'User-Agent': 'vgthmind-shop-importer/1.0' } }, (res) => {
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
    https.get(url, { agent: proxyAgent, headers: { 'User-Agent': 'vgthmind-shop-importer/1.0' } }, (res) => {
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

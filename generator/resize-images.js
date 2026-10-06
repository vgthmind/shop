// Product photos in several widths (WebP, transparency kept), like the
// BigCartel CDN served them (?w=…): assets/products/<slug>/<n>.png ->
// assets/products-sized/<width>/<slug>/<n>.webp. Kept in the repo as a
// cache: only new or changed photos are processed (the GitHub Action runs
// this before build.js). generator/filters.js `constrain` picks the
// smallest width >= the one the template asks for.

'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'products');
const OUT = path.join(ROOT, 'assets', 'products-sized');
const WIDTHS = [24, 320, 540, 800]; // originals are ~1000 px: above 800, the original

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : (/\.(png|jpe?g|webp)$/i.test(d.name) ? [p] : []);
  });
}

async function main() {
  const files = walk(SRC);
  const wanted = new Set();
  let made = 0;
  for (const src of files) {
    const rel = path.relative(SRC, src).replace(/\.[^.]+$/, '.webp');
    const srcTime = fs.statSync(src).mtimeMs;
    for (const w of WIDTHS) {
      const dest = path.join(OUT, String(w), rel);
      wanted.add(dest);
      if (fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= srcTime) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      await sharp(src).resize({ width: w, withoutEnlargement: true }).webp({ quality: w <= 24 ? 40 : 80, alphaQuality: 90 }).toFile(dest);
      made++;
    }
  }
  // Photos removed from the catalog: drop their variants too.
  let removed = 0;
  for (const f of walk(OUT)) {
    if (!wanted.has(f)) { fs.unlinkSync(f); removed++; }
  }
  console.log(`Images : ${files.length} photos, ${made} variantes creees, ${removed} supprimees (${WIDTHS.join('/')} px).`);
}

main().catch((e) => { console.error(e); process.exit(1); });

// Fabrique les icones du site et de l'admin a partir du logo vgthmind (fond TRANSPARENT) :
//   node generator/make-favicons.js
// Site  -> assets/theme/ : favicon.svg, favicon.ico (16/32/48), favicon-16/32/48.png,
//          icon-192/512.png (manifest), icon-maskable-512.png, apple-touch-icon.png (180, fond sombre #0b0b0b)
// Admin -> assets/theme/admin/ : memes fichiers + pastille doree (distingue l'onglet admin)
//          et admin/icon-192.png, admin/icon-512.png (manifest de l'admin).
// Le logo est blanc chrome cerne de noir/bleu : lisible sur onglet clair ET sombre ; le SVG
// le SVG est une silhouette noire (theme clair) / blanche (theme sombre) via prefers-color-scheme ; ICO/PNG gardent les couleurs chrome, sans halo.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const root = path.join(__dirname, '..');
const dir = path.join(root, 'assets', 'theme');
const adminDir = path.join(dir, 'admin');
const APPLE_BG = '#0b0b0b';
const BADGE = '#ffa726';

let logoBuf;
// Logo net : pas de halo (les pixels a moitie transparents autour des lettres sont retires), alpha raffermi.
async function cleanAlpha(buf, white) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const a = Math.max(0, Math.min(255, Math.round((data[i + 3] - 90) * 255 / 100)));
    data[i + 3] = a;
    if (white) { data[i] = data[i + 1] = data[i + 2] = 255; }
  }
  return sharp(data, { raw: info }).png().toBuffer();
}
async function logo() { return logoBuf || (logoBuf = await cleanAlpha(await sharp(path.join(dir, 'logo.png')).trim({ threshold: 5 }).toBuffer(), false)); }
let silBuf;
async function silhouette() { return silBuf || (silBuf = await cleanAlpha(await logo(), true)); }

// Pastille doree (coin bas-droit) pour l'admin.
function badge(size) {
  const r = Math.max(3, Math.round(size * 0.16)), c = size - r - Math.round(size * 0.02);
  const sw = Math.max(1, Math.round(size * 0.04));
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${c}" cy="${c}" r="${r}" fill="${BADGE}" stroke="#0b0b0b" stroke-width="${sw}"/></svg>`);
}

// frac = part de la largeur occupee par le logo ; bg = null (transparent) ou couleur.
async function tile(size, { frac = 0.96, bg = null, admin = false } = {}) {
  const inner = Math.round(size * frac);
  const l = await sharp(await logo()).resize(inner, inner, { fit: 'inside' }).toBuffer();
  const layers = [{ input: l, gravity: 'centre' }];
  if (admin) layers.push({ input: badge(size), top: 0, left: 0 });
  return sharp({ create: { width: size, height: size, channels: 4, background: bg || { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers).png({ compressionLevel: 9 }).toBuffer();
}

function ico(bufs, list) {
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(list.length, 4);
  let offset = 6 + 16 * list.length; const dirs = []; const data = [];
  for (const s of list) {
    const b = bufs[s]; const e = Buffer.alloc(16);
    e.writeUInt8(s, 0); e.writeUInt8(s, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(b.length, 8); e.writeUInt32LE(offset, 12);
    offset += b.length; dirs.push(e); data.push(b);
  }
  return Buffer.concat([head, ...dirs, ...data]);
}

// SVG : silhouette du logo, sans fond ni halo ; noire en theme clair, blanche en theme sombre.
async function svg(admin) {
  const l = await sharp(await silhouette()).resize(128, 128, { fit: 'inside' }).png({ compressionLevel: 9 }).toBuffer();
  const m = await sharp(l).metadata();
  const w = m.width, h = m.height, S = 128, y = Math.round((S - h) / 2);
  const dot = admin ? `<circle cx="112" cy="112" r="14" fill="${BADGE}" stroke="#0b0b0b" stroke-width="5"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
<style>
.l{filter:brightness(0)}
@media (prefers-color-scheme: dark){.l{filter:none}}
</style>
<image class="l" x="${Math.round((S - w) / 2)}" y="${y}" width="${w}" height="${h}" href="data:image/png;base64,${l.toString('base64')}"/>
${dot}
</svg>
`;
}

async function set(outDir, admin) {
  fs.mkdirSync(outDir, { recursive: true });
  const w = (f, b) => fs.writeFileSync(path.join(outDir, f), b);
  const b = {};
  for (const s of [16, 32, 48]) { b[s] = await tile(s, { frac: 0.98, admin }); w(`favicon-${s}.png`, b[s]); }
  w('favicon.ico', ico(b, [16, 32, 48]));
  w('favicon.svg', await svg(admin));
  w('apple-touch-icon.png', await tile(180, { frac: 0.84, bg: APPLE_BG, admin }));
  w('icon-192.png', await tile(192, { frac: 0.94, admin }));
  w('icon-512.png', await tile(512, { frac: 0.94, admin }));
  w('icon-maskable-512.png', await tile(512, { frac: 0.66, bg: APPLE_BG, admin }));
}

(async () => {
  await set(dir, false);
  await set(adminDir, true);
  // Manifest de l'admin : icones dans admin/ (cf. admin/manifest.webmanifest).
  for (const f of ['icon-192.png', 'icon-512.png']) fs.copyFileSync(path.join(adminDir, f), path.join(root, 'admin', f));
  console.log('Icones creees dans', dir, 'et', adminDir);
})();

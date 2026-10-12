// Fabrique les icones du site (onglet, raccourci iPhone, installation) a partir du logo vgthmind :
//   node generator/make-favicons.js
// Sortie : assets/theme/favicon-16/32/48.png, apple-touch-icon.png (180), icon-192.png, icon-512.png, favicon.ico
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const dir = path.join(__dirname, '..', 'assets', 'theme');

async function tile(size) {
  const logo = await sharp(path.join(dir, 'logo.png')).trim().toBuffer();
  const inner = Math.round(size * 0.84);
  const l = await sharp(logo).resize(inner, inner, { fit: 'inside' }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: '#0b0b0b' } })
    .composite([{ input: l, gravity: 'centre' }]).png({ compressionLevel: 9 }).toBuffer();
}

(async () => {
  const sizes = { 'favicon-16.png': 16, 'favicon-32.png': 32, 'favicon-48.png': 48, 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 };
  const bufs = {};
  for (const [f, s] of Object.entries(sizes)) { bufs[s] = await tile(s); fs.writeFileSync(path.join(dir, f), bufs[s]); }
  // favicon.ico : 3 images PNG (16, 32, 48)
  const list = [16, 32, 48];
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(list.length, 4);
  let offset = 6 + 16 * list.length; const dirs = []; const data = [];
  for (const s of list) {
    const b = bufs[s]; const e = Buffer.alloc(16);
    e.writeUInt8(s, 0); e.writeUInt8(s, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(b.length, 8); e.writeUInt32LE(offset, 12);
    offset += b.length; dirs.push(e); data.push(b);
  }
  fs.writeFileSync(path.join(dir, 'favicon.ico'), Buffer.concat([head, ...dirs, ...data]));
  console.log('Icones creees dans', dir);
})();

// Test rapide : node admin/studio-process.test.mjs
import { createRequire } from 'module';
import assert from 'assert';
const P = createRequire(import.meta.url)('./studio-process.js');

const w = 20, h = 10, rgba = new Uint8ClampedArray(w * h * 4);
for (let y = 2; y < 6; y++) for (let x = 4; x < 12; x++) { const i = (y * w + x) * 4; rgba[i] = 200; rgba[i + 3] = 255; }
assert.deepStrictEqual(P.bbox(rgba, w, h), { x: 4, y: 2, w: 8, h: 4 });
assert.strictEqual(P.bbox(new Uint8ClampedArray(16), 2, 2), null);

// layout : marge identique, centré
const L = P.layout([{ x: 0, y: 0, w: 100, h: 50 }, { x: 0, y: 0, w: 40, h: 80 }], { outW: 1000, outH: 1000, margin: 0.1 });
assert.ok(Math.abs(L[0].dx - 100) < 1e-6 && Math.abs(L[1].dy - 100) < 1e-6);
const C = P.layout([{ x: 0, y: 0, w: 100, h: 50 }, { x: 0, y: 0, w: 40, h: 80 }], { outW: 1000, outH: 1000, margin: 0.1, mode: 'common' });
assert.strictEqual(C[0].scale, C[1].scale);

// refineAlpha : seuils
const a = P.refineAlpha(Uint8ClampedArray.from([0, 10, 128, 250, 255]), 5, 1, { lo: 12, hi: 235 });
assert.strictEqual(a[0], 0); assert.strictEqual(a[1], 0); assert.strictEqual(a[4], 255); assert.ok(a[2] > 100 && a[2] < 160);
// érosion
const e = P.refineAlpha(Uint8ClampedArray.from([255, 255, 255, 255, 255]), 5, 1, { shrink: 1 });
assert.strictEqual(e[0], 255);

// defringe : un pixel de bord noir prend la couleur voisine
const f = new Uint8ClampedArray(5 * 4); for (let i = 0; i < 5; i++) { f.set([200, 100, 50, 255], i * 4); }
f.set([0, 0, 0, 100], 4 * 4);
P.defringe(f, 5, 1, 2);
assert.ok(Math.abs(f[16] - 200) < 2 && Math.abs(f[17] - 100) < 2);
console.log('studio-process : OK');

// zip : lisible par unzip
import fs from 'fs'; import { execSync } from 'child_process'; import os from 'os'; import path from 'path';
const z = P.zip([{ name: 'piece/0.webp', data: new Uint8Array([1, 2, 3, 4]) }, { name: 'piece/1.webp', data: new TextEncoder().encode('bonjour') }]);
const tmp = path.join(os.tmpdir(), 'studio-test.zip'); fs.writeFileSync(tmp, z);
const r = execSync(`python3 -I -c "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip(),z.namelist(),z.read('piece/1.webp'))" ${tmp}`).toString();
assert.ok(r.includes('None') && r.includes('bonjour'), r);
console.log('zip : OK');

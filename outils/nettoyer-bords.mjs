// Nettoie les bords d'une photo détourée (PNG/WebP à fond transparent) : halo clair, contour flou, voile semi-transparent.
// Usage : node outils/nettoyer-bords.mjs entree.png sortie.png [--source=photo-source.png --hauteur=1200]
//   --source : refait la photo depuis une photo détourée de meilleure qualité (recadrée sur la pièce, remise à la hauteur demandée).
// Le vêtement n'est pas touché : seuls les pixels du contour (opacité partielle) sont recalculés.
import sharp from 'sharp';

const arg = (k) => (process.argv.find((a) => a.startsWith('--' + k + '=')) || '').split('=')[1];
const [inFile, outFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'));

function boxBlur(src, W, H, r) { // flou de boîte séparable (r pixels)
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H), n = 2 * r + 1;
  for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x <= r; x++) s += src[y * W + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) { tmp[y * W + x] = s / n; s += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)]; } }
  for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) { out[y * W + x] = s / n; s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; } }
  return out;
}
const smooth = (a, lo, hi) => { const t = Math.min(1, Math.max(0, (a - lo) / (hi - lo))); return t * t * (3 - 2 * t); };

export async function nettoyer(input, { source, hauteur } = {}) {
  let img = sharp(source || input).ensureAlpha();
  if (source) { // recadrage serré + marge de 2 %, puis mise à la hauteur
    const t = await img.trim({ threshold: 10, background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer({ resolveWithObject: true });
    const pad = Math.round(t.info.height * 0.02), h = Number(hauteur) || 1200;
    img = sharp(t.data).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).resize({ height: h, kernel: 'lanczos3' });
  }
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const a = new Float32Array(N); for (let i = 0; i < N; i++) a[i] = data[i * 4 + 3] / 255;
  // 1. contour : on resserre d'environ 1 px et on adoucit (plus de voile ni de dents d'escalier)
  const ab = boxBlur(a, W, H, 1);
  const a2 = new Float32Array(N); for (let i = 0; i < N; i++) a2[i] = a[i] < 0.02 ? 0 : smooth(ab[i], 0.45, 0.88);
  // 2. couleurs : au contour, on reprend la couleur du tissu voisin (supprime le halo du fond d'origine)
  const core = new Float32Array(N); for (let i = 0; i < N; i++) core[i] = a[i] > 0.97 ? 1 : 0;
  const coreE = boxBlur(core, W, H, 2); for (let i = 0; i < N; i++) core[i] = coreE[i] > 0.98 ? 1 : 0; // cœur = pixels à 2 px du bord
  const ch = [0, 1, 2].map((c) => { const v = new Float32Array(N); for (let i = 0; i < N; i++) v[i] = core[i] * data[i * 4 + c]; return boxBlur(v, W, H, 4); });
  const w = boxBlur(core, W, H, 4);
  const out = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    const edge = a[i] < 0.97 || a2[i] < 0.97; // seulement le contour
    for (let c = 0; c < 3; c++) {
      let v = data[i * 4 + c];
      if (edge && w[i] > 0.02 && a2[i] > 0) { const n = ch[c][i] / w[i]; const k = 0.9; v = v * (1 - k) + n * k; }
      out[i * 4 + c] = Math.round(v);
    }
    out[i * 4 + 3] = Math.round(a2[i] * 255);
  }
  return sharp(out, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 });
}

if (process.argv[1] && /nettoyer-bords\.mjs$/.test(process.argv[1])) {
  if (!inFile || !outFile) { console.log('Usage : node outils/nettoyer-bords.mjs entree.png sortie.png [--source=... --hauteur=1200]'); process.exit(1); }
  const p = await nettoyer(inFile, { source: arg('source'), hauteur: arg('hauteur') });
  await p.toFile(outFile); console.log('écrit', outFile);
}

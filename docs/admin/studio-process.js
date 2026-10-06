/* Studio photo — fonctions pures (aucun accès au navigateur, aucune clé).
   Travaillent sur des tableaux RGBA (Uint8ClampedArray, 4 octets par pixel)
   ou sur un masque alpha (Uint8ClampedArray, 1 octet par pixel).
   Chargé comme script classique (window.VGStudioProcess) ou sous Node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VGStudioProcess = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Applique un masque alpha (1 octet/pixel) aux pixels RGBA.
  function applyAlpha(rgba, alpha) {
    for (var i = 0, n = alpha.length; i < n; i++) rgba[i * 4 + 3] = alpha[i];
  }

  // Minimum glissant (érosion) sur une ligne ou colonne, rayon r.
  function minFilter(src, w, h, r) {
    if (r < 1) return src;
    var tmp = new Uint8ClampedArray(src.length), out = new Uint8ClampedArray(src.length);
    var x, y, k, m, v;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      m = 255;
      for (k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) { v = src[y * w + k]; if (v < m) m = v; }
      tmp[y * w + x] = m;
    }
    for (x = 0; x < w; x++) for (y = 0; y < h; y++) {
      m = 255;
      for (k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) { v = tmp[k * w + x]; if (v < m) m = v; }
      out[y * w + x] = m;
    }
    return out;
  }

  // Flou rapide (boîte, 1 passe séparable) sur un tableau Float32 d'un canal.
  function boxBlur(src, w, h, r) {
    var tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    var x, y, acc, cnt, i;
    for (y = 0; y < h; y++) {
      acc = 0; cnt = 0;
      for (x = 0; x <= Math.min(r, w - 1); x++) { acc += src[y * w + x]; cnt++; }
      for (x = 0; x < w; x++) {
        tmp[y * w + x] = acc / cnt;
        i = x + r + 1; if (i < w) { acc += src[y * w + i]; cnt++; }
        i = x - r; if (i >= 0) { acc -= src[y * w + i]; cnt--; }
      }
    }
    for (x = 0; x < w; x++) {
      acc = 0; cnt = 0;
      for (y = 0; y <= Math.min(r, h - 1); y++) { acc += tmp[y * w + x]; cnt++; }
      for (y = 0; y < h; y++) {
        out[y * w + x] = acc / cnt;
        i = y + r + 1; if (i < h) { acc += tmp[i * w + x]; cnt++; }
        i = y - r; if (i >= 0) { acc -= tmp[i * w + x]; cnt--; }
      }
    }
    return out;
  }

  // Affine le masque : courbe (tout ce qui est sous `lo` devient transparent,
  // tout ce qui est au-dessus de `hi` devient opaque, doux entre les deux),
  // puis contraction éventuelle de `shrink` pixels (retire le liséré de fond).
  // opts : { lo: 0..255 (déf. 12), hi: 0..255 (déf. 235), shrink: 0..4 (déf. 0), w, h }
  function refineAlpha(alpha, w, h, opts) {
    opts = opts || {};
    var lo = opts.lo == null ? 12 : opts.lo, hi = opts.hi == null ? 235 : opts.hi;
    if (hi <= lo) hi = lo + 1;
    var out = new Uint8ClampedArray(alpha.length), v, t;
    for (var i = 0; i < alpha.length; i++) {
      t = (alpha[i] - lo) / (hi - lo);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      v = t * t * (3 - 2 * t); // smoothstep
      out[i] = Math.round(v * 255);
    }
    var s = opts.shrink | 0;
    return s > 0 ? minFilter(out, w, h, s) : out;
  }

  // Défrangeage : sur les pixels semi-transparents, remplace la couleur par la
  // moyenne des couleurs des pixels voisins bien opaques (supprime le halo du
  // fond d'origine). Les pixels opaques ne changent pas. Modifie `rgba`.
  function defringe(rgba, w, h, radius) {
    radius = radius == null ? 4 : radius;
    if (radius < 1) return;
    var n = w * h, r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n), m = new Float32Array(n);
    var i, a;
    for (i = 0; i < n; i++) {
      if (rgba[i * 4 + 3] >= 245) { r[i] = rgba[i * 4]; g[i] = rgba[i * 4 + 1]; b[i] = rgba[i * 4 + 2]; m[i] = 1; }
    }
    var br = boxBlur(r, w, h, radius), bg = boxBlur(g, w, h, radius), bb = boxBlur(b, w, h, radius), bm = boxBlur(m, w, h, radius);
    for (i = 0; i < n; i++) {
      a = rgba[i * 4 + 3];
      if (a < 245 && a > 0 && bm[i] > 0.02) {
        rgba[i * 4] = br[i] / bm[i]; rgba[i * 4 + 1] = bg[i] / bm[i]; rgba[i * 4 + 2] = bb[i] / bm[i];
      }
    }
  }

  // Boîte englobante des pixels dont l'alpha dépasse `thr` (déf. 16).
  // Renvoie { x, y, w, h } ou null si l'image est vide.
  function bbox(rgba, w, h, thr) {
    thr = thr == null ? 16 : thr;
    var x0 = w, y0 = h, x1 = -1, y1 = -1, x, y;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] > thr) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  // Cadrage commun : pour chaque boîte (une par photo), calcule l'échelle et la
  // position pour que le sujet soit centré avec la même marge partout.
  // opts : { outW, outH, margin (part du côté, déf. 0.06), mode: 'each' | 'common' }
  //  - 'each'   : chaque sujet remplit le cadre (marge identique sur chaque photo)
  //  - 'common' : même échelle pour toutes (tailles relatives conservées) ; la plus
  //               grande photo a la marge demandée.
  // Renvoie un tableau { scale, dx, dy } (dx, dy = coin haut-gauche de la boîte source dans le cadre).
  function layout(boxes, opts) {
    var outW = opts.outW, outH = opts.outH, m = opts.margin == null ? 0.06 : opts.margin;
    var mx = Math.round(outW * m), my = Math.round(outH * m);
    var aw = outW - 2 * mx, ah = outH - 2 * my;
    var fit = boxes.map(function (b) { return b ? Math.min(aw / b.w, ah / b.h) : 1; });
    var common = Math.min.apply(null, fit.filter(function (_, i) { return boxes[i]; }).concat([Infinity]));
    return boxes.map(function (b, i) {
      if (!b) return { scale: 1, dx: 0, dy: 0 };
      var s = opts.mode === 'common' ? common : fit[i];
      return { scale: s, dx: (outW - b.w * s) / 2, dy: (outH - b.h * s) / 2 };
    });
  }

  // ZIP « stocké » (sans compression : les WebP sont déjà compressés).
  // files : [{ name: 'slug/0.webp', data: Uint8Array }] -> Uint8Array du .zip
  var CRC = null;
  function crc32(buf) {
    if (!CRC) { CRC = new Uint32Array(256); for (var n = 0, c, k; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) crc = CRC[(crc ^ buf[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0, total = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); // date 1980-01-01
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, f.data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + size;
    });
    var cdSize = 0; central.forEach(function (c) { cdSize += c.length; });
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    var all = parts.concat(central, [new Uint8Array(end.buffer)]);
    all.forEach(function (a) { total += a.length; });
    var out = new Uint8Array(total), pos = 0;
    all.forEach(function (a) { out.set(a, pos); pos += a.length; });
    return out;
  }

  return { zip: zip, crc32: crc32, applyAlpha: applyAlpha, refineAlpha: refineAlpha, defringe: defringe, bbox: bbox, layout: layout, minFilter: minFilter };
});

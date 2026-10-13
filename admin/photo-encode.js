/* Photos et vidéos ajoutées depuis la fiche « Pièces » et « Pièce rapide » : décodage, réduction, encodage WebP (comme le studio photo :
   encodeur du navigateur, sinon WebAssembly local pour Safari, sinon PNG), et vidéo reel en MP4 léger. Tout se fait dans le navigateur. */
(function (root) {
  'use strict';
  var MAX_VIDEO = 40 * 1024 * 1024;

  function toBlob(c, type, q) { return new Promise(function (ok) { c.toBlob(ok, type, q); }); }

  // Fichier image -> canvas réduit (côté le plus long <= maxSide). Les photos d'iPhone (HEIC) se lisent dans Safari.
  async function decode(file, maxSide) {
    var bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) { bmp = await createImageBitmap(file); }
    var s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    var c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return c;
  }

  // Canvas -> { blob, ext, data (Uint8Array) } : WebP sous maxBytes si possible.
  async function encode(c, maxBytes) {
    var q = 0.85, b, tries = 0, out = null;
    for (;;) {
      b = await toBlob(c, 'image/webp', q);
      if (!b || b.type !== 'image/webp') break;
      if (b.size <= maxBytes || q <= 0.5 || ++tries > 8) { out = { blob: b, ext: 'webp' }; break; }
      q -= 0.07;
    }
    if (!out && root.VGStudioWebP) {
      try {
        var id = c.getContext('2d').getImageData(0, 0, c.width, c.height), qq = 85;
        for (tries = 0; tries < 8; tries++) {
          var wb = await root.VGStudioWebP.encode(id, qq);
          if (wb.size <= maxBytes || qq <= 50) { out = { blob: wb, ext: 'webp' }; break; }
          qq -= 7;
        }
      } catch (e) { /* PNG ci-dessous */ }
    }
    if (!out) out = { blob: await toBlob(c, 'image/png'), ext: 'png' };
    out.data = new Uint8Array(await out.blob.arrayBuffer());
    return out;
  }

  async function fromFile(file, opts) {
    opts = opts || {};
    return encode(await decode(file, opts.maxSide || 1600), (opts.maxKB || 350) * 1024);
  }

  // Vidéo : MP4 de 40 Mo maximum ; sinon conversion automatique (video-convert.js). Renvoie une Promise<File|Blob>.
  function prepareVideo(f, onMsg) {
    onMsg = onMsg || function () {};
    function readable(file) {
      return new Promise(function (ok, ko) {
        var v = document.createElement('video'), u = URL.createObjectURL(file);
        v.muted = true; v.preload = 'metadata';
        v.onloadedmetadata = function () { URL.revokeObjectURL(u); ok(file); };
        v.onerror = function () { URL.revokeObjectURL(u); ko(new Error('Cette vidéo ne peut pas être lue par ce navigateur (vidéo iPhone HEVC ?) : exporte-la en MP4 H.264.')); };
        v.src = u;
      });
    }
    var mp4 = /\.mp4$/i.test(f.name) || f.type === 'video/mp4';
    if (f.size <= MAX_VIDEO && mp4) return readable(f);
    if (!root.VGVideoConvert || !root.VGVideoConvert.supported()) {
      return Promise.reject(new Error(f.size > MAX_VIDEO ? 'Vidéo trop lourde (' + Math.round(f.size / 1048576) + ' Mo, 40 Mo maximum) : exporte-la en plus léger.' : 'Vidéo non MP4 : exporte-la en MP4 H.264.'));
    }
    onMsg('Conversion en MP4 léger… 0 % (garde l\'écran allumé)');
    return root.VGVideoConvert.convert(f, { maxSeconds: 30, maxWidth: 720, bitrate: 2000000, maxBytes: MAX_VIDEO - 1048576, onProgress: function (p) { onMsg('Conversion en MP4 léger… ' + Math.round(p * 100) + ' % (garde l\'écran allumé)'); } })
      .then(function (out) { if (out.size > MAX_VIDEO) throw new Error('encore trop lourde après conversion'); return readable(out); });
  }

  root.VGPhotoEncode = { decode: decode, encode: encode, fromFile: fromFile, prepareVideo: prepareVideo, MAX_VIDEO: MAX_VIDEO };
})(window);

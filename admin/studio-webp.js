/* Studio photo — encodeur WebP de secours (WebAssembly, fichiers dans vendor/webp/).
   Safari/iPhone n'encode pas le WebP via canvas.toBlob : on utilise celui-ci. Local, sans réseau. */
(function (root) {
  'use strict';
  var mod = null;
  // Détection SIMD (octets standard de « wasm-feature-detect »).
  function hasSimd() {
    try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); }
    catch (e) { return false; }
  }
  var base0 = document.currentScript ? document.currentScript.src : location.href;
  function absBase() { return new URL('vendor/webp/', base0).href; }
  function load2() {
    if (!mod) {
      var file = hasSimd() ? 'webp_enc_simd.js' : 'webp_enc.js';
      mod = import(absBase() + file).then(function (m) { return m.default({ noInitialRun: true }); });
    }
    return mod;
  }
  var OPTS = { quality: 75, target_size: 0, target_PSNR: 0, method: 4, sns_strength: 50, filter_strength: 60, filter_sharpness: 0, filter_type: 1, partitions: 0, segments: 4, pass: 1, show_compressed: 0, preprocessing: 0, autofilter: 0, partition_limit: 0, alpha_compression: 1, alpha_filtering: 1, alpha_quality: 100, lossless: 0, exact: 0, image_hint: 0, emulate_jpeg_size: 0, thread_level: 0, low_memory: 0, near_lossless: 100, use_delta_palette: 0, use_sharp_yuv: 0 };
  // imageData : ImageData ; quality : 0..100 -> Blob image/webp
  root.VGStudioWebP = {
    encode: async function (imageData, quality) {
      var m = await load2();
      var o = Object.assign({}, OPTS, { quality: quality });
      var r = m.encode(imageData.data, imageData.width, imageData.height, o);
      if (!r) throw new Error('Encodage WebP impossible.');
      return new Blob([r.buffer], { type: 'image/webp' });
    }
  };
})(window);

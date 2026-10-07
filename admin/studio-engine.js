/* Studio photo — moteurs de détourage. Aucune clé, aucun envoi de photo.
   Un moteur = { name, segment(canvas) -> Promise<{ alpha: Uint8ClampedArray, w, h }> }
   (alpha à la taille du canvas fourni).

   - 'model'  : vrai modèle BiRefNet « lite » (MIT) exécuté DANS le navigateur avec
                transformers.js (Apache-2.0). Téléchargé au moment de l'usage depuis
                Hugging Face (puis mis en cache par le navigateur). Essaie plusieurs
                configurations (WebGPU, puis WASM quantifié, puis WASM complet).
   - 'simple' : repli sans téléchargement : fond uni détecté sur les bords de la photo.
                Sert aussi de moteur de test de l'interface (?engine=simple).
   - 'remote' : EMPLACEMENT du service payant (désactivé, sans clé, voir REMOTE). */
(function (root) {
  'use strict';

  var TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
  var MODEL_ID = 'onnx-community/BiRefNet_lite-ONNX';

  var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // ---- Vrai modèle -------------------------------------------------------
  var loaded = null; // { lib, model, processor, label }

  function configs() {
    var list = [];
    // WebGPU : rapide, mais encore fragile sur iPhone -> WASM d'abord là-bas.
    if (navigator.gpu && !isIOS) list.push({ device: 'webgpu', dtype: 'fp16', label: 'WebGPU (précis)' });
    list.push({ device: 'wasm', dtype: 'q8', label: 'Processeur (quantifié)' });
    list.push({ device: 'wasm', dtype: 'fp32', label: 'Processeur (complet)' });
    return list;
  }

  async function loadModel(onStatus, modelId) {
    if (loaded) return loaded;
    onStatus('Chargement de la bibliothèque…');
    var lib = await import(/* @vite-ignore */ TRANSFORMERS_URL);
    lib.env.allowLocalModels = false;
    var errors = [], cfgs = configs(), i, cfg;
    for (i = 0; i < cfgs.length; i++) {
      cfg = cfgs[i];
      try {
        onStatus('Téléchargement du modèle — ' + cfg.label + ' (1re fois seulement, quelques dizaines de Mo)…');
        var progress = function (p) {
          if (p && p.status === 'progress' && p.total) onStatus('Téléchargement du modèle : ' + Math.round(p.loaded / p.total * 100) + ' %');
        };
        var model = await lib.AutoModel.from_pretrained(modelId, { device: cfg.device, dtype: cfg.dtype, progress_callback: progress });
        var processor = await lib.AutoProcessor.from_pretrained(modelId);
        loaded = { lib: lib, model: model, processor: processor, label: cfg.label };
        return loaded;
      } catch (e) {
        errors.push(cfg.label + ' : ' + (e && e.message ? e.message : e));
      }
    }
    var err = new Error('Modèle indisponible. ' + errors.join(' | '));
    err.code = 'model-unavailable';
    throw err;
  }

  // Exécute le modèle. Les noms d'entrée/sortie viennent du modèle ONNX ; si
  // une version change, c'est ICI (une dizaine de lignes) qu'il faut ajuster.
  async function runModel(m, canvas) {
    var blob = await new Promise(function (ok) { canvas.toBlob(ok, 'image/png'); });
    var image = await m.lib.RawImage.fromBlob(blob);
    var inputs = await m.processor(image);
    var feed = inputs.pixel_values;
    var out;
    try { out = await m.model({ input_image: feed }); }
    catch (e) { out = await m.model({ pixel_values: feed }); }
    var t = out.output_image || out.alphas || Object.values(out)[0];
    var dims = t.dims, mh = dims[dims.length - 2], mw = dims[dims.length - 1];
    var src = t.data, n = mw * mh, off = src.length - n; // dernier plan = masque
    var small = document.createElement('canvas'); small.width = mw; small.height = mh;
    var sctx = small.getContext('2d'), id = sctx.createImageData(mw, mh), k, v;
    for (k = 0; k < n; k++) {
      v = 255 / (1 + Math.exp(-src[off + k])); // sigmoïde
      id.data[k * 4] = id.data[k * 4 + 1] = id.data[k * 4 + 2] = v; id.data[k * 4 + 3] = 255;
    }
    sctx.putImageData(id, 0, 0);
    // Mise à l'échelle lissée vers la taille de la photo.
    var big = document.createElement('canvas'); big.width = canvas.width; big.height = canvas.height;
    var bctx = big.getContext('2d'); bctx.imageSmoothingEnabled = true; bctx.imageSmoothingQuality = 'high';
    bctx.drawImage(small, 0, 0, big.width, big.height);
    var px = bctx.getImageData(0, 0, big.width, big.height).data, alpha = new Uint8ClampedArray(big.width * big.height);
    for (k = 0; k < alpha.length; k++) alpha[k] = px[k * 4];
    return { alpha: alpha, w: big.width, h: big.height };
  }

  function modelEngine(onStatus, modelId) {
    return {
      name: 'model',
      async segment(canvas) {
        var m = await loadModel(onStatus, modelId || MODEL_ID);
        onStatus('Détourage en cours (' + m.label + ')…');
        // L'inférence travaille en 1024 px : on lui donne la photo telle quelle.
        return runModel(m, canvas);
      }
    };
  }

  // ---- Repli : fond uni --------------------------------------------------
  function simpleEngine() {
    return {
      name: 'simple',
      async segment(canvas) {
        var w = canvas.width, h = canvas.height;
        var d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
        // Couleur du fond = médiane des pixels du cadre extérieur.
        var rs = [], gs = [], bs = [], x, y, i, step = Math.max(1, Math.floor(Math.max(w, h) / 200));
        function take(px, py) { i = (py * w + px) * 4; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); }
        for (x = 0; x < w; x += step) { take(x, 0); take(x, h - 1); }
        for (y = 0; y < h; y += step) { take(0, y); take(w - 1, y); }
        var med = function (a) { a.sort(function (p, q) { return p - q; }); return a[a.length >> 1]; };
        var br = med(rs), bg = med(gs), bb = med(bs);
        var alpha = new Uint8ClampedArray(w * h), dist, t;
        for (i = 0; i < alpha.length; i++) {
          dist = Math.sqrt(Math.pow(d[i * 4] - br, 2) + Math.pow(d[i * 4 + 1] - bg, 2) + Math.pow(d[i * 4 + 2] - bb, 2));
          t = (dist - 18) / 40; // 0 sous 18, 1 au-dessus de 58
          alpha[i] = t <= 0 ? 0 : t >= 1 ? 255 : Math.round(t * 255);
        }
        return { alpha: alpha, w: w, h: h };
      }
    };
  }

  // ---- Emplacement du service payant (désactivé) ------------------------------
  // À activer plus tard (voir rapports-nuit/studio-photo.md §4). La clé n'est
  // JAMAIS ici : elle vit dans un secret du Worker ; la page n'appelle que le
  // Worker, avec la session admin (vgAdminToken()).
  var REMOTE = { enabled: false, url: '' /* ex. VG_ENDPOINT + '/admin/studio/remove-bg' */ };
  function remoteEngine() {
    return {
      name: 'remote',
      async segment(canvas) {
        if (!REMOTE.enabled) throw new Error('Service payant non activé.');
        var blob = await new Promise(function (ok) { canvas.toBlob(ok, 'image/png'); });
        var r = await fetch(REMOTE.url, { method: 'POST', headers: { Authorization: 'Bearer ' + (root.vgAdminToken ? root.vgAdminToken() : ''), 'Content-Type': 'image/png' }, body: blob });
        if (!r.ok) throw new Error('Service payant : erreur ' + r.status);
        var bmp = await createImageBitmap(await r.blob()); // PNG détouré renvoyé par le Worker
        var c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
        var cx = c.getContext('2d'); cx.drawImage(bmp, 0, 0, c.width, c.height);
        var px = cx.getImageData(0, 0, c.width, c.height).data, a = new Uint8ClampedArray(c.width * c.height);
        for (var k = 0; k < a.length; k++) a[k] = px[k * 4 + 3];
        return { alpha: a, w: c.width, h: c.height };
      }
    };
  }

  root.VGStudioEngine = {
    remote: REMOTE,
    isIOS: isIOS,
    MODEL_ID: MODEL_ID,
    create: function (kind, onStatus, modelId) {
      onStatus = onStatus || function () {};
      if (kind === 'simple') return simpleEngine();
      if (kind === 'remote') return remoteEngine();
      return modelEngine(onStatus, modelId);
    }
  };
})(window);

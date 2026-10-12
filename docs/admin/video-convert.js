/* Conversion d'une vidéo en MP4 léger, directement dans le navigateur (aucun logiciel à installer, aucun envoi à un tiers).
   Principe : la vidéo est lue, redessinée en plus petit sur un canvas, et réenregistrée par le navigateur (MediaRecorder).
   La conversion dure le temps de la vidéo (8 s de clip = ~8 s) : garder l'écran allumé et l'onglet ouvert.
   Marche sur iPhone (Safari 14.5+) et sur Chrome récent. Le son est retiré (les clips et reels du site sont muets). */
(function (root) {
  'use strict';
  var MIMES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1.4D401E', 'video/mp4;codecs=avc1', 'video/mp4'];

  function pickMime() {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
    for (var i = 0; i < MIMES.length; i++) if (MediaRecorder.isTypeSupported(MIMES[i])) return MIMES[i];
    return '';
  }
  function supported() { return !!(pickMime() && HTMLCanvasElement.prototype.captureStream); }
  function even(n) { n = Math.round(n); return n - (n % 2) || 2; }

  // opts : { maxSeconds (8), maxWidth (720), bitrate (bits/s, 1 500 000), fps (30), onProgress(0..1) }
  function convert(file, opts) {
    opts = opts || {};
    var maxS = opts.maxSeconds || 8, maxW = opts.maxWidth || 720, fps = opts.fps || 30;
    return new Promise(function (resolve, reject) {
      var mime = pickMime();
      if (!mime || !HTMLCanvasElement.prototype.captureStream) { reject(new Error('Ce navigateur ne sait pas écrire du MP4 : utilise Safari (iPhone) ou Chrome à jour.')); return; }
      var url = URL.createObjectURL(file), v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.src = url;
      function cleanup() { try { URL.revokeObjectURL(url); } catch (e) {} v.pause(); v.removeAttribute('src'); v.load(); }
      v.onerror = function () { cleanup(); reject(new Error('Cette vidéo ne peut pas être lue par ce navigateur (vidéo iPhone HEVC ? Essaie depuis Safari sur l\'iPhone).')); };
      v.onloadedmetadata = function () {
        var dur = Math.min(isFinite(v.duration) ? v.duration : maxS, maxS);
        var vw = v.videoWidth || 720, vh = v.videoHeight || 1280, k = Math.min(1, maxW / Math.max(1, Math.min(vw, vh)));
        var w = even(vw * k), h = even(vh * k);
        var bitrate = opts.bitrate || 1500000;
        if (opts.maxBytes) bitrate = Math.min(bitrate, Math.floor(opts.maxBytes * 8 * 0.85 / Math.max(1, dur)));
        var canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d'), chunks = [], rec;
        try { rec = new MediaRecorder(canvas.captureStream(fps), { mimeType: mime, videoBitsPerSecond: bitrate }); }
        catch (e) { cleanup(); reject(new Error('Conversion impossible dans ce navigateur : ' + e.message)); return; }
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onerror = function (e) { cleanup(); reject(new Error('Erreur pendant la conversion.')); };
        rec.onstop = function () {
          cleanup();
          var blob = new Blob(chunks, { type: 'video/mp4' });
          if (!blob.size) { reject(new Error('La conversion n\'a rien produit.')); return; }
          var name = (file.name || 'video').replace(/\.[^.]+$/, '') + '.mp4';
          try { resolve(new File([blob], name, { type: 'video/mp4' })); } catch (e) { blob.name = name; resolve(blob); }
        };
        var done = false;
        function finish() { if (done) return; done = true; try { rec.state !== 'inactive' && rec.stop(); } catch (e) {} }
        function draw() {
          if (done) return;
          ctx.drawImage(v, 0, 0, w, h);
          var t = v.currentTime;
          if (opts.onProgress) opts.onProgress(Math.min(1, t / dur));
          if (v.ended || t >= dur) { finish(); return; }
          requestAnimationFrame(draw);
        }
        v.onended = finish;
        rec.start(250);
        var p = v.play();
        if (p && p.then) p.then(function () { requestAnimationFrame(draw); }, function () { cleanup(); reject(new Error('Lecture bloquée par le navigateur : touche l\'écran puis réessaie.')); });
        else requestAnimationFrame(draw);
        setTimeout(finish, (dur + 6) * 1000); // filet de sécurité
      };
    });
  }

  root.VGVideoConvert = { convert: convert, supported: supported };
})(typeof window !== 'undefined' ? window : this);

/* Studio photo — interface. Tout se passe dans le navigateur ; aucune photo n'est envoyée. */
(function () {
  'use strict';
  var P = window.VGStudioProcess, E = window.VGStudioEngine;
  // Fonds réels du site (vérifiés dans le thème) :
  //  - beige #f4f2ec : fiches produit et grilles (theme/layout.html + custom-css.css : --bg, cadres transparents) et vignette des e-mails (BG dans emails.ts)
  //  - noir  #000000 : zoom plein écran des photos (PhotoSwipe, --pswp-bg)
  //  - blanc #ffffff : carte des e-mails (autour de la vignette)
  var BGS = {
    beige: { label: 'Beige du site (#f4f2ec) — fiches, grilles, vignette e-mail', color: '#f4f2ec' },
    black: { label: 'Noir (#000000) — zoom plein écran', color: '#000000' },
    white: { label: 'Blanc (#ffffff) — carte e-mail', color: '#ffffff' }
  };
  function applyBg(el, key) { // key : 'checker' | 'transparent' | clé de BGS
    var checker = key === 'checker' || key === 'transparent';
    el.classList.toggle('checker', checker); el.style.background = checker ? '' : BGS[key].color;
  }
  var MAXSIDE = E.isIOS ? 1600 : 2000; // taille de travail (mémoire limitée sur iPhone)
  var $ = function (id) { return document.getElementById(id); };

  var photos = [], sel = -1, busy = false, nextId = 1;
  var engineKind = new URLSearchParams(location.search).get('engine') || 'model';
  var engines = {};
  var brushMode = 'erase';
  var params = { lo: 12, hi: 235, shrink: 0, defr: 4 };
  var lastZip = null;
  var FORCE_WASM = new URLSearchParams(location.search).get('webp') === 'wasm'; // test : force l'encodeur de secours (comme Safari)

  function setStatus(t) { $('status').textContent = t || ''; }
  function notice(t, err) {
    var d = document.createElement('div'); d.className = 'notice' + (err ? ' err' : ''); d.textContent = t;
    $('notices').appendChild(d); setTimeout(function () { d.remove(); }, 20000);
  }

  // ---------- ajout des photos ----------
  async function decode(file) {
    var bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) { bmp = await createImageBitmap(file); }
    var s = Math.min(1, MAXSIDE / Math.max(bmp.width, bmp.height));
    var c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return c;
  }

  async function addFiles(list) {
    var files = Array.prototype.slice.call(list).filter(function (f) { return /^image\//.test(f.type) || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name); });
    for (var i = 0; i < files.length; i++) {
      try {
        var src = await decode(files[i]);
        photos.push({ id: nextId++, name: files[i].name, src: src, w: src.width, h: src.height, status: 'queued', raw: null, ref: null, mode: null, cov: null, undo: [], cut: null, box: null, thumb: null, msg: '' });
      } catch (e) {
        notice('Photo illisible : ' + files[i].name + ' (les HEIC se lisent sur iPhone/Safari ; sinon exporte en JPEG).', true);
      }
    }
    renderStrip();
    runQueue();
  }

  // ---------- détourage (file d'attente) ----------
  function getEngine() {
    if (!engines[engineKind]) engines[engineKind] = E.create(engineKind, setStatus);
    return engines[engineKind];
  }

  async function runQueue() {
    if (busy) return; busy = true;
    try {
      for (;;) {
        var p = photos.find(function (x) { return x.status === 'queued'; });
        if (!p) break;
        await segmentPhoto(p);
      }
    } finally { busy = false; setStatus(''); }
  }

  async function segmentPhoto(p) {
    p.status = 'processing'; p.msg = ''; renderStrip();
    var r;
    try {
      r = await getEngine().segment(p.src);
    } catch (e) {
      if (engineKind === 'model') {
        // Repli : le modèle n'a pas pu se charger (réseau, mémoire…) -> fond uni.
        notice('Modèle indisponible (' + (e && e.message ? e.message : e) + '). Repli automatique : détourage « fond uni » + retouche manuelle. Tu peux réessayer le modèle en le re-choisissant dans la liste.', true);
        engineKind = 'simple'; $('engine').value = 'simple';
        try { r = await getEngine().segment(p.src); } catch (e2) { r = null; }
      }
      if (!r) { p.status = 'error'; p.msg = 'Échec du détourage : ' + (e && e.message ? e.message : e); renderStrip(); return; }
    }
    p.raw = r.alpha; p.mode = new Uint8Array(p.w * p.h); p.cov = new Uint8Array(p.w * p.h); p.undo = []; p.box = null;
    p.status = 'review';
    var idx = photos.indexOf(p);
    if (sel < 0 || photos[sel] === p || photos[sel].status === 'error') select(idx);
    else { buildCutout(p); makeThumb(p); releaseCut(p); }
    renderStrip();
  }

  // ---------- construction du détouré ----------
  function finalAlpha(p, i) {
    var v = p.ref[i], m = p.mode[i];
    if (m) { var c = p.cov[i]; v = m === 1 ? v * (255 - c) / 255 : v + (255 - v) * c / 255; }
    return v;
  }

  function buildCutout(p) {
    p.ref = P.refineAlpha(p.raw, p.w, p.h, { lo: params.lo, hi: params.hi, shrink: params.shrink });
    var id = p.src.getContext('2d').getImageData(0, 0, p.w, p.h), d = id.data, n = p.w * p.h, a = new Uint8ClampedArray(n), i;
    for (i = 0; i < n; i++) a[i] = finalAlpha(p, i);
    P.applyAlpha(d, a);
    P.defringe(d, p.w, p.h, params.defr);
    p.cut = id; p.box = P.bbox(d, p.w, p.h, 24);
    return id;
  }
  function ensureCut(p) { return p.cut || buildCutout(p); }
  function releaseCut(p) { p.cut = null; p.ref = null; }

  function makeThumb(p) {
    var t = p.thumb || (p.thumb = document.createElement('canvas')), s = 192 / Math.max(p.w, p.h);
    t.width = Math.round(p.w * s); t.height = Math.round(p.h * s);
    var tmp = document.createElement('canvas'); tmp.width = p.w; tmp.height = p.h;
    var useCut = p.status !== 'original' && p.cut;
    if (useCut) tmp.getContext('2d').putImageData(p.cut, 0, 0); else tmp.getContext('2d').drawImage(p.src, 0, 0);
    var cx = t.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(tmp, 0, 0, t.width, t.height);
  }

  // ---------- liste des photos ----------
  var STATUS = { queued: 'En attente…', processing: 'Détourage…', review: 'À valider', valid: '✓ Validée', original: 'Original gardé', error: 'Erreur' };
  function renderStrip() {
    var strip = $('strip'); strip.textContent = '';
    photos.forEach(function (p, i) {
      var c = document.createElement('div'); c.className = 'card' + (i === sel ? ' sel' : '');
      var cv = document.createElement('canvas'); cv.width = 112; cv.height = 96;
      var cx = cv.getContext('2d');
      var src = p.thumb && p.thumb.width ? p.thumb : null;
      if (!src) { var t = document.createElement('canvas'); t.width = 96; t.height = 96; var s = 96 / Math.max(p.w, p.h); cx.drawImage(p.src, 0, 0, p.w * s, p.h * s); }
      else { var k = Math.min(112 / src.width, 96 / src.height); cx.drawImage(src, (112 - src.width * k) / 2, (96 - src.height * k) / 2, src.width * k, src.height * k); }
      var st = document.createElement('div'); st.className = 'st ' + (p.status === 'valid' ? 'valid' : p.status === 'error' ? 'err' : ''); st.textContent = (i === 0 ? '★ ' : '') + (STATUS[p.status] || '') + (p.msg ? ' — ' + p.msg : '');
      var mv = document.createElement('div'); mv.className = 'mv';
      [['←', -1], ['→', 1], ['✕', 0]].forEach(function (b) {
        var bt = document.createElement('button'); bt.textContent = b[0]; bt.title = b[1] ? 'Déplacer' : 'Retirer';
        bt.onclick = function (ev) { ev.stopPropagation(); b[1] ? move(i, b[1]) : remove(i); };
        mv.appendChild(bt);
      });
      c.appendChild(cv); c.appendChild(st); c.appendChild(mv); c.onclick = function () { select(i); };
      strip.appendChild(c);
    });
  }

  function move(i, d) {
    var j = i + d; if (j < 0 || j >= photos.length) return;
    var cur = photos[sel]; var t = photos[i]; photos[i] = photos[j]; photos[j] = t;
    sel = photos.indexOf(cur); renderStrip();
  }
  function remove(i) {
    var cur = photos[sel]; photos.splice(i, 1);
    sel = photos.indexOf(cur); if (sel < 0) { sel = -1; if (photos.length) select(Math.min(i, photos.length - 1)); else $('editor').hidden = true; }
    renderStrip();
  }

  // ---------- éditeur ----------
  var view = { z: 1, tx: 0, ty: 0 }; // zoom partagé par les deux panneaux
  var stageC = $('stageC'), stageO = $('stageO'), cutEl = $('cut'), origEl = $('orig');

  function select(i) {
    var prev = photos[sel];
    if (prev && prev !== photos[i] && prev.cut) { makeThumb(prev); releaseCut(prev); }
    sel = i; var p = photos[i]; if (!p) return;
    $('editor').hidden = false; $('edName').textContent = p.name; renderStrip();
    view = { z: 1, tx: 0, ty: 0 };
    drawOrig(p);
    if (p.raw) { ensureCut(p); drawCut(p); } else { clearCut(); }
    layoutStages();
    updateButtons(p);
    $('edMsg').textContent = p.status === 'error' ? p.msg : '';
  }
  function drawOrig(p) { origEl.width = p.w; origEl.height = p.h; origEl.getContext('2d').drawImage(p.src, 0, 0); }
  function drawCut(p) { cutEl.width = p.w; cutEl.height = p.h; cutEl.getContext('2d').putImageData(p.cut, 0, 0); }
  function clearCut() { var p = photos[sel]; cutEl.width = p ? p.w : 4; cutEl.height = p ? p.h : 4; }
  function updateButtons(p) {
    var ok = !!(p && p.raw);
    ['bValid', 'bOrig', 'bRedo'].forEach(function (id) { $(id).disabled = !p || p.status === 'processing' || (!ok && id !== 'bRedo'); });
    $('bUndo').disabled = !p || !p.undo.length;
  }
  function refreshSelected() {
    var p = photos[sel]; if (!p || !p.raw) return;
    buildCutout(p); drawCut(p); updateButtons(p);
    // les autres photos recalculent leur détouré au besoin
    photos.forEach(function (q) { if (q !== p) { q.box = null; q.cut = null; q.ref = null; } });
  }
  var timer = null;
  function deferRefresh() { clearTimeout(timer); timer = setTimeout(refreshSelected, 120); }

  function nextToReview(from) {
    for (var k = 1; k <= photos.length; k++) { var j = (from + k) % photos.length; if (photos[j].status === 'review') return j; }
    return -1;
  }
  function setStatusOf(p, st) {
    p.status = st; if (p.cut) makeThumb(p);
    var n = nextToReview(photos.indexOf(p)); renderStrip();
    if (n >= 0 && st !== 'review') select(n);
  }

  // Taille des deux panneaux : la photo entière, à son vrai rapport, sans dépasser 75 % de la hauteur d'écran.
  function layoutStages() {
    var p = photos[sel]; if (!p) return;
    [['cutPanel', stageC], ['origPanel', stageO]].forEach(function (a) {
      var panel = $(a[0]), maxW = panel.clientWidth - 2, w, h = maxW * p.h / p.w;
      if (h > innerHeight * 0.75) { h = innerHeight * 0.75; }
      w = h * p.w / p.h; a[1].style.width = w + 'px'; a[1].style.height = h + 'px'; panel.style.minHeight = h + 'px';
    });
    applyView();
  }
  function stageSize() { return { w: stageC.clientWidth, h: stageC.clientHeight }; }
  function clampView() {
    var s = stageSize(); view.z = Math.min(8, Math.max(1, view.z));
    view.tx = Math.min(0, Math.max(s.w * (1 - view.z), view.tx)); view.ty = Math.min(0, Math.max(s.h * (1 - view.z), view.ty));
  }
  function applyView() {
    clampView();
    var t = 'translate(' + view.tx + 'px,' + view.ty + 'px) scale(' + view.z + ')';
    cutEl.style.transform = t; origEl.style.transform = t;
    $('zoomV').textContent = '×' + (Math.round(view.z * 10) / 10);
  }
  // Zoom centré sur le point (cx, cy) exprimé dans le repère du panneau.
  function zoomAt(cx, cy, z2) {
    z2 = Math.min(8, Math.max(1, z2)); var k = z2 / view.z;
    view.tx = cx - (cx - view.tx) * k; view.ty = cy - (cy - view.ty) * k; view.z = z2; applyView();
  }
  $('zIn').onclick = function () { var s = stageSize(); zoomAt(s.w / 2, s.h / 2, view.z * 1.5); };
  $('zOut').onclick = function () { var s = stageSize(); zoomAt(s.w / 2, s.h / 2, view.z / 1.5); };
  $('zFit').onclick = function () { view = { z: 1, tx: 0, ty: 0 }; applyView(); };
  window.addEventListener('resize', layoutStages);
  window.addEventListener('orientationchange', function () { setTimeout(layoutStages, 250); });

  // ---------- pinceau, déplacement, gestes ----------
  var tool = 'erase'; // 'erase' | 'restore' | 'pan'
  var spaceDown = false;
  window.addEventListener('keydown', function (e) { if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA/.test((e.target || {}).tagName || '')) { spaceDown = true; e.preventDefault(); } });
  window.addEventListener('keyup', function (e) { if (e.code === 'Space') spaceDown = false; });

  function radius(p) { return Math.max(1, $('brush').value / 100 * p.w / 2); }
  // Point image sous (clientX, clientY) ; le rect du canvas tient compte du zoom (transform).
  function toImg(cxp, cyp) {
    var p = photos[sel], r = cutEl.getBoundingClientRect();
    return { x: (cxp - r.left) * p.w / r.width, y: (cyp - r.top) * p.h / r.height, k: r.width / p.w };
  }
  function stamp(p, x, y, R) {
    var f = Math.max(1.5, R * 0.2), mode = tool === 'erase' ? 1 : 2;
    var x0 = Math.max(0, Math.floor(x - R - 1)), x1 = Math.min(p.w - 1, Math.ceil(x + R + 1));
    var y0 = Math.max(0, Math.floor(y - R - 1)), y1 = Math.min(p.h - 1, Math.ceil(y + R + 1));
    if (x1 < x0 || y1 < y0) return;
    var d = p.cut.data, X, Y, i, dist, cv;
    for (Y = y0; Y <= y1; Y++) for (X = x0; X <= x1; X++) {
      dist = Math.sqrt((X - x) * (X - x) + (Y - y) * (Y - y)); cv = (R - dist) / f; if (cv <= 0) continue;
      cv = (cv > 1 ? 1 : cv) * 255; i = Y * p.w + X;
      if (p.mode[i] === mode) { if (cv > p.cov[i]) p.cov[i] = cv; } else { p.mode[i] = mode; p.cov[i] = cv; }
      d[i * 4 + 3] = finalAlpha(p, i);
    }
    cutEl.getContext('2d').putImageData(p.cut, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    p.box = null;
  }
  function stroke(p, a, b) {
    var R = radius(p), step = Math.max(1, R / 3), dx = b.x - a.x, dy = b.y - a.y, n = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / step));
    for (var k = 1; k <= n; k++) stamp(p, a.x + dx * k / n, a.y + dy * k / n, R);
  }

  // Décalage du pinceau au-dessus du doigt (sinon le doigt cache ce qu'on retouche).
  function fingerOffset(ev, p) {
    if (ev.pointerType !== 'touch' || !$('offset').checked) return 0;
    return Math.max(44, radius(p) * toImg(0, 0).k + 28);
  }
  function showCursor(ev, p) {
    var c = $('cursor'), r = stageC.getBoundingClientRect(), s = radius(p) * 2 * toImg(0, 0).k;
    c.style.display = tool === 'pan' ? 'none' : 'block'; c.style.width = c.style.height = s + 'px';
    c.style.left = (ev.clientX - r.left) + 'px'; c.style.top = (ev.clientY - fingerOffset(ev, p) - r.top) + 'px';
  }

  var ptrs = {}, nPtrs = 0, gest = null, brush = null, panFrom = null;
  function stagePt(ev, stage) { var r = stage.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }

  function abortStroke(p) { // un 2e doigt arrive : c'est un geste de zoom, pas un trait
    if (brush && brush.started && p && p.undo.length) {
      var u = p.undo.pop(); p.mode = u.mode; p.cov = u.cov; buildCutout(p); drawCut(p); updateButtons(p);
    }
    brush = null;
  }
  function beginStroke(ev, p) {
    brush = { started: false, startX: ev.clientX, startY: ev.clientY, last: null };
    if (ev.pointerType !== 'touch') startStamp(ev, p); // souris/stylet : tout de suite
  }
  function startStamp(ev, p) {
    p.undo.push({ mode: p.mode.slice(), cov: p.cov.slice() }); if (p.undo.length > 8) p.undo.shift();
    var pt = toImg(ev.clientX, ev.clientY - fingerOffset(ev, p)); brush.started = true; brush.last = pt;
    stamp(p, pt.x, pt.y, radius(p)); updateButtons(p);
  }

  function bindStage(stage, canBrush) {
    stage.addEventListener('pointerdown', function (ev) {
      var p = photos[sel]; if (!p) return;
      if (ev.pointerType === 'mouse' && ev.button === 2) return;
      ev.preventDefault(); try { stage.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
      ptrs[ev.pointerId] = stagePt(ev, stage); nPtrs = Object.keys(ptrs).length;
      if (nPtrs >= 2) {
        abortStroke(p); panFrom = null;
        var ids = Object.keys(ptrs), a = ptrs[ids[0]], b = ptrs[ids[1]];
        gest = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, v: { z: view.z, tx: view.tx, ty: view.ty } };
        return;
      }
      var wantPan = !canBrush || tool === 'pan' || spaceDown || (ev.pointerType === 'mouse' && ev.button === 1);
      if (wantPan) { panFrom = { x: ev.clientX, y: ev.clientY, tx: view.tx, ty: view.ty }; stage.style.cursor = 'grabbing'; }
      else { beginStroke(ev, p); showCursor(ev, p); }
    });
    stage.addEventListener('pointermove', function (ev) {
      var p = photos[sel]; if (!p) return;
      if (ptrs[ev.pointerId]) ptrs[ev.pointerId] = stagePt(ev, stage);
      if (canBrush && !panFrom && !gest) { if (p.cut) showCursor(ev, p); }
      if (gest && nPtrs >= 2) {
        var ids = Object.keys(ptrs), a = ptrs[ids[0]], b = ptrs[ids[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        var z2 = Math.min(8, Math.max(1, gest.v.z * d / gest.d)), k = z2 / gest.v.z;
        view.z = z2; view.tx = mx - (gest.mx - gest.v.tx) * k; view.ty = my - (gest.my - gest.v.ty) * k; applyView();
        return;
      }
      if (panFrom && ptrs[ev.pointerId]) { view.tx = panFrom.tx + ev.clientX - panFrom.x; view.ty = panFrom.ty + ev.clientY - panFrom.y; applyView(); return; }
      if (brush && p.cut && ptrs[ev.pointerId]) {
        if (!brush.started) { if (Math.hypot(ev.clientX - brush.startX, ev.clientY - brush.startY) < 4) return; startStamp(ev, p); }
        var pt = toImg(ev.clientX, ev.clientY - fingerOffset(ev, p)); stroke(p, brush.last, pt); brush.last = pt;
      }
    });
    function up(ev) {
      var p = photos[sel]; delete ptrs[ev.pointerId]; nPtrs = Object.keys(ptrs).length;
      if (nPtrs < 2) gest = null;
      if (nPtrs === 0) {
        stage.style.cursor = '';
        if (brush && p) { if (!brush.started && ev.type === 'pointerup') startStamp(ev, p); makeThumb(p); renderStrip(); }
        brush = null; panFrom = null;
      }
    }
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('pointerleave', function () { if (!brush) $('cursor').style.display = 'none'; });
    stage.addEventListener('wheel', function (ev) {
      if (!photos[sel]) return; ev.preventDefault();
      var pt = stagePt(ev, stage); zoomAt(pt.x, pt.y, view.z * Math.exp(-ev.deltaY * 0.0015));
    }, { passive: false });
    stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  bindStage(stageC, true); bindStage(stageO, false);

  // ---------- boutons ----------
  function setTool(t) {
    tool = t;
    [['erase', 'mErase'], ['restore', 'mRestore'], ['pan', 'mPan']].forEach(function (x) { $(x[1]).classList.toggle('on', x[0] === t); });
    stageC.style.touchAction = 'none'; $('cursor').style.display = 'none';
  }
  $('mErase').onclick = function () { setTool('erase'); };
  $('mRestore').onclick = function () { setTool('restore'); };
  $('mPan').onclick = function () { setTool('pan'); };
  $('offset').checked = matchMedia('(pointer: coarse)').matches;
  $('bUndo').onclick = function () {
    var p = photos[sel]; if (!p || !p.undo.length) return;
    var u = p.undo.pop(); p.mode = u.mode; p.cov = u.cov; buildCutout(p); drawCut(p); makeThumb(p); renderStrip(); updateButtons(p);
  };
  $('bValid').onclick = function () { var p = photos[sel]; if (p) setStatusOf(p, 'valid'); };
  $('bOrig').onclick = function () { var p = photos[sel]; if (p) { setStatusOf(p, 'original'); } };
  $('bRedo').onclick = function () {
    var p = photos[sel]; if (!p) return;
    p.status = 'queued'; p.raw = null; p.cut = null; p.ref = null; p.undo = []; p.box = null; p.thumb = null; clearCut(); renderStrip(); updateButtons(p); runQueue();
  };
  function bindParam(id, key) { $(id).oninput = function () { params[key] = Number($(id).value); deferRefresh(); }; }
  bindParam('pLo', 'lo'); bindParam('pHi', 'hi'); bindParam('pShrink', 'shrink'); bindParam('pDefr', 'defr');
  (function fillBgs() {
    var pv = $('pvBg'), ex = $('bg'), k;
    pv.textContent = ''; ex.textContent = '';
    function opt(sel, v, t) { var o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }
    for (k in BGS) opt(pv, k, BGS[k].label);
    opt(pv, 'checker', 'Damier (transparent)');
    opt(ex, 'transparent', 'Transparent (comme aujourd\'hui)');
    for (k in BGS) opt(ex, k, BGS[k].label);
  })();
  function applyPreviewBg() {
    var k = $('pvBg').value;
    applyBg($('cutPanel'), k); applyBg(stageC, k);
    document.documentElement.style.setProperty('--thumb-bg', k === 'checker' ? '#ddd' : BGS[k].color);
  }
  $('pvBg').onchange = applyPreviewBg; applyPreviewBg();
  $('engine').value = engineKind === 'simple' ? 'simple' : 'model';
  $('engine').onchange = function () { engineKind = $('engine').value; delete engines[engineKind]; };
  $('margin').oninput = function () { $('marginV').textContent = $('margin').value + ' %'; };
  $('files').onchange = function (e) { addFiles(e.target.files); e.target.value = ''; };
  var drop = $('drop');
  ['dragenter', 'dragover'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });
  window.addEventListener('beforeunload', function (e) { if (photos.length) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- export ----------
  function exportable() { return photos.filter(function (p) { return p.status === 'valid' || p.status === 'original'; }); }
  function srcCanvasOf(p) {
    if (p.status === 'original') return p.src;
    var t = document.createElement('canvas'); t.width = p.w; t.height = p.h; t.getContext('2d').putImageData(ensureCut(p), 0, 0); return t;
  }
  function boxOf(p) {
    if (p.status === 'original') return { x: 0, y: 0, w: p.w, h: p.h };
    var id = ensureCut(p);
    if (!p.box) p.box = P.bbox(id.data, p.w, p.h, 24);
    return p.box;
  }
  function renderOutputs() {
    var list = exportable(), outW = Number($('outW').value), outH = Math.round(outW / Number($('ratio').value));
    var boxes = list.map(function (p) { var b = boxOf(p); if (p !== photos[sel]) releaseCut(p); return b; });
    var lay = P.layout(boxes, { outW: outW, outH: outH, margin: Number($('margin').value) / 100, mode: $('fit').value });
    return list.map(function (p, i) {
      var c = document.createElement('canvas'); c.width = outW; c.height = outH;
      var cx = c.getContext('2d'); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
      if ($('bg').value !== 'transparent') { cx.fillStyle = BGS[$('bg').value].color; cx.fillRect(0, 0, outW, outH); }
      var b = boxes[i], L = lay[i];
      if (b) cx.drawImage(srcCanvasOf(p), b.x, b.y, b.w, b.h, L.dx, L.dy, b.w * L.scale, b.h * L.scale);
      if (p !== photos[sel]) releaseCut(p);
      return c;
    });
  }
  $('bPreview').onclick = function () {
    var outs = renderOutputs(), g = $('preview'); g.textContent = '';
    outs.forEach(function (c) { applyBg(c, $('bg').value); g.appendChild(c); });
    $('exMsg').textContent = outs.length ? outs.length + ' photo(s) prête(s)' : 'Aucune photo validée (✓ Valider ou Garder l\'original).';
    var skipped = photos.length - outs.length; if (outs.length && skipped) $('exMsg').textContent += ' — ' + skipped + ' non validée(s) ignorée(s).';
  };

  function toBlob(c, type, q) { return new Promise(function (ok) { c.toBlob(ok, type, q); }); }
  async function encodeWebp(c, maxBytes) {
    var q = 0.85, b, tries = 0;
    for (;;) {
      b = FORCE_WASM ? null : await toBlob(c, 'image/webp', q);
      if (!b || b.type !== 'image/webp') break;
      if (b.size <= maxBytes || q <= 0.5 || ++tries > 8) return { blob: b, ext: 'webp', q: q };
      q -= 0.07;
    }
    // Safari/iPhone ne sait pas encoder le WebP via canvas : encodeur WebAssembly local (vendor/webp/), sinon PNG.
    try {
      var id = c.getContext('2d').getImageData(0, 0, c.width, c.height);
      q = 85;
      for (tries = 0; tries < 8; tries++) {
        var wb = await window.VGStudioWebP.encode(id, q);
        if (wb.size <= maxBytes || q <= 50) return { blob: wb, ext: 'webp', q: q / 100 };
        q -= 7;
      }
    } catch (e) { console.warn('Encodeur WebP de secours indisponible :', e); }
    return { blob: await toBlob(c, 'image/png'), ext: 'png', q: 1 };
  }

  async function buildFiles() {
    var slug = ($('slug').value || 'piece').trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'piece';
    var outs = renderOutputs(), files = [], total = 0, png = false, maxBytes = Number($('maxKB').value) * 1024;
    for (var i = 0; i < outs.length; i++) {
      $('exMsg').textContent = 'Encodage ' + (i + 1) + '/' + outs.length + '…';
      var r = await encodeWebp(outs[i], maxBytes); if (r.ext === 'png') png = true;
      total += r.blob.size;
      files.push({ name: i + '.' + r.ext, blob: r.blob, data: new Uint8Array(await r.blob.arrayBuffer()) });
    }
    $('exMsg').textContent = files.length + ' fichier(s), ' + Math.round(total / 1024) + ' Ko au total' + (png ? ' — WebP indisponible sur cet appareil : PNG (plus lourd).' : '.');
    return { slug: slug, files: files };
  }

  function download(blob, name) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  $('bZip').onclick = async function () {
    if (!exportable().length) { $('exMsg').textContent = 'Aucune photo validée.'; return; }
    var r = await buildFiles(); lastZip = r;
    var z = P.zip(r.files.map(function (f) { return { name: r.slug + '/' + f.name, data: f.data }; }));
    download(new Blob([z], { type: 'application/zip' }), r.slug + '.zip');
  };
  if (navigator.canShare && navigator.canShare({ files: [new File([''], 'a.webp', { type: 'image/webp' })] })) $('bShare').hidden = false;
  $('bShare').onclick = async function () {
    if (!exportable().length) { $('exMsg').textContent = 'Aucune photo validée.'; return; }
    var r = await buildFiles();
    var fl = r.files.map(function (f) { return new File([f.blob], r.slug + '-' + f.name, { type: f.blob.type }); });
    try { await navigator.share({ files: fl, title: r.slug }); } catch (e) { /* annulé */ }
  };

  // Emplacement du futur branchement (voir rapports-nuit/studio-photo.md §4) :
  // publish() enverra les fichiers de lastZip au Worker (/admin/studio/publish).
  window.VGStudio = { publish: function () { throw new Error('Publication pas encore branchée.'); }, _state: function () { return { photos: photos, params: params }; } };
})();

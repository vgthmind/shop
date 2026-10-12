/* Page « Catalogue » (admin/catalogue.html) : interface. Logique pure dans catalogue-core.js, enregistrement dans
   catalogue-save.js. Les modifications s'accumulent (« en attente »), sont gardées sur l'appareil (localStorage)
   et partent en UN commit au clic sur « Enregistrer » ; « Annuler cet enregistrement » remet l'état d'avant.
   Le stock (Sold out) vit dans le Worker : changé tout de suite, avec confirmation et annulation. */
(function () {
  'use strict';
  var C = window.VGCatalogue, S = window.VGCatalogueSave, F = window.VGPieceForm, Pub = window.VGStudioPublish;
  var ENDPOINT = window.VG_ENDPOINT || 'https://vgthmind-shop-checkout.vgthm66.workers.dev';
  var PENDING_KEY = 'vg-catalogue-pending', LAST_KEY = 'vg-catalogue-last';
  var $ = function (id) { return document.getElementById(id); };

  var pieces = [], cats = [], raw = {}, stock = null;
  var pending = { pieces: {}, categories: null };
  var selected = {}, editing = null, lastSave = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function eur(n) { return (Math.round(Number(n) * 100) / 100).toFixed(2).replace('.', ',') + ' €'; }
  function cur(slug) { return pending.pieces[slug] || pieces.filter(function (p) { return p.slug === slug; })[0]; }
  function all() {
    var seen = {}, out = pieces.map(function (p) { seen[p.slug] = 1; return pending.pieces[p.slug] || p; });
    Object.keys(pending.pieces).forEach(function (s) { if (!seen[s]) out.push(pending.pieces[s]); }); // pièces nouvelles (dupliquées)
    return out;
  }
  function catsNow() { return pending.categories || cats; }
  function catName(perm) { var c = catsNow().filter(function (x) { return x.permalink === perm; })[0]; return c ? c.name : perm; }
  function pendingCount() { return Object.keys(pending.pieces).length + (pending.categories ? 1 : 0); }

  // ---------- messages ----------
  var toastTimer = null;
  function toast(msg, opts) {
    opts = opts || {};
    var t = $('toast');
    t.className = opts.error ? 'err' : '';
    t.innerHTML = esc(msg) + (opts.action ? ' <button type="button">' + esc(opts.action) + '</button>' : '');
    t.hidden = false;
    if (opts.action) t.querySelector('button').onclick = function () { t.hidden = true; opts.onAction(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, opts.ms || (opts.action ? 9000 : opts.error ? 8000 : 3500));
  }

  // ---------- sauvegarde locale (rien ne se perd si l'onglet se ferme) ----------
  function persist() {
    try {
      if (pendingCount()) localStorage.setItem(PENDING_KEY, JSON.stringify({ at: Date.now(), pending: pending }));
      else localStorage.removeItem(PENDING_KEY);
    } catch (e) { /* stockage plein ou interdit : la page marche quand même */ }
    drawSaveBar();
  }
  function restoreOffer() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch (e) {}
    var b = $('restore');
    if (!saved || !saved.pending) { b.hidden = true; return; }
    var n = Object.keys(saved.pending.pieces || {}).length + (saved.pending.categories ? 1 : 0);
    if (!n) { b.hidden = true; return; }
    b.innerHTML = '<span class="grow">Modifications non enregistrées retrouvées (' + n + ', du ' + esc(new Date(saved.at).toLocaleString('fr-FR')) + ').</span>'
      + '<button type="button" class="primary" id="r-yes">Reprendre</button><button type="button" id="r-no">Effacer</button>';
    b.hidden = false;
    $('r-yes').onclick = function () { pending = { pieces: saved.pending.pieces || {}, categories: saved.pending.categories || null }; b.hidden = true; draw(); persist(); toast('Modifications reprises. Pense à « Enregistrer ».'); };
    $('r-no').onclick = function () { if (!confirm('Effacer ces modifications non enregistrées ?')) return; try { localStorage.removeItem(PENDING_KEY); } catch (e) {} b.hidden = true; };
  }

  // ---------- connexion ----------
  var session = '';
  function captureSession(e) {
    if (e.origin !== ENDPOINT) return;
    var m = /^authorization:github:success:(.*)$/.exec(String(e.data || ''));
    if (!m) return;
    try { var p = JSON.parse(m[1]); if (p.session) { session = p.session; localStorage.setItem('vg-admin-session', p.session); } } catch (err) {}
  }
  $('login-btn').addEventListener('click', function () {
    $('login-msg').textContent = 'Connexion…';
    window.addEventListener('message', captureSession);
    Pub.login().then(function () { $('login-msg').textContent = ''; return load(); })
      .catch(function (e) { $('login-msg').textContent = e.message; })
      .then(function () { setTimeout(function () { window.removeEventListener('message', captureSession); }, 1000); });
  });

  // ---------- chargement ----------
  function loadStock() {
    return fetch(ENDPOINT + '/stock').then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { stock = d && d.stock ? d.stock : null; }).catch(function () { stock = null; });
  }
  function load() {
    toast('Chargement du catalogue…', { ms: 20000 });
    return Promise.all([S.load(Pub.api), loadStock()]).then(function (res) {
      pieces = res[0].pieces; cats = res[0].categories; raw = res[0].raw;
      Object.keys(pending.pieces).forEach(function (s) { if (JSON.stringify(pending.pieces[s]) === JSON.stringify(pieces.filter(function (p) { return p.slug === s; })[0])) delete pending.pieces[s]; });
      $('login').hidden = true; $('app').hidden = false;
      try { lastSave = JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); } catch (e) { lastSave = null; }
      fillCatSelects(); draw(); drawSaveBar(); restoreOffer();
      toast(pieces.length + ' pièces chargées' + (stock ? '' : ' (stock indisponible pour l\'instant)') + '.');
    }).catch(function (e) { toast('Chargement impossible : ' + e.message, { error: true }); });
  }

  // ---------- liste ----------
  function filters() {
    return { q: $('q').value, cat: $('f-cat').value, stock: $('f-stock').value, unique: $('f-unique').value, status: $('f-status').value };
  }
  function canReorder() {
    var f = filters();
    return !f.q && !f.cat && !f.stock && !f.unique && f.status === 'actives';
  }
  function statusTag(p) {
    var st = C.statusOf(p);
    return st === 'publiee' ? '' : st === 'brouillon' ? '<span class="tag draft">Brouillon</span>' : st === 'masquee' ? '<span class="tag hid">Masquée</span>' : '<span class="tag arch">Archivée</span>';
  }
  function stockTag(p) {
    var n = C.stockOf(p, stock);
    return n <= 0 ? '<span class="tag out">Sold out</span>' : '<span class="tag ok">' + (n === 1 ? 'En stock' : n + ' en stock') + '</span>';
  }
  function thumbHtml(p, cls) {
    var t = C.thumbUrls(p);
    return '<img class="' + (cls || 'thumb') + '" loading="lazy" alt="" src="' + esc(t.src) + '" data-fb="' + esc(t.fallback) + '">';
  }
  function draw() {
    var list = C.byPosition(C.filter(all(), filters(), stock)), reorder = canReorder();
    $('count').textContent = list.length + ' pièce' + (list.length > 1 ? 's' : '');
    $('ordernote').textContent = reorder ? 'Glisse ⠿ (ou ↑ ↓ sur téléphone) pour changer l\'ordre dans la boutique.' : 'Ordre : retire les filtres pour réordonner.';
    $('list').innerHTML = list.length ? list.map(function (p) {
      var chg = !!pending.pieces[p.slug];
      var catChips = (p.categories || []).filter(function (c) { return C.FIXED_CATS.indexOf(c) === -1; }).map(function (c) { return '<span class="tag">' + esc(catName(c)) + '</span>'; }).join('');
      return '<li data-slug="' + esc(p.slug) + '" class="' + (selected[p.slug] ? 'sel' : '') + '"' + (reorder ? ' draggable="true"' : '') + '>'
        + '<input type="checkbox" data-sel aria-label="Sélectionner ' + esc(p.name) + '"' + (selected[p.slug] ? ' checked' : '') + '>'
        + '<span class="handle' + (reorder ? '' : ' off') + '" aria-hidden="true">⠿</span>'
        + thumbHtml(p)
        + '<div class="info"><div class="nm">' + esc(p.name) + '</div><div class="meta">'
        + (p.latest_drop ? '<span class="tag">Latest Drop</span>' : '') + catChips
        + (p.unique !== false ? '<span class="tag">Unique piece</span>' : '')
        + (p.color_hex ? '<span class="tag"><span class="dot" style="background:' + esc(p.color_hex) + '"></span></span>' : '')
        + (chg ? '<span class="tag chg">modifiée</span>' : '') + '</div></div>'
        + '<div class="right"><span class="price">' + eur(p.price) + '</span>' + stockTag(p) + statusTag(p)
        + (reorder ? '<span class="updown"><button type="button" class="small" data-up aria-label="Monter">↑</button><button type="button" class="small" data-down aria-label="Descendre">↓</button></span>' : '')
        + '</div></li>';
    }).join('') : '<li class="empty">Aucune pièce ne correspond.</li>';
    drawBulk();
  }
  // Vignette WebP absente (pièce toute neuve, site pas encore reconstruit) : photo d'origine.
  $('list').addEventListener('error', function (e) {
    var img = e.target;
    if (img.tagName === 'IMG' && img.dataset.fb && img.src.indexOf(img.dataset.fb) === -1) img.src = img.dataset.fb;
  }, true);

  ['q', 'f-cat', 'f-stock', 'f-unique', 'f-status'].forEach(function (id) { $(id).addEventListener('input', draw); });

  function fillCatSelects() {
    var opts = catsNow().filter(function (c) { return c.permalink !== 'all'; }).map(function (c) { return '<option value="' + esc(c.permalink) + '">' + esc(c.name) + '</option>'; }).join('');
    var ed = C.editableCats(catsNow()).map(function (c) { return '<option value="' + esc(c.permalink) + '">' + esc(c.name) + '</option>'; }).join('');
    var keep = $('f-cat').value;
    $('f-cat').innerHTML = '<option value="">Toutes les catégories</option>' + opts; $('f-cat').value = keep;
    $('bulk-add').innerHTML = '<option value="">+ Catégorie…</option>' + ed;
    $('bulk-rm').innerHTML = '<option value="">− Catégorie…</option>' + ed;
  }

  // ---------- modifications en attente ----------
  function stage(changed, label) {
    var n = 0;
    Object.keys(changed).forEach(function (slug) {
      var orig = pieces.filter(function (p) { return p.slug === slug; })[0];
      if (orig && JSON.stringify(orig) === JSON.stringify(changed[slug])) delete pending.pieces[slug];
      else pending.pieces[slug] = changed[slug];
      n++;
    });
    persist(); draw();
    if (label) toast(label + (n ? ' (' + n + ')' : '') + '. Pas encore en ligne : clique « Enregistrer ».');
  }

  function drawSaveBar() {
    var n = pendingCount(), bar = $('savebar');
    var canUndo = !!(lastSave && lastSave.undo && Date.now() - lastSave.at < 24 * 3600 * 1000);
    bar.hidden = !n && !canUndo;
    $('save').hidden = !n; $('discard').hidden = !n;
    $('undo').hidden = !!n || !canUndo;
    $('savemsg').textContent = n ? n + ' modification' + (n > 1 ? 's' : '') + ' en attente (gardée' + (n > 1 ? 's' : '') + ' sur cet appareil)'
      : canUndo ? 'Enregistré ✓ le site se met à jour en 1 à 2 minutes.' : '';
  }

  $('discard').addEventListener('click', function () {
    if (!confirm('Annuler toutes les modifications non enregistrées ?')) return;
    var before = pending; pending = { pieces: {}, categories: null }; persist(); fillCatSelects(); draw();
    toast('Modifications annulées.', { action: 'Rétablir', onAction: function () { pending = before; persist(); fillCatSelects(); draw(); } });
  });

  $('save').addEventListener('click', function () {
    var perms = catsNow().map(function (c) { return c.permalink; });
    for (var s in pending.pieces) {
      var err = C.check(pending.pieces[s], perms);
      if (err) { toast(pending.pieces[s].name + ' : ' + err, { error: true }); openEditor(s); return; }
    }
    var slugs = Object.keys(pending.pieces);
    var msg = 'Catalogue : ' + (slugs.length ? slugs.join(', ') : '') + (pending.categories ? (slugs.length ? ' + ' : '') + 'catégories' : '') + ' (page Catalogue)';
    $('save').disabled = true;
    S.save(Pub.api, pending, raw, msg, function (t) { $('savemsg').textContent = t; }).then(function (r) {
      lastSave = { at: Date.now(), undo: r.undo, written: r.written };
      try { localStorage.setItem(LAST_KEY, JSON.stringify(lastSave)); } catch (e) {}
      Object.keys(r.written).forEach(function (p) { raw[p] = r.written[p]; });
      Object.keys(pending.pieces).forEach(function (s) {
        var q = pending.pieces[s], i = pieces.map(function (p) { return p.slug; }).indexOf(s);
        if (i === -1) pieces.push(q); else pieces[i] = q;
      });
      if (pending.categories) cats = pending.categories;
      pending = { pieces: {}, categories: null }; persist(); fillCatSelects(); draw();
      toast('Enregistré ✓ Le site se met à jour tout seul (1 à 2 minutes).', { ms: 6000 });
    }).catch(function (e) {
      toast(e.message, { error: true, ms: 12000 });
    }).then(function () { $('save').disabled = false; drawSaveBar(); });
  });

  $('undo').addEventListener('click', function () {
    if (!lastSave || !confirm('Annuler le dernier enregistrement ? Les pièces reviennent à leur état d\'avant (une pièce créée par cet enregistrement passe en archivée).')) return;
    $('undo').disabled = true;
    S.revert(Pub.api, lastSave, function (t) { $('savemsg').textContent = t; }).then(function () {
      lastSave = null; try { localStorage.removeItem(LAST_KEY); } catch (e) {}
      return load();
    }).then(function () { toast('Dernier enregistrement annulé ✓'); })
      .catch(function (e) { toast(e.message, { error: true, ms: 12000 }); })
      .then(function () { $('undo').disabled = false; drawSaveBar(); });
  });

  $('reload').addEventListener('click', function () { load(); });

  // ---------- sélection + actions groupées ----------
  function selSlugs() { return Object.keys(selected).filter(function (s) { return selected[s]; }); }
  function drawBulk() {
    var n = selSlugs().length;
    $('bulk').hidden = !n; document.body.classList.toggle('has-bulk', !!n);
    $('bulkmsg').textContent = n + ' sélectionnée' + (n > 1 ? 's' : '');
    var visible = Array.prototype.slice.call(document.querySelectorAll('#list li[data-slug]'));
    $('all').checked = visible.length > 0 && visible.every(function (li) { return selected[li.dataset.slug]; });
  }
  $('all').addEventListener('change', function () {
    var on = $('all').checked;
    document.querySelectorAll('#list li[data-slug]').forEach(function (li) { selected[li.dataset.slug] = on; });
    draw();
  });
  $('bulk-none').addEventListener('click', function () { selected = {}; draw(); });
  document.querySelectorAll('[data-bulk]').forEach(function (b) {
    b.addEventListener('click', function () {
      var st = b.getAttribute('data-bulk'), slugs = selSlugs();
      if (st === 'archivee' && !confirm('Archiver ' + slugs.length + ' pièce(s) ? Elles disparaissent du site (fiches gardées, réversible).')) return;
      stage(C.bulk(all(), slugs, { type: 'status', value: st }), { publiee: 'Publiées', masquee: 'Masquées', brouillon: 'Passées en brouillon', archivee: 'Archivées' }[st]);
    });
  });
  $('bulk-add').addEventListener('change', function () {
    var v = this.value; this.value = ''; if (!v) return;
    stage(C.bulk(all(), selSlugs(), { type: 'addCat', value: v }), 'Ajoutées à « ' + catName(v) + ' »');
  });
  $('bulk-rm').addEventListener('change', function () {
    var v = this.value; this.value = ''; if (!v) return;
    stage(C.bulk(all(), selSlugs(), { type: 'removeCat', value: v }), 'Retirées de « ' + catName(v) + ' »');
  });

  // Stock : tout de suite dans le Worker (comme la page Stock), avec annulation.
  function setStock(map, label) {
    var tok = session || (window.vgAdminToken && window.vgAdminToken());
    if (!tok) { toast('Connexion au stock expirée : recharge la page et reconnecte-toi.', { error: true }); return Promise.resolve(); }
    var before = {};
    Object.keys(map).forEach(function (s) { before[s] = Math.max(0, C.stockOf(cur(s) || { slug: s }, stock)); });
    return fetch(ENDPOINT + '/admin/stock', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ stock: map }) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || ('Erreur ' + r.status)); return d; }); })
      .then(function () { return loadStock(); })
      .then(function () {
        draw(); if (editing) drawEditor();
        toast(label + ' ✓ (visible sur le site sous 15 secondes)', { action: 'Annuler', onAction: function () { setStock(before, 'Stock remis comme avant'); } });
      })
      .catch(function (e) { toast('Stock non modifié : ' + e.message, { error: true }); });
  }
  $('bulk-soldout').addEventListener('click', function () {
    var slugs = selSlugs();
    if (!confirm('Mettre ' + slugs.length + ' pièce(s) en Sold out (stock à 0) ? C\'est immédiat sur le site.')) return;
    var m = {}; slugs.forEach(function (s) { m[s] = 0; });
    setStock(m, slugs.length + ' pièce(s) en Sold out');
  });

  // ---------- clics dans la liste ----------
  $('list').addEventListener('click', function (e) {
    var li = e.target.closest('li[data-slug]'); if (!li) return;
    var slug = li.dataset.slug;
    if (e.target.hasAttribute('data-sel')) { selected[slug] = e.target.checked; li.classList.toggle('sel', e.target.checked); drawBulk(); return; }
    if (e.target.hasAttribute('data-up') || e.target.hasAttribute('data-down')) {
      var list = C.byPosition(C.filter(all(), filters(), stock)), i = list.map(function (p) { return p.slug; }).indexOf(slug);
      applyOrder(slug, i + (e.target.hasAttribute('data-up') ? -1 : 1)); return;
    }
    if (e.target.closest('.handle')) return;
    openEditor(slug);
  });

  function applyOrder(slug, to) {
    var visible = C.filter(all(), filters(), stock), pos = C.reorder(visible, slug, to), changed = {};
    Object.keys(pos).forEach(function (s) { var q = JSON.parse(JSON.stringify(cur(s))); q.position = pos[s]; changed[s] = q; });
    if (Object.keys(changed).length) stage(changed, 'Ordre changé');
  }

  // Glisser-déposer (ordinateur).
  var dragSlug = null;
  $('list').addEventListener('dragstart', function (e) {
    var li = e.target.closest('li[data-slug]'); if (!li) return;
    dragSlug = li.dataset.slug; li.classList.add('dragging');
    try { e.dataTransfer.setData('text/plain', dragSlug); e.dataTransfer.effectAllowed = 'move'; } catch (err) {}
  });
  $('list').addEventListener('dragover', function (e) {
    if (!dragSlug) return; e.preventDefault();
    document.querySelectorAll('#list .drag-over').forEach(function (x) { x.classList.remove('drag-over'); });
    var li = e.target.closest('li[data-slug]'); if (li) li.classList.add('drag-over');
  });
  $('list').addEventListener('drop', function (e) {
    e.preventDefault();
    var li = e.target.closest('li[data-slug]'); if (!li || !dragSlug) return;
    var order = Array.prototype.map.call(document.querySelectorAll('#list li[data-slug]'), function (x) { return x.dataset.slug; });
    var s = dragSlug; dragSlug = null;
    applyOrder(s, order.indexOf(li.dataset.slug));
  });
  $('list').addEventListener('dragend', function () { dragSlug = null; document.querySelectorAll('#list .dragging, #list .drag-over').forEach(function (x) { x.classList.remove('dragging', 'drag-over'); }); });

  // ---------- éditeur d'une pièce ----------
  var original = null;
  function openEditor(slug) {
    editing = slug;
    original = JSON.parse(JSON.stringify(pieces.filter(function (p) { return p.slug === slug; })[0] || null));
    drawEditor();
    if (!$('editor').open) $('editor').showModal();
  }
  function edited() { return JSON.parse(JSON.stringify(cur(editing))); }
  function commitEdit(q) {
    var ch = {}; ch[editing] = q; stage(ch);
    var err = C.check(q, catsNow().map(function (c) { return c.permalink; }));
    $('ed-err').textContent = err || '';
    $('ed-title').textContent = q.name || q.slug;
    drawState(q);
  }
  function drawState(q) {
    var st = C.statusOf(q), lab = C.STATUSES.filter(function (s) { return s.id === st; })[0].label;
    $('ed-state').textContent = pending.pieces[editing] ? lab + ' · modifiée' : lab;
    $('ed-state').className = 'tag' + (pending.pieces[editing] ? ' chg' : '');
  }
  function colorOptions(q) {
    var known = F.COLORS.map(function (c) { return c.hex; });
    var opts = '<option value="">Pas de pastille</option>' + F.COLORS.map(function (c) {
      return '<option value="' + c.id + '"' + (q.color_hex === c.hex ? ' selected' : '') + '>' + esc(c.label) + '</option>';
    }).join('') + '<option value="autre"' + (q.color_hex && known.indexOf(q.color_hex) === -1 ? ' selected' : '') + '>Autre…</option>';
    return opts;
  }
  function drawEditor() {
    var q = cur(editing); if (!q) return;
    var n = C.stockOf(q, stock);
    $('ed-title').textContent = q.name || q.slug;
    $('ed-view').href = '../product/' + encodeURIComponent(q.slug);
    var ed = C.editableCats(catsNow());
    var desc = String(q.description || '');
    $('ed-body').innerHTML =
      '<p class="err" id="ed-err"></p>'
      + '<div class="field"><span>Statut</span><div class="chips">' + C.STATUSES.map(function (s) {
        return '<label><input type="radio" name="ed-st" value="' + s.id + '"' + (C.statusOf(q) === s.id ? ' checked' : '') + '>' + esc(s.label) + '</label>';
      }).join('') + '</div><div class="muted" style="margin-top:4px">Brouillon : visible seulement par son lien (bouton « Voir sur le site »), pas achetable. Masquée : achetable par lien direct, absente des listes. Archivée : retirée du site.</div></div>'
      + '<label class="field"><span>Nom</span><input type="text" data-k="name" value="' + esc(q.name) + '"></label>'
      + '<div class="row2"><label class="field"><span>Prix (€)</span><input type="number" inputmode="decimal" min="0" step="0.01" data-k="price" value="' + esc(q.price) + '"></label>'
      + '<label class="field"><span>Taille</span><input type="text" data-k="size" maxlength="20" placeholder="M, 42, Unique…" value="' + esc(q.size || '') + '"></label></div>'
      + '<div class="field"><span>Stock (en direct)</span><div class="bar" style="margin:0">' + (n <= 0 ? '<span class="tag out">Sold out</span>' : '<span class="tag ok">' + n + ' en stock</span>')
      + '<input type="number" min="0" max="9999" step="1" inputmode="numeric" id="ed-stock" value="' + Math.max(0, n) + '" style="width:90px" aria-label="Stock">'
      + '<button type="button" class="small" id="ed-stock-set">Changer le stock</button>' + (n > 0 ? '<button type="button" class="small danger" id="ed-soldout">Sold out</button>' : '') + '</div>'
      + (q.draft ? '<div class="muted">En brouillon : jamais achetable, même avec du stock.</div>' : '') + '</div>'
      + '<label class="field"><span>Description (anglais puis français, séparés par une ligne vide)</span><textarea rows="7" data-k="description">' + esc(desc) + '</textarea></label>'
      + '<div class="field"><span>Catégories</span><div class="chips">' + ed.map(function (c) {
        return '<label><input type="checkbox" data-cat value="' + esc(c.permalink) + '"' + ((q.categories || []).indexOf(c.permalink) !== -1 ? ' checked' : '') + '>' + esc(c.name) + '</label>';
      }).join('') + '<label><input type="checkbox" data-k="latest_drop"' + (q.latest_drop ? ' checked' : '') + '>Latest Drop</label></div></div>'
      + '<div class="field"><span>Badges</span><div class="chips"><label><input type="checkbox" data-k="unique"' + (q.unique !== false ? ' checked' : '') + '>Badge « UNIQUE PIECE »</label></div></div>'
      + '<div class="row2"><label class="field"><span>Pastille couleur</span><select id="ed-color">' + colorOptions(q) + '</select></label>'
      + '<label class="field"><span>Teinte <span class="dot" id="ed-dot" style="background:' + esc(q.color_hex || 'transparent') + '"></span></span><input type="text" id="ed-hex" placeholder="#1a1a1a" value="' + esc(q.color_hex || '') + '"></label></div>'
      + '<label class="field"><span>Reel (lien Instagram ou YouTube)</span><input type="url" inputmode="url" data-k="reel_url" placeholder="https://www.instagram.com/reel/…" value="' + esc(q.reel_url || '') + '"></label>'
      + '<div class="field"><span>Photos (la 1re, encadrée, est la photo principale). Glisse, ou utilise ← →.</span><div class="photos" id="ed-photos">' + (q.images || []).map(function (u, i) {
        var t = C.thumbUrls({ images: [u] });
        return '<div class="photo" draggable="true" data-i="' + i + '">' + (i === 0 ? '<span class="main">principale</span>' : '')
          + '<img loading="lazy" alt="Photo ' + (i + 1) + '" src="' + esc(t.src) + '" data-fb="' + esc(t.fallback) + '">'
          + '<div class="pa"><button type="button" data-pl aria-label="Avant">←</button><button type="button" data-px aria-label="Retirer">✕</button><button type="button" data-pr aria-label="Après">→</button></div></div>';
      }).join('') + '</div><div class="muted" style="margin-top:6px">Ajouter des photos : <a href="studio-photo.html">studio « Nouvelle pièce »</a> (même nom de pièce, case « remplacer » décochée). Retirer une photo l\'enlève de la pièce ; le fichier reste dans le dépôt.</div></div>'
      + '<p class="muted">Adresse : /product/' + esc(q.slug) + ' · poids et ports : <a href="pieces.html">page Poids &amp; ports</a>.</p>';
    drawState(q);
    $('ed-err').textContent = C.check(q, catsNow().map(function (c) { return c.permalink; })) || '';
  }

  // Saisie dans l'éditeur : appliquée tout de suite aux modifications en attente (et gardée sur l'appareil).
  var inputTimer = null;
  $('ed-body').addEventListener('input', function (e) {
    var t = e.target, q = edited();
    if (t.id === 'ed-stock') return;
    if (t.name === 'ed-st') { q = C.withStatus(q, t.value); commitEdit(q); drawEditor(); return; }
    if (t.hasAttribute('data-cat')) {
      q.categories = Array.prototype.map.call($('ed-body').querySelectorAll('[data-cat]:checked'), function (x) { return x.value; });
      commitEdit(q); return;
    }
    if (t.id === 'ed-color') {
      var c = F.colorById(t.value);
      if (!t.value) { delete q.color_hex; delete q.color_name; }
      else if (c) { q.color_hex = c.hex; q.color_name = c.name || c.id; }
      else { q.color_name = q.color_name || 'autre'; q.color_hex = q.color_hex || '#9a9a9a'; }
      $('ed-hex').value = q.color_hex || ''; $('ed-dot').style.background = q.color_hex || 'transparent';
      commitEdit(q); return;
    }
    if (t.id === 'ed-hex') {
      var h = t.value.trim();
      if (h) q.color_hex = h.toLowerCase(); else { delete q.color_hex; delete q.color_name; }
      $('ed-dot').style.background = /^#[0-9a-f]{6}$/i.test(h) ? h : 'transparent';
      clearTimeout(inputTimer); inputTimer = setTimeout(function () { commitEdit(q); }, 250); return;
    }
    var k = t.getAttribute('data-k'); if (!k) return;
    if (t.type === 'checkbox') q[k] = t.checked;
    else if (k === 'price') q.price = t.value === '' ? '' : Number(t.value);
    else if (k === 'size' || k === 'reel_url') { var v = t.value.trim(); if (v) q[k] = v; else delete q[k]; }
    else q[k] = t.value;
    clearTimeout(inputTimer); inputTimer = setTimeout(function () { commitEdit(q); }, 250);
  });

  function photosChanged(images) { var q = edited(); q.images = images; commitEdit(q); drawEditor(); }
  $('ed-body').addEventListener('click', function (e) {
    var ph = e.target.closest('.photo');
    if (ph) {
      var i = Number(ph.dataset.i), imgs = edited().images || [];
      if (e.target.hasAttribute('data-pl')) photosChanged(C.move(imgs, i, i - 1));
      else if (e.target.hasAttribute('data-pr')) photosChanged(C.move(imgs, i, i + 1));
      else if (e.target.hasAttribute('data-px')) {
        if (imgs.length <= 1) { toast('Une pièce garde au moins une photo.', { error: true }); return; }
        if (!confirm('Retirer cette photo de la pièce ? (Le fichier reste dans le dépôt ; « Annuler mes changements » la remet.)')) return;
        photosChanged(imgs.filter(function (_, k) { return k !== i; }));
      }
      return;
    }
    if (e.target.id === 'ed-soldout') {
      if (!confirm('Mettre « ' + cur(editing).name + ' » en Sold out (stock à 0) ? C\'est immédiat sur le site.')) return;
      var m = {}; m[editing] = 0; setStock(m, 'Sold out');
    }
    if (e.target.id === 'ed-stock-set') {
      var v = Math.floor(Number($('ed-stock').value));
      if (!isFinite(v) || v < 0 || v > 9999) { toast('Stock : un nombre entre 0 et 9999.', { error: true }); return; }
      var m2 = {}; m2[editing] = v; setStock(m2, 'Stock de « ' + cur(editing).name + ' » : ' + v);
    }
  });
  $('ed-body').addEventListener('error', function (e) {
    var img = e.target; if (img.tagName === 'IMG' && img.dataset.fb && img.src.indexOf(img.dataset.fb) === -1) img.src = img.dataset.fb;
  }, true);
  // Photos : glisser-déposer.
  var dragPhoto = -1;
  $('ed-body').addEventListener('dragstart', function (e) { var ph = e.target.closest('.photo'); if (ph) { dragPhoto = Number(ph.dataset.i); try { e.dataTransfer.setData('text/plain', String(dragPhoto)); } catch (err) {} } });
  $('ed-body').addEventListener('dragover', function (e) { if (dragPhoto >= 0 && e.target.closest('.photo')) e.preventDefault(); });
  $('ed-body').addEventListener('drop', function (e) {
    var ph = e.target.closest('.photo'); if (!ph || dragPhoto < 0) return; e.preventDefault();
    var to = Number(ph.dataset.i), from = dragPhoto; dragPhoto = -1;
    if (from !== to) photosChanged(C.move(edited().images || [], from, to));
  });

  function closeEditor() { clearTimeout(inputTimer); editing = null; $('editor').close(); draw(); }
  $('ed-close').addEventListener('click', closeEditor);
  $('ed-done').addEventListener('click', function () {
    var q = cur(editing), err = C.check(q, catsNow().map(function (c) { return c.permalink; }));
    if (err && pending.pieces[editing]) { if (!confirm('Attention : ' + err + '\nFermer quand même ? (La pièce ne pourra pas être enregistrée tant que ce n\'est pas corrigé.)')) return; }
    var had = !!pending.pieces[editing];
    closeEditor();
    if (had) toast('Gardé. Clique « Enregistrer » pour mettre en ligne.');
  });
  $('editor').addEventListener('cancel', function (e) { e.preventDefault(); closeEditor(); });
  $('ed-revert').addEventListener('click', function () {
    if (!pending.pieces[editing]) { toast('Aucun changement sur cette pièce.'); return; }
    if (!original) { if (!confirm('Cette pièce est une copie pas encore enregistrée : l\'abandonner ?')) return; delete pending.pieces[editing]; persist(); closeEditor(); return; }
    if (!confirm('Revenir à la version enregistrée de cette pièce ?')) return;
    delete pending.pieces[editing]; persist(); drawEditor(); draw();
    toast('Changements de la pièce annulés.');
  });
  $('ed-dup').addEventListener('click', function () {
    var src = cur(editing), taken = all().map(function (p) { return p.slug; });
    var d = C.duplicate(src, taken);
    pending.pieces[d.slug] = d; persist(); draw();
    openEditor(d.slug);
    toast('Copie créée en brouillon : « ' + d.name + ' ». Change le nom, les photos, puis « Enregistrer ».', { ms: 7000 });
  });

  // ---------- catégories ----------
  function drawCats() {
    var ed = C.editableCats(catsNow());
    $('cat-rows').innerHTML = ed.map(function (c, i) {
      var n = all().filter(function (p) { return (p.categories || []).indexOf(c.permalink) !== -1 && C.statusOf(p) !== 'archivee'; }).length;
      return '<div class="catrow" data-p="' + esc(c.permalink) + '"><label><input type="text" value="' + esc(c.name) + '" aria-label="Nom de la catégorie"> <span class="muted">' + n + ' pièce' + (n > 1 ? 's' : '') + ' · /category/' + esc(c.permalink) + '</span></label>'
        + '<button type="button" class="small" data-cu ' + (i === 0 ? 'disabled' : '') + ' aria-label="Monter">↑</button><button type="button" class="small" data-cd ' + (i === ed.length - 1 ? 'disabled' : '') + ' aria-label="Descendre">↓</button></div>';
    }).join('');
  }
  function catsChanged(next) {
    pending.categories = JSON.stringify(next) === JSON.stringify(cats) ? null : next;
    persist(); fillCatSelects(); drawCats(); draw();
  }
  $('cats-btn').addEventListener('click', function () { $('cat-err').textContent = ''; drawCats(); $('catdlg').showModal(); });
  $('cat-close').addEventListener('click', function () { $('catdlg').close(); });
  $('cat-done').addEventListener('click', function () { $('catdlg').close(); if (pending.categories) toast('Catégories modifiées. Clique « Enregistrer » pour mettre en ligne.'); });
  $('cat-rows').addEventListener('change', function (e) {
    var row = e.target.closest('.catrow'); if (!row || e.target.tagName !== 'INPUT') return;
    var r = C.renameCategory(catsNow(), row.dataset.p, e.target.value);
    if (r.error) { $('cat-err').textContent = r.error; drawCats(); return; }
    $('cat-err').textContent = ''; catsChanged(r.categories);
  });
  $('cat-rows').addEventListener('click', function (e) {
    var row = e.target.closest('.catrow'); if (!row) return;
    if (e.target.hasAttribute('data-cu')) catsChanged(C.moveCategory(catsNow(), row.dataset.p, -1).categories);
    if (e.target.hasAttribute('data-cd')) catsChanged(C.moveCategory(catsNow(), row.dataset.p, 1).categories);
  });
  $('cat-add').addEventListener('click', function () {
    var r = C.addCategory(catsNow(), $('cat-new').value);
    if (r.error) { $('cat-err').textContent = r.error; return; }
    $('cat-err').textContent = ''; $('cat-new').value = ''; catsChanged(r.categories);
  });

  // Quitter la page avec des modifications : elles restent gardées sur l'appareil, on prévient quand même.
  window.addEventListener('beforeunload', function (e) { if (pendingCount()) { e.preventDefault(); e.returnValue = ''; } });

  // Mode démo hors ligne (tests de la page sans GitHub) : ?demo=1 charge window.__VG_DEMO.
  if (window.__VG_DEMO) {
    pieces = window.__VG_DEMO.pieces; cats = window.__VG_DEMO.categories; raw = {}; stock = window.__VG_DEMO.stock || null;
    $('login').hidden = true; $('app').hidden = false; fillCatSelects(); draw(); drawSaveBar(); restoreOffer();
  }
})();

/* Studio photo — publication des photos d'une pièce, par le MÊME chemin que l'admin actuel (Sveltia) :
   1. jeton GitHub « fine-grained » limité au dépôt vgthmind/shop, collé une fois par vgthmind (voir login()) ;
   2. le navigateur écrit directement dans le dépôt vgthmind/shop, branche main, avec l'API GitHub
      (un seul commit : photos + data/products/<slug>.json) ;
   3. l'Action « Build shop » reconstruit data/catalog.json, les tailles d'images et docs/ (1 à 2 min).
   AUCUN jeton n'est écrit dans le code ni dans le dépôt : le jeton est gardé dans ce navigateur seulement (localStorage). */
(function (root) {
  'use strict';
  var ENDPOINT = root.VG_ENDPOINT || 'https://vgthmind-shop-checkout.vgthm66.workers.dev';
  var REPO = 'vgthmind/shop', BRANCH = 'main', API = 'https://api.github.com';
  var token = '';
  var MAX_PHOTO_BYTES = 25 * 1024 * 1024;

  // Connexion GitHub (2026-10-12) : un jeton « fine-grained » créé par vgthmind, limité au seul dépôt
  // vgthmind/shop (guide : rapports-nuit/GUIDE-JETON-GITHUB.md), collé une fois et gardé sur cet appareil.
  // Le jeton de la connexion « Se connecter avec GitHub » (OAuth) n'est plus utilisé pour écrire : il
  // ouvrait tous les dépôts publics du compte. L'OAuth ne sert plus qu'à la session du Worker (stock).
  var PAT_KEY = 'vg-github-pat';
  var GUIDE = 'https://github.com/vgthmind/shop/blob/main/rapports-nuit/GUIDE-JETON-GITHUB.md';
  function store() { try { return root.localStorage || null; } catch (e) { return null; } }
  function savedPat() { var ls = store(); try { return ls ? ls.getItem(PAT_KEY) || '' : ''; } catch (e) { return ''; } }
  function keepPat(t) { var ls = store(); try { if (ls) ls.setItem(PAT_KEY, t); } catch (e) { /* navigation privée */ } }
  function forget() { token = ''; var ls = store(); try { if (ls) ls.removeItem(PAT_KEY); } catch (e) { /* rien */ } }

  // Vérifie le jeton auprès de GitHub. Refuse les jetons « classiques » (ghp_…) : ils ouvrent tous les dépôts.
  async function checkPat(t) {
    t = String(t || '').replace(/\s+/g, '');
    if (!t) throw new Error('Colle ton jeton GitHub.');
    if (/^(ghp|gho|ghu|ghs|ghr)_/.test(t)) throw new Error('Ce jeton est un jeton « classique » : il ouvre tous tes dépôts. Crée plutôt un jeton « Fine-grained » limité au dépôt shop (voir le guide).');
    var r;
    try { r = await fetch(API + '/repos/' + REPO, { headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' } }); }
    catch (e) { throw new Error('Pas de connexion à GitHub : vérifie ta connexion internet puis réessaie.'); }
    if (r.status === 401) throw new Error('GitHub refuse ce jeton : il est expiré, supprimé ou mal copié. Recopie-le, ou crée-en un nouveau (voir le guide).');
    if (r.status === 403 || r.status === 404) throw new Error('Ce jeton n’a pas accès au dépôt vgthmind/shop. Dans « Repository access », choisis « Only select repositories » puis « vgthmind/shop ».');
    if (!r.ok) throw new Error('GitHub ne répond pas (' + r.status + '). Réessaie dans une minute.');
    return t;
  }

  // Petite fenêtre « Colle ton jeton » (créée à la volée : les pages Catalogue, Pièces et Studio n'ont rien à prévoir).
  function askPat(firstMsg) {
    return new Promise(function (resolve, reject) {
      var d = root.document;
      if (!d || !d.body) { reject(new Error('Jeton GitHub manquant.')); return; }
      var box = d.createElement('div');
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
      box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
      box.innerHTML = '<form style="background:#fff;color:#111;max-width:440px;width:100%;box-sizing:border-box;border-radius:14px;padding:18px;font:15px/1.45 system-ui,sans-serif">'
        + '<p style="margin:0 0 8px;font-weight:600">Jeton GitHub de la boutique</p>'
        + '<p style="margin:0 0 10px">Colle ici le jeton que tu as créé sur GitHub (il commence par <code>github_pat_</code>). Il reste gardé sur cet appareil.</p>'
        + '<input name="t" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…" style="width:100%;box-sizing:border-box;font:16px monospace;padding:10px;border:1px solid #bbb;border-radius:8px">'
        + '<p data-msg style="margin:8px 0 0;color:#b00020;min-height:1em"></p>'
        + '<p style="margin:8px 0 12px"><a href="' + GUIDE + '" target="_blank" rel="noopener noreferrer">Comment créer ce jeton ?</a></p>'
        + '<div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" data-no>Annuler</button><button type="submit" style="font-weight:600">Valider</button></div></form>';
      var form = box.querySelector('form'), input = box.querySelector('input'), msg = box.querySelector('[data-msg]');
      msg.textContent = firstMsg || '';
      function close() { if (box.parentNode) box.parentNode.removeChild(box); }
      box.querySelector('[data-no]').addEventListener('click', function () { close(); reject(new Error('Connexion annulée.')); });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        msg.textContent = 'Vérification…';
        checkPat(input.value).then(function (t) { close(); resolve(t); }, function (err) { msg.textContent = err.message; });
      });
      d.body.appendChild(box);
      try { input.focus(); } catch (e) { /* iPhone */ }
    });
  }

  // Session du Worker (stock), seulement si la page la demande et qu'elle manque. La fenêtre GitHub s'ouvre
  // tout de suite (dans le clic), sinon Safari la bloque. Le jeton OAuth éventuellement renvoyé est ignoré.
  function workerSession() {
    return new Promise(function (resolve, reject) {
      var popup = root.open(ENDPOINT + '/auth?provider=github&site_id=' + encodeURIComponent(location.hostname), 'vg-github-login', 'width=600,height=720');
      if (!popup) { reject(new Error('Fenêtre bloquée par le navigateur : autorise les pop-ups pour ce site.')); return; }
      function onMessage(e) {
        if (e.origin !== ENDPOINT) return;
        var data = String(e.data || '');
        if (data === 'authorizing:github') { popup.postMessage(data, e.origin); return; }
        var m = /^authorization:github:(success|error):(.*)$/.exec(data);
        if (!m) return;
        root.removeEventListener('message', onMessage);
        var payload = {};
        try { payload = JSON.parse(m[2]); } catch (err) { /* vide */ }
        if (m[1] === 'success' && payload.session) {
          var ls = store(); try { if (ls) ls.setItem('vg-admin-session', payload.session); } catch (err) { /* rien */ }
          resolve(true);
        } else reject(new Error(payload.message || 'Connexion refusée.'));
      }
      root.addEventListener('message', onMessage);
    });
  }

  // login({ session: true }) : Catalogue (stock + GitHub) ; login() : Pièces et Studio (GitHub seulement).
  function login(o) {
    var needSession = !!(o && o.session) && !(root.vgAdminToken && root.vgAdminToken());
    var first = needSession ? workerSession() : Promise.resolve(true);
    return first.then(function () {
      var saved = savedPat();
      if (!saved) return askPat();
      return checkPat(saved).catch(function (e) { forget(); return askPat(e.message); });
    }).then(function (t) { token = t; keepPat(t); return true; });
  }

  // Connexion coupée / GitHub qui hoquette (502, 503, 504) : on réessaie 3 fois (1 s, 2 s). Sans danger : lire, créer un blob
  // (identifié par son contenu), un arbre ou un commit peut se refaire ; la mise à jour de la branche est revérifiée à part.
  var RETRY_MS = root.VG_RETRY_MS !== undefined ? root.VG_RETRY_MS : 1000;
  function wait(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
  function netError(cause) {
    var e = new Error('Connexion coupée pendant l’envoi. Rien n’est publié tant que le dernier pas n’est pas fait : vérifie ta connexion puis recommence (la page Pièces montrera si la pièce est déjà là).');
    e.code = 'network'; e.cause = cause; return e;
  }
  async function gh(method, path, body) {
    var payload = body ? JSON.stringify(body) : undefined;
    for (var attempt = 0; ; attempt++) {
      var r;
      try {
        r = await fetch(API + '/repos/' + REPO + path, {
          method: method,
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
          body: payload
        });
      } catch (err) {
        if (attempt >= 3) throw netError(err);
        await wait(RETRY_MS * (attempt + 1)); continue;
      }
      if ((r.status === 502 || r.status === 503 || r.status === 504) && attempt < 3) { await wait(RETRY_MS * (attempt + 1)); continue; }
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        var why = (d && d.message) || ('GitHub ' + r.status);
        if (r.status === 401) why = 'GitHub refuse le jeton (expiré ou supprimé) : recharge la page et colle un nouveau jeton.';
        else if (r.status === 403 && /personal access token/i.test(why)) why = 'Le jeton ne peut pas écrire : sur GitHub, mets « Contents » sur « Read and write » (voir le guide).';
        var e = new Error(why); e.status = r.status; throw e;
      }
      return d;
    }
  }

  function b64(bytes) { // Uint8Array -> base64
    var s = '', i, CH = 0x8000;
    for (i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function fromB64(str) { var bin = atob(str.replace(/\s/g, '')), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }

  // opts : { slug, files: [{ name:'0.webp', data:Uint8Array }], replace: bool, onStatus(fn) }
  async function publish(opts) {
    var say = opts.onStatus || function () {}, slug = opts.slug;
    if (!token) throw new Error('Pas connecté à GitHub.');
    if (!/^[^\s\/\\.][^\s\/\\]*$/.test(slug) || /[\x00-\x1f?#%"'<>|*:]/.test(slug) || slug.length > 100) throw new Error('Slug invalide (pas d\'espace, de point ni de barre).');
    if (!opts.files.length) throw new Error('Aucune photo à publier.');
    // Seulement des images (WebP/PNG/JPEG) de taille raisonnable : rien d'autre ne part dans le dépôt public.
    opts.files.forEach(function (f) {
      if (!/^[\w-]{1,40}\.(webp|png|jpe?g)$/i.test(String(f.name || ''))) throw new Error('Fichier refusé (images WebP, PNG ou JPEG seulement) : ' + f.name);
      if (!f.data || f.data.length > MAX_PHOTO_BYTES) throw new Error('Photo trop lourde (' + Math.round((f.data ? f.data.length : 0) / 1048576) + ' Mo, ' + (MAX_PHOTO_BYTES / 1048576) + ' Mo maximum) : ' + f.name);
    });
    if (opts.reelVideo && opts.reelVideo.data.length > 40 * 1024 * 1024) throw new Error('Vidéo trop lourde (' + Math.round(opts.reelVideo.data.length / 1048576) + ' Mo, 40 Mo maximum) : exporte-la en plus léger.');
    var jsonPath = 'data/products/' + slug + '.json';

    say('Lecture de la fiche pièce…');
    var cur = null, product;
    try { cur = await gh('GET', '/contents/' + encodeURIComponent(jsonPath).replace(/%2F/g, '/') + '?ref=' + BRANCH); }
    catch (e) {
      if (e.status !== 404) throw e;
      if (!opts.piece) throw new Error('La pièce « ' + slug + ' » n\'existe pas encore : crée-la d\'abord avec l\'assistant « Nouvelle pièce ».');
    }
    // opts.piece (assistant) : fiche complète. Nouvelle pièce = création ; pièce existante = ses champs sont mis à jour.
    if (cur) {
      product = JSON.parse(new TextDecoder().decode(fromB64(cur.content)));
      if (opts.piece && opts.isNew) throw new Error('Une pièce « ' + slug + ' » existe déjà : change le nom (slug) ou ouvre-la depuis la page Pièces.');
      if (opts.piece) product = Object.assign({}, product, opts.piece, { images: product.images });
    } else product = Object.assign({}, opts.piece, { slug: slug });

    var stamp = Date.now().toString(36); // noms uniques : pas de cache périmé, pas de conflit avec 0.png existant
    var dir = 'assets/products/' + slug + '/';
    var newPaths = opts.files.map(function (f, i) { return dir + 'v' + stamp + '-' + i + '.' + f.name.split('.').pop(); });

    say('Préparation du commit…');
    var ref = await gh('GET', '/git/ref/heads/' + BRANCH);
    var head = ref.object.sha;
    var commit = await gh('GET', '/git/commits/' + head);

    var tree = [], i;
    for (i = 0; i < opts.files.length; i++) {
      say('Envoi de la photo ' + (i + 1) + '/' + opts.files.length + '…');
      var blob = await gh('POST', '/git/blobs', { content: b64(opts.files[i].data), encoding: 'base64' });
      tree.push({ path: newPaths[i], mode: '100644', type: 'blob', sha: blob.sha });
    }

    if (opts.reelVideo) { // vidéo MP4 du reel : jouée toute seule sur la page ; remplace l'ancienne
      var rvPath = dir + 'reel-' + stamp + '.mp4';
      say('Envoi de la vidéo du reel…');
      var rvBlob = await gh('POST', '/git/blobs', { content: b64(opts.reelVideo.data), encoding: 'base64' });
      tree.push({ path: rvPath, mode: '100644', type: 'blob', sha: rvBlob.sha });
      var oldRv = (product.reel_video || '').replace(/^[/]/, '');
      if (oldRv && oldRv.indexOf(dir) === 0) tree.push({ path: oldRv, mode: '100644', type: 'blob', sha: null });
      product.reel_video = '/' + rvPath;
    }
    var oldImages = (product.images || []).filter(function (u) { return typeof u === 'string'; });
    var kept = [], removed = [];
    oldImages.forEach(function (u) {
      var rel = u.replace(/^\//, '');
      if (opts.replace && rel.indexOf(dir) === 0) removed.push(rel); else if (!opts.replace) kept.push(u);
    });
    removed.forEach(function (p) { tree.push({ path: p, mode: '100644', type: 'blob', sha: null }); });
    product.images = (opts.replace ? [] : kept).concat(newPaths.map(function (p) { return '/' + p; }));

    var jsonBlob = await gh('POST', '/git/blobs', { content: b64(new TextEncoder().encode(JSON.stringify(product, null, 2) + '\n')), encoding: 'base64' });
    tree.push({ path: jsonPath, mode: '100644', type: 'blob', sha: jsonBlob.sha });

    say('Création du commit…');
    var newTree = await gh('POST', '/git/trees', { base_tree: commit.tree.sha, tree: tree });
    var nc = await gh('POST', '/git/commits', { message: (opts.piece && !cur ? 'Nouvelle pièce ' : 'Photos de ') + slug + ' (Studio photo)', tree: newTree.sha, parents: [head] });
    try { await gh('PATCH', '/git/refs/heads/' + BRANCH, { sha: nc.sha, force: false }); }
    catch (e) {
      if (e.code === 'network') { // la réponse s'est peut-être perdue alors que la branche a bien avancé
        var now = null;
        try { now = await gh('GET', '/git/ref/heads/' + BRANCH); } catch (e2) { /* toujours coupé */ }
        if (now && now.object && now.object.sha === nc.sha) { /* c'est passé */ } else throw e;
      } else if (e.status === 422 || e.status === 409) throw new Error('Le dépôt a changé pendant l\'envoi (autre enregistrement). Rien n\'a été publié : réessaie.');
      else throw e;
    }
    say('Publié. Le site se reconstruit tout seul (1 à 2 min).');
    return { commit: nc.sha, added: newPaths, removed: removed };
  }

  async function readJson(path) { var c = await gh('GET', '/contents/' + path + '?ref=' + BRANCH); return JSON.parse(new TextDecoder().decode(fromB64(c.content))); }
  async function exists(slug) {
    try { await gh('GET', '/contents/data/products/' + encodeURIComponent(slug) + '.json?ref=' + BRANCH); return true; }
    catch (e) { if (e.status === 404) return false; throw e; }
  }

  root.VGStudioPublish = { login: login, publish: publish, api: gh, readJson: readJson, exists: exists, connected: function () { return !!token; }, logout: function () { token = ''; }, forget: forget };
})(window);

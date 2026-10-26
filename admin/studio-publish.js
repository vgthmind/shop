/* Studio photo — publication des photos d'une pièce, par le MÊME chemin que l'admin actuel (Sveltia) :
   1. connexion « Se connecter avec GitHub » via le Worker (/auth -> /callback), seul le compte admin passe ;
      le Worker renvoie au navigateur le jeton OAuth (portée public_repo) que Sveltia utilise déjà ;
   2. le navigateur écrit directement dans le dépôt vgthmind/shop, branche main, avec l'API GitHub
      (un seul commit : photos + data/products/<slug>.json) ;
   3. l'Action « Build shop » reconstruit data/catalog.json, les tailles d'images et docs/ (1 à 2 min).
   AUCUN jeton n'est écrit dans le code ni dans le dépôt : le jeton vit en mémoire dans cet onglet, jamais stocké. */
(function (root) {
  'use strict';
  var ENDPOINT = root.VG_ENDPOINT || 'https://vgthmind-shop-checkout.vgthm66.workers.dev';
  var REPO = 'vgthmind/shop', BRANCH = 'main', API = 'https://api.github.com';
  // Jeton gardé dans sessionStorage : propre à l'onglet (jamais partagé), vidé à la fermeture de l'onglet, à la déconnexion
  // (vg-admin-auth.js) et après 4 h sans activité. Il survit au changement de page dans le même onglet.
  var SK = 'vg-gh-token', IDLE = 4 * 60 * 60 * 1000, token = '';
  function keep() { try { if (token) root.sessionStorage.setItem(SK, JSON.stringify({ t: token, at: Date.now() })); else root.sessionStorage.removeItem(SK); } catch (e) {} }
  (function restore() {
    try {
      var s = JSON.parse(root.sessionStorage.getItem(SK) || 'null');
      if (s && s.t && Date.now() - s.at < IDLE) { token = s.t; keep(); } else root.sessionStorage.removeItem(SK);
    } catch (e) {}
  })();

  // Même poignée de main que Sveltia / vgAdminLogin, mais on garde `token` (en mémoire seulement).
  function login() {
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
        if (m[1] === 'success' && payload.token) { token = payload.token; keep(); resolve(true); }
        else reject(new Error(payload.message || 'Connexion refusée.'));
      }
      root.addEventListener('message', onMessage);
    });
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
          method: method, cache: 'no-store',
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
          body: payload
        });
      } catch (err) {
        if (attempt >= 3) throw netError(err);
        await wait(RETRY_MS * (attempt + 1)); continue;
      }
      if ((r.status === 502 || r.status === 503 || r.status === 504) && attempt < 3) { await wait(RETRY_MS * (attempt + 1)); continue; }
      var d = await r.json().catch(function () { return {}; });
      if (r.status === 401) { token = ''; keep(); } else if (token) keep(); // activité : repousse l'échéance des 4 h
      if (!r.ok) { var e = new Error(r.status === 401 ? 'Connexion GitHub expirée : reconnecte-toi.' : (d && d.message) || ('GitHub ' + r.status)); e.status = r.status; throw e; }
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
    if (!/^[^\s\/\\.][^\s\/\\]*$/.test(slug)) throw new Error('Slug invalide (pas d\'espace, de point ni de barre).');
    if (!opts.files.length) throw new Error('Aucune photo à publier.');
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
    say('Enregistré. Le site se reconstruit tout seul (1 à 2 min).');
    return { commit: nc.sha, added: newPaths, removed: removed };
  }

  async function readJson(path) { var c = await gh('GET', '/contents/' + path + '?ref=' + BRANCH); return JSON.parse(new TextDecoder().decode(fromB64(c.content))); }
  async function exists(slug) {
    try { await gh('GET', '/contents/data/products/' + encodeURIComponent(slug) + '.json?ref=' + BRANCH); return true; }
    catch (e) { if (e.status === 404) return false; throw e; }
  }

  root.VGStudioPublish = { login: login, publish: publish, api: gh, readJson: readJson, exists: exists, connected: function () { return !!token; }, logout: function () { token = ''; keep(); } };
})(window);

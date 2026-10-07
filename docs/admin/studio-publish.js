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
  var token = '';

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
        if (m[1] === 'success' && payload.token) { token = payload.token; resolve(true); }
        else reject(new Error(payload.message || 'Connexion refusée.'));
      }
      root.addEventListener('message', onMessage);
    });
  }

  function gh(method, path, body) {
    return fetch(API + '/repos/' + REPO + path, {
      method: method,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error((d && d.message) || ('GitHub ' + r.status)); e.status = r.status; throw e; }
        return d;
      });
    });
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
    var jsonPath = 'data/products/' + slug + '.json';

    say('Lecture de la fiche pièce…');
    var cur;
    try { cur = await gh('GET', '/contents/' + encodeURIComponent(jsonPath).replace(/%2F/g, '/') + '?ref=' + BRANCH); }
    catch (e) { if (e.status === 404) throw new Error('La pièce « ' + slug + ' » n\'existe pas encore : crée-la d\'abord dans l\'admin (Pièces → Nouveau), puis publie ses photos ici.'); throw e; }
    var product = JSON.parse(new TextDecoder().decode(fromB64(cur.content)));

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
    var nc = await gh('POST', '/git/commits', { message: 'Photos de ' + slug + ' (Studio photo)', tree: newTree.sha, parents: [head] });
    try { await gh('PATCH', '/git/refs/heads/' + BRANCH, { sha: nc.sha, force: false }); }
    catch (e) {
      if (e.status === 422 || e.status === 409) throw new Error('Le dépôt a changé pendant l\'envoi (autre enregistrement). Rien n\'a été publié : réessaie.');
      throw e;
    }
    say('Publié. Le site se reconstruit tout seul (1 à 2 min).');
    return { commit: nc.sha, added: newPaths, removed: removed };
  }

  root.VGStudioPublish = { login: login, publish: publish, connected: function () { return !!token; }, logout: function () { token = ''; } };
})(window);

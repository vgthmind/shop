/* Page « Catalogue » : lecture et enregistrement des fiches (data/products/<slug>.json) et des catégories
   (data/categories.json) par l'API GitHub, en UN commit sur main ; l'Action « Build shop » reconstruit le site.
   `gh(method, path, body)` est fourni par la page (VGStudioPublish.api) ; les tests lui passent un faux dépôt.
   Chaque enregistrement renvoie de quoi l'annuler (contenu d'avant), refusé si le fichier a changé entre-temps. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VGCatalogueSave = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var BRANCH = 'main', DIR = 'data/products/', CATS = 'data/categories.json';

  function fromB64(str) { var bin = atob(str.replace(/\s/g, '')), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  function toB64(text) {
    var bytes = new TextEncoder().encode(text), s = '', i, CH = 0x8000;
    for (i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function enc(path) { return encodeURIComponent(path).replace(/%2F/g, '/'); }
  function text(file) { return new TextDecoder().decode(fromB64(file.content)); }
  function pieceText(p) { var q = Object.assign({}, p); delete q._file; return JSON.stringify(q, null, 2) + '\n'; }
  function catsText(c) { return '[\n' + c.map(function (x) { return '  { ' + Object.keys(x).map(function (k) { return JSON.stringify(k) + ': ' + JSON.stringify(x[k]); }).join(', ') + ' }'; }).join(',\n') + '\n]\n'; }

  // { pieces: [fiche + slug], categories: [...], raw: { chemin: texte lu } }
  async function load(gh) {
    var list = await gh('GET', '/contents/' + DIR.slice(0, -1) + '?ref=' + BRANCH);
    var files = list.filter(function (f) { return /\.json$/.test(f.name); });
    var raw = {};
    var pieces = await Promise.all(files.map(function (f) {
      return gh('GET', '/contents/' + enc(f.path) + '?ref=' + BRANCH).then(function (c) {
        var t = text(c); raw[f.path] = t;
        return Object.assign(JSON.parse(t), { slug: f.name.replace(/\.json$/, '') });
      });
    }));
    var cf = await gh('GET', '/contents/' + CATS + '?ref=' + BRANCH);
    raw[CATS] = text(cf);
    return { pieces: pieces, categories: JSON.parse(raw[CATS]), raw: raw };
  }

  // changes : { pieces: { slug: fiche }, categories: [...]|undefined } ; raw : contenus lus au chargement.
  // Refuse si un fichier a changé dans le dépôt depuis le chargement (autre appareil, Sveltia, studio).
  async function save(gh, changes, raw, message, say) {
    say = say || function () {};
    var writes = {};
    Object.keys(changes.pieces || {}).forEach(function (slug) { writes[DIR + slug + '.json'] = pieceText(changes.pieces[slug]); });
    if (changes.categories) writes[CATS] = catsText(changes.categories);
    return commitFiles(gh, writes, raw, message, say);
  }

  // writes : { chemin: nouveau texte }. expected : { chemin: texte attendu dans le dépôt (absent = fichier nouveau) }.
  async function commitFiles(gh, writes, expected, message, say) {
    say = say || function () {};
    var paths = Object.keys(writes);
    if (!paths.length) throw new Error('Rien à enregistrer.');
    say('Vérification…');
    var before = {};
    for (var i = 0; i < paths.length; i++) {
      var cur = null;
      try { cur = text(await gh('GET', '/contents/' + enc(paths[i]) + '?ref=' + BRANCH)); }
      catch (e) { if (e.status !== 404) throw e; }
      var exp = expected[paths[i]];
      if ((exp === undefined ? null : exp) !== cur) {
        var e2 = new Error('« ' + paths[i].replace(DIR, '').replace(/\.json$/, '') + ' » a été modifiée ailleurs entre-temps. Rien n\'a été enregistré : clique « Recharger » (tes modifications en cours sont gardées sur cet appareil) puis recommence.');
        e2.code = 'stale'; throw e2;
      }
      before[paths[i]] = cur;
    }
    say('Enregistrement…');
    var ref = await gh('GET', '/git/ref/heads/' + BRANCH), head = ref.object.sha;
    var commit = await gh('GET', '/git/commits/' + head), tree = [];
    for (i = 0; i < paths.length; i++) {
      var blob = await gh('POST', '/git/blobs', { content: toB64(writes[paths[i]]), encoding: 'base64' });
      tree.push({ path: paths[i], mode: '100644', type: 'blob', sha: blob.sha });
    }
    var newTree = await gh('POST', '/git/trees', { base_tree: commit.tree.sha, tree: tree });
    var nc = await gh('POST', '/git/commits', { message: message, tree: newTree.sha, parents: [head] });
    try { await gh('PATCH', '/git/refs/heads/' + BRANCH, { sha: nc.sha, force: false }); }
    catch (e) {
      if (e.status === 422 || e.status === 409) throw new Error('Le dépôt a changé pendant l\'envoi. Rien n\'a été enregistré : réessaie.');
      throw e;
    }
    // Annulation : remettre « before » là où on vient d'écrire « writes ». Un fichier nouveau ne peut pas être
    // « dé-créé » par ce chemin : il est passé en archivé à la place (jamais de suppression).
    var undo = {};
    paths.forEach(function (p) {
      if (before[p] !== null) undo[p] = before[p];
      else { try { var o = JSON.parse(writes[p]); o.archived = true; undo[p] = JSON.stringify(o, null, 2) + '\n'; } catch (e) { /* ignoré */ } }
    });
    return { commit: nc.sha, written: writes, undo: undo };
  }

  async function revert(gh, last, say) {
    return commitFiles(gh, last.undo, last.written, 'Catalogue : annulation du dernier enregistrement (page Catalogue)', say);
  }

  return { load: load, save: save, revert: revert, commitFiles: commitFiles, pieceText: pieceText, catsText: catsText };
}));

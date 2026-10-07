/* Page « Pièces » : lecture et enregistrement des fiches data/products/<slug>.json par l'API GitHub, comme le
   studio photo (un seul commit sur main ; l'Action « Build shop » reconstruit le site ensuite).
   `gh(method, path, body)` est fourni par la page (VGStudioPublish.api) ; les tests lui passent un faux dépôt. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./pieces-view.js'));
  else root.VGPiecesSave = factory(root.VGPieces);
}(typeof self !== 'undefined' ? self : this, function (View) {
  'use strict';
  var BRANCH = 'main', DIR = 'data/products/';

  function fromB64(str) { var bin = atob(str.replace(/\s/g, '')), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  function toB64(text) {
    var bytes = new TextEncoder().encode(text), s = '', i, CH = 0x8000;
    for (i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function enc(path) { return encodeURIComponent(path).replace(/%2F/g, '/'); }
  function parse(file) { return JSON.parse(new TextDecoder().decode(fromB64(file.content))); }

  // Toutes les fiches : [{ slug, ...fiche }] (le slug du nom de fichier fait foi).
  async function loadPieces(gh) {
    var list = await gh('GET', '/contents/' + DIR.slice(0, -1) + '?ref=' + BRANCH);
    var files = list.filter(function (f) { return /\.json$/.test(f.name); });
    var pieces = await Promise.all(files.map(function (f) {
      return gh('GET', '/contents/' + enc(f.path) + '?ref=' + BRANCH).then(function (c) {
        return Object.assign({}, parse(c), { slug: f.name.replace(/\.json$/, '') });
      });
    }));
    return pieces.sort(function (a, b) { return String(a.name || a.slug).localeCompare(String(b.name || b.slug)); });
  }

  // edits : { slug: { weight_g, mode, alone } }. Valide tout AVANT d'écrire ; un seul commit pour toutes les pièces.
  // Renvoie { commit, saved: [slug], pieces: { slug: fiche enregistrée } }.
  async function savePieces(gh, edits, say) {
    say = say || function () {};
    var slugs = Object.keys(edits);
    if (!slugs.length) throw new Error('Rien à enregistrer.');
    var next = {}, tree = [], i;
    say('Lecture des fiches…');
    for (i = 0; i < slugs.length; i++) {
      var path = DIR + slugs[i] + '.json', cur;
      try { cur = await gh('GET', '/contents/' + enc(path) + '?ref=' + BRANCH); }
      catch (e) { if (e.status === 404) throw new Error('La pièce « ' + slugs[i] + ' » n\'existe plus dans le dépôt.'); throw e; }
      var base = parse(cur), r = View.applyEdit(base, edits[slugs[i]]);
      if (r.error) throw new Error(slugs[i] + ' : ' + r.error);
      next[slugs[i]] = r.product;
    }
    say('Création du commit…');
    var ref = await gh('GET', '/git/ref/heads/' + BRANCH), head = ref.object.sha;
    var commit = await gh('GET', '/git/commits/' + head);
    for (i = 0; i < slugs.length; i++) {
      var blob = await gh('POST', '/git/blobs', { content: toB64(JSON.stringify(next[slugs[i]], null, 2) + '\n'), encoding: 'base64' });
      tree.push({ path: DIR + slugs[i] + '.json', mode: '100644', type: 'blob', sha: blob.sha });
    }
    var newTree = await gh('POST', '/git/trees', { base_tree: commit.tree.sha, tree: tree });
    var nc = await gh('POST', '/git/commits', { message: 'Poids, mode et part seule : ' + slugs.join(', ') + ' (page Pièces)', tree: newTree.sha, parents: [head] });
    try { await gh('PATCH', '/git/refs/heads/' + BRANCH, { sha: nc.sha, force: false }); }
    catch (e) {
      if (e.status === 422 || e.status === 409) throw new Error('Le dépôt a changé pendant l\'envoi. Rien n\'a été enregistré : réessaie.');
      throw e;
    }
    say('Enregistré. Le site se reconstruit tout seul (1 à 2 min).');
    return { commit: nc.sha, saved: slugs, pieces: next };
  }

  return { loadPieces: loadPieces, savePieces: savePieces };
}));

/* Page « Pièces » (fiche) : enregistre une fiche et ses photos en UN commit sur main (API GitHub), comme le studio photo.
   `gh(method, path, body)` est fourni par la page (VGStudioPublish.api) ; les tests lui passent un faux dépôt.
   Les fichiers de photos retirés de la fiche restent dans le dépôt (une copie « Dupliquer » peut les partager). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VGFicheSave = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var BRANCH = 'main', DIR = 'data/products/';

  function toB64Bytes(bytes) {
    var s = '', i, CH = 0x8000;
    for (i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function toB64Text(text) { return toB64Bytes(new TextEncoder().encode(text)); }
  function enc(path) { return encodeURIComponent(path).replace(/%2F/g, '/'); }

  // opts : { slug, product, images: [ '/assets/…' | { data: Uint8Array, ext: 'webp' } ], isNew, reelVideo: { data }, message }
  // `images` fixe l'ordre final (existantes + nouvelles). Renvoie { commit, product } (product.images = liste finale).
  async function saveFiche(gh, opts, say) {
    say = say || function () {};
    var slug = opts.slug, product = Object.assign({}, opts.product, { slug: slug });
    if (!/^[^\s\/\\.][^\s\/\\]*$/.test(slug || '')) throw new Error('Adresse de la pièce invalide (pas d\'espace, de point ni de barre).');
    var jsonPath = DIR + slug + '.json';
    if (opts.isNew) {
      var found = true;
      try { await gh('GET', '/contents/' + enc(jsonPath) + '?ref=' + BRANCH); }
      catch (e) { if (e.status === 404) found = false; else throw e; }
      if (found) throw new Error('Une pièce « ' + slug + ' » existe déjà : change le nom.');
    }
    if (opts.reelVideo && opts.reelVideo.data.length > 40 * 1024 * 1024) throw new Error('Vidéo trop lourde (40 Mo maximum) : exporte-la en plus léger.');

    say('Préparation du commit…');
    var ref = await gh('GET', '/git/ref/heads/' + BRANCH), head = ref.object.sha;
    var commit = await gh('GET', '/git/commits/' + head);
    var tree = [], stamp = Date.now().toString(36), dir = 'assets/products/' + slug + '/', list = [], i, n = 0, total = (opts.images || []).filter(function (x) { return typeof x !== 'string'; }).length;
    for (i = 0; i < (opts.images || []).length; i++) {
      var it = opts.images[i];
      if (typeof it === 'string') { list.push(it); continue; }
      n++; say('Envoi de la photo ' + n + '/' + total + '…');
      var path = dir + 'v' + stamp + '-' + i + '.' + (it.ext || 'webp');
      var blob = await gh('POST', '/git/blobs', { content: toB64Bytes(it.data), encoding: 'base64' });
      tree.push({ path: path, mode: '100644', type: 'blob', sha: blob.sha });
      list.push('/' + path);
    }
    product.images = list;

    if (opts.reelVideo) {
      say('Envoi de la vidéo du reel…');
      var rvPath = dir + 'reel-' + stamp + '.mp4';
      var rv = await gh('POST', '/git/blobs', { content: toB64Bytes(opts.reelVideo.data), encoding: 'base64' });
      tree.push({ path: rvPath, mode: '100644', type: 'blob', sha: rv.sha });
      var old = String(product.reel_video || '').replace(/^\//, '');
      if (old && old.indexOf(dir) === 0) tree.push({ path: old, mode: '100644', type: 'blob', sha: null });
      product.reel_video = '/' + rvPath;
    }

    say('Création du commit…');
    var jb = await gh('POST', '/git/blobs', { content: toB64Text(JSON.stringify(product, null, 2) + '\n'), encoding: 'base64' });
    tree.push({ path: jsonPath, mode: '100644', type: 'blob', sha: jb.sha });
    var newTree = await gh('POST', '/git/trees', { base_tree: commit.tree.sha, tree: tree });
    var nc = await gh('POST', '/git/commits', { message: (opts.message || (opts.isNew ? 'Nouvelle pièce ' : 'Fiche ')) + slug + ' (page Pièces)', tree: newTree.sha, parents: [head] });
    try { await gh('PATCH', '/git/refs/heads/' + BRANCH, { sha: nc.sha, force: false }); }
    catch (e) {
      if (e.status === 422 || e.status === 409) throw new Error('Le dépôt a changé pendant l\'envoi. Rien n\'a été enregistré : réessaie.');
      throw e;
    }
    say('Enregistré. Le site se reconstruit tout seul (1 à 2 min).');
    return { commit: nc.sha, product: product };
  }

  return { saveFiche: saveFiche };
}));

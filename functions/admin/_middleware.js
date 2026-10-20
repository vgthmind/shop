// Garde des pages /admin : sans connexion, plus rien d'autre que la page de connexion.
// Le cookie « vg-admin » (posé par admin/vg-admin-auth.js après la connexion GitHub, valable 30 min après
// la dernière activité) contient la session signée par le Worker ; on la fait vérifier par le Worker
// (/admin/renew, qui répond 401 si la session est fausse ou expirée). Aucun secret n'est stocké ici.
const WORKER = 'https://vgthmind-shop-checkout.vgthm66.workers.dev';
// Restent publics : la page de connexion, son script et ce qu'il faut à l'installation de l'appli.
const PUBLIC = /^\/admin\/connexion(\.html)?$|^\/admin\/(vg-admin-auth\.js|manifest\.webmanifest|sw\.js|icon-\d+\.png|vendor\/.*)$/;

// Anciennes pages de l'admin (supprimées, ou rangées dans Réglages) -> nouvelle adresse. Redirection permanente, avant la connexion :
// les anciens favoris, les liens de mails et l'appli déjà installée continuent de marcher. Un # d'origine est conservé par le navigateur.
const MOVED = {
  '': 'menu.html', index: 'menu.html', stock: 'catalogue.html', pieces: 'catalogue.html#/noweight', drop: 'catalogue.html#/programmer',
  rapide: 'nouvelle-piece.html', 'studio-photo': 'nouvelle-piece.html', plus: 'reglages.html', trafic: 'reglages-visites.html',
  expedition: 'reglages-livraison.html', export: 'reglages-compta.html', ouverture: 'reglages-videos.html', etat: 'reglages-sante.html',
  aide: 'reglages-aide.html', promos: 'reglages-promos.html'
};
function movedTo(pathname) {
  const m = /^\/admin\/?([a-z-]*?)(?:\.html)?$/.exec(pathname);
  return m && Object.prototype.hasOwnProperty.call(MOVED, m[1]) ? '/admin/' + MOVED[m[1]] : null;
}

function cookie(request, name) {
  const m = new RegExp('(?:^|; )' + name + '=([^;]*)').exec(request.headers.get('Cookie') || '');
  try { return m ? decodeURIComponent(m[1]) : ''; } catch (e) { return ''; }
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const moved = movedTo(url.pathname);
  if (moved) {
    const [path, hash] = moved.split('#');
    return new Response(null, { status: 301, headers: { Location: new URL(path + url.search, url).toString() + (hash ? '#' + hash : ''), 'Cache-Control': 'private, max-age=300' } });
  }
  if (PUBLIC.test(url.pathname)) return next();
  const token = cookie(request, 'vg-admin');
  let ok = false;
  if (/^vgs\.\d{1,12}\.[A-Za-z0-9_-]{43}$/.test(token)) {
    try {
      const r = await fetch(WORKER + '/admin/renew', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
      ok = r.status === 200;
    } catch (e) { ok = false; }
  }
  if (!ok) {
    const wantsPage = (request.headers.get('Accept') || '').includes('text/html');
    // Cookie présent mais session refusée : on l'efface (sinon il repartirait à chaque visite).
    const headers = { 'Cache-Control': 'no-store' };
    if (token) headers['Set-Cookie'] = 'vg-admin=; Max-Age=0; Path=/; Secure; SameSite=Strict';
    if (!wantsPage) return new Response('Connexion requise.', { status: 401, headers });
    const to = new URL('/admin/connexion', url);
    to.searchParams.set('next', url.pathname + url.search);
    return new Response(null, { status: 302, headers: { ...headers, Location: to.toString() } });
  }
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'private, no-store');
  // Les en-têtes de _headers ne s'appliquent pas aux réponses d'une Function : on les pose ici (la CSP reste absente, voir generator/_headers).
  // La CSP globale de _headers (« ! Content-Security-Policy » ne la retire pas ici) bloquait l'API GitHub : page Pièces bloquée sur « Chargement… ».
  out.headers.delete('Content-Security-Policy');
  out.headers.set('X-Frame-Options', 'DENY'); out.headers.set('X-Content-Type-Options', 'nosniff'); out.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return out;
}

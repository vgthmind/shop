// Garde des pages /admin : sans connexion, plus rien d'autre que la page de connexion.
// Le cookie « vg-admin » (posé par admin/vg-admin-auth.js après la connexion GitHub, valable 30 min après
// la dernière activité) contient la session signée par le Worker ; on la fait vérifier par le Worker
// (/admin/renew, qui répond 401 si la session est fausse ou expirée). Aucun secret n'est stocké ici.
const WORKER = 'https://vgthmind-shop-checkout.vgthm66.workers.dev';
// Restent publics : la page de connexion, son script, l'éditeur Sveltia (sa propre connexion GitHub) et ce qu'il faut à l'installation de l'appli.
const PUBLIC = /^\/admin\/?$|^\/admin\/(index|connexion)(\.html)?$|^\/admin\/(config\.yml|vg-admin-auth\.js|manifest\.webmanifest|sw\.js|icon-\d+\.png|vendor\/.*)$/;

function cookie(request, name) {
  const m = new RegExp('(?:^|; )' + name + '=([^;]*)').exec(request.headers.get('Cookie') || '');
  try { return m ? decodeURIComponent(m[1]) : ''; } catch (e) { return ''; }
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
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
    if (!wantsPage) return new Response('Connexion requise.', { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const to = new URL('/admin/connexion', url);
    to.searchParams.set('next', url.pathname + url.search);
    return new Response(null, { status: 302, headers: { Location: to.toString(), 'Cache-Control': 'no-store' } });
  }
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'private, no-store');
  return out;
}

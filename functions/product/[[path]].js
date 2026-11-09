// Pages /product/... : une adresse inconnue (pièce retirée, faute de frappe) renvoie une vraie page 404 (une redirection
// vers la boutique était vue par Google comme une « soft 404 »). Les anciennes adresses BigCartel connues ont, elles,
// leur 301 vers la bonne fiche (docs/_redirects, généré par generator/build.js).
// Pièces supprimées volontairement ou de test : 410 « Gone » (Google les oublie plus vite qu'un 404). Ajouter ici le permalink d'une pièce retirée.
const GONE = new Set(['test-1euro', 'test1e', 'test']);

export async function onRequest(context) {
  // Anciens liens avec majuscules (/product/CH_0002) : les adresses sont en minuscules, 301 vers la bonne fiche.
  const url = new URL(context.request.url), low = url.pathname.toLowerCase();
  if (low !== url.pathname && /^\/product\/[^/]+\/?$/.test(low)) return new Response(null, { status: 301, headers: { Location: low + (low.endsWith('/') ? '' : '/') + url.search } });
  const m = /^\/product\/([^/]+?)\/?$/.exec(url.pathname);
  if (m && GONE.has(m[1])) return new Response('<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Pièce retirée | vgthmind</title><p>Cette pièce a été retirée. <a href="/products/">Voir la boutique</a></p>', { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
  return context.next();
}

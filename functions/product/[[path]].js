// Pages /product/... : une adresse inconnue (pièce retirée, faute de frappe) renvoie une vraie page 404 (une redirection
// vers la boutique était vue par Google comme une « soft 404 »). Les anciennes adresses BigCartel connues ont, elles,
// leur 301 vers la bonne fiche (docs/_redirects, généré par generator/build.js).
// Fiches retirées dont l'ancienne page reste en mémoire chez Cloudflare (s-maxage 7 jours, pas de purge possible sans zone) : renvoyées vers la liste.
const RETIREES = new Set(['test-1euro']);

export async function onRequest(context) {
  const m = /^\/product\/([^/]+)\/?$/.exec(new URL(context.request.url).pathname);
  if (m && RETIREES.has(m[1])) return new Response(null, { status: 302, headers: { Location: '/products', 'Cache-Control': 'no-store' } });
  return context.next();
}

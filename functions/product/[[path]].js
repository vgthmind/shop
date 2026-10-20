// Pages /product/... : une adresse inconnue (ancien lien BigCartel, pièce retirée, faute de frappe) ne mène plus à
// « page introuvable » mais à la boutique. Redirection TEMPORAIRE (302) : une pièce publiée plus tard à cette adresse
// ne doit pas rester bloquée par un 301 gardé en mémoire par les navigateurs. Les anciennes adresses connues ont, elles,
// leur 301 (docs/_redirects, généré par generator/build.js).
// Fiches retirées dont l'ancienne page reste en mémoire chez Cloudflare (s-maxage 7 jours, pas de purge possible sans zone) : renvoyées vers la liste.
const RETIREES = new Set(['test-1euro']);

export async function onRequest(context) {
  const m = /^\/product\/([^/]+)\/?$/.exec(new URL(context.request.url).pathname);
  if (m && RETIREES.has(m[1])) return new Response(null, { status: 302, headers: { Location: '/products', 'Cache-Control': 'no-store' } });
  const res = await context.next();
  if (res.status === 404) return new Response(null, { status: 302, headers: { Location: '/products', 'Cache-Control': 'no-store' } });
  return res;
}

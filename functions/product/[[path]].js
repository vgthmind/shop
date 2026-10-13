// Pages /product/... : une adresse inconnue (ancien lien BigCartel, pièce retirée, faute de frappe) ne mène plus à
// « page introuvable » mais à la boutique. Redirection TEMPORAIRE (302) : une pièce publiée plus tard à cette adresse
// ne doit pas rester bloquée par un 301 gardé en mémoire par les navigateurs. Les anciennes adresses connues ont, elles,
// leur 301 (docs/_redirects, généré par generator/build.js).
export async function onRequest(context) {
  const res = await context.next();
  if (res.status === 404) return new Response(null, { status: 302, headers: { Location: '/products', 'Cache-Control': 'no-store' } });
  return res;
}

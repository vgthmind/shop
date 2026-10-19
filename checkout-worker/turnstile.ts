// Cloudflare Turnstile : vérifie le jeton envoyé par le formulaire (contact, demande).
// Sans TURNSTILE_SECRET (secret Wrangler), la vérification est désactivée : le site marche comme avant.
// Avec le secret, un jeton absent ou refusé = 403. Erreur réseau côté Cloudflare = on laisse passer (les limites de débit restent).
export async function checkTurnstile(secret: string | undefined, token: unknown, ip: string, doFetch: typeof fetch = fetch): Promise<boolean> {
  if (!secret) return true;
  const t = String(token == null ? '' : token);
  if (!t || t.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret, response: t });
    if (ip && ip !== 'x') body.set('remoteip', ip);
    const r = await doFetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    if (!r.ok) return true;
    const j: any = await r.json().catch(() => null);
    return !!(j && j.success === true);
  } catch (e) { return true; }
}

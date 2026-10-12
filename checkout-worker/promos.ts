// Codes promo (admin) : créés dans Stripe (coupon + code promotionnel), jamais stockés ici.
// Le champ « code promotionnel » est déjà actif au paiement (allow_promotion_codes) : rien à changer côté panier.
// Clé Stripe restreinte : droits Écriture « Coupons » et « Promotion Codes » à ajouter le moment venu.
// Remise sur les pièces uniquement (Stripe ne remise pas la livraison).

export interface PromoInput { code?: unknown; percent?: unknown; amount?: unknown; max?: unknown; expires?: unknown; min?: unknown; first?: unknown }
export type StripeCall = (method: string, path: string, params?: URLSearchParams) => Promise<{ ok: boolean; data: any }>;

// « 2026-12-31 » -> fin de journée à Paris, en secondes Unix (ou null). Heure d'été/hiver gérée par Intl.
export function endOfDayParis(day: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || '').trim());
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], 23, 59, 0);
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const parisAt = (ts: number) => { const o: Record<string, string> = {}; fmt.formatToParts(new Date(ts)).forEach((x) => { o[x.type] = x.value; }); return Date.UTC(+o.year, +o.month - 1, +o.day, (+o.hour) % 24, +o.minute); };
  let ts = guess - (parisAt(guess) - guess);
  ts = guess - (parisAt(ts) - ts);
  return Number.isFinite(ts) ? Math.floor(ts / 1000) : null;
}

// Vérifie le formulaire et prépare les deux appels Stripe. { error } si quelque chose ne va pas (message pour le propriétaire).
export function planPromo(input: PromoInput, now = Date.now()): { error: string } | { coupon: URLSearchParams; promo: (couponId: string) => URLSearchParams; label: string } {
  const code = String(input.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return { error: 'Code : 3 à 30 caractères, lettres sans accent, chiffres, - ou _ (ex. BIENVENUE10).' };
  const percent = input.percent === '' || input.percent == null ? null : Number(input.percent);
  const amount = input.amount === '' || input.amount == null ? null : Number(input.amount);
  if ((percent == null) === (amount == null)) return { error: 'Choisis une remise en % OU un montant en €, pas les deux.' };
  const coupon = new URLSearchParams();
  coupon.set('name', code);
  coupon.set('duration', 'once');
  let label: string;
  if (percent != null) {
    if (!(percent > 0 && percent <= 100)) return { error: 'Pourcentage : entre 1 et 100.' };
    coupon.set('percent_off', String(percent));
    label = `-${percent} %`;
  } else {
    if (!(amount! >= 0.5 && amount! <= 1000)) return { error: 'Montant : entre 0,50 € et 1000 €.' };
    coupon.set('amount_off', String(Math.round(amount! * 100)));
    coupon.set('currency', 'eur');
    label = `-${amount!.toFixed(2).replace('.', ',')} €`;
  }
  const max = input.max === '' || input.max == null ? null : Number(input.max);
  if (max != null && !(Number.isInteger(max) && max >= 1 && max <= 100000)) return { error: 'Nombre d\'utilisations : un entier d\'au moins 1.' };
  const min = input.min === '' || input.min == null ? null : Number(input.min);
  if (min != null && !(min > 0 && min <= 100000)) return { error: 'Panier minimum : un montant en € supérieur à 0.' };
  let expires: number | null = null;
  if (input.expires !== '' && input.expires != null) {
    expires = endOfDayParis(String(input.expires));
    if (expires == null) return { error: 'Date de fin : écris AAAA-MM-JJ (ex. 2026-12-31).' };
    if (expires * 1000 <= now) return { error: 'La date de fin est déjà passée.' };
  }
  const promo = (couponId: string) => {
    const p = new URLSearchParams();
    p.set('coupon', couponId);
    p.set('code', code);
    if (max != null) p.set('max_redemptions', String(max));
    if (expires != null) p.set('expires_at', String(expires));
    if (min != null) { p.set('restrictions[minimum_amount]', String(Math.round(min * 100))); p.set('restrictions[minimum_amount_currency]', 'eur'); }
    if (input.first === true) p.set('restrictions[first_time_transaction]', 'true');
    return p;
  };
  return { coupon, promo, label };
}

// Une ligne de la liste admin.
export function promoRow(p: any) {
  const c = p.coupon || {};
  return {
    id: p.id, code: p.code, active: !!p.active && c.valid !== false,
    off: c.percent_off != null ? `-${c.percent_off} %` : c.amount_off != null ? `-${(c.amount_off / 100).toFixed(2).replace('.', ',')} €` : '',
    used: p.times_redeemed || 0, max: p.max_redemptions || null,
    expires: p.expires_at ? new Date(p.expires_at * 1000).toISOString() : null,
    min: p.restrictions && p.restrictions.minimum_amount ? p.restrictions.minimum_amount / 100 : null,
    first: !!(p.restrictions && p.restrictions.first_time_transaction),
  };
}

type J = (data: unknown, status?: number) => Response;

// Routes /admin/promos (l'appelant a déjà vérifié que c'est l'admin). null = pas une route de ce module.
export async function promoRoutes(request: Request, path: string, call: StripeCall | null, json: J, now = Date.now()): Promise<Response | null> {
  if (!path.startsWith('/admin/promos')) return null;
  if (!call) return json({ error: 'Clé Stripe absente ou refusée.' }, 503);
  if (path === '/admin/promos' && request.method === 'GET') {
    const r = await call('GET', '/v1/promotion_codes?limit=100&expand[]=data.coupon');
    if (!r.ok) return json({ error: stripeMsg(r.data, 'Stripe a refusé la lecture des codes (droits « Promotion Codes » en lecture ?).') }, 502);
    return json({ promos: (r.data.data || []).map(promoRow) });
  }
  if (path === '/admin/promos' && request.method === 'POST') {
    const body: any = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return json({ error: 'Requête invalide.' }, 400);
    const plan = planPromo(body, now);
    if ('error' in plan) return json({ error: plan.error }, 400);
    const c = await call('POST', '/v1/coupons', plan.coupon);
    if (!c.ok) return json({ error: stripeMsg(c.data, 'Stripe a refusé le coupon (droit Écriture « Coupons » à ajouter à la clé).') }, 502);
    const p = await call('POST', '/v1/promotion_codes', plan.promo(String(c.data.id)));
    if (!p.ok) {
      await call('DELETE', '/v1/coupons/' + encodeURIComponent(String(c.data.id))).catch(() => null); // pas de coupon orphelin
      return json({ error: stripeMsg(p.data, 'Stripe a refusé le code (déjà utilisé ? droit Écriture « Promotion Codes » ?).') }, 502);
    }
    return json({ ok: true, promo: promoRow({ ...p.data, coupon: c.data }), label: plan.label });
  }
  if (path === '/admin/promos/toggle' && request.method === 'POST') {
    const body: any = await request.json().catch(() => null);
    const id = String(body && body.id || '');
    if (!/^promo_[A-Za-z0-9]+$/.test(id) || typeof body.active !== 'boolean') return json({ error: 'Requête invalide.' }, 400);
    const r = await call('POST', '/v1/promotion_codes/' + id, new URLSearchParams({ active: String(body.active) }));
    if (!r.ok) return json({ error: stripeMsg(r.data, 'Stripe a refusé la modification.') }, 502);
    return json({ ok: true, id, active: !!r.data.active });
  }
  return json({ error: 'Not found' }, 404);
}

function stripeMsg(d: any, fallback: string) {
  const m = d && d.error && d.error.message ? String(d.error.message) : '';
  return m ? fallback + ' (Stripe : ' + m.slice(0, 160) + ')' : fallback;
}

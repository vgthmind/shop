// « Pièce sur demande » : règles pures (sans réseau ni stockage), utilisées par requests.ts, le Durable Object
// RequestsDO et les tests. Une demande = un objet JSON ; chaque action renvoie la demande modifiée et la liste
// des effets à produire ensuite (mails, alertes), jamais l'inverse : l'état est enregistré avant tout envoi.

// Parcours du formulaire : « Une pièce pour moi » (custom ou sur-mesure), « Une production visuelle » (location
// d'une pièce existante ou création pour le projet), « Une collab ».
export const TYPES = ['custom', 'surmesure', 'production', 'collab'] as const;
export type ReqType = (typeof TYPES)[number];
export const PAID_TYPES: string[] = ['custom', 'surmesure']; // devis + acompte + solde par Stripe ; le reste : réponse à la main
export const TYPE_LABELS: Record<string, string> = { custom: 'Pièce pour moi · Custom', surmesure: 'Pièce pour moi · Sur-mesure', production: 'Production visuelle', collab: 'Collab' };
export const BRANCH: Record<string, string> = { custom: 'piece', surmesure: 'piece', production: 'production', collab: 'collab' };

// Libellés des réponses (admin, mails) : clé du champ -> [FR, EN].
export const FIELD_LABELS: Record<string, [string, string]> = {
  piece: ['Type de pièce', 'Piece'], mode: ['Démarche', 'Approach'], idea: ['Idée / description', 'Idea / description'],
  mood: ['Ambiance', 'Mood'], colors: ['Couleurs', 'Colours'], refs: ['Références', 'References'], size: ['Taille', 'Size'],
  measures: ['Mesures', 'Measurements'], paint: ['Peinture en plus', 'Add painting'], budget: ['Budget indicatif', 'Budget'],
  deadline: ['Date souhaitée', 'Wanted by'], prodKind: ['Besoin', 'Need'], projectType: ['Type de projet', 'Project type'],
  dates: ['Dates', 'Dates'], place: ['Lieu', 'Location'], count: ['Nombre de pièces', 'Number of pieces'], artist: ['Artiste (nom ou lien)', 'Artist (name or link)'],
  collabType: ['Type de collab', 'Collab type'], links: ['Liens (chaîne, réseaux)', 'Links (channel, socials)'], link: ['Lien vers des fichiers', 'Link to files'],
};
export const CHOICE_LABELS: Record<string, [string, string]> = {
  know: ['Je sais ce que je veux', 'I know what I want'], guide: ['J’ai une envie, guide-moi', 'I have an idea, guide me'],
  location: ['Location d’une pièce existante', 'Rent an existing piece'], creation: ['Création pour le projet', 'A piece made for the project'],
};
// Champs affichés pour chaque type (ordre du récapitulatif et de l'admin).
export const FIELDS_BY_TYPE: Record<string, string[]> = {
  custom: ['piece', 'mode', 'idea', 'mood', 'colors', 'refs', 'size', 'budget', 'deadline', 'link'],
  surmesure: ['piece', 'paint', 'mode', 'idea', 'mood', 'colors', 'refs', 'measures', 'budget', 'deadline', 'link'],
  production: ['prodKind', 'projectType', 'dates', 'deadline', 'place', 'count', 'artist', 'budget', 'idea', 'refs', 'link'],
  collab: ['collabType', 'links', 'idea', 'refs', 'link'],
};

// Statuts (ordre d'affichage dans l'admin). « brouillon » : formulaire reçu, fichiers en cours d'envoi.
export const STATUSES = ['brouillon', 'nouvelle', 'discussion', 'devis', 'acompte', 'fabrication', 'validation', 'solde', 'envoyee', 'terminee', 'refusee'] as const;
export const STATUS_LABELS: Record<string, string> = {
  brouillon: 'Envoi en cours', nouvelle: 'Nouvelle', discussion: 'En discussion', devis: 'Devis envoyé', acompte: 'Acompte payé',
  fabrication: 'En fabrication', validation: 'En attente de validation client', solde: 'Solde payé', envoyee: 'Envoyée', terminee: 'Terminée', refusee: 'Refusée',
};
const CLOSED = ['terminee', 'refusee'];

// Pièces proposées (prix « à partir de » dans les Réglages). Poids emballé par défaut pour le port du solde (modifiable dans le devis).
export const PIECES: Record<string, { key: string; fr: string; en: string; weight_g: number }[]> = {
  custom: [
    { key: 'tshirt', fr: 'T-shirt', en: 'T-shirt', weight_g: 250 },
    { key: 'hoodie', fr: 'Sweat / hoodie', en: 'Sweatshirt / hoodie', weight_g: 700 },
    { key: 'veste', fr: 'Veste / jean / jogging', en: 'Jacket / jeans / joggers', weight_g: 900 },
    { key: 'autre', fr: 'Autre pièce', en: 'Another piece', weight_g: 600 }, // le client la décrit ou envoie une photo
  ],
  surmesure: [
    { key: 'short', fr: 'Short', en: 'Shorts', weight_g: 400 },
    { key: 'pantalon', fr: 'Pantalon', en: 'Trousers', weight_g: 700 },
    { key: 'haut', fr: 'Haut', en: 'Top', weight_g: 400 },
    { key: 'veste', fr: 'Veste', en: 'Jacket', weight_g: 1000 },
  ],
};

export type LeadKey = 'location' | 'custom' | 'surmesure';
export const LEAD_KEYS: LeadKey[] = ['location', 'custom', 'surmesure'];
export interface Settings {
  prices: { custom: Record<string, number>; surmesure: Record<string, number>; paintFrom: number };
  depositPct: number; // % du prix total
  remindDays: number; // relance du client
  alertDays: number; // alerte pour vgthmind
  forfeitDays: number; // acompte conservé (CGV)
  retouchesIncluded: number;
  leadWeeks: Record<LeadKey, { min: number; max: number }>; // délai indicatif (min à max semaines) ; min = date la plus proche acceptée
  cards: Record<string, string>; // photo de chaque carte du parcours ('' = photo livrée avec le site)
}
// Cartes avec photo du parcours (page « Sur demande »). Photo changeable dans l'admin (Réglages).
export const CARD_KEYS = ['piece', 'production', 'collab', 'custom', 'surmesure', 'know', 'guide', 'location', 'creation',
  'custom.tshirt', 'custom.hoodie', 'custom.veste', 'custom.autre', 'surmesure.short', 'surmesure.pantalon', 'surmesure.haut', 'surmesure.veste'];
export const DEFAULT_SETTINGS: Settings = {
  prices: { custom: { tshirt: 75, hoodie: 140, veste: 160, autre: 75 }, surmesure: { short: 150, pantalon: 220, haut: 200, veste: 320 }, paintFrom: 10 },
  depositPct: 30, remindDays: 7, alertDays: 14, forfeitDays: 30, retouchesIncluded: 1, cards: {},
  leadWeeks: { location: { min: 2, max: 2 }, custom: { min: 2, max: 3 }, surmesure: { min: 3, max: 4 } },
};

// Limites des fichiers joints (stockage R2).
export const FILE_LIMITS = { photos: 8, photoBytes: 10 * 1024 * 1024, videos: 1, videoBytes: 50 * 1024 * 1024, finals: 12 };
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
export function fileKind(type: string): 'photo' | 'video' | null {
  const t = String(type || '').toLowerCase();
  return PHOTO_TYPES.includes(t) ? 'photo' : VIDEO_TYPES.includes(t) ? 'video' : null;
}

export const DAY = 86400000;
export const DRAFT_GRACE_MS = 60 * 60 * 1000; // formulaire jamais terminé (onglet fermé pendant l'envoi) : traité au bout d'1 h
export const UPLOAD_WINDOW_MS = 2 * 60 * 60 * 1000; // fichiers acceptés pendant 2 h après l'envoi du formulaire
export const KEEP_UNPAID_MS = 365 * DAY; // demande sans suite / refusée / terminée : effacée 12 mois après le dernier échange
export const KEEP_FILES_MS = 182 * DAY; // fichiers : effacés 6 mois après la fin de la demande

const round2 = (n: number) => Math.round(n * 100) / 100;
const clean = (v: unknown, n: number) => String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, n);
const block = (v: unknown, n: number) => String(v == null ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, n);
export const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

// --- Formulaire public --------------------------------------------------------------------------
export function parseSubmission(body: any, lead: Settings['leadWeeks'] = DEFAULT_SETTINGS.leadWeeks, nowMs: number = Date.now()): { ok: true; value: any } | { ok: false; fields: string[] } {
  const type = String(body && body.type) as ReqType;
  const v: any = {
    type: TYPES.includes(type) ? type : '',
    lang: body && body.lang === 'fr' ? 'fr' : 'en',
    client: { first: clean(body?.firstName, 60) || (body?.lastName ? '' : clean(body?.name, 100).split(' ')[0]), last: clean(body?.lastName, 60) || (body?.firstName ? '' : clean(body?.name, 100).split(' ').slice(1).join(' ')), name: '', email: clean(body?.email, 200).toLowerCase(), country: /^[A-Za-z]{2}$/.test(String(body?.country || '')) ? String(body.country).toUpperCase() : '' },
    fields: {
      piece: clean(body?.piece, 30),
      mode: body?.mode === 'guide' ? 'guide' : body?.mode === 'know' ? 'know' : '',
      idea: block(body?.idea, 3000),
      mood: block(body?.mood, 1000),
      refs: block(body?.refs, 1500),
      colors: clean(body?.colors, 300),
      size: clean(body?.size, 100),
      measures: block(body?.measures, 1500),
      paint: !!(body && body.paint),
      budget: clean(body?.budget, 100),
      deadline: clean(body?.deadline, 100),
      prodKind: body?.prodKind === 'creation' ? 'creation' : body?.prodKind === 'location' ? 'location' : '',
      projectType: clean(body?.projectType, 150),
      dates: clean(body?.dates, 200),
      place: clean(body?.place, 200),
      count: clean(body?.count, 30),
      artist: clean(body?.artist, 300),
      collabType: clean(body?.collabType, 150),
      links: block(body?.links, 800),
      link: clean(body?.link, 500),
    } as Record<string, any>,
    photosConsent: !!(body && body.photosConsent),
  };
  const f: string[] = [];
  const x = v.fields;
  if (!v.type) f.push('type');
  if (!v.client.first) f.push('firstName');
  if (!v.client.last) f.push('lastName');
  v.client.name = `${v.client.first} ${v.client.last}`.trim();
  delete v.client.first; delete v.client.last;
  if (!EMAIL_RE.test(v.client.email)) f.push('email');
  if (!v.client.country) f.push('country');
  if (PAID_TYPES.includes(v.type)) {
    if (!PIECES[v.type].some((p) => p.key === x.piece)) f.push('piece');
    if (!x.mode) f.push('mode');
    if (x.mode === 'guide' ? x.mood.length + x.idea.length < 10 : x.idea.length < 10) f.push('idea');
    if (v.type === 'surmesure' && x.measures.length < 3) f.push('measures');
  } else if (v.type === 'production') {
    if (!x.prodKind) f.push('prodKind');
    if (!x.projectType) f.push('projectType');
    if (!x.dates) f.push('dates');
  } else if (v.type === 'collab') {
    if (!x.collabType) f.push('collabType');
    if (x.idea.length < 10) f.push('idea');
  }
  if (x.link && !/^https?:\/\/\S+$/i.test(x.link)) f.push('link');
  // Date souhaitée : AAAA-MM-JJ, pas avant le délai minimum du type de demande (location, custom, sur-mesure) ; 1 jour de marge (fuseaux).
  const leadKey: LeadKey | '' = v.type === 'custom' || v.type === 'surmesure' ? v.type : v.type === 'production' && x.prodKind === 'location' ? 'location' : '';
  if (!leadKey) delete x.deadline;
  else if (x.deadline) {
    const t = /^\d{4}-\d{2}-\d{2}$/.test(x.deadline) ? Date.parse(x.deadline + 'T12:00:00Z') : NaN;
    if (!Number.isFinite(t) || t < nowMs + (lead[leadKey].min * 7 - 1) * 86400000 || t > nowMs + 1100 * 86400000) f.push('deadline');
  }
  if (v.type !== 'surmesure') x.paint = false;
  // Seuls les champs du parcours choisi sont gardés (rien d'une autre branche restée dans le navigateur).
  if (v.type) for (const k of Object.keys(x)) if (!FIELDS_BY_TYPE[v.type].includes(k)) delete x[k];
  return f.length ? { ok: false, fields: f } : { ok: true, value: v };
}

export function newRequest(v: any, id: string, k: string, now: number) {
  return {
    id, k, type: v.type, lang: v.lang, status: 'brouillon', created: now, updated: now,
    client: v.client, fields: v.fields, photosConsent: v.photosConsent,
    files: [] as any[], finals: [] as any[], notes: '',
    quote: null as any, deposit: null as any, validation: null as any, balance: null as any,
    reminders: {} as Record<string, number>, forfeited: false,
    log: [{ at: now, what: 'Demande reçue' + (v.photosConsent ? ' (accord photos : oui)' : '') }],
  };
}

// --- Réglages -----------------------------------------------------------------------------------
// Prix boutique « équivalents » (le moins cher de chaque famille) : un « à partir de » n'est jamais en dessous.
// Custom = pièces de la catégorie Customs/Upcycling ; sur-mesure = les autres pièces cousues.
const FAMILIES: Record<string, { custom: boolean; re: RegExp; cat?: string }> = {
  'custom.tshirt': { custom: true, re: /tee|t-shirt|tshirt/i },
  'custom.hoodie': { custom: true, re: /hoodie|sweat|^CH_/i }, // CH_ = hoodies zippés peints
  'custom.veste': { custom: true, re: /veste|jacket|jean/i },
  'surmesure.short': { custom: false, re: /^short/i },
  'surmesure.pantalon': { custom: false, re: /^pantalon|^JA_/i }, // JA_ = jogging cousu puis peint (pièce cousue, pas un custom)
  'surmesure.haut': { custom: false, re: /./, cat: 'tops' },
  'surmesure.veste': { custom: false, re: /veste|jacket/i },
};
export function priceFloors(catalog: any[]): Record<string, { price: number; name: string } | null> {
  const out: Record<string, { price: number; name: string } | null> = {};
  for (const [key, fam] of Object.entries(FAMILIES)) {
    let best: { price: number; name: string } | null = null;
    for (const p of catalog || []) {
      if (p.status && p.status !== 'active') continue;
      const cats = (p.categories || []).map((c: any) => String(c.permalink || c.name || c).toLowerCase());
      const isCustom = cats.some((c: string) => /custom/.test(c));
      if (isCustom !== fam.custom || !fam.re.test(String(p.name || ''))) continue;
      if (fam.cat && !cats.includes(fam.cat)) continue;
      const price = Number(p.price);
      if (price > 0 && (!best || price < best.price)) best = { price, name: String(p.name) };
    }
    out[key] = best;
  }
  return out;
}

export function checkSettings(s: any, floors: Record<string, { price: number; name: string } | null>): { ok: true; value: Settings } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const num = (v: any, lo: number, hi: number, label: string, int = false) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < lo || n > hi || (int && !Number.isInteger(n))) { errors.push(`${label} : valeur entre ${lo} et ${hi}`); return lo; }
    return int ? n : round2(n);
  };
  const out: Settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  for (const t of ['custom', 'surmesure'] as const) {
    for (const p of PIECES[t]) {
      const v = num(s?.prices?.[t]?.[p.key], 1, 10000, `${t === 'custom' ? 'Custom' : 'Sur-mesure'} ${p.fr}`);
      const fl = floors[`${t}.${p.key}`];
      if (fl && v < fl.price) errors.push(`${t === 'custom' ? 'Custom' : 'Sur-mesure'} ${p.fr} : ${v} € est en dessous du prix boutique équivalent (${fl.name}, ${fl.price} €)`);
      out.prices[t][p.key] = v;
    }
  }
  out.prices.paintFrom = num(s?.prices?.paintFrom, 0, 10000, 'Peinture en plus');
  out.depositPct = num(s?.depositPct, 1, 100, 'Acompte (%)', true);
  out.remindDays = num(s?.remindDays, 1, 90, 'Relance (jours)', true);
  out.alertDays = num(s?.alertDays, 1, 120, 'Alerte (jours)', true);
  out.forfeitDays = num(s?.forfeitDays, 1, 365, 'Acompte conservé (jours)', true);
  out.retouchesIncluded = num(s?.retouchesIncluded, 0, 10, 'Retouches incluses', true);
  for (const k of LEAD_KEYS) {
    const mn = num(s?.leadWeeks?.[k]?.min, 1, 52, `Délai minimum (${k}, semaines)`, true), mx = num(s?.leadWeeks?.[k]?.max, 1, 52, `Délai maximum (${k}, semaines)`, true);
    if (mx < mn) errors.push(`Délai (${k}) : le maximum doit être au moins égal au minimum`);
    out.leadWeeks[k] = { min: mn, max: Math.max(mn, mx) };
  }
  for (const k of CARD_KEYS) {
    const u =String(s?.cards?.[k] || '').trim();
    if (!u) continue;
    if (u.length > 500 || !/^(https:\/\/[^\s"'<>]+|\/[^\s"'<>]*|card:[a-z.]+:[a-f0-9]{8,32})$/i.test(u)) errors.push(`Photo de la carte ${k} : adresse invalide`);
    else out.cards[k] = u;
  }
  if (!errors.length && out.alertDays <= out.remindDays) errors.push('Alerte : doit venir après la relance');
  if (!errors.length && out.forfeitDays <= out.alertDays) errors.push('Acompte conservé : doit venir après l’alerte');
  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}

export function mergeSettings(saved: any): Settings {
  if (!saved) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  const s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  Object.assign(s.prices.custom, saved.prices?.custom || {});
  Object.assign(s.prices.surmesure, saved.prices?.surmesure || {});
  if (saved.prices && saved.prices.paintFrom != null) s.prices.paintFrom = saved.prices.paintFrom;
  for (const k of ['depositPct', 'remindDays', 'alertDays', 'forfeitDays', 'retouchesIncluded']) if (saved[k] != null) s[k] = saved[k];
  for (const k of LEAD_KEYS) { const l = saved.leadWeeks?.[k]; if (l && l.min >= 1 && l.max >= l.min) s.leadWeeks[k] = { min: l.min, max: l.max }; }
  if (saved.cards && typeof saved.cards === 'object') s.cards = { ...saved.cards };
  return s;
}

// Montant de l'acompte et du solde (en euros, arrondis au centime).
export function depositFor(total: number, pct: number) { return round2((total * pct) / 100); }

// Texte exact de la case à cocher avant l'acompte (gardé tel quel dans le journal de la demande).
export function consentText(lang: string, q: { total: number; deposit: number; depositPct: number }, s: Settings): string {
  const eur = (n: number) => n.toFixed(2).replace('.', lang === 'fr' ? ',' : '.') + ' €';
  if (lang === 'fr') {
    return `Je commande une pièce personnalisée, réalisée selon mes demandes : je reconnais ne pas disposer du droit de rétractation (article L221-28 3° du Code de la consommation). `
      + `Je verse un acompte de ${eur(q.deposit)} (${q.depositPct} % du prix total de ${eur(q.total)}) : il s'agit d'un acompte et non d'arrhes (article L214-1 du Code de la consommation), ma commande est ferme. `
      + `Le solde est payé après validation de la pièce sur photos, avant l'envoi. Sans validation ni paiement du solde ${s.forfeitDays} jours après l'envoi des photos (relance comprise), l'acompte reste acquis à vgthmind. `
      + `Si vgthmind refuse ou abandonne la commande, l'acompte est remboursé intégralement.`;
  }
  return `I am ordering a personalised piece, made to my specifications: I acknowledge that I have no right of withdrawal (article L221-28 3° of the French Consumer Code). `
    + `I pay a deposit of ${eur(q.deposit)} (${q.depositPct}% of the total price of ${eur(q.total)}): this is a down payment ("acompte", not "arrhes", article L214-1 of the French Consumer Code), so my order is firm. `
    + `The balance is paid after I approve the piece from photos, before shipping. If I neither approve nor pay the balance ${s.forfeitDays} days after the photos are sent (reminder included), vgthmind keeps the deposit. `
    + `If vgthmind declines or abandons the order, the deposit is refunded in full.`;
}

// --- Actions ------------------------------------------------------------------------------------
export type Effect = { kind: string; data?: any };
export type ActResult = { ok: true; rec: any; effects: Effect[]; info?: any } | { ok: false; error: string; status?: number };

const fail = (error: string, status = 400): ActResult => ({ ok: false, error, status });
function done(rec: any, now: number, what: string | null, effects: Effect[] = [], info?: any): ActResult {
  rec.updated = now;
  if (what) rec.log.push({ at: now, what });
  if (rec.log.length > 200) rec.log = rec.log.slice(-200);
  return { ok: true, rec, effects, info };
}

export function applyAction(input: any, action: string, d: any, s: Settings, now: number): ActResult {
  const rec = JSON.parse(JSON.stringify(input));
  const paid = PAID_TYPES.includes(rec.type);
  switch (action) {
    case 'addFile': { // fichier du client (pendant 2 h après le formulaire)
      if (now - rec.created > UPLOAD_WINDOW_MS) return fail('upload_closed', 403);
      const kind = fileKind(d.type);
      if (!kind) return fail('type', 415);
      const count = rec.files.filter((f: any) => f.kind === kind).length;
      if (kind === 'photo' && (count >= FILE_LIMITS.photos || d.size > FILE_LIMITS.photoBytes)) return fail('limit', 413);
      if (kind === 'video' && (count >= FILE_LIMITS.videos || d.size > FILE_LIMITS.videoBytes)) return fail('limit', 413);
      rec.files.push({ key: d.key, name: clean(d.name, 120), type: d.type, size: d.size, kind, at: now });
      return done(rec, now, null);
    }
    case 'confirm': { // fin de l'envoi (navigateur) ou filet de sécurité du cron
      if (rec.status !== 'brouillon') return done(rec, now, null, [], { already: true });
      rec.status = 'nouvelle';
      return done(rec, now, null, [{ kind: 'mail:received' }, { kind: 'mail:new' }]);
    }
    case 'status': {
      if (!STATUSES.includes(d.status) || d.status === 'brouillon') return fail('Statut inconnu.');
      const from = rec.status;
      rec.status = d.status;
      return done(rec, now, `Statut : ${STATUS_LABELS[from]} → ${STATUS_LABELS[d.status]}`);
    }
    case 'notes': rec.notes = block(d.notes, 5000); return done(rec, now, null);
    case 'quote': {
      if (!paid) return fail('Pas de devis automatique pour une location ou une collab : réponds par mail.');
      if (rec.deposit && rec.deposit.paidAt) return fail('Acompte déjà payé : le devis ne peut plus changer.');
      const total = round2(Number(d.total));
      if (!(total >= 1 && total <= 20000)) return fail('Prix total invalide.');
      const pct = d.depositPct == null || d.depositPct === '' ? s.depositPct : Math.floor(Number(d.depositPct));
      if (!(pct >= 1 && pct <= 100)) return fail('Pourcentage d’acompte invalide.');
      const piece = PIECES[rec.type].find((p) => p.key === rec.fields.piece);
      const weight = Math.floor(Number(d.weight_g) || (piece ? piece.weight_g : 600));
      if (!(weight > 0 && weight <= 30000)) return fail('Poids invalide.');
      const delay = clean(d.delay, 120);
      if (!delay) return fail('Indique le délai de fabrication.');
      rec.quote = { total, depositPct: pct, deposit: depositFor(total, pct), delay, weight_g: weight, message: block(d.message, 3000), title: clean(d.title, 120) || defaultTitle(rec), sentAt: now };
      rec.status = 'devis';
      rec.reminders = {};
      return done(rec, now, `Devis envoyé : ${total} €, acompte ${pct} % (${rec.quote.deposit} €), délai ${delay}`, [{ kind: 'mail:quote' }]);
    }
    case 'acceptDeposit': { // le client coche la mention puis part payer
      if (!paid || rec.status !== 'devis' || !rec.quote) return fail('not_payable', 409);
      if (rec.deposit && rec.deposit.paidAt) return fail('already_paid', 409);
      if (d.accept !== true) return fail('consent_required');
      const text = consentText(rec.lang, rec.quote, s);
      rec.deposit = { ...(rec.deposit || {}), acceptedAt: now, acceptIp: clean(d.ip, 60), consent: text, amount: rec.quote.deposit };
      return done(rec, now, 'Mention acceptée avant l’acompte : « ' + text + ' »');
    }
    case 'depositSession': rec.deposit = { ...(rec.deposit || {}), session: d.session }; return done(rec, now, null);
    case 'depositPaid': {
      if (rec.deposit && rec.deposit.paidAt) return done(rec, now, null, [], { already: true });
      rec.deposit = { ...(rec.deposit || {}), session: d.session, paidAt: now, amount: round2(d.amount) };
      rec.status = 'fabrication';
      rec.reminders = {};
      return done(rec, now, `Acompte payé : ${rec.deposit.amount} € (fabrication lancée)`, [{ kind: 'mail:depositPaid' }, { kind: 'alert', data: { subject: `Acompte payé : ${rec.id}`, detail: `${rec.client.name} a payé ${rec.deposit.amount} €. Fabrication lancée.` } }]);
    }
    case 'addFinal': {
      if (rec.finals.length >= FILE_LIMITS.finals) return fail('12 photos maximum.');
      if (fileKind(d.type) !== 'photo' || d.size > FILE_LIMITS.photoBytes) return fail('Photo seulement (10 Mo max).');
      rec.finals.push({ key: d.key, name: clean(d.name, 120), type: d.type, size: d.size, at: now });
      return done(rec, now, null);
    }
    case 'removeFinal': rec.finals = rec.finals.filter((f: any) => f.key !== d.key); return done(rec, now, null, [{ kind: 'deleteFile', data: { key: d.key } }]);
    case 'sendValidation': {
      if (!paid || !rec.deposit || !rec.deposit.paidAt) return fail('L’acompte n’est pas encore payé.');
      if (rec.balance && rec.balance.paidAt) return fail('Solde déjà payé.');
      if (!rec.finals.length) return fail('Ajoute d’abord les photos de la pièce finie.');
      const v = rec.validation || { round: 0, retouchesUsed: 0, retouches: [] };
      v.round += 1; v.sentAt = now; v.validatedAt = null;
      rec.validation = v; rec.status = 'validation'; rec.reminders = {}; rec.forfeited = false;
      return done(rec, now, `Photos envoyées pour validation (envoi n° ${v.round})`, [{ kind: 'mail:validation' }]);
    }
    case 'validate': {
      if (rec.status !== 'validation' || !rec.validation) return fail('not_waiting', 409);
      if (!rec.validation.validatedAt) rec.validation.validatedAt = now;
      return done(rec, now, 'Pièce validée par le client', [{ kind: 'alert', data: { subject: `Pièce validée : ${rec.id}`, detail: `${rec.client.name} a validé la pièce. Le solde reste à payer.` } }]);
    }
    case 'retouch': {
      if (rec.status !== 'validation' || !rec.validation || rec.validation.validatedAt) return fail('not_waiting', 409);
      const text = block(d.text, 1500);
      if (text.length < 3) return fail('text_required');
      const v = rec.validation;
      if (v.retouchesUsed >= s.retouchesIncluded) { // au-delà des retouches incluses : sur devis
        v.retouches.push({ at: now, text, extra: true });
        return done(rec, now, 'Retouche supplémentaire demandée (sur devis) : ' + text, [{ kind: 'alert', data: { subject: `Retouche supplémentaire (sur devis) : ${rec.id}`, detail: `${rec.client.name} demande une retouche au-delà des ${s.retouchesIncluded} incluse(s) :\n\n${text}\n\nÀ chiffrer et à répondre par mail.` } }], { extra: true });
      }
      v.retouchesUsed += 1; v.retouches.push({ at: now, text });
      rec.status = 'fabrication'; rec.reminders = {};
      return done(rec, now, `Retouche demandée (${v.retouchesUsed}/${s.retouchesIncluded} incluse) : ` + text, [{ kind: 'alert', data: { subject: `Retouche demandée : ${rec.id}`, detail: `${rec.client.name} demande une retouche (${v.retouchesUsed}/${s.retouchesIncluded} incluse) :\n\n${text}` } }]);
    }
    case 'balanceSession': rec.balance = { ...(rec.balance || {}), session: d.session, shipping: d.shipping, country: d.country }; return done(rec, now, null);
    case 'balancePaid': {
      if (rec.balance && rec.balance.paidAt) return done(rec, now, null, [], { already: true });
      rec.balance = { ...(rec.balance || {}), session: d.session, paidAt: now, amount: round2(d.amount), shipping: round2(d.shipping || 0) };
      if (rec.validation && !rec.validation.validatedAt) rec.validation.validatedAt = now; // payer le solde vaut validation
      rec.status = 'solde'; rec.reminders = {};
      return done(rec, now, `Solde payé : ${rec.balance.amount} € (dont port ${rec.balance.shipping} €) : commande dans « Commandes »`, [{ kind: 'alert', data: { subject: `Solde payé : ${rec.id}`, detail: `${rec.client.name} a payé le solde. La commande est dans l'onglet Commandes (à expédier).` } }]);
    }
    case 'shipped': {
      if (rec.status === 'envoyee' || CLOSED.includes(rec.status)) return done(rec, now, null);
      rec.status = 'envoyee';
      return done(rec, now, 'Commande expédiée' + (d.tracking ? ' (suivi ' + clean(d.tracking, 100) + ')' : ''));
    }
    case 'reply': {
      const subject = clean(d.subject, 150), message = block(d.message, 5000);
      if (!subject || message.length < 2) return fail('Sujet et message obligatoires.');
      if (rec.status === 'nouvelle') rec.status = 'discussion';
      return done(rec, now, 'Mail envoyé : « ' + subject + ' »\n' + message, [{ kind: 'mail:reply', data: { subject, message } }]);
    }
    case 'filesPurged': { // conservation (cron) : ne compte pas comme un échange (date de dernière activité inchangée)
      const keys: string[] = d.keys || [];
      rec.files = rec.files.filter((f: any) => !keys.includes(f.key));
      rec.finals = rec.finals.filter((f: any) => !keys.includes(f.key));
      rec.log.push({ at: now, what: `${keys.length} fichier(s) effacé(s) (durée de conservation)` });
      return { ok: true, rec, effects: [] };
    }
    case 'reminder': { // posé par le cron (voir dueStep)
      rec.reminders = { ...(rec.reminders || {}), [d.step]: now };
      if (d.step === 'forfeit') rec.forfeited = true;
      return done(rec, now, d.what || null, d.effects || []);
    }
  }
  return fail('Action inconnue.');
}

// Réponses lisibles, dans l'ordre du parcours : [[libellé, valeur], …] (admin, mails, récapitulatif).
export function answerLines(rec: any, lang: string): [string, string][] {
  const i = lang === 'fr' ? 0 : 1;
  const out: [string, string][] = [];
  for (const k of FIELDS_BY_TYPE[rec.type] || []) {
    let v = rec.fields[k];
    if (v === '' || v == null || v === false) continue;
    if (k === 'piece') { const p = (PIECES[rec.type] || []).find((x) => x.key === v); v = p ? (lang === 'fr' ? p.fr : p.en) : v; }
    else if (k === 'paint') v = lang === 'fr' ? 'Oui' : 'Yes';
    else if (k === 'deadline' && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) { const [y, m, d] = String(v).split('-'); v = lang === 'fr' ? `${d}/${m}/${y}` : `${y}-${m}-${d}`; }
    else if (CHOICE_LABELS[v]) v = CHOICE_LABELS[v][i];
    out.push([FIELD_LABELS[k] ? FIELD_LABELS[k][i] : k, String(v)]);
  }
  return out;
}

export function defaultTitle(rec: any): string {
  const p = (PIECES[rec.type] || []).find((x) => x.key === rec.fields.piece);
  const kind = rec.type === 'custom' ? 'Custom' : 'Sur-mesure';
  return `${kind}${p ? ' ' + p.fr.toLowerCase() : ''}${rec.fields.paint ? ' peint' : ''}`;
}

// --- Relances et durées de conservation (cron) ----------------------------------------------------
// Renvoie au plus une étape à jouer pour cette demande (le cron repasse le lendemain pour la suivante).
export function dueStep(rec: any, s: Settings, now: number): { step: string; what: string; effects: Effect[] } | null {
  const r = rec.reminders || {};
  const days = (t: number) => (now - t) / DAY;
  if (rec.status === 'brouillon' && now - rec.created > DRAFT_GRACE_MS) return null; // géré à part (confirm)
  if (rec.status === 'devis' && rec.quote && !(rec.deposit && rec.deposit.paidAt)) {
    const d = days(rec.quote.sentAt);
    if (d >= s.alertDays && !r.quoteAlert) return { step: 'quoteAlert', what: `Alerte : devis sans réponse depuis ${s.alertDays} jours`, effects: [{ kind: 'alert', data: { subject: `Devis sans réponse : ${rec.id}`, detail: `${rec.client.name} (${rec.client.email}) n'a pas payé l'acompte ${s.alertDays} jours après le devis (relance faite). Relance à la main ou passe la demande en « Refusée ».` } }] };
    if (d >= s.remindDays && !r.quoteRemind) return { step: 'quoteRemind', what: 'Relance automatique du devis envoyée', effects: [{ kind: 'mail:quoteReminder' }] };
  }
  if (rec.status === 'validation' && rec.validation && rec.validation.sentAt && !(rec.balance && rec.balance.paidAt)) {
    const d = days(rec.validation.sentAt);
    if (d >= s.forfeitDays && !r.forfeit) return { step: 'forfeit', what: `${s.forfeitDays} jours sans validation ni solde : acompte conservé (CGV)`, effects: [{ kind: 'alert', data: { subject: `Acompte conservé : ${rec.id}`, detail: `${s.forfeitDays} jours après l'envoi des photos, ni validation ni paiement du solde. Selon les CGV, l'acompte (${rec.deposit?.amount} €) reste acquis. Tu peux passer la demande en « Terminée » ou « Refusée ».` } }] };
    if (d >= s.alertDays && !r.validationAlert) return { step: 'validationAlert', what: `Alerte : pas de ${rec.validation.validatedAt ? 'solde' : 'validation'} depuis ${s.alertDays} jours`, effects: [{ kind: 'alert', data: { subject: `Validation / solde en attente : ${rec.id}`, detail: `${rec.client.name} (${rec.client.email}) : ${rec.validation.validatedAt ? 'pièce validée mais solde non payé' : 'pas de validation'} ${s.alertDays} jours après l'envoi des photos (relance faite). Acompte conservé au bout de ${s.forfeitDays} jours.` } }] };
    if (d >= s.remindDays && !r.validationRemind) return { step: 'validationRemind', what: 'Relance automatique de la validation envoyée', effects: [{ kind: 'mail:validationReminder' }] };
  }
  return null;
}

// Ce que la conservation impose : 'delete' (toute la demande), 'files' (fichiers seulement), ou rien.
export function retention(rec: any, now: number): { deleteAll: boolean; deleteFiles: string[] } {
  const closedAt = CLOSED.includes(rec.status) || rec.status === 'envoyee' ? rec.updated : 0;
  const everPaid = !!(rec.deposit && rec.deposit.paidAt);
  const idle = now - rec.updated;
  // Sans suite (jamais payée) ou terminée/refusée : effacée 12 mois après le dernier échange. Les données de
  // facturation restent chez Stripe et sur les factures (10 ans), pas ici.
  if (idle > KEEP_UNPAID_MS && (CLOSED.includes(rec.status) || rec.status === 'envoyee' || !everPaid)) return { deleteAll: true, deleteFiles: rec.files.concat(rec.photosConsent ? [] : rec.finals).map((f: any) => f.key) }; // accord photos : la pièce finie reste (portfolio)
  if (closedAt && now - closedAt > KEEP_FILES_MS) {
    const keys = rec.files.map((f: any) => f.key).concat(rec.photosConsent ? [] : rec.finals.map((f: any) => f.key));
    return { deleteAll: false, deleteFiles: keys };
  }
  return { deleteAll: false, deleteFiles: [] };
}

// Vue client (page « Ma demande ») : jamais les notes privées, l'IP, les fichiers du client ni le journal.
export function clientView(rec: any, s: Settings) {
  const v = rec.validation;
  return {
    id: rec.id, type: rec.type, lang: rec.lang, status: rec.status, created: rec.created,
    name: rec.client.name, country: rec.client.country, piece: rec.fields.piece,
    quote: rec.quote ? { total: rec.quote.total, deposit: rec.quote.deposit, depositPct: rec.quote.depositPct, balance: round2(rec.quote.total - rec.quote.deposit), delay: rec.quote.delay, message: rec.quote.message, title: rec.quote.title, sentAt: rec.quote.sentAt } : null,
    consent: rec.quote ? consentText(rec.lang, rec.quote, s) : '',
    depositPaid: !!(rec.deposit && rec.deposit.paidAt),
    validation: v ? { round: v.round, sentAt: v.sentAt, validatedAt: v.validatedAt || null, retouchesLeft: Math.max(0, s.retouchesIncluded - v.retouchesUsed), retouchesIncluded: s.retouchesIncluded } : null,
    photos: rec.status === 'validation' || rec.status === 'solde' || rec.status === 'envoyee' || rec.status === 'terminee' ? rec.finals.map((_f: any, i: number) => i) : [],
    balancePaid: !!(rec.balance && rec.balance.paidAt),
    forfeitDays: s.forfeitDays,
  };
}

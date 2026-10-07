// Compta : construction (pure, testable) des lignes envoyees vers le Google Sheet.
// AUCUNE donnee client : ni nom, ni email, ni telephone, ni adresse, ni pays.
// Seulement : date, numero de commande (VG-XXXXXX), designation des pieces,
// montants, mode de reglement, identifiants Stripe techniques.
// Utilise par checkout-worker/accounting.ts et teste par `npm test`.

export const SALE_COLUMNS = [
  'Date', 'N° de pièce (commande)', 'Désignation', 'Nature', 'Mode de règlement',
  'Pièces TTC', 'Frais de port', 'Remise', 'Total encaissé', 'ID paiement Stripe', 'Clé',
];
export const REFUND_COLUMNS = ['Date', 'N° de pièce (commande)', 'ID paiement Stripe', 'Montant remboursé', 'Motif', 'Clé'];

const euros = (cents) => Math.round(Number(cents || 0)) / 100;

// Jour calendaire de Paris (AAAA-MM-JJ) d'un horodatage Stripe (secondes).
export function parisDate(unixSeconds) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(unixSeconds * 1000));
}

// Vente = session Stripe Checkout payee. `lineItems` : data[] de Stripe (description, quantity).
export function buildSaleRecord(session, { ref = '', lineItems = [] } = {}) {
  const designation = lineItems.map((li) => `${li.description}${li.quantity > 1 ? ' ×' + li.quantity : ''}`).join(' ; ').slice(0, 500);
  const total = euros(session.amount_total);
  const shipping = euros(session.shipping_cost && session.shipping_cost.amount_total);
  const discount = euros(session.total_details && session.total_details.amount_discount);
  return {
    type: 'sale',
    key: String(session.id),
    livemode: !!session.livemode,
    row: {
      date: parisDate(session.created), ref, designation, nature: 'Vente de marchandises',
      method: 'Carte bancaire (Stripe)',
      items: Math.round((total - shipping) * 100) / 100, shipping, discount, total,
      payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : '',
    },
  };
}

// Remboursement = objet « refund » Stripe (evenement refund.created).
export function buildRefundRecord(refund, { ref = '' } = {}) {
  return {
    type: 'refund',
    key: String(refund.id),
    livemode: refund.livemode !== undefined ? !!refund.livemode : true,
    row: {
      date: parisDate(refund.created), ref,
      payment_intent: typeof refund.payment_intent === 'string' ? refund.payment_intent : '',
      amount: euros(refund.amount), reason: refundReason(refund.reason),
    },
  };
}

function refundReason(r) {
  return { duplicate: 'Doublon', fraudulent: 'Fraude', requested_by_customer: 'Demande du client' }[r] || '';
}

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// Signature HMAC-SHA256 de `${ts}.${payload}` (payload = chaine JSON envoyee telle quelle).
export async function sign(secret, ts, payload) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${payload}`)));
}

// Corps de requete vers Apps Script : { ts, sig, payload } ; payload est une CHAINE JSON.
// Le secret n'est jamais envoye, seulement la signature.
export async function buildEnvelope(secret, record, now = Date.now()) {
  const payload = JSON.stringify({ v: 1, type: record.type, key: record.key, row: record.row });
  const ts = String(Math.floor(now / 1000));
  return JSON.stringify({ ts, sig: await sign(secret, ts, payload), payload });
}

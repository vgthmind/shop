// Facture d'une commande payée : données seulement (le rendu imprimable / PDF se fait dans le navigateur,
// assets/vg-invoice.js). Numéro W-AAAA-NNN (compteur du Worker, distinct du Facturier AAAA-NNN).
export const VAT_MENTION = 'TVA non applicable, art. 293 B du CGI';
// Recodification CIBS reportée au 1er janvier 2027 : à reprendre alors (ici, mentions légales, Facturier).

export interface InvoiceLine { name: string; size?: string; qty: number; unit: number; amount: number }
export interface Invoice {
  number: string;
  test: boolean;
  date: number; // secondes (date de la commande)
  currency: string;
  seller: { name: string; line2: string; siret: string; email: string };
  customer: { name: string; email: string; address: string[]; country: string };
  lines: InvoiceLine[];
  shipping: number;
  discount: number;
  total: number;
  vat: string;
  ref: string;
  // Pièce sur demande : titre (« Facture d’acompte »), acompte déduit du solde, mentions.
  title?: string; titleEn?: string; kind?: string; deductions?: { label: string; amount: number }[]; notes?: string[];
}

export const SELLER = { name: 'vgthmind', city: 'Vitry-sur-Seine, France', siret: '952 025 369 00028', email: 'contact@vgthmind.org' };

// Année civile de Paris d'un horodatage Stripe (secondes).
export function parisYear(unixSeconds: number): number {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric' }).format(new Date(unixSeconds * 1000)));
}

export function buildInvoice(s: any, lines: InvoiceLine[], opts: { number: string; ref: string; sellerAddress?: string }): Invoice {
  const ship = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || {};
  const a = ship.address || s.customer_details?.address || {}; // acompte : pas de livraison, adresse de facturation
  const addr = [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' '), a.state].filter(Boolean);
  return {
    number: opts.number,
    ref: opts.ref,
    test: !s.livemode,
    date: s.created,
    currency: String(s.currency || 'eur').toUpperCase(),
    seller: { name: SELLER.name, line2: [opts.sellerAddress, SELLER.city].filter(Boolean).join(', '), siret: SELLER.siret, email: SELLER.email },
    customer: { name: ship.name || s.customer_details?.name || '', email: s.customer_details?.email || '', address: addr, country: a.country || s.customer_details?.address?.country || '' },
    lines,
    shipping: (s.shipping_cost?.amount_total || 0) / 100,
    discount: (s.total_details?.amount_discount || 0) / 100,
    total: (s.amount_total || 0) / 100,
    vat: VAT_MENTION,
  };
}

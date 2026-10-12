/* Facture imprimable / « Enregistrer en PDF » : prend l'objet `invoice` renvoyé par le Worker
   (POST /invoice pour le client, GET /admin/invoice pour l'admin) et ouvre une page prête à imprimer.
   Aucune donnée n'est gardée dans le navigateur. */
(function (root) {
  'use strict';
  var T = {
    fr: { title: 'Facture', no: 'N°', date: 'Date', seller: 'Émetteur', customer: 'Client', desc: 'Désignation', qty: 'Qté', unit: 'Prix unitaire', amount: 'Montant',
      shipping: 'Livraison', discount: 'Remise', total: 'Total payé', paid: 'Réglée par carte bancaire (Stripe).', siret: 'SIRET', order: 'Commande', size: 'Taille',
      test: 'FACTURE DE TEST : aucune valeur', print: 'Imprimer / Enregistrer en PDF', locale: 'fr-FR' },
    en: { title: 'Invoice', no: 'No.', date: 'Date', seller: 'Seller', customer: 'Customer', desc: 'Description', qty: 'Qty', unit: 'Unit price', amount: 'Amount',
      shipping: 'Shipping', discount: 'Discount', total: 'Total paid', paid: 'Paid by card (Stripe).', siret: 'SIRET', order: 'Order', size: 'Size',
      test: 'TEST INVOICE: no value', print: 'Print / Save as PDF', locale: 'en-GB' }
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function html(inv, lang) {
    var t = T[lang] || T.fr;
    var money = function (n) { return new Intl.NumberFormat(t.locale, { style: 'currency', currency: inv.currency || 'EUR' }).format(n || 0); };
    var date = new Date(inv.date * 1000).toLocaleDateString(t.locale, { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
    var rows = inv.lines.map(function (l) {
      return '<tr><td>' + esc(l.name) + (l.size ? '<br><small>' + t.size + ' ' + esc(l.size) + '</small>' : '') + '</td><td class="n">' + esc(l.qty) + '</td><td class="n">' + money(l.unit) + '</td><td class="n">' + money(l.amount) + '</td></tr>';
    }).join('');
    return '<!doctype html><html lang="' + (lang === 'en' ? 'en' : 'fr') + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">'
      + '<title>' + t.title + ' ' + esc(inv.number) + '</title><style>'
      + 'body{font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#171717;max-width:760px;margin:24px auto;padding:0 16px}'
      + 'h1{font-size:26px;margin:0 0 4px;letter-spacing:.04em;text-transform:uppercase}.top{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;border-bottom:2px solid #171717;padding-bottom:12px}'
      + '.parties{display:flex;gap:24px;flex-wrap:wrap;margin:18px 0}.parties div{flex:1 1 240px}.lbl{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b6860}'
      + 'table{width:100%;border-collapse:collapse;margin:12px 0}th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b6860;text-align:left;border-bottom:1px solid #171717;padding:6px 4px}'
      + 'td{padding:8px 4px;border-bottom:1px solid #ddd;vertical-align:top}.n{text-align:right;white-space:nowrap}small{color:#6b6860}'
      + '.tot td{border:0;padding:3px 4px}.grand td{font-weight:700;font-size:16px;border-top:2px solid #171717;padding-top:8px}.mention{margin-top:18px;font-size:12px;color:#444}'
      + '.test{background:#fde8e8;color:#a23b2a;border:1px solid #a23b2a;padding:6px 10px;margin:10px 0;font-weight:700;text-align:center}'
      + 'button{margin:0 0 16px;padding:10px 16px;border-radius:999px;border:1px solid #171717;background:#171717;color:#fff;font:inherit;cursor:pointer}'
      + '@media print{button{display:none}body{margin:0}}</style></head><body>'
      + '<button onclick="window.print()">' + t.print + '</button>'
      + (inv.test ? '<div class="test">' + t.test + '</div>' : '')
      + '<div class="top"><div><h1>' + t.title + '</h1><div>' + t.no + ' ' + esc(inv.number) + '<br>' + t.date + ' : ' + esc(date) + '<br>' + t.order + ' ' + esc(inv.ref) + '</div></div>'
      + '<div style="text-align:right"><strong>' + esc(inv.seller.name) + '</strong><br>' + esc(inv.seller.line2) + '<br>' + t.siret + ' ' + esc(inv.seller.siret) + '<br>' + esc(inv.seller.email) + '</div></div>'
      + '<div class="parties"><div><div class="lbl">' + t.customer + '</div><strong>' + esc(inv.customer.name) + '</strong><br>' + inv.customer.address.map(esc).join('<br>') + (inv.customer.country ? '<br>' + esc(inv.customer.country) : '') + '<br>' + esc(inv.customer.email) + '</div></div>'
      + '<table><thead><tr><th>' + t.desc + '</th><th class="n">' + t.qty + '</th><th class="n">' + t.unit + '</th><th class="n">' + t.amount + '</th></tr></thead><tbody>' + rows + '</tbody></table>'
      + '<table class="tot"><tr><td></td><td class="n">' + t.shipping + '</td><td class="n" style="width:120px">' + money(inv.shipping) + '</td></tr>'
      + (inv.discount ? '<tr><td></td><td class="n">' + t.discount + '</td><td class="n">−' + money(inv.discount) + '</td></tr>' : '')
      + '<tr class="grand"><td></td><td class="n">' + t.total + '</td><td class="n">' + money(inv.total) + '</td></tr></table>'
      + '<p class="mention">' + esc(inv.vat) + '<br>' + t.paid + '</p></body></html>';
  }

  // Ouvre la facture dans un nouvel onglet (à appeler dans un clic : sinon le navigateur bloque la fenêtre).
  function open(inv, lang) {
    var w = root.open('', '_blank');
    if (!w) { alert('Fenêtre bloquée : autorise les pop-ups pour ce site.'); return; }
    w.document.open(); w.document.write(html(inv, lang)); w.document.close();
  }

  // Ouvre tout de suite une page vide (dans le clic : pas bloquée), puis y écrit la facture quand elle arrive.
  function openAsync(promise, lang) {
    var w = root.open('', '_blank');
    if (!w) { alert('Fenêtre bloquée : autorise les pop-ups pour ce site.'); return Promise.resolve(false); }
    w.document.write('<p style="font:16px system-ui;padding:24px">…</p>');
    return promise.then(function (inv) { w.document.open(); w.document.write(html(inv, lang)); w.document.close(); return true; })
      .catch(function (e) { w.document.body.innerHTML = '<p style="font:16px system-ui;padding:24px">' + esc(e && e.message ? e.message : 'Erreur') + '</p>'; return false; });
  }

  root.VGInvoice = { html: html, open: open, openAsync: openAsync };
  if (typeof module === 'object' && module.exports) module.exports = root.VGInvoice;
}(typeof self !== 'undefined' ? self : this));

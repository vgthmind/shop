/* Page « Ma demande » (/demande/?id=D-…&k=…) : lien secret envoyé par mail. Affiche le statut, le devis avec la
   mention à accepter avant l'acompte, les photos de la pièce finie (validation ou retouche), le paiement du solde
   (port selon le pays) et les factures. Tout est relu au Worker ; rien n'est gardé dans le navigateur. */
(function () {
  'use strict';
  var root = document.getElementById('vgr'); if (!root) return;
  var EP = window.VG_SHOP_CHECKOUT_ENDPOINT !== undefined ? window.VG_SHOP_CHECKOUT_ENDPOINT : 'https://vgthmind-shop-checkout.vgthm66.workers.dev';
  var CGV = root.getAttribute('data-cgv'), SUIVI = root.getAttribute('data-suivi'), NEW = root.getAttribute('data-new');
  var body = document.getElementById('vgr-body');
  var qs = new URLSearchParams(location.search), id = qs.get('id') || '', k = qs.get('k') || '';
  var data = null, tries = 0, ship = null;
  function L(en, fr) { return (window.vgLang || 'en') === 'fr' ? fr : en; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function eur(n) { return new Intl.NumberFormat(L('en-GB', 'fr-FR'), { style: 'currency', currency: 'EUR' }).format(n || 0); }
  function api(path, extra) {
    return fetch(EP + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ id: id, k: k }, extra || {})) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._s = r.status; return j; }); });
  }
  var STATUS = {
    nouvelle: ['Received', 'Reçue'], discussion: ['In discussion', 'En discussion'], devis: ['Quote sent', 'Devis envoyé'], acompte: ['Deposit paid', 'Acompte payé'],
    fabrication: ['Being made', 'En fabrication'], validation: ['Waiting for your approval', 'En attente de ta validation'], solde: ['Balance paid', 'Solde payé'],
    envoyee: ['Shipped', 'Envoyée'], terminee: ['Completed', 'Terminée'], refusee: ['Closed', 'Close'], brouillon: ['Sending', 'Envoi en cours'],
  };
  var PIECE = { tshirt: ['T-shirt', 'T-shirt'], chemise: ['Shirt', 'Chemise'], hoodie: ['Sweatshirt / hoodie', 'Sweat / hoodie'], veste: ['Jacket', 'Veste'], short: ['Shorts', 'Short'], pantalon: ['Trousers', 'Pantalon'], haut: ['Top', 'Haut'] };
  var TYPE = { custom: 'Custom', surmesure: ['Made to measure', 'Sur-mesure'], production: ['Visual production', 'Production visuelle'], collab: 'Collab' };
  function t2(v) { return Array.isArray(v) ? L(v[0], v[1]) : v || ''; }

  function load() {
    if (!/^D-[A-Z0-9]{6}$/.test(id) || !k) { body.innerHTML = '<p>' + esc(L('This link is incomplete. Use the link from your email.', 'Ce lien est incomplet. Utilise le lien reçu par mail.')) + '</p>'; return; }
    api('/requests/view').then(function (j) {
      if (!j.ok) { body.innerHTML = '<p>' + esc(L('Request not found. It may have been deleted (retention period) — write to contact@vgthmind.org.', 'Demande introuvable. Elle a peut-être été effacée (durée de conservation) : écris à contact@vgthmind.org.')) + '</p>'; return; }
      data = j.request;
      // Retour de Stripe : le paiement peut mettre quelques secondes à être confirmé.
      if (qs.get('paid') === 'deposit' && !data.depositPaid && tries < 6) { tries++; draw(L('Confirming your payment…', 'Confirmation de ton paiement…')); setTimeout(load, 2500); return; }
      draw();
      if (location.hash) { var el = document.getElementById(location.hash.slice(1)); if (el) setTimeout(function () { el.scrollIntoView({ block: 'start' }); }, 50); }
    }).catch(function () { body.innerHTML = '<p class="err">' + esc(L('Connection failed, try again.', 'Connexion impossible, réessaie.')) + '</p>'; });
  }

  function quoteTable(q) {
    return '<table><tr class="big"><td>' + esc(L('Total price', 'Prix total')) + '</td><td class="n">' + eur(q.total) + '</td></tr>'
      + '<tr><td>' + esc(L('Deposit (' + q.depositPct + '%)', 'Acompte (' + q.depositPct + ' %)')) + '</td><td class="n">' + eur(q.deposit) + '</td></tr>'
      + '<tr><td>' + esc(L('Balance, after approval on photos (+ shipping)', 'Solde, après validation sur photos (+ port)')) + '</td><td class="n">' + eur(q.balance) + '</td></tr>'
      + '<tr><td>' + esc(L('Making time', 'Délai de fabrication')) + '</td><td class="n">' + esc(q.delay) + '</td></tr></table>';
  }

  function draw(note) {
    var r = data, q = r.quote, h = '';
    var piece = PIECE[r.piece] ? ' · ' + t2(PIECE[r.piece]) : '';
    h += '<h1>' + esc((q && q.title) || (t2(TYPE[r.type]) + piece)) + '</h1><p class="tag">' + esc(r.id + ' · ' + t2(STATUS[r.status])) + '</p>';
    if (note) h += '<p class="box">' + esc(note) + '</p>';
    var paid = r.type === 'custom' || r.type === 'surmesure';

    if (!paid) {
      h += '<div class="box"><p>' + esc(L('I reply to visual productions and collabs directly by email (quote, deposit cheque, contract depending on the project). Just reply to my emails.', 'Je réponds aux productions visuelles et aux collabs directement par mail (devis, caution par chèque, contrat selon le projet). Réponds simplement à mes mails.')) + '</p></div>';
    } else if (!q && (r.status === 'nouvelle' || r.status === 'discussion')) {
      h += '<div class="box"><p>' + esc(L('Your request is received. I’ll get back to you by email with questions or a quote.', 'Ta demande est bien reçue. Je reviens vers toi par mail avec des questions ou un devis.')) + '</p></div>';
    }

    // Devis + acompte
    if (paid && q && !r.depositPaid && r.status === 'devis') {
      h += '<h2>' + esc(L('Your quote', 'Ton devis')) + '</h2><div class="box">' + quoteTable(q) + (q.message ? '<p style="white-space:pre-wrap;margin-top:12px">' + esc(q.message) + '</p>' : '') + '</div>'
        + '<div class="box" id="acompte"><label class="check"><input type="checkbox" id="vgr-accept"><span>' + esc(r.consent) + ' <a href="' + esc(CGV) + '" target="_blank" rel="noopener">' + esc(L('Terms of sale', 'Conditions générales de vente')) + '</a></span></label>'
        + '<div class="row"><button type="button" class="btn" id="vgr-pay" disabled>' + esc(L('Pay the deposit', 'Payer l’acompte') + ' · ' + eur(q.deposit)) + '</button></div><p class="err" id="vgr-err"></p></div>';
    }
    if (paid && r.depositPaid) {
      h += '<div class="box"><p>' + esc(L('Deposit received: your order is firm and the piece is being made.', 'Acompte reçu : ta commande est ferme et ta pièce est en fabrication.')) + (q ? ' ' + esc(L('Making time: ', 'Délai : ') + q.delay) : '') + '</p>'
        + '<div class="row"><button type="button" class="btn ghost" data-inv="deposit">' + esc(L('Deposit invoice', 'Facture d’acompte')) + '</button>' + (r.balancePaid ? '<button type="button" class="btn ghost" data-inv="balance">' + esc(L('Invoice', 'Facture')) + '</button>' : '') + '</div></div>';
    }

    // Photos + validation
    if (r.photos.length) {
      h += '<h2 id="photos">' + esc(L('Your finished piece', 'Ta pièce finie')) + '</h2><div class="photos">'
        + r.photos.map(function (i) { return '<a href="' + EP + '/requests/photo?id=' + encodeURIComponent(id) + '&k=' + encodeURIComponent(k) + '&i=' + i + '" target="_blank" rel="noopener"><img style="--i:' + i + '" src="' + EP + '/requests/photo?id=' + encodeURIComponent(id) + '&k=' + encodeURIComponent(k) + '&i=' + i + '" alt="" loading="lazy"></a>'; }).join('') + '</div>';
    }
    var v = r.validation;
    if (r.status === 'validation' && v && !v.validatedAt) {
      h += '<div class="box" id="valider"><p>' + esc(L('Happy with it? Approve the piece, then pay the balance before shipping.', 'Elle te plaît ? Valide la pièce, puis paie le solde avant l’envoi.')) + '</p>'
        + '<p class="muted">' + esc(L('Without approval or payment of the balance ' + r.forfeitDays + ' days after the photos were sent (reminder included), the deposit is kept (terms of sale).', 'Sans validation ni paiement du solde ' + r.forfeitDays + ' jours après l’envoi des photos (relance comprise), l’acompte reste acquis (CGV).')) + '</p>'
        + '<div class="row"><button type="button" class="btn" id="vgr-ok">' + esc(L('I approve', 'Je valide')) + '</button></div></div>'
        + '<div class="box" id="retouche">' + (v.retouchesLeft > 0
          ? '<p><b>' + esc(L('I’d like a change', 'Je demande une retouche')) + '</b> · ' + esc(L(v.retouchesLeft + ' included', v.retouchesLeft + ' incluse' + (v.retouchesLeft > 1 ? 's' : ''))) + '</p>'
          : '<p><b>' + esc(L('Extra change: on quote', 'Retouche supplémentaire sur devis')) + '</b></p><p class="muted">' + esc(L('The included change has been used. Describe what you’d like: I’ll send you a quote.', 'La retouche incluse a été utilisée. Décris ce que tu veux : je t’envoie un devis.')) + '</p>')
        + '<textarea id="vgr-retouch" rows="4" maxlength="1500" placeholder="' + esc(L('What should change?', 'Qu’est-ce qui doit changer ?')) + '"></textarea>'
        + '<div class="row"><button type="button" class="btn ghost" id="vgr-ret">' + esc(v.retouchesLeft > 0 ? L('Send my change request', 'Envoyer ma demande de retouche') : L('Ask for a quote', 'Demander un devis')) + '</button></div><p class="err" id="vgr-rerr"></p></div>';
    }
    if (r.status === 'validation' && v && v.validatedAt && !r.balancePaid) {
      var opts = ['FR', 'BE', 'CH', 'LU', 'DE', 'IT', 'ES', 'NL', 'GB', 'US', 'CA'];
      if (r.country && opts.indexOf(r.country) === -1) opts.unshift(r.country);
      var name = function (c) { try { return new Intl.DisplayNames([L('en', 'fr')], { type: 'region' }).of(c) || c; } catch (e) { return c; } };
      h += '<div class="box" id="solde"><p class="okmsg">' + esc(L('Piece approved, thank you!', 'Pièce validée, merci !')) + '</p><h2 style="margin-top:8px">' + esc(L('Balance', 'Solde')) + '</h2>'
        + '<label class="muted" for="vgr-country">' + esc(L('Shipping country', 'Pays de livraison')) + '</label><select id="vgr-country">' + opts.map(function (c) { return '<option value="' + c + '"' + (c === (r.country || 'FR') ? ' selected' : '') + '>' + esc(name(c)) + '</option>'; }).join('') + '</select>'
        + '<div id="vgr-ship" style="margin-top:10px"></div><div class="row"><button type="button" class="btn" id="vgr-bal" disabled>' + esc(L('Pay the balance', 'Payer le solde')) + '</button></div><p class="err" id="vgr-berr"></p></div>';
    }
    if (r.balancePaid) h += '<div class="box"><p>' + esc(L('Balance paid. You’ll receive the order confirmation, then the tracking number when it ships.', 'Solde payé. Tu reçois la confirmation de commande, puis le numéro de suivi à l’envoi.')) + '</p><div class="row"><a class="btn ghost" href="' + esc(SUIVI) + '">' + esc(L('Track my order', 'Suivre ma commande')) + '</a></div></div>';
    if (r.status === 'refusee') h += '<div class="box"><p>' + esc(L('This request is closed. Another idea?', 'Cette demande est close. Une autre idée ?')) + '</p><div class="row"><a class="btn ghost" href="' + esc(NEW) + '">' + esc(L('Start a project', 'Proposer un projet')) + '</a></div></div>';
    h += '<p class="muted" style="margin-top:22px">' + esc(L('A question? Reply to my emails or write to contact@vgthmind.org.', 'Une question ? Réponds à mes mails ou écris à contact@vgthmind.org.')) + '</p>';
    body.innerHTML = h;
    wire();
  }

  function wire() {
    var acc = document.getElementById('vgr-accept'), pay = document.getElementById('vgr-pay');
    if (acc && pay) {
      acc.addEventListener('change', function () { pay.disabled = !acc.checked; });
      pay.addEventListener('click', function () {
        pay.disabled = true;
        api('/requests/deposit', { accept: acc.checked === true }).then(function (j) {
          if (j.url) { location.href = j.url; return; }
          pay.disabled = false;
          document.getElementById('vgr-err').textContent = j.error === 'payments_off' ? L('Online payment is not open yet.', 'Le paiement en ligne n’est pas encore ouvert.') : L('Payment could not start, try again.', 'Le paiement n’a pas pu démarrer, réessaie.');
        });
      });
    }
    var ok = document.getElementById('vgr-ok');
    if (ok) ok.addEventListener('click', function () { ok.disabled = true; api('/requests/validate').then(function (j) { if (j.ok) { data = j.request; draw(); var s = document.getElementById('solde'); if (s) s.scrollIntoView({ block: 'start' }); } else ok.disabled = false; }); });
    var ret = document.getElementById('vgr-ret');
    if (ret) ret.addEventListener('click', function () {
      var t = document.getElementById('vgr-retouch').value.trim(), e = document.getElementById('vgr-rerr');
      if (t.length < 3) { e.textContent = L('Describe the change.', 'Décris la retouche.'); return; }
      ret.disabled = true;
      api('/requests/retouch', { text: t }).then(function (j) {
        if (!j.ok) { ret.disabled = false; e.textContent = L('Could not send, try again.', 'Envoi impossible, réessaie.'); return; }
        data = j.request; draw(j.extra ? L('Request received: I’ll send you a quote for this extra change.', 'Demande reçue : je t’envoie un devis pour cette retouche supplémentaire.') : L('Change request received: I’m on it and will send new photos.', 'Demande de retouche reçue : je m’en occupe et je t’envoie de nouvelles photos.'));
      });
    });
    var cs = document.getElementById('vgr-country'), bal = document.getElementById('vgr-bal');
    if (cs && bal) {
      var quote = function () {
        bal.disabled = true; document.getElementById('vgr-ship').innerHTML = '<p class="muted">…</p>';
        api('/requests/balance-quote', { country: cs.value }).then(function (j) {
          if (!j.ok) { document.getElementById('vgr-ship').innerHTML = '<p class="err">' + esc(j.message || L('Country not served.', 'Pays non livré.')) + '</p>'; return; }
          ship = j;
          document.getElementById('vgr-ship').innerHTML = '<table><tr><td>' + esc(L('Balance', 'Solde')) + '</td><td class="n">' + eur(j.balance) + '</td></tr><tr><td>' + esc(L('Shipping', 'Livraison')) + '</td><td class="n">' + (j.shipping ? eur(j.shipping) : L('Free', 'Offerte')) + '</td></tr><tr class="big"><td>' + esc(L('To pay', 'À payer')) + '</td><td class="n">' + eur(j.balance + j.shipping) + '</td></tr></table>';
          bal.disabled = false;
        });
      };
      cs.addEventListener('change', quote); quote();
      bal.addEventListener('click', function () {
        bal.disabled = true;
        api('/requests/balance', { country: cs.value }).then(function (j) {
          if (j.url) { location.href = j.url; return; }
          bal.disabled = false; document.getElementById('vgr-berr').textContent = j.error === 'payments_off' ? L('Online payment is not open yet.', 'Le paiement en ligne n’est pas encore ouvert.') : (j.error || L('Payment could not start.', 'Le paiement n’a pas pu démarrer.'));
        });
      });
    }
    body.querySelectorAll('[data-inv]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!window.VGInvoice) return;
        window.VGInvoice.openAsync(api('/requests/invoice', { which: b.getAttribute('data-inv') }).then(function (j) { if (!j.ok) throw new Error(L('Invoice unavailable.', 'Facture indisponible.')); return j.invoice; }), L('en', 'fr'));
      });
    });
  }
  document.addEventListener('vg:lang', function () { if (data) draw(); });
  load();
})();

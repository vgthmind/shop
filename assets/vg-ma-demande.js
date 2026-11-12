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
    fabrication: ['In progress', 'En cours'], validation: ['Waiting for your approval', 'En attente de ta validation'], solde: ['Balance paid', 'Solde payé'],
    envoyee: ['Shipped', 'Envoyée'], terminee: ['Completed', 'Terminée'], refusee: ['Closed', 'Close'], brouillon: ['Sending', 'Envoi en cours'],
  };
  var PIECE = { tshirt: ['T-shirt', 'T-shirt'], hoodie: ['Sweatshirt / hoodie', 'Sweat / hoodie'], veste: ['Jacket', 'Veste'], autre: ['Another piece', 'Autre pièce'], short: ['Shorts', 'Short'], pantalon: ['Trousers', 'Pantalon'], haut: ['Top', 'Haut'] };
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

  function pdfUrl() { return EP + '/requests/quote.pdf?id=' + encodeURIComponent(id) + '&k=' + encodeURIComponent(k); }
  function dayFmt(ms) { return new Date(ms).toLocaleDateString(L('en-GB', 'fr-FR'), { day: 'numeric', month: 'long', year: 'numeric' }); }
  function quoteTable(q) {
    var ref = q.number ? q.number + (q.version > 1 ? ' v' + q.version : '') : '';
    var lines = (q.lines || []).map(function (l) { return '<tr><td>' + esc(l.label) + (l.qty > 1 ? ' <span class="muted">× ' + l.qty + '</span>' : '') + '</td><td class="n">' + eur(l.amount) + '</td></tr>'; }).join('');
    return (ref ? '<p class="muted" style="margin:0 0 8px">' + esc(L('Quote ', 'Devis ') + ref) + (q.validUntil ? ' · ' + esc(L('valid until ', 'valable jusqu’au ') + dayFmt(q.validUntil)) : '') + '</p>' : '')
      + '<table>' + lines + '<tr class="big"><td>' + esc(L('Total price', 'Prix total')) + '</td><td class="n">' + eur(q.total) + '</td></tr>'
      + (q.deposit ? '<tr><td>' + esc(q.optionalDeposit ? L('Optional deposit (' + q.depositPct + '%)', 'Acompte facultatif (' + q.depositPct + ' %)') : L('Deposit (' + q.depositPct + '%)', 'Acompte (' + q.depositPct + ' %)')) + '</td><td class="n">' + eur(q.deposit) + '</td></tr>' : '')
      + (q.deposit && !q.optionalDeposit ? '<tr><td>' + esc(L('Balance, after approval on photos (+ shipping)', 'Solde, après validation sur photos (+ port)')) + '</td><td class="n">' + eur(q.balance) + '</td></tr>' : '')
      + '<tr><td>' + esc(q.optionalDeposit ? L('Lead time', 'Délai') : L('Making time', 'Délai de fabrication')) + '</td><td class="n">' + esc(q.delay) + '</td></tr></table>'
      + '<p style="margin-top:10px"><a class="btn ghost" href="' + esc(pdfUrl()) + '" target="_blank" rel="noopener">' + esc(L('Download the quote (PDF)', 'Télécharger le devis (PDF)')) + '</a></p>';
  }

  // Virement bancaire (sans frais) : coordonnées renvoyées par le Worker seulement une fois le virement choisi (lien privé).
  var editBal = false;
  function bankBox(t, dep) {
    var b = data.bank; if (!b || !t) return '';
    var rows = [[L('Exact amount', 'Montant exact'), eur(t.amount), Number(t.amount).toFixed(2), ''], [L('Reference to put on the transfer', 'Référence à mettre en libellé du virement'), t.ref, t.ref, ' ref'],
      [L('Account holder', 'Titulaire'), b.holder, b.holder, ''], ['IBAN', b.iban, b.iban.replace(/\s/g, ''), '']];
    if (b.bic) rows.push(['BIC', b.bic, b.bic, '']);
    return '<div class="box vir" id="virement"><p class="tag vt">' + esc(L('Bank transfer pending', 'Virement en attente')) + '</p>'
      + '<p>' + esc(dep ? L('Make a transfer of the exact amount below from your bank, with the reference. Your order starts when the funds arrive (usually 1 to 3 working days).', 'Fais un virement du montant exact ci-dessous depuis ta banque, avec la référence. Ta commande démarre à réception des fonds (en général 1 à 3 jours ouvrés).')
        : L('Make a transfer of the exact amount below from your bank, with the reference. I ship your piece when the funds arrive (usually 1 to 3 working days).', 'Fais un virement du montant exact ci-dessous depuis ta banque, avec la référence. J’envoie ta pièce à réception des fonds (en général 1 à 3 jours ouvrés).')) + '</p>'
      + '<div class="bank">' + rows.map(function (x) { return '<div class="bl' + x[3] + '"><div><span class="muted">' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b></div><button type="button" class="cp" data-copy="' + esc(x[2]) + '">' + esc(L('Copy', 'Copier')) + '</button></div>'; }).join('') + '</div>'
      + (!dep && t.shipping ? '<p class="muted">' + esc(L('Including shipping: ', 'Dont livraison : ') + eur(t.shipping)) + '</p>' : '')
      + '<p class="muted">' + esc(L('You also received these details by email. I’ll confirm by email as soon as the transfer is in.', 'Tu as aussi reçu ces informations par mail. Je te confirme par mail dès que le virement est arrivé.')) + '</p>';
  }
  function addrForm() {
    var f = function (k, lab, ac, type, req) { return '<label class="fld"><span class="muted">' + esc(lab) + (req ? '' : ' ' + L('(optional)', '(facultatif)')) + '</span><input type="' + (type || 'text') + '" id="vgr-a-' + k + '" autocomplete="' + ac + '" maxlength="120"></label>'; };
    return '<div id="vgr-addr" hidden><p style="margin:14px 0 4px"><b>' + esc(L('Delivery address', 'Adresse de livraison')) + '</b></p>'
      + f('name', L('First and last name', 'Prénom et nom'), 'name', 'text', 1) + f('line1', L('Address', 'Adresse'), 'address-line1', 'text', 1) + f('line2', L('Address line 2', 'Complément d’adresse'), 'address-line2')
      + '<div class="two">' + f('postal_code', L('Postcode', 'Code postal'), 'postal-code', 'text', 1) + f('city', L('City', 'Ville'), 'address-level2', 'text', 1) + '</div>' + f('phone', L('Phone (for the carrier)', 'Téléphone (pour le transporteur)'), 'tel', 'tel')
      + '<div class="row"><button type="button" class="btn" id="vgr-bvir-ok">' + esc(L('Confirm and see the bank details', 'Valider et voir les coordonnées bancaires')) + '</button></div></div>';
  }

  function draw(note) {
    var r = data, q = r.quote, h = '';
    var piece = PIECE[r.piece] ? ' · ' + t2(PIECE[r.piece]) : '';
    h += '<h1>' + esc((q && q.title) || (t2(TYPE[r.type]) + piece)) + '</h1><p class="tag">' + esc(r.id + ' · ' + t2(STATUS[r.status])) + '</p>';
    if (note) h += '<p class="box">' + esc(note) + '</p>';
    var paid = r.type === 'custom' || r.type === 'surmesure';
    var cgvLink = ' <a href="' + esc(CGV) + '" target="_blank" rel="noopener">' + esc(L('Terms of sale', 'Conditions générales de vente')) + '</a>';

    if (!q && !paid) {
      h += '<div class="box"><p>' + esc(L('I reply to visual productions and collabs directly by email. When we agree, I send you a quote here: you accept it online, with an optional deposit.', 'Je réponds aux productions visuelles et aux collabs directement par mail. Quand on est d’accord, je t’envoie un devis ici : tu l’acceptes en ligne, avec un acompte facultatif.')) + '</p></div>';
    } else if (!q && (r.status === 'nouvelle' || r.status === 'discussion')) {
      h += '<div class="box"><p>' + esc(L('Your request is received. I’ll get back to you by email with questions or a quote.', 'Ta demande est bien reçue. Je reviens vers toi par mail avec des questions ou un devis.')) + '</p></div>';
    }

    // Devis : à accepter (avec les CGV), puis acompte (obligatoire pour une pièce, facultatif pour une location / collab)
    var accepted = !!(q && q.acceptedAt);
    if (q && !r.depositPaid && r.status === 'devis') {
      h += '<h2>' + esc(L('Your quote', 'Ton devis')) + '</h2><div class="box">' + quoteTable(q) + (q.message ? '<p style="white-space:pre-wrap;margin-top:12px">' + esc(q.message) + '</p>' : '') + '</div>';
      if (q.expired) {
        h += '<div class="box"><p>' + esc(L('This quote has expired. Write to me and I’ll send you an updated one.', 'Ce devis a expiré. Écris-moi et je t’en envoie un à jour.')) + '</p><div class="row"><a class="btn ghost" href="mailto:contact@vgthmind.org">contact@vgthmind.org</a></div></div>';
      } else if (r.transfer && r.transfer.deposit && r.bank) {
        h += bankBox(r.transfer.deposit, true) + '<div class="row"><button type="button" class="btn ghost" id="vgr-pay">' + esc(L('Pay by card instead', 'Payer par carte à la place') + ' · ' + eur(q.deposit)) + '</button></div><p class="err" id="vgr-err"></p></div>';
      } else if (paid && r.transferOk) {
        h += '<div class="box" id="acompte"><label class="check"><input type="checkbox" id="vgr-accept"><span>' + esc(r.consent) + cgvLink + '</span></label>'
          + '<p style="margin:14px 0 0"><b>' + esc(L('Accept the quote and pay the deposit', 'Accepter le devis et payer l’acompte') + ' · ' + eur(q.deposit)) + '</b></p>'
          + '<div class="row"><button type="button" class="btn" id="vgr-vir" disabled>' + esc(L('Bank transfer — no fees', 'Virement bancaire — sans frais')) + '</button><button type="button" class="btn ghost" id="vgr-pay" disabled>' + esc(L('Card', 'Carte bancaire')) + '</button></div>'
          + '<p class="muted" style="margin-top:10px">' + esc(L('Bank transfer: the bank details appear right after, and your order starts when the funds arrive. Card: immediate payment.', 'Virement : les coordonnées s’affichent juste après, et ta commande démarre à réception des fonds. Carte : paiement immédiat.')) + '</p><p class="err" id="vgr-err"></p></div>';
      } else if (paid) {
        h += '<div class="box" id="acompte"><label class="check"><input type="checkbox" id="vgr-accept"><span>' + esc(r.consent) + cgvLink + '</span></label>'
          + '<div class="row"><button type="button" class="btn" id="vgr-pay" disabled>' + esc(L('Accept the quote and pay the deposit', 'Accepter le devis et payer l’acompte') + ' · ' + eur(q.deposit)) + '</button></div><p class="err" id="vgr-err"></p></div>';
      } else {
        h += '<div class="box" id="acompte"><label class="check"><input type="checkbox" id="vgr-accept"><span>' + esc(r.consent) + cgvLink + '</span></label><div class="row">'
          + (q.deposit && r.transferOk ? '<button type="button" class="btn" id="vgr-vir" disabled>' + esc(L('Accept and pay the optional deposit by bank transfer — no fees', 'Accepter et payer l’acompte facultatif par virement — sans frais') + ' · ' + eur(q.deposit)) + '</button>' : '')
          + (q.deposit ? '<button type="button" class="btn' + (r.transferOk ? ' ghost' : '') + '" id="vgr-pay" disabled>' + esc(L('Accept and pay the optional deposit', 'Accepter et payer l’acompte facultatif') + ' · ' + eur(q.deposit)) + '</button><button type="button" class="btn ghost" id="vgr-acc" disabled>' + esc(L('Accept without paying the deposit now', 'Accepter sans payer l’acompte maintenant')) + '</button>'
            : '<button type="button" class="btn" id="vgr-acc" disabled>' + esc(L('Accept the quote', 'Accepter le devis')) + '</button>')
          + '</div><p class="err" id="vgr-err"></p></div>';
      }
    } else if (q && (r.depositPaid || accepted || (r.status !== 'devis' && r.status !== 'nouvelle' && r.status !== 'discussion'))) {
      h += '<h2>' + esc(L('Your quote', 'Ton devis')) + '</h2><div class="box">' + quoteTable(q) + (accepted ? '<p class="okmsg" style="margin-top:10px">' + esc(L('Accepted on ', 'Accepté le ') + dayFmt(q.acceptedAt)) + '</p>' : '') + '</div>';
    }
    if (r.depositPaid) {
      h += '<div class="box"><p>' + esc(paid ? L('Deposit received: your order is firm and the piece is being made.', 'Acompte reçu : ta commande est ferme et ta pièce est en fabrication.') : L('Deposit received: thank you, the project is in progress.', 'Acompte reçu : merci, le projet est en cours.')) + (q ? ' ' + esc(L('Lead time: ', 'Délai : ') + q.delay) : '') + '</p>'
        + '<div class="row"><button type="button" class="btn ghost" data-inv="deposit">' + esc(L('Deposit invoice', 'Facture d’acompte')) + '</button>' + (r.balancePaid ? '<button type="button" class="btn ghost" data-inv="balance">' + esc(L('Invoice', 'Facture')) + '</button>' : '') + '</div></div>';
    } else if (!paid && accepted && r.status !== 'devis') {
      h += '<div class="box"><p>' + esc(L('Quote accepted, thank you! The project is in progress. I’ll write to you for the next steps.', 'Devis accepté, merci ! Le projet est en cours. Je t’écris pour la suite.')) + '</p></div>';
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
    if (r.status === 'validation' && v && v.validatedAt && !r.balancePaid && r.transfer && r.transfer.balance && r.bank && !editBal) {
      h += '<h2 id="solde">' + esc(L('Balance', 'Solde')) + '</h2>' + bankBox(r.transfer.balance, false)
        + '<div class="row"><button type="button" class="btn ghost" id="vgr-bedit">' + esc(L('Change the address or pay by card', 'Changer l’adresse ou payer par carte')) + '</button></div></div>';
    } else if (r.status === 'validation' && v && v.validatedAt && !r.balancePaid) {
      var opts = ['FR', 'BE', 'CH', 'LU', 'DE', 'IT', 'ES', 'NL', 'GB', 'US', 'CA'];
      if (r.country && opts.indexOf(r.country) === -1) opts.unshift(r.country);
      var name = function (c) { try { return new Intl.DisplayNames([L('en', 'fr')], { type: 'region' }).of(c) || c; } catch (e) { return c; } };
      h += '<div class="box" id="solde"><p class="okmsg">' + esc(L('Piece approved, thank you!', 'Pièce validée, merci !')) + '</p><h2 style="margin-top:8px">' + esc(L('Balance', 'Solde')) + '</h2>'
        + '<label class="muted" for="vgr-country">' + esc(L('Shipping country', 'Pays de livraison')) + '</label><select id="vgr-country">' + opts.map(function (c) { return '<option value="' + c + '"' + (c === (r.country || 'FR') ? ' selected' : '') + '>' + esc(name(c)) + '</option>'; }).join('') + '</select>'
        + '<div id="vgr-ship" style="margin-top:10px"></div>'
        + (r.transferOk
          ? '<div class="row"><button type="button" class="btn" id="vgr-bvir" disabled>' + esc(L('Bank transfer — no fees', 'Virement bancaire — sans frais')) + '</button><button type="button" class="btn ghost" id="vgr-bal" disabled>' + esc(L('Card', 'Carte bancaire')) + '</button></div>' + addrForm()
          : '<div class="row"><button type="button" class="btn" id="vgr-bal" disabled>' + esc(L('Pay the balance', 'Payer le solde')) + '</button></div>')
        + '<p class="err" id="vgr-berr"></p></div>';
    }
    if (r.balancePaid) h += '<div class="box"><p>' + esc(L('Balance paid. You’ll receive the order confirmation, then the tracking number when it ships.', 'Solde payé. Tu reçois la confirmation de commande, puis le numéro de suivi à l’envoi.')) + '</p><div class="row"><a class="btn ghost" href="' + esc(SUIVI) + '">' + esc(L('Track my order', 'Suivre ma commande')) + '</a></div></div>';
    if (r.status === 'refusee') h += '<div class="box"><p>' + esc(L('This request is closed. Another idea?', 'Cette demande est close. Une autre idée ?')) + '</p><div class="row"><a class="btn ghost" href="' + esc(NEW) + '">' + esc(L('Start a project', 'Proposer un projet')) + '</a></div></div>';
    h += '<p class="muted" style="margin-top:22px">' + esc(L('A question? Reply to my emails or write to contact@vgthmind.org.', 'Une question ? Réponds à mes mails ou écris à contact@vgthmind.org.')) + '</p>';
    body.innerHTML = h;
    wire();
  }

  function wire() {
    var acc = document.getElementById('vgr-accept'), pay = document.getElementById('vgr-pay');
    var vir = document.getElementById('vgr-vir');
    if (acc && vir) {
      acc.addEventListener('change', function () { vir.disabled = !acc.checked; });
      vir.addEventListener('click', function () {
        vir.disabled = true;
        api('/requests/transfer', { which: 'deposit', accept: acc.checked === true }).then(function (j) {
          if (j.ok) { data = j.request; draw(); var b = document.getElementById('virement'); if (b) b.scrollIntoView({ block: 'start' }); return; }
          vir.disabled = false;
          document.getElementById('vgr-err').textContent = j.error === 'quote_expired' ? L('This quote has expired.', 'Ce devis a expiré.') : L('Could not register the transfer, try again.', 'Le virement n’a pas pu être enregistré, réessaie.');
        });
      });
    }
    body.querySelectorAll('[data-copy]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-copy'), done = function () { var o = L('Copy', 'Copier'); b.textContent = L('Copied ✓', 'Copié ✓'); b.classList.add('ok'); setTimeout(function () { b.textContent = o; b.classList.remove('ok'); }, 1600); };
        var old = function () { var ta = document.createElement('textarea'); ta.value = v; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, v.length); try { document.execCommand('copy'); done(); } catch (e) {} ta.remove(); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, old); else old();
      });
    });
    var bedit = document.getElementById('vgr-bedit');
    if (bedit) bedit.addEventListener('click', function () { editBal = true; draw(); var s = document.getElementById('solde'); if (s) s.scrollIntoView({ block: 'start' }); });
    if (pay && (acc || (data.transfer && data.transfer.deposit))) {
      if (acc) acc.addEventListener('change', function () { pay.disabled = !acc.checked; });
      pay.addEventListener('click', function () {
        pay.disabled = true;
        api('/requests/deposit', { accept: acc ? acc.checked === true : true }).then(function (j) { // virement déjà choisi : la mention a été acceptée à ce moment-là
          if (j.url) { location.href = j.url; return; }
          pay.disabled = false;
          document.getElementById('vgr-err').textContent = j.error === 'quote_expired' ? L('This quote has expired.', 'Ce devis a expiré.') : j.error === 'payments_off' ? L('Online payment is not open yet.', 'Le paiement en ligne n’est pas encore ouvert.') : L('Payment could not start, try again.', 'Le paiement n’a pas pu démarrer, réessaie.');
        });
      });
    }
    var accBtn = document.getElementById('vgr-acc');
    if (acc && accBtn) {
      acc.addEventListener('change', function () { accBtn.disabled = !acc.checked; });
      accBtn.addEventListener('click', function () {
        accBtn.disabled = true;
        api('/requests/accept', { accept: acc.checked === true }).then(function (j) {
          if (j.ok) { data = j.request; draw(L('Quote accepted, thank you!', 'Devis accepté, merci !')); return; }
          accBtn.disabled = false;
          document.getElementById('vgr-err').textContent = j.error === 'quote_expired' ? L('This quote has expired.', 'Ce devis a expiré.') : L('Could not send, try again.', 'Envoi impossible, réessaie.');
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
      var bvir = document.getElementById('vgr-bvir'), addr = document.getElementById('vgr-addr'), berr = document.getElementById('vgr-berr');
      if (bvir && addr) {
        bvir.addEventListener('click', function () { addr.hidden = false; var n = document.getElementById('vgr-a-name'); if (n && !n.value) n.value = data.name || ''; if (n) n.focus(); });
        document.getElementById('vgr-bvir-ok').addEventListener('click', function () {
          var ok = this, a = {}; ['name', 'line1', 'line2', 'postal_code', 'city', 'phone'].forEach(function (f) { a[f] = document.getElementById('vgr-a-' + f).value.trim(); });
          if (a.name.length < 2 || a.line1.length < 3 || !a.postal_code || !a.city) { berr.textContent = L('Fill in your name, address, postcode and city.', 'Indique ton nom, ton adresse, ton code postal et ta ville.'); return; }
          ok.disabled = true; berr.textContent = '';
          api('/requests/transfer', { which: 'balance', country: cs.value, address: a }).then(function (j) {
            if (j.ok) { data = j.request; editBal = false; draw(); var b = document.getElementById('solde'); if (b) b.scrollIntoView({ block: 'start' }); return; }
            ok.disabled = false; berr.textContent = j.error === 'address_required' ? L('Fill in your name, address, postcode and city.', 'Indique ton nom, ton adresse, ton code postal et ta ville.') : L('Could not register the transfer, try again.', 'Le virement n’a pas pu être enregistré, réessaie.');
          });
        });
      }
      var quote = function () {
        bal.disabled = true; if (bvir) bvir.disabled = true; document.getElementById('vgr-ship').innerHTML = '<p class="muted">…</p>';
        api('/requests/balance-quote', { country: cs.value }).then(function (j) {
          if (!j.ok) { document.getElementById('vgr-ship').innerHTML = '<p class="err">' + esc(j.message || L('Country not served.', 'Pays non livré.')) + '</p>'; return; }
          ship = j;
          document.getElementById('vgr-ship').innerHTML = '<table><tr><td>' + esc(L('Balance', 'Solde')) + '</td><td class="n">' + eur(j.balance) + '</td></tr><tr><td>' + esc(L('Shipping', 'Livraison')) + '</td><td class="n">' + (j.shipping ? eur(j.shipping) : L('Free', 'Offerte')) + '</td></tr><tr class="big"><td>' + esc(L('To pay', 'À payer')) + '</td><td class="n">' + eur(j.balance + j.shipping) + '</td></tr></table>';
          bal.disabled = false; if (bvir) bvir.disabled = false;
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

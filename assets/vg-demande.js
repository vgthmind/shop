/* « Proposer un projet » (page /sur-demande) : parcours étape par étape, une question par écran.
   Branches : une pièce pour moi (custom / sur-mesure), une production visuelle, une collab ; puis coordonnées et
   récapitulatif modifiable. Envoi : POST /requests (Worker), fichiers un par un (PUT /requests/file), puis
   POST /requests/confirm (mails). Saisie gardée dans l'onglet (sessionStorage) : Retour et rechargement ne perdent rien.
   Aucun cookie ; anti-spam = champ piège + délai minimum (comme le formulaire de contact). */
(function () {
  'use strict';
  var root = document.getElementById('vgd'); if (!root) return;
  var EP = window.VG_SHOP_CHECKOUT_ENDPOINT !== undefined ? window.VG_SHOP_CHECKOUT_ENDPOINT : 'https://vgthmind-shop-checkout.vgthm66.workers.dev';
  var IMG = root.getAttribute('data-img') || '/assets/demande/';
  var REQ_PAGE = root.getAttribute('data-req') || '/demande/';
  var PRIVACY = root.getAttribute('data-privacy') || '/confidentialite';
  var stage = document.getElementById('vgd-stage'), bar = document.getElementById('vgd-bar'), count = document.getElementById('vgd-count');
  function L(en, fr) { return (window.vgLang || (document.documentElement.getAttribute('lang') === 'fr' ? 'fr' : 'en')) === 'fr' ? fr : en; }
  function lang() { return L('en', 'fr'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // Réglages (prix « à partir de », photos changées dans l'admin) : valeurs par défaut, remplacées par celles du Worker.
  var cfg = { prices: { custom: { tshirt: 75, hoodie: 140, veste: 160, autre: 75 }, surmesure: { short: 150, pantalon: 220, haut: 200, veste: 320 }, paintFrom: 10 },
    depositPct: 30, retouchesIncluded: 1, forfeitDays: 30, cards: {}, leadWeeks: { location: { min: 2, max: 2 }, custom: { min: 2, max: 3 }, surmesure: { min: 3, max: 4 } }, uploads: true, limits: { photos: 8, photoBytes: 10485760, videos: 1, videoBytes: 52428800 } };
  var PIECES = {
    custom: [['tshirt', 'T-shirt', 'T-shirt'], ['hoodie', 'Sweatshirt / hoodie', 'Sweat / hoodie'], ['veste', 'Jacket / jeans / joggers', 'Veste / jean / jogging'], ['autre', 'Another piece', 'Autre pièce']],
    surmesure: [['short', 'Shorts', 'Short'], ['pantalon', 'Trousers', 'Pantalon'], ['haut', 'Top', 'Haut'], ['veste', 'Jacket', 'Veste']],
  };
  var NO_PHOTO = {}; // une clé ici = carte en texte seul
  var PROJECTS = [['Music video', 'Clip'], ['Stage / concert', 'Scène / concert'], ['Photo shoot', 'Shooting photo'], ['Video / YouTube', 'Vidéo / YouTube'], ['Other', 'Autre']];
  var COLLABS = [['Artist / music', 'Artiste / musique'], ['Video / YouTube', 'Vidéo / YouTube'], ['Brand', 'Marque'], ['Art project', 'Projet artistique'], ['Other', 'Autre']];
  var COUNTRIES = ('FR BE CH LU MC DE AT IT ES PT NL IE GB DK SE NO FI PL CZ SK HU RO BG GR HR SI EE LV LT CY MT IS US CA MX BR AR CL CO PE AU NZ JP KR CN HK TW SG TH VN MY ID PH IN AE SA QA IL TR MA DZ TN SN CI CM ZA EG GP MQ GF RE YT PM BL MF NC PF WF').split(' ');

  var KEY = 'vg-demande-draft';
  var st = { what: '', kind: '', piece: '', paint: false, mode: '', idea: '', mood: '', colors: '', refs: '', size: '', measures: '', budget: '', deadline: '',
    prodKind: '', projectType: '', dates: '', place: '', count: '', artist: '', collabType: '', links: '', link: '', firstName: '', lastName: '', email: '', country: '', photosConsent: false, website: '' };
  try { var saved = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (saved && typeof saved === 'object') for (var k in st) if (k in saved && k !== 'website') st[k] = saved[k]; } catch (e) {}
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  var files = []; // File choisis (gardés en mémoire seulement)
  var t0 = Date.now();
  var cur = 0, backToRecap = false, sending = false;

  function type() { return st.what === 'piece' ? st.kind : st.what; }
  function minPrice(kind) { var p = cfg.prices[kind] || {}, m = Infinity; for (var k in p) if (p[k] < m) m = p[k]; return m === Infinity ? 0 : m; }
  function eur(n) { return L('€' + n, n + ' €'); }
  // Délais (réglables dans l'admin) : indicatif « min à max semaines » ; la date souhaitée ne peut pas être avant le minimum.
  function leadKey() { return st.what === 'production' ? (st.prodKind === 'location' ? 'location' : '') : type() === 'custom' || type() === 'surmesure' ? type() : ''; }
  function weeksText(k) { var l = cfg.leadWeeks[k]; if (!l) return ''; return l.min === l.max ? L(l.min + (l.min > 1 ? ' weeks' : ' week'), l.min + (l.min > 1 ? ' semaines' : ' semaine')) : L(l.min + ' to ' + l.max + ' weeks', l.min + ' à ' + l.max + ' semaines'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function minDate(k) { var l = cfg.leadWeeks[k], d = new Date(); d.setDate(d.getDate() + (l ? l.min : 0) * 7); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtDate(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? L(m[1] + '-' + m[2] + '-' + m[3], m[3] + '/' + m[2] + '/' + m[1]) : iso; }
  function lateDate(k) { return st.deadline && leadKey() === k && st.deadline < minDate(k); }
  function from(n) { return L('from ' + eur(n), 'à partir de ' + eur(n)); }

  // --- Étapes --------------------------------------------------------------------------------
  function path() {
    var p = ['what'];
    if (st.what === 'piece') p.push('kind', 'piece', 'mode', 'idea', 'details', 'files');
    else if (st.what === 'production') p.push('prodKind', 'project', 'prodIdea', 'files');
    else if (st.what === 'collab') p.push('collab', 'files');
    p.push('contact', 'recap');
    return p;
  }
  function img(key) {
    if (NO_PHOTO[key] && !cfg.cards[key]) return '';
    var over = cfg.cards[key];
    if (over) return '<img src="' + esc(over) + '" alt="" loading="lazy" decoding="async">';
    var f = IMG + key.replace('.', '-');
    return '<img src="' + f + '-400.webp" srcset="' + f + '-400.webp 400w, ' + f + '.webp 800w" sizes="(max-width:520px) 46vw, 260px" alt="" loading="lazy" decoding="async">';
  }
  function card(field, value, key, title, sub, price, i) {
    var pic = img(key);
    return '<button type="button" class="vgd-card' + (pic ? '' : ' noimg') + '" style="--i:' + i + '" data-set="' + field + '" data-v="' + esc(value) + '" aria-pressed="' + (st[field] === value) + '">'
      + pic + '<span class="t">' + esc(title) + '</span>' + (sub ? '<span class="s">' + esc(sub) + '</span>' : '') + (price ? '<span class="vgd-price">' + esc(price) + '</span>' : '') + '</button>';
  }
  function row(id, label, html, hint) { return '<div class="vgd-row"><label for="vgd-' + id + '">' + esc(label) + '</label>' + (hint ? '<small id="vgd-' + id + '-h">' + esc(hint) + '</small>' : '') + html + '</div>'; }
  function input(id, label, opts) {
    opts = opts || {};
    var attrs = ' id="vgd-' + id + '" name="' + id + '" data-f="' + id + '" maxlength="' + (opts.max || 200) + '"' + (opts.hint ? ' aria-describedby="vgd-' + id + '-h"' : '') + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') + (opts.min ? ' min="' + esc(opts.min) + '"' : '') + (opts.auto ? ' autocomplete="' + opts.auto + '"' : '');
    var el = opts.area ? '<textarea' + attrs + ' rows="' + (opts.rows || 4) + '">' + esc(st[id]) + '</textarea>' : '<input type="' + (opts.type || 'text') + '"' + attrs + (opts.mode ? ' inputmode="' + opts.mode + '"' : '') + ' value="' + esc(st[id]) + '">';
    return row(id, label + (opts.req ? ' *' : ''), el, opts.hint);
  }
  function chips(field, list) {
    return '<div class="vgd-chips" role="group">' + list.map(function (c) { var v = L(c[0], c[1]); return '<button type="button" class="vgd-chip" data-chip="' + field + '" data-v="' + esc(v) + '" aria-pressed="' + (st[field] === v) + '">' + esc(v) + '</button>'; }).join('') + '</div>';
  }
  function head(q, hint) { return '<h2 class="vgd-q" tabindex="-1">' + esc(q) + '</h2>' + (hint ? '<p class="vgd-hint">' + esc(hint) + '</p>' : ''); }

  var STEPS = {
    what: {
      title: function () { return L('What is it for?', 'C’est pour quoi ?'); },
      cards: true,
      html: function () {
        return head(L('What is it for?', 'C’est pour quoi ?')) + '<div class="vgd-cards big">'
          + card('what', 'piece', 'piece', L('A piece for me', 'Une pièce pour moi'), L('Custom painted or made to measure', 'Custom peint ou sur-mesure'), L('on quote', 'sur devis'), 0)
          + card('what', 'production', 'production', L('A visual production', 'Une production visuelle'), L('Music video, stage, shoot, video', 'Clip, scène, shooting, vidéo'), L('on quote', 'sur devis'), 1)
          + card('what', 'collab', 'collab', L('A collab', 'Une collab'), L('Artist, video, project', 'Artiste, vidéo, projet'), L('on quote', 'sur devis'), 2) + '</div>';
      },
      ok: function () { return st.what ? null : 'what'; },
    },
    kind: {
      title: function () { return L('Custom or made to measure', 'Custom ou sur-mesure'); }, cards: true,
      html: function () {
        return head(L('Custom or made to measure?', 'Custom ou sur-mesure ?'), L('Indicative time: custom ', 'Délai indicatif : custom ') + weeksText('custom') + L(', made to measure ', ', sur-mesure ') + weeksText('surmesure') + '.') + '<div class="vgd-cards big">'
          + card('kind', 'custom', 'custom', 'Custom', L('A second-hand piece painted on your theme (airbrush, spray)', 'Une pièce de seconde main peinte sur ton thème (aérographe, spray)'), from(minPrice('custom')), 0)
          + card('kind', 'surmesure', 'surmesure', L('Made to measure', 'Sur-mesure'), L('A piece sewn from A to Z to your measurements, painted if you like', 'Une pièce cousue de A à Z à tes mesures, peinte si tu veux'), from(minPrice('surmesure')), 1) + '</div>';
      },
      ok: function () { return st.kind ? null : 'kind'; },
    },
    piece: {
      title: function () { return L('Type of piece', 'Type de pièce'); }, cards: true, stay: true,
      html: function () {
        var list = PIECES[st.kind] || [];
        var h = head(L('Which piece?', 'Quelle pièce ?'), L('Starting prices: the final price is in the quote.', 'Prix de départ : le prix final est précisé dans le devis.')) + '<div class="vgd-cards">'
          + list.map(function (p, i) { return card('piece', p[0], st.kind + '.' + p[0], L(p[1], p[2]), p[0] === 'autre' ? L('Describe it or send a photo', 'Décris-la ou envoie une photo') : '', from((cfg.prices[st.kind] || {})[p[0]]), i); }).join('') + '</div>';
        if (st.kind === 'surmesure') {
          h += '<div class="vgd-fields" style="margin-top:16px"><label class="vgd-check"><input type="checkbox" data-f="paint"' + (st.paint ? ' checked' : '') + '><span><b>' + esc(L('Add painting', 'Peinture en plus')) + '</b> · ' + esc(from(cfg.prices.paintFrom))
            + '<br><small style="color:#6b6860">' + esc(L('Final price depends on the size and complexity of the design, given in the quote.', 'Prix final selon la taille et la complexité du motif, précisé dans le devis.')) + '</small></span></label></div>';
        }
        return h;
      },
      ok: function () { return st.piece ? null : 'piece'; },
    },
    mode: {
      title: function () { return L('Your idea', 'Ton idée'); }, cards: true,
      html: function () {
        return head(L('How clear is your idea?', 'Ton idée, elle en est où ?')) + '<div class="vgd-cards big">'
          + card('mode', 'know', 'know', L('I know what I want', 'Je sais ce que je veux'), L('You describe it, I make it', 'Tu décris, je réalise'), '', 0)
          + card('mode', 'guide', 'guide', L('I have an idea, guide me', 'J’ai une envie, guide-moi'), L('A mood, colours, references: we build it together', 'Une ambiance, des couleurs, des références : on construit ensemble'), '', 1) + '</div>';
      },
      ok: function () { return st.mode ? null : 'mode'; },
    },
    idea: {
      title: function () { return st.mode === 'guide' ? L('Mood', 'Ambiance') : L('Description', 'Description'); },
      html: function () {
        if (st.mode === 'guide') {
          return head(L('Tell me about the mood', 'Parle-moi de l’ambiance'), L('No need to be precise: words, feelings, places, music…', 'Pas besoin d’être précis : des mots, des sensations, des lieux, de la musique…')) + '<div class="vgd-fields">'
            + input('mood', L('Mood / vibe', 'Ambiance'), { area: true, req: true, max: 1000, ph: L('e.g. dark, ocean, 2000s rave…', 'ex. sombre, océan, rave années 2000…') })
            + input('colors', L('Colours', 'Couleurs'), { max: 300, ph: L('e.g. deep blue, silver', 'ex. bleu nuit, argent') })
            + input('refs', L('References (text or links)', 'Références (texte ou liens)'), { area: true, rows: 3, max: 1500, ph: L('Artists, images, Instagram or Pinterest links…', 'Artistes, images, liens Instagram ou Pinterest…') })
            + input('idea', L('Anything else?', 'Autre chose ?'), { area: true, rows: 3, max: 3000 }) + '</div>';
        }
        return head(L('Describe the piece', 'Décris la pièce'), L('Theme, placement of the design, details…', 'Thème, emplacement du motif, détails…')) + '<div class="vgd-fields">'
          + input('idea', L('Your idea', 'Ton idée'), { area: true, req: true, rows: 5, max: 3000 })
          + input('colors', L('Colours', 'Couleurs'), { max: 300 })
          + input('refs', L('References (text or links)', 'Références (texte ou liens)'), { area: true, rows: 3, max: 1500 }) + '</div>';
      },
      ok: function () { return st.mode === 'guide' ? ((st.mood + st.idea).trim().length >= 10 ? null : 'mood') : (st.idea.trim().length >= 10 ? null : 'idea'); },
    },
    details: {
      title: function () { return L('Details', 'Détails'); },
      html: function () {
        var sm = st.kind === 'surmesure';
        return head(L('A few details', 'Quelques détails')) + '<div class="vgd-fields">'
          + (sm ? input('measures', L('Your measurements', 'Tes mesures'), { area: true, req: true, rows: 5, max: 1500, hint: L('In cm: chest, waist, hips, inside leg, height… or the measurements of a piece that fits you well.', 'En cm : poitrine, taille, hanches, entrejambe, hauteur… ou les mesures d’une pièce qui te va bien.') })
            : input('size', L('Your size', 'Ta taille'), { max: 100, ph: L('e.g. M, or a fit you like', 'ex. M, ou une coupe que tu aimes'), hint: L('Custom = a second-hand piece: tell me your size, I find the base.', 'Custom = une pièce de seconde main : donne ta taille, je trouve la base.') }))
          + input('budget', L('Budget (rough)', 'Budget indicatif'), { max: 100, ph: L('e.g. €150–200', 'ex. 150 à 200 €') })
          + input('deadline', L('Wanted by (optional)', 'Date souhaitée (facultatif)'), { type: 'date', min: minDate(st.kind), hint: L('Indicative time: ', 'Délai indicatif : ') + weeksText(st.kind) + L('. Earliest date: ', '. Date la plus proche : ') + fmtDate(minDate(st.kind)) + '.' }) + '</div>';
      },
      ok: function () { return st.kind === 'surmesure' && st.measures.trim().length < 3 ? 'measures' : lateDate(st.kind) ? 'deadline' : null; },
    },
    prodKind: {
      title: function () { return L('Your need', 'Ton besoin'); }, cards: true,
      html: function () {
        return head(L('Rent or create?', 'Louer ou créer ?')) + '<div class="vgd-cards big">'
          + card('prodKind', 'location', 'location', L('Rent an existing piece', 'Location d’une pièce existante'), L('For a video, a stage, a shoot', 'Pour un clip, une scène, un shooting'), L('on quote', 'sur devis'), 0)
          + card('prodKind', 'creation', 'creation', L('A piece made for the project', 'Création pour le projet'), L('An outfit designed for your universe', 'Une tenue pensée pour ton univers'), L('on quote', 'sur devis'), 1) + '</div>';
      },
      ok: function () { return st.prodKind ? null : 'prodKind'; },
    },
    project: {
      title: function () { return L('The project', 'Le projet'); },
      html: function () {
        return head(L('Tell me about the project', 'Parle-moi du projet')) + '<div class="vgd-fields">'
          + '<div class="vgd-row"><span class="vgd-lbl">' + esc(L('Type of project *', 'Type de projet *')) + '</span>' + chips('projectType', PROJECTS) + '</div>'
          + input('dates', L('Dates', 'Dates'), { req: true, max: 200, ph: L('e.g. 12–14 Nov', 'ex. 12 au 14 novembre') })
          + (st.prodKind === 'location' ? input('deadline', L('First date you need the piece (optional)', 'Première date où tu as besoin de la pièce (facultatif)'), { type: 'date', min: minDate('location'), hint: L('Indicative time for a rental: ', 'Délai indicatif pour une location : ') + weeksText('location') + L('. Earliest date: ', '. Date la plus proche : ') + fmtDate(minDate('location')) + '.' }) : '')
          + input('place', L('Location', 'Lieu'), { max: 200, ph: L('City, venue', 'Ville, salle') })
          + input('count', L('Number of pieces', 'Nombre de pièces'), { max: 30, mode: 'numeric' })
          + input('artist', L('Artist (name or link)', 'Artiste (nom ou lien)'), { max: 300 })
          + input('budget', L('Budget (rough)', 'Budget indicatif'), { max: 100 }) + '</div>';
      },
      ok: function () { return !st.projectType ? 'projectType' : !st.dates.trim() ? 'dates' : lateDate('location') ? 'deadline' : null; },
    },
    prodIdea: {
      title: function () { return L('References', 'Références'); },
      html: function () {
        return head(L('Your references', 'Tes références'), L('The universe, the look you have in mind, pieces from the shop you like…', 'L’univers, le look que tu as en tête, des pièces de la boutique qui te plaisent…')) + '<div class="vgd-fields">'
          + input('idea', L('The project in a few words', 'Le projet en quelques mots'), { area: true, rows: 4, max: 3000 })
          + input('refs', L('References (text or links)', 'Références (texte ou liens)'), { area: true, rows: 4, max: 1500 }) + '</div>';
      },
      ok: function () { return null; },
    },
    collab: {
      title: function () { return 'Collab'; },
      html: function () {
        return head(L('Your collab', 'Ta collab')) + '<div class="vgd-fields">'
          + '<div class="vgd-row"><span class="vgd-lbl">' + esc(L('Type of collab *', 'Type de collab *')) + '</span>' + chips('collabType', COLLABS) + '</div>'
          + input('links', L('Links (channel, socials)', 'Liens (chaîne, réseaux)'), { area: true, rows: 2, max: 800 })
          + input('idea', L('Your idea', 'Ton idée'), { area: true, req: true, rows: 5, max: 3000 }) + '</div>';
      },
      ok: function () { return !st.collabType ? 'collabType' : st.idea.trim().length < 10 ? 'idea' : null; },
    },
    files: {
      title: function () { return L('Photos & videos', 'Photos et vidéos'); },
      html: function () {
        var lim = cfg.limits, h = head(L('Photos, videos, links', 'Photos, vidéos, liens'), L('Optional: inspiration, the piece to customise, your space…', 'Facultatif : inspirations, la pièce à customiser, ton univers…')) + '<div class="vgd-fields">';
        if (st.what === 'collab') h += input('refs', L('References (text or links)', 'Références (texte ou liens)'), { area: true, rows: 3, max: 1500 });
        if (cfg.uploads) {
          h += '<label class="vgd-drop" for="vgd-file">' + esc(L('Add photos or a video', 'Ajouter des photos ou une vidéo')) + '<br>' + esc(L('up to ' + lim.photos + ' photos (10 MB each) and 1 video (50 MB)', 'jusqu’à ' + lim.photos + ' photos (10 Mo chacune) et 1 vidéo (50 Mo)')) + '</label>'
            + '<input type="file" id="vgd-file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm" hidden>'
            + '<ul class="vgd-files">' + files.map(function (f, i) { return '<li><span>' + esc(f.name) + ' · ' + (f.size / 1048576).toFixed(1) + ' ' + L('MB', 'Mo') + '</span><button type="button" data-rm="' + i + '">' + esc(L('Remove', 'Retirer')) + '</button></li>'; }).join('') + '</ul>';
        } else {
          h += '<p class="vgd-note">' + esc(L('File upload is not available yet: share a link instead (WeTransfer, Google Drive…).', 'L’envoi de fichiers n’est pas encore disponible : partage plutôt un lien (WeTransfer, Google Drive…).')) + '</p>';
        }
        return h + input('link', L('Link to bigger files', 'Lien vers des fichiers plus lourds'), { type: 'url', max: 500, ph: 'https://…', mode: 'url' }) + '</div>';
      },
      ok: function () { return st.link && !/^https?:\/\/\S+$/i.test(st.link) ? 'link' : null; },
    },
    contact: {
      title: function () { return L('Your details', 'Tes coordonnées'); },
      html: function () {
        var names = COUNTRIES.map(function (c) { var n = c; try { n = new Intl.DisplayNames([lang()], { type: 'region' }).of(c) || c; } catch (e) {} return [c, n]; });
        var first = names.slice(0, 1), rest = names.slice(1).sort(function (a, b) { return a[1].localeCompare(b[1], lang()); });
        var sel = '<select id="vgd-country" data-f="country" autocomplete="country"><option value="">' + esc(L('Choose…', 'Choisir…')) + '</option>'
          + first.concat(rest).map(function (c) { return '<option value="' + c[0] + '"' + (st.country === c[0] ? ' selected' : '') + '>' + esc(c[1]) + '</option>'; }).join('') + '</select>';
        return head(L('How can I reach you?', 'Comment te répondre ?')) + '<div class="vgd-fields">'
          + input('firstName', L('First name', 'Prénom'), { req: true, max: 60, auto: 'given-name' })
          + input('lastName', L('Last name', 'Nom'), { req: true, max: 60, auto: 'family-name' })
          + input('email', 'E-mail', { req: true, type: 'email', max: 200, auto: 'email', mode: 'email' })
          + row('country', L('Country *', 'Pays *'), sel)
          + (st.what === 'piece' ? '<label class="vgd-check"><input type="checkbox" data-f="photosConsent"' + (st.photosConsent ? ' checked' : '') + '><span>' + esc(L('Optional: I agree that photos of the finished piece may be shown on the vgthmind website and social media.', 'Facultatif : j’accepte que les photos de la pièce finie soient montrées sur le site et les réseaux de vgthmind.')) + '</span></label>' : '')
          + '<div class="vgd-trap" aria-hidden="true"><label for="vgd-website">Do not fill in</label><input id="vgd-website" data-f="website" tabindex="-1" autocomplete="off"></div></div>';
      },
      ok: function () {
        if (!st.firstName.trim()) return 'firstName';
        if (!st.lastName.trim()) return 'lastName';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(st.email.trim())) return 'email';
        return st.country ? null : 'country';
      },
    },
    recap: {
      title: function () { return L('Summary', 'Récapitulatif'); },
      html: function () {
        var p = path(), sections = [];
        p.forEach(function (s, i) {
          if (s === 'recap') return;
          var lines = recapLines(s);
          if (!lines.length) return;
          sections.push('<section style="--i:' + sections.length + '"><div class="hd"><b>' + esc(STEPS[s].title()) + '</b><button type="button" data-edit="' + i + '">' + esc(L('Edit', 'Modifier')) + '</button></div><dl>'
            + lines.map(function (l) { return '<dt>' + esc(l[0]) + '</dt><dd>' + esc(l[1]) + '</dd>'; }).join('') + '</dl></section>');
        });
        var paid = st.what === 'piece';
        return head(L('Check your request', 'Vérifie ta demande'), L('You can edit each step before sending.', 'Tu peux modifier chaque étape avant l’envoi.')) + '<div class="vgd-recap">' + sections.join('') + '</div>'
          + '<p class="vgd-note" style="margin-top:16px">' + esc(paid
            ? L('Next: I reply with questions or a quote. A ' + cfg.depositPct + '% deposit starts the work, you approve the piece from photos, then pay the balance before shipping.', 'Ensuite : je te réponds avec des questions ou un devis. Un acompte de ' + cfg.depositPct + ' % lance la fabrication, tu valides la pièce sur photos, puis tu payes le solde avant l’envoi.')
            : L('Next: I reply by email with a quote (and a deposit cheque / contract if needed).', 'Ensuite : je te réponds par mail avec un devis (et une caution par chèque / un contrat si besoin).')) + '</p>'
          + '<p style="font-size:13px;color:#6b6860;margin-top:10px">' + L('Your answers are only used to reply to you. See the <a href="' + PRIVACY + '">privacy page</a>.', 'Tes réponses servent uniquement à te répondre. Voir la page <a href="' + PRIVACY + '">Confidentialité</a>.') + '</p>';
      },
      ok: function () { return null; },
    },
  };

  function pieceName() { var p = (PIECES[st.kind] || []).filter(function (x) { return x[0] === st.piece; })[0]; return p ? L(p[1], p[2]) : ''; }
  function recapLines(s) {
    var o = [], add = function (label, v) { if (v !== '' && v != null && v !== false) o.push([label, v === true ? L('Yes', 'Oui') : String(v)]); };
    if (s === 'what') add(L('For', 'Pour'), { piece: L('A piece for me', 'Une pièce pour moi'), production: L('A visual production', 'Une production visuelle'), collab: L('A collab', 'Une collab') }[st.what]);
    if (s === 'kind') add(L('Type', 'Type'), st.kind === 'custom' ? 'Custom' : L('Made to measure', 'Sur-mesure'));
    if (s === 'piece') { add(L('Piece', 'Pièce'), pieceName() + (st.piece ? ' · ' + from((cfg.prices[st.kind] || {})[st.piece]) : '')); if (st.kind === 'surmesure') add(L('Add painting', 'Peinture en plus'), st.paint); }
    if (s === 'mode') add(L('Approach', 'Démarche'), st.mode === 'guide' ? L('I have an idea, guide me', 'J’ai une envie, guide-moi') : st.mode ? L('I know what I want', 'Je sais ce que je veux') : '');
    if (s === 'idea') { add(L('Mood', 'Ambiance'), st.mode === 'guide' ? st.mood : ''); add(L('Idea', 'Idée'), st.idea); add(L('Colours', 'Couleurs'), st.colors); add(L('References', 'Références'), st.refs); }
    if (s === 'details') { add(L('Size', 'Taille'), st.kind === 'custom' ? st.size : ''); add(L('Measurements', 'Mesures'), st.kind === 'surmesure' ? st.measures : ''); add(L('Budget', 'Budget'), st.budget); add(L('Wanted by', 'Date souhaitée'), fmtDate(st.deadline)); }
    if (s === 'prodKind') add(L('Need', 'Besoin'), st.prodKind === 'creation' ? L('A piece made for the project', 'Création pour le projet') : st.prodKind ? L('Rent an existing piece', 'Location d’une pièce existante') : '');
    if (s === 'project') { add(L('Project', 'Projet'), st.projectType); add('Dates', st.dates); add(L('Wanted by', 'Date souhaitée'), st.prodKind === 'location' ? fmtDate(st.deadline) : ''); add(L('Location', 'Lieu'), st.place); add(L('Pieces', 'Pièces'), st.count); add(L('Artist', 'Artiste'), st.artist); add('Budget', st.budget); }
    if (s === 'prodIdea') { add(L('Project', 'Projet'), st.idea); add(L('References', 'Références'), st.refs); }
    if (s === 'collab') { add(L('Collab', 'Collab'), st.collabType); add(L('Links', 'Liens'), st.links); add(L('Idea', 'Idée'), st.idea); }
    if (s === 'files') { if (st.what === 'collab') add(L('References', 'Références'), st.refs); add(L('Files', 'Fichiers'), files.map(function (f) { return f.name; }).join(', ')); add(L('Link', 'Lien'), st.link); }
    if (s === 'contact') { add(L('Name', 'Nom'), (st.firstName + ' ' + st.lastName).trim()); add('E-mail', st.email); var n = st.country; try { n = new Intl.DisplayNames([lang()], { type: 'region' }).of(st.country) || n; } catch (e) {} add(L('Country', 'Pays'), n); if (st.what === 'piece') add(L('Photos of the piece', 'Photos de la pièce'), st.photosConsent ? L('OK to show', 'OK pour les montrer') : L('Not shown', 'Pas montrées')); }
    return o;
  }

  // --- Rendu ---------------------------------------------------------------------------------
  function render(dir) {
    var p = path();
    if (cur >= p.length) cur = p.length - 1;
    var s = STEPS[p[cur]];
    var total = st.what ? p.length : 9; // avant le 1er choix : longueur du parcours le plus long (pièce)
    var last = p[cur] === 'recap';
    bar.style.width = Math.round(((cur + 1) / total) * 100) + '%';
    count.textContent = L('Step ', 'Étape ') + (cur + 1) + ' / ' + total;
    var nav = '<div class="vgd-nav">' + (cur > 0 ? '<button type="button" class="vgd-btn ghost" data-go="back">' + esc(L('Back', 'Retour')) + '</button>' : '')
      + (s.cards && !s.stay ? '' : '<button type="button" class="vgd-btn" data-go="next">' + esc(last ? L('Send my request', 'Envoyer ma demande') : backToRecap ? L('Back to summary', 'Retour au récapitulatif') : L('Next', 'Suivant')) + '</button>')
      + '</div><p class="vgd-err" id="vgd-err" role="alert"></p>';
    stage.innerHTML = '<div class="vgd-step' + (dir === 'back' ? ' back' : '') + '">' + s.html() + nav + '</div>';
    var h = stage.querySelector('.vgd-q');
    if (h && dir) try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); }
    if (dir && root.getBoundingClientRect().top < 0) root.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  function go(i, dir, push) {
    cur = i; render(dir);
    if (push) try { history.pushState({ vgd: i }, ''); } catch (e) {}
  }
  function next() {
    var p = path(), bad = STEPS[p[cur]].ok();
    if (bad) return invalid(bad);
    if (p[cur] === 'recap') return send();
    if (backToRecap) { backToRecap = false; return go(p.indexOf('recap'), 'next', true); }
    go(cur + 1, 'next', true);
  }
  function invalid(f) {
    var el = stage.querySelector('[data-f="' + f + '"]') || stage.querySelector('[data-chip="' + f + '"]') || stage.querySelector('[data-set="' + f + '"]');
    var msg = { deadline: L('Choose a date from ' + fmtDate(minDate(leadKey())) + ' (minimum time).', 'Choisis une date à partir du ' + fmtDate(minDate(leadKey())) + ' (délai minimum).'), firstName: L('Please enter your first name.', 'Merci d’indiquer ton prénom.'), lastName: L('Please enter your last name.', 'Merci d’indiquer ton nom.'), email: L('Please enter a valid email address.', 'Merci d’indiquer une adresse e-mail valide.'), link: L('The link must start with https://', 'Le lien doit commencer par https://'),
      measures: L('Please give your measurements.', 'Merci d’indiquer tes mesures.'), idea: L('Tell me a bit more (10 characters minimum).', 'Dis-m’en un peu plus (10 caractères minimum).'),
      mood: L('Tell me a bit more (10 characters minimum).', 'Dis-m’en un peu plus (10 caractères minimum).') }[f] || L('Please answer this question.', 'Merci de répondre à cette question.');
    var err = document.getElementById('vgd-err'); if (err) err.textContent = msg;
    if (el) { if (el.matches('input,textarea,select')) el.setAttribute('aria-invalid', 'true'); el.focus(); }
  }

  stage.addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t || sending) return;
    if (t.hasAttribute('data-set')) {
      var f = t.getAttribute('data-set'), v = t.getAttribute('data-v'), changed = st[f] !== v;
      st[f] = v; save();
      if (changed && f === 'what') { st.kind = ''; st.piece = ''; }
      if (changed && f === 'kind') { st.piece = ''; st.paint = false; }
      stage.querySelectorAll('[data-set="' + f + '"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === t)); });
      if (!STEPS[path()[cur]].stay) setTimeout(next, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 230);
      return;
    }
    if (t.hasAttribute('data-chip')) {
      var c = t.getAttribute('data-chip'); st[c] = t.getAttribute('data-v'); save();
      stage.querySelectorAll('[data-chip="' + c + '"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === t)); });
      return;
    }
    if (t.hasAttribute('data-rm')) { files.splice(Number(t.getAttribute('data-rm')), 1); render(); return; }
    if (t.hasAttribute('data-edit')) { backToRecap = true; go(Number(t.getAttribute('data-edit')), 'back', true); return; }
    var g = t.getAttribute('data-go');
    if (g === 'next') next();
    if (g === 'back') { backToRecap = false; try { history.back(); } catch (err) { go(Math.max(0, cur - 1), 'back'); } }
  });
  stage.addEventListener('input', function (e) {
    var f = e.target.getAttribute && e.target.getAttribute('data-f'); if (!f) return;
    st[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; save();
    e.target.removeAttribute('aria-invalid');
  });
  stage.addEventListener('change', function (e) {
    if (e.target.id === 'vgd-file') { addFiles(e.target.files); return; }
    var f = e.target.getAttribute && e.target.getAttribute('data-f'); if (f) { st[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; save(); }
  });
  stage.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox]):not([type=file])')) { e.preventDefault(); next(); }
  });
  window.addEventListener('popstate', function (e) {
    var i = e.state && typeof e.state.vgd === 'number' ? e.state.vgd : 0;
    if (sending) return;
    go(Math.min(i, path().length - 1), i < cur ? 'back' : 'next', false);
  });
  document.addEventListener('vg:lang', function () { render(); });

  function mime(f) {
    if (f.type) return f.type.toLowerCase();
    var x = (f.name.split('.').pop() || '').toLowerCase();
    return { heic: 'image/heic', heif: 'image/heif', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mov: 'video/quicktime', mp4: 'video/mp4', webm: 'video/webm' }[x] || '';
  }
  function addFiles(list) {
    var lim = cfg.limits, msgs = [];
    Array.prototype.forEach.call(list || [], function (f) {
      var t = mime(f), video = /^video\//.test(t), photo = /^image\//.test(t);
      var nP = files.filter(function (x) { return /^image\//.test(mime(x)); }).length, nV = files.length - nP;
      if (!video && !photo) msgs.push(f.name + ' : ' + L('format not accepted', 'format non accepté'));
      else if (photo && (nP >= lim.photos || f.size > lim.photoBytes)) msgs.push(f.name + ' : ' + L('too big or too many photos (max ' + lim.photos + ', 10 MB)', 'trop lourde ou trop de photos (max ' + lim.photos + ', 10 Mo)'));
      else if (video && (nV >= lim.videos || f.size > lim.videoBytes)) msgs.push(f.name + ' : ' + L('1 video max, 50 MB: share a link instead', '1 vidéo max, 50 Mo : partage plutôt un lien'));
      else files.push(f);
    });
    render();
    if (msgs.length) document.getElementById('vgd-err').textContent = msgs.join(' · ');
  }

  // --- Envoi ---------------------------------------------------------------------------------
  function put(id, k, f, onProgress) {
    return new Promise(function (resolve) {
      var x = new XMLHttpRequest();
      x.open('PUT', EP + '/requests/file?id=' + encodeURIComponent(id) + '&k=' + encodeURIComponent(k) + '&name=' + encodeURIComponent(f.name.slice(0, 120)));
      x.setRequestHeader('Content-Type', mime(f));
      x.upload.onprogress = function (ev) { if (ev.lengthComputable) onProgress(ev.loaded); };
      x.onload = function () { resolve(x.status >= 200 && x.status < 300); };
      x.onerror = function () { resolve(false); };
      x.send(f);
    });
  }
  function send() {
    if (sending) return;
    sending = true;
    var btn = stage.querySelector('[data-go="next"]'); if (btn) btn.disabled = true;
    var err = document.getElementById('vgd-err');
    var body = { type: type(), lang: lang(), t: Date.now() - t0 };
    for (var k in st) if (k !== 'what' && k !== 'kind') body[k] = typeof st[k] === 'string' ? st[k].trim() : st[k];
    body.name = (st.firstName + ' ' + st.lastName).trim(); // ancien Worker (avant le déploiement) : champ unique
    fetch(EP + '/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (x) {
        if (x.s === 429) throw new Error(L('Too many requests for now, try again later or email contact@vgthmind.org.', 'Trop d’envois pour le moment : réessaie plus tard ou écris à contact@vgthmind.org.'));
        if (x.s === 400 && x.j.fields) { sending = false; var p = path(); for (var i = 0; i < p.length; i++) if (STEPS[p[i]].ok()) { go(i, 'back', true); return null; } throw new Error(L('Please check your answers.', 'Vérifie tes réponses.')); }
        if (!(x.s === 200 && x.j.ok)) throw new Error(L('Could not send. Please email contact@vgthmind.org.', 'La demande n’a pas pu partir. Écris à contact@vgthmind.org.'));
        return uploads(x.j);
      })
      .catch(function (e) { sending = false; if (btn) btn.disabled = false; if (err) err.textContent = e.message; });
  }
  function uploads(res) {
    var total = files.reduce(function (a, f) { return a + f.size; }, 0), doneBytes = 0, failed = [];
    stage.innerHTML = '<div class="vgd-step vgd-done"><p class="big">' + esc(L('Sending…', 'Envoi…')) + '</p>' + (files.length && res.uploads ? '<div class="vgd-meter"><i id="vgd-meter"></i></div><p class="vgd-hint" id="vgd-up"></p>' : '') + '</div>';
    bar.style.width = '100%'; count.textContent = '';
    var meter = document.getElementById('vgd-meter'), up = document.getElementById('vgd-up');
    var chain = Promise.resolve();
    if (res.uploads) files.forEach(function (f, i) {
      chain = chain.then(function () {
        if (up) up.textContent = L('File ', 'Fichier ') + (i + 1) + ' / ' + files.length + ' · ' + f.name;
        return put(res.id, res.k, f, function (n) { if (meter) meter.style.width = Math.round(((doneBytes + n) / total) * 100) + '%'; }).then(function (ok) { doneBytes += f.size; if (!ok) failed.push(f.name); });
      });
    });
    return chain.then(function () {
      return fetch(EP + '/requests/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: res.id, k: res.k }) }).catch(function () {});
    }).then(function () {
      try { sessionStorage.removeItem(KEY); } catch (e) {}
      var link = REQ_PAGE + '?id=' + encodeURIComponent(res.id) + '&k=' + encodeURIComponent(res.k);
      stage.innerHTML = '<div class="vgd-step vgd-done"><p class="big">' + esc(L('Request sent, thank you!', 'Demande envoyée, merci !')) + '</p>'
        + '<p>' + esc(L('You’ll receive a confirmation email (check your spam). I usually reply within 2 to 5 working days.', 'Tu vas recevoir un mail de confirmation (regarde aussi les spams). Je te réponds en général sous 2 à 5 jours ouvrés.')) + '</p>'
        + (failed.length ? '<p class="vgd-err">' + esc(L('Some files could not be sent: ', 'Certains fichiers n’ont pas pu partir : ') + failed.join(', ') + L('. Reply to the confirmation email with them.', '. Réponds au mail de confirmation en les joignant.')) + '</p>' : '')
        + '<p class="vgd-nav"><a class="vgd-btn" href="' + esc(link) + '" style="text-decoration:none">' + esc(L('View my request', 'Voir ma demande')) + '</a></p></div>';
      files = [];
    });
  }

  // Réglages publics (prix, photos des cartes), sans bloquer l'affichage.
  fetch(EP + '/requests/settings').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d) return;
    if (d.prices) ['custom', 'surmesure'].forEach(function (t) { cfg.prices[t] = Object.assign({}, cfg.prices[t], d.prices[t] || {}); }), cfg.prices.paintFrom = d.prices.paintFrom != null ? d.prices.paintFrom : cfg.prices.paintFrom; // jamais de prix vide
    cfg.depositPct = d.depositPct || cfg.depositPct; cfg.cards = d.cards || {}; cfg.uploads = d.uploads !== false; cfg.limits = d.limits || cfg.limits;
    if (d.leadWeeks) cfg.leadWeeks = Object.assign({}, cfg.leadWeeks, d.leadWeeks);
    if (!sending && STEPS[path()[cur]].cards) render(); // jamais pendant une saisie (le curseur serait perdu)
  }).catch(function () {});

  try { history.replaceState({ vgd: 0 }, ''); } catch (e) {}
  render();
})();

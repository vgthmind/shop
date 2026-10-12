/* Assistant « Nouvelle pièce » : navigation par étapes + étapes Fiche et Ports de studio-photo.html.
   Logique pure : piece-form.js (testée). Les photos, le détourage et la publication : studio-photo.js / studio-publish.js. */
(function () {
  'use strict';
  var F = window.VGPieceForm, $ = function (id) { return document.getElementById(id); };
  var STEPS = ['Photos', 'Détourage', 'Fiche', 'Ports', 'Publier'];
  var step = 1, config = null, categories = [], colorTouched = false, uniqueTouched = false, slugTouched = false;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function eur(n) { return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') + ' €'; }
  function checked(name) { return Array.prototype.map.call(document.querySelectorAll('input[name=' + name + ']:checked'), function (i) { return i.value; }); }

  function form() {
    var col = (document.querySelector('input[name=fColor]:checked') || {}).value || '';
    return {
      name: $('fName').value, slug: $('slug').value, price: $('fPrice').value, quantity: $('fQty').value === '' ? '' : Number($('fQty').value),
      unique: $('fUnique').checked, latest_drop: $('fDrop').checked, draft: $('fDraft') ? $('fDraft').checked : false, categories: checked('fCat'),
      description_en: $('fEn').value, description_fr: $('fFr').value, color: col, color_other: $('fColorOther').value,
      reel_url: $('fReel').value, size: $('fSize') ? $('fSize').value : '', weight_g: $('fWeight').value === '' ? '' : Number($('fWeight').value), mode: $('fMode').value, alone: $('fAlone').checked
    };
  }
  function cats() { return categories.map(function (c) { return c.permalink; }); }

  // Renvoie { product } ou { error } : utilisé par la publication (studio-photo.js).
  function collect() {
    var f = form();
    return F.buildPiece(f, cats());
  }

  // ---------- étapes ----------
  function show(n) {
    step = Math.max(1, Math.min(5, n));
    Array.prototype.forEach.call(document.querySelectorAll('[data-step]'), function (s) { s.hidden = Number(s.getAttribute('data-step')) !== step; });
    Array.prototype.forEach.call($('steps').children, function (b, i) { b.classList.toggle('on', i + 1 === step); });
    $('bPrev').disabled = step === 1; $('bNext').hidden = step === 5;
    var has = window.VGStudio.count() > 0;
    $('noPhoto').hidden = has;
    if (step === 3) suggestColor();
    if (step === 4) ports();
    if (step === 5) recap();
    window.scrollTo(0, 0);
  }

  function buildSteps() {
    $('steps').innerHTML = STEPS.map(function (t, i) { return '<button type="button" data-go="' + (i + 1) + '">' + (i + 1) + ' · ' + t + '</button>'; }).join('');
    $('steps').onclick = function (e) { var g = e.target.getAttribute('data-go'); if (g) show(Number(g)); };
    $('bPrev').onclick = function () { show(step - 1); };
    $('bNext').onclick = function () { show(step + 1); };
  }

  // ---------- fiche ----------
  function buildColors() {
    $('fColors').innerHTML = F.COLORS.map(function (c) {
      return '<label><input type="radio" name="fColor" value="' + c.id + '"><span class="dot" style="background:' + c.hex + '"></span>' + esc(c.label) + '</label>';
    }).join('') + '<label><input type="radio" name="fColor" value="autre">Autre…</label>';
    $('fColors').addEventListener('change', function () { colorTouched = true; $('fColorHint').textContent = ''; $('fColorOther').hidden = form().color !== 'autre'; });
  }

  // Couleur proposée d'après la description, sinon la photo ; vgthmind valide ou change (jamais écrasé s'il a déjà choisi).
  function suggestColor() {
    if (colorTouched) return;
    var s = F.suggestColor({ description: $('fEn').value + ' ' + $('fFr').value, image: window.VGStudio.colorSample() });
    if (!s) return;
    var r = document.querySelector('input[name=fColor][value=' + s.id + ']'); if (r) r.checked = true;
    $('fColorHint').textContent = 'Couleur proposée d\'après ' + (s.source === 'description' ? 'la description' : 'la photo') + ' : valide-la ou change-la.';
  }

  function syncUnique() {
    if (!uniqueTouched) $('fUnique').checked = F.defaultUnique($('fQty').value);
  }

  function buildCats() {
    $('fCats').innerHTML = categories.filter(function (c) { return c.permalink !== 'all' && c.permalink !== 'latest-drop'; }).map(function (c) {
      return '<label><input type="checkbox" name="fCat" value="' + esc(c.permalink) + '">' + esc(c.name) + '</label>';
    }).join('');
  }

  // ---------- ports ----------
  function ports() {
    var out = $('portsOut'), f = form();
    if (!config) { out.innerHTML = '<p class="muted">Grille de ports indisponible.</p>'; return; }
    if (f.weight_g === '' || !(f.weight_g > 0)) { out.innerHTML = '<p class="muted">Saisis le poids pour voir les ports.</p>'; return; }
    var d = window.VGPieces.describe(window.VGShipping, config, { slug: 'nouvelle', weight_g: f.weight_g, mode: f.mode, alone: f.alone });
    var rows = d.zones.map(function (z) {
      var cls = z.gap >= 0 ? 'gain' : 'perte';
      return '<tr><td>' + esc(z.label) + ' <span class="muted">(' + esc(z.country) + ', ' + (z.kind === 'lettre' ? 'lettre' : 'colis') + ')</span></td>'
        + '<td class="num">' + eur(z.cost) + '</td><td class="num">' + (z.total === 0 ? 'offert' : eur(z.total)) + '</td>'
        + '<td class="num ' + cls + '">' + (z.gap >= 0 ? '+' : '−') + eur(Math.abs(z.gap)) + '</td></tr>';
    }).join('');
    var a = d.advice ? '<div class="notice">' + (d.advice.better === 'colis'
      ? 'Le colis revient moins cher que la lettre : colis ' + eur(d.advice.colis_cost) + ' · lettre ' + eur(d.advice.lettre_cost) + ' (France).'
      : 'La lettre revient moins cher que le colis : lettre ' + eur(d.advice.lettre_cost) + ' · colis ' + eur(d.advice.colis_cost) + ' (France).') + '</div>' : '';
    out.innerHTML = '<table class="ports"><tr class="muted"><td>Zone</td><td class="num">Coût réel</td><td class="num">Payé</td><td class="num">Écart</td></tr>' + rows + '</table>' + a;
  }

  // ---------- récap ----------
  function recap() {
    var r = collect(), el = $('recap');
    if (r.error) { el.className = 'notice err'; el.textContent = 'À corriger avant de publier : ' + r.error; return; }
    var p = r.product;
    el.className = 'notice';
    el.innerHTML = '<strong>' + esc(p.name) + '</strong> (' + esc(p.slug) + ') · ' + p.price + ' € · quantité ' + p.quantity + (p.unique ? ' · badge UNIQUE PIECE' : '') + (p.draft ? ' · <strong>BROUILLON</strong>' : '')
      + '<br>' + esc(p.categories.join(', ')) + (p.color_name ? ' · couleur ' + esc(p.color_name) : '') + (p.reel_url ? ' · reel' : '') + ' · ' + p.weight_g + ' g (' + p.mode + (p.alone ? ', part seule' : '') + ')'
      + '<br>' + window.VGStudio.count() + ' photo(s) validée(s).'
      + (window.VGStudio.pending() ? '<br><strong>' + window.VGStudio.pending() + ' photo(s) à détourer ou à valider : pièce non publiable pour l’instant (étape 2).</strong>' : '');
  }

  function init() {
    buildSteps(); buildColors();
    $('fName').addEventListener('input', function () { if (!slugTouched) $('slug').value = F.slugify($('fName').value); });
    $('slug').addEventListener('input', function () { slugTouched = true; });
    $('fQty').addEventListener('input', syncUnique);
    $('fUnique').addEventListener('change', function () { uniqueTouched = true; });
    ['fWeight', 'fMode', 'fAlone'].forEach(function (id) { $(id).addEventListener('input', ports); $(id).addEventListener('change', ports); });
    show(1);
    // Catégories : lues dans le dépôt (data/categories.json) ; grille de ports : fichier de l'admin.
    fetch('https://raw.githubusercontent.com/vgthmind/shop/main/data/categories.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (c) { categories = c; buildCats(); }).catch(function () { $('fCats').textContent = 'Catégories indisponibles.'; });
    fetch('shipping-config.json').then(function (r) { return r.json(); }).then(function (c) { config = c; }).catch(function () {});
  }

  window.VGWizard = { collect: collect, show: show };
  init();
})();

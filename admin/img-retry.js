/* Miniatures des pièces dans l'admin : une photo qu'on vient d'enregistrer n'est en ligne qu'après la reconstruction du site (1 à 2 min).
   Si elle est demandée avant, le navigateur (Safari surtout) garde « échec » pour cette adresse tant que la page reste ouverte, même une fois la photo en ligne.
   On réessaie donc avec une adresse différente (?r=…), en alternant la miniature et l'original, toutes les 15 s, 12 fois au plus. */
(function (root) {
  'use strict';
  root.vgImgRetry = function (img) {
    var n = Number(img.getAttribute('data-n') || 0);
    if (n >= 12) return;
    img.setAttribute('data-n', String(n + 1));
    var base = img.getAttribute(n % 2 === 0 ? 'data-full' : 'data-sized');
    if (!base) return;
    setTimeout(function () { img.src = base + (base.indexOf('?') < 0 ? '?' : '&') + 'r=' + Date.now(); }, n === 0 ? 0 : 15000);
  };
})(window);

// Notre propre script minimal, SANS dépendance BigCartel (remplace jQuery +
// api.js + theme.js + Product.find() retirés de theme/layout.html - voir le
// commentaire à cet endroit pour pourquoi).
//
// Pour l'instant, fait uniquement ce que theme.js faisait et qu'on utilise
// encore réellement : révéler la page (sans ça, body garde la classe
// "preloader"/"transition-preloader" du gabarit -- opacity:0 sur tout,
// pour toujours, bug trouvé en testant la 1ère version de ce générateur en
// local). lazysizes (bibliothèque libre, chargée séparément dans le
// Layout) s'occupe des <img class="lazyload" data-srcset="...">.
//
// Le panier multi-articles + Stripe Checkout (étape 3 du plan) s'ajoutera
// ici plus tard, dans un fichier séparé pour ne pas alourdir celui-ci.
(function () {
  function reveal() {
    document.body.classList.remove('preloader', 'transition-preloader');
  }
  if (document.readyState === 'complete') reveal();
  else window.addEventListener('load', reveal);
})();

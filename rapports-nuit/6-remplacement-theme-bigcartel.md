# 6 — Remplacement de theme.js / api.js (BigCartel) : ce qu'ils faisaient, ce qui les remplace

Branche `nuit/corrections`. Objectif : le site doit fonctionner une fois BigCartel fermé. Avant : chaque page chargeait `assets.bigcartel.com/.../theme.js` (145 Ko), `assets.bigcartel.com/api/6/api.eur.js` (5 Ko) et jQuery depuis cdnjs (87 Ko). Maintenant : **aucune de ces trois requêtes** ; à la place `assets/vg-theme.js` (14 Ko, notre code) et `assets/vendor/splide.min.js` (30 Ko).

## 1. Ce que faisaient réellement ces scripts sur le site

### `api.js` (5 Ko)
Petite bibliothèque d'appels à l'API de la boutique BigCartel : `API.send` (requêtes XHR vers `/cart.js`, `/product/<slug>.js`, `/products.js`…), `Cart.*` (ajouter / modifier / retirer / lire le panier côté serveur BigCartel), `Product.find / findAll / search / findImage`, `Format.money / number / pluralize / queryString`.
**Utilisé par** : `theme.js` et un petit script du gabarit de la fiche produit (`Product.find(...)` puis `processProduct`). **Aucun code du site** (panier, Body, transitions) ne s'en sert : le panier est `assets/vg-shop-cart.js` (localStorage + Worker).

### `theme.js` (145 Ko = 4 bibliothèques libres + ~15 Ko de code BigCartel)

| Contenu | Rôle sur le site | Devenir |
|---|---|---|
| **lazysizes 5.2.1** (MIT) | Chargement différé des images (`img.lazyload`, `data-srcset`, `data-sizes="auto"`, flou → net : classes `lazyload / lazyloading / lazyloaded`) | **Réécrit** (≈ 60 lignes, `IntersectionObserver`) |
| **Splide 4.1.2** (MIT) | Carrousel des fiches produit (flèches, balayage tactile, clavier) et du diaporama d'accueil | **Gardé tel quel : Splide 4.1.4** (MIT, source officielle npm) hébergé dans `assets/vendor/` avec sa licence |
| **PhotoSwipe + lightbox** (MIT) | Zoom des photos | **Supprimé** : jamais utilisé. Le Body (`theme/custom/body.html`, `vg-lightbox`) intercepte déjà le clic en phase de capture et affiche son propre zoom |
| **tinycolor** (MIT) | Calcule des variables CSS de teinte à partir des couleurs du thème | **Réécrit** (6 lignes). Seules les variables `--text-color-rgb`, `--background-color-rgb`, `--header-text-color-rgb` sont utilisées par `theme.css` ; les 5 teintes par couleur ne servaient à rien |
| Code BigCartel : en-tête fixe, fond de l'en-tête au défilement, variable `--vh`, hauteur de l'accueil, fondu du texte d'accueil, apparition du carrousel d'accueil, retrait de la classe `preloader`, `tabindex` du formulaire de contact | Mise en page | **Réécrit** |
| Code BigCartel : miniatures de la fiche produit (clic, élément actif, défilement, flèches gauche/droite, compteur) | Fiche produit | **Réécrit** |
| Code BigCartel : fenêtres Recherche et Menu (ouverture, Échap, clic à l'extérieur, piège du focus, retour du focus) | Navigation | **Réécrit** |
| Code BigCartel : **options / variantes** (produit cartésien des options, états « épuisé / indisponible », prix dans le bouton) | Fiches avec tailles | **Laissé de côté** : aucune pièce n'a d'options (pièces uniques). À réécrire si les variantes reviennent (rapport 1, #5) |
| Code BigCartel : **actions du panier BigCartel** (boutons +/−, retirer, mise à jour des compteurs d'en-tête) | Page panier | **Laissé de côté** : le panier du site est rendu par `vg-shop-cart.js`, qui met lui-même à jour les compteurs |
| Extensions de `Array.prototype` (`equals`, `count`, `includes`) | Interne | **Supprimées** (inutiles) |

### jQuery (87 Ko)
Aucun code du site ne l'utilise (vérifié : ni le Body, ni les transitions, ni le panier, ni le Worker). Il ne servait qu'à `theme.js`. **Supprimé.**

## 2. Ce qui a été fait

- `assets/vg-theme.js` : notre code, sans dépendance (sauf Splide), commenté en tête de fichier.
- `assets/vendor/splide.min.js` + `LICENSE-splide.txt` + `LISEZ-MOI.md` (comment mettre à jour).
- `generator/build.js` : `ownScripts()` retire les balises jQuery / api.js et le script `Product.find` du gabarit ; la balise de `theme.js` devient Splide + `vg-theme.js` ; copie des fichiers dans `docs/`.
- Les gabarits `theme/*.html` ne sont **pas** modifiés pour cela (tout se fait à la construction).
- README mis à jour.

## 3. Tests (navigateur headless, Chromium, bureau 1280 px et mobile 390 px)

Méthode : le site d'**avant** (commit `31e4d92` de `main`, avec les vrais scripts BigCartel servis depuis des copies locales) et le site d'**après** sont ouverts sur les mêmes 11 pages (accueil, produits, catégorie, 2 fiches, panier, studio, contact, suivi, merci, CGV) ; 25 mesures par page sont comparées (classes de l'en-tête avant/après défilement, `--vh`, variables de couleur, carrousels initialisés, nombre de diapositives, miniature active après flèche et après clic, ouverture / fermeture de Recherche et Menu avec Échap, focus, classe `overlay-open`, erreurs de console, images chargées).

Résultat : **identique sur toutes les pages**, sauf le nombre exact d'images déjà chargées au moment de la mesure (marge de chargement différée un peu différente, volontaire). Zoom des photos : ouverture et fermeture vérifiées (identique à l'avant). Requêtes vers `assets.bigcartel.com` ou jQuery : **0**. Erreurs JavaScript : **0**.

## 4. Limites et risques

- **Pas testé** : Safari / iPhone réels, Firefox, balayage tactile réel (Splide le gère, mais je n'ai pas de téléphone), lecteurs d'écran.
- Si une fiche avait un jour des **options** (tailles), `vg-theme.js` ne les gère pas (voir §1).
- `text_color` est vide dans `theme/settings.json` : la variable `--text-color-rgb` vaut noir (0, 0, 0), exactement comme avant ; si tu voulais la couleur de texte clair, c'est un réglage à décider.
- Retour arrière : `git revert` du commit « Remplace theme.js et api.js… » (et reconstruction) rétablit les anciennes balises.

## 5. Autres dépendances encore présentes (hors BigCartel)

Mesurées sur la page d'une fiche, après ces corrections : le Worker (`/stock`), Cloudflare Web Analytics, les **18 vidéos reels** et les fichiers téléchargés au build (`vg-transitions-dev.js`, `.css`, `products-config.json`, `search-keywords.json`) qui viennent du dépôt `vgthmind.github.io`. Les icônes et les polices ne viennent plus de l'extérieur.

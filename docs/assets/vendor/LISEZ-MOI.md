# assets/vendor/

Bibliothèques libres hébergées ici pour que le site ne dépende d'aucun CDN tiers.

| Fichier | Projet | Version | Licence |
|---|---|---|---|
| `splide.min.js` | [Splide](https://splidejs.com) (carrousel des fiches produit et de l'accueil) | 4.1.4 | MIT (voir `LICENSE-splide.txt`) |

Tout le reste du comportement du thème est notre propre code : `assets/vg-theme.js`.
Mise à jour de Splide : `npm pack @splidejs/splide@<version>`, recopier `dist/js/splide.min.js`, relancer `node generator/build.js`, tester une fiche produit.

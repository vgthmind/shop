# Instagram : retirer le script tiers (à appliquer plus tard)

> Rien n'a été modifié dans `theme/` ni `docs/`. Après application : lancer `node generator/build.js` avant de commiter (règle de CLAUDE.md), sinon `docs/` n'est pas à jour.

## 1. Ce qui est chargé aujourd'hui

| Élément | Où | Effet | Tiers |
|---|---|---|---|
| `<script async src="https://www.instagram.com/embed.js">` | `theme/custom/head.html` ligne 1 → injecté dans **les 46 pages générées** de `docs/` (accueil, catégories, produits, panier, 404, merci, suivi, studio, contact, mentions légales, confidentialité, CGV…) | Charge un script Meta sur **chaque visite** | Meta / Instagram |
| `<iframe src="https://www.instagram.com/<reel>/embed">` | `theme/custom/body.html` (fonction `REEL_MAP`, bloc `.ig-reel-embed`), uniquement sur les **fiches produit**, **après un clic** sur l'affiche | Charge le lecteur Instagram (Meta peut déposer des traceurs) | Meta / Instagram |

**Constat : `embed.js` est inutile.** Il ne sert qu'à transformer des `<blockquote class="instagram-media">`, et il n'y en a aucun dans le dépôt (`grep instagram-media` : 0 résultat). Le lecteur actuel est une `<iframe>` créée à la main, qui fonctionne sans ce script. Le retirer ne change rien visuellement et supprime un appel à Meta sur toutes les pages.

### Pages concernées par l'`<iframe>` (20 fiches, après clic)
`ch_0002`, `ch_0003`, `ch_0004`, `ch_0005`, `ch_0006`, `sa`, `sma_0001`, `sma_0003`, `sma_0004`, `custom-hoodie`, `custom-tee-shirt-col-en-v`, `pantalon-rouge-framboise`, `pantalon-denim-bleu`, `ja_0001`, `longsleeve-td002`, `short-ge0001`, `cd-vgtape`, `gp_0002`, `short-coupe-évasée`, `cache-cou` (URL `docs/product/<slug>/`).
Liens utilisés : `reel/…` pour 18 fiches, `p/DPHLT6DjLHL/` pour `longsleeve-td002` et `short-ge0001`.
Autres sources vidéo (`REEL_VIDEO_MAP`, `reel_url` de `products-config.json`) : vides aujourd'hui.

## 2. Remplacement proposé : affiche + lien vers @vgthmind, sans script tiers

Comportement : même bloc visuel (affiche = première photo du produit, déjà hébergée par le site, bouton lecture, libellé « Voir la pièce portée · @vgthmind »), mais c'est un **lien normal** qui ouvre le reel sur Instagram dans un nouvel onglet. Aucune requête vers Meta avant le clic volontaire de l'internaute, et plus de lecteur intégré.

### a) `theme/custom/head.html` — supprimer la ligne

```diff
-<script async src="https://www.instagram.com/embed.js"></script>
```
(Si le fichier ne contient rien d'autre, le laisser vide.)

### b) `theme/custom/body.html` — remplacer la branche `else` de `(window.__vgConfig …).then(…)`

Remplacer tout ce bloc (depuis `} else {` qui suit `wrap.appendChild(extLink);` de la branche vidéo jusqu'à la fin de la branche, `wrap.addEventListener('keydown', …)` inclus) par :

```js
    } else {
      // Pas de lecteur tiers : l'affiche est un simple lien vers Instagram (nouvel onglet).
      var link = document.createElement('a');
      link.className = 'ig-reel-link';
      link.href = reelUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', 'Voir la pièce portée sur Instagram (@vgthmind), nouvel onglet');
      var poster = document.querySelector('.product-images img, .product-image img');
      var posterUrl = poster ? poster.src : '';
      var posterSpan = document.createElement('span');
      posterSpan.className = 'ig-reel-poster';
      if (posterUrl) posterSpan.style.backgroundImage = "url('" + posterUrl + "')";
      var play = document.createElement('span');
      play.className = 'ig-reel-play';
      link.appendChild(posterSpan);
      link.appendChild(play);
      link.appendChild(label);
      wrap.appendChild(link);
    }
```
et, dans la même fonction, supprimer les variables devenues inutiles : `embedPath` (et son affectation `embedPath = REEL_MAP[slug].split('?')[0];`), ainsi que le `window.open` / `iframe` (déjà retirés par le remplacement).

### c) `theme/custom/custom-css.css` — ajouter (le lien doit se comporter comme l'ancien bloc cliquable)

```css
.ig-reel-link{display:block !important;position:relative !important;color:inherit !important;text-decoration:none !important;}
.ig-reel-link:focus-visible{outline:2px solid currentColor !important;outline-offset:3px !important;}
```
Les règles existantes `.ig-reel-embed`, `.ig-reel-poster`, `.ig-reel-play`, `.ig-reel-label` continuent de s'appliquer. Les règles `.ig-reel-embed iframe`, `.ig-reel-embed blockquote` et `.ig-reel-embed-active` (lignes ~294-310, 648-660, 1236, 1332-1335) deviennent inutiles et pourront être nettoyées plus tard (sans urgence).

### d) Libellé EN/FR
Le libellé actuel « Voir la piece portee · @vgthmind » (sans accents ni EN) peut devenir : `Voir la pièce portée · @vgthmind` (FR) / `See it worn · @vgthmind` (EN) — à décider avec le reste du site, qui est bilingue.

## 3. Effets sur la confidentialité
- **Avec ce remplacement** : la politique de confidentialité peut garder l'option **A** du brouillon (« les liens ouvrent Instagram dans un nouvel onglet »). **Plus aucun contenu Meta n'est chargé sur le site**, ni script ni iframe : pas de consentement nécessaire pour cet élément.
- **Si vous conservez le lecteur intégré (iframe au clic)** : supprimer seulement la ligne `embed.js` (a) et utiliser l'option **B** du brouillon ; l'iframe n'est chargée qu'après un clic, ce qui reste préférable à un chargement automatique, mais le juriste devra confirmer que ce clic vaut consentement (Q11).
- Dans les deux cas, la ligne `embed.js` doit disparaître.

## 4. Vérification après application (une seule, comme demandé)
1. `node generator/build.js`.
2. `grep -rl "instagram.com/embed.js" docs` → aucun résultat.
3. Ouvrir une fiche produit (ex. `custom-hoodie`) : l'affiche s'affiche, un clic ouvre Instagram dans un nouvel onglet.

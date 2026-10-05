# vgthmind — boutique (hors BigCartel)

Prototype autonome, gratuit, testé en parallèle — **rien n'est encore publié
ni connecté au domaine vgthmind.org.** Rien ici n'affecte
vgthmind.bigcartel.com, qui reste la vraie boutique en ligne pour l'instant.

**Aperçu en ligne (non indexé, `noindex` + `robots.txt` actifs) :**
https://vgthmind.github.io/shop/

**[2026-10-05] Nouveau plan, décidé par vgthmind : reproduire le site BigCartel
À L'IDENTIQUE** (pas une approximation visuelle) en rendant les vrais
gabarits Liquid du thème avec le vrai catalogue, pour que
`vg-transitions-dev.js`/`.css` (mêmes fichiers que le brouillon BigCartel,
chargés sans modification) fonctionnent sans adaptation. L'ancien prototype
"design approximatif" (`index.html`/`product.html`/`css/`/`js/` à la racine,
JS écrit à la main) est **abandonné et retiré**, remplacé par ce qui suit.
`admin/` (Sveltia CMS) et `oauth-worker/` restent — toujours prévus pour
l'étape 4 (ajout/modif de pièces), pas encore reliés au nouveau schéma de
catalogue (voir "Suite" plus bas).

**[2026-10-05, même jour] Import réel fait, aperçu en ligne vérifié.**
L'accès réseau vers `vgthmind.bigcartel.com`/`assets.bigcartel.com` et vers
`vgthmind.github.io` a été ouvert pour cette session, et GitHub Pages activé
sur ce dépôt (`main` / `docs` → `vgthmind.github.io/shop/`). `node
generator/import-catalog.js` a tourné pour de vrai contre le catalogue
BigCartel (27 produits, 93 photos téléchargées), `docs/` régénéré, poussé,
et l'aperçu vérifié en ligne page par page. **4 bugs réels trouvés et
corrigés pendant cette vérification** (pas supposés corrects - voir
"Vérifié" plus bas) : le filtre `product_image_url` ne trouvait jamais
l'image locale (toutes les images restaient en hotlink vers le CDN
BigCartel), tous les liens internes et les photos 404aient (gabarits
BigCartel écrits pour un domaine racine, ce site est une project page
GitHub Pages sous `/shop/`), les photos téléchargées n'étaient jamais
copiées dans `docs/` (racine effective publiée), et `robots.txt` n'était
jamais servi en ligne (même raison). Les deux blocages listés plus bas sont
donc **partiellement caducs** : le blocage réseau est levé ; le blocage sur
les gabarits (stale depuis le 2026-09-26) reste entier, aucun nouvel export
de thème n'a été fourni.

## Architecture (étapes 1 et 2 du plan)

```
theme/        gabarits Liquid RÉELS exportés de BigCartel (layout.html,
              product.html, products.html, home.html, contact.html,
              theme.css, settings.json) + nos propres ajouts (voir
              "Écarts volontaires" plus bas)
generator/    moteur + générateur de site statique (Node, zéro dépendance)
  liquid.js        - interpréteur d'un sous-ensemble de Liquid (seulement
                      les tags/filtres réellement utilisés par theme/*.html)
  filters.js        - implémentation des filtres, réécrite pour NOTRE site
                      (pas le backend BigCartel - voir plus bas)
  translations.js    - table t['...'] (chaînes anglaises par défaut de
                      BigCartel, codées en dur : pas d'accès à son API)
  normalize-catalog.js - transforme un /products.json brut en catalogue
                         exploitable par le générateur
  import-catalog.js    - importe le catalogue EN LIGNE (télécharge aussi
                         les images), à relancer manuellement - voir
                         "Catalogue actuel" plus bas
  build.js              - rend theme/*.html + data/catalog.json -> docs/
assets/site.js   notre propre script (pas de BigCartel) - voir plus bas
data/catalog.json  catalogue actuellement utilisé par le générateur
docs/            site statique généré (c'est lui que GitHub Pages sert,
                  "Deploy from a branch: main / docs")
```

Pour reconstruire le site après un changement (thème ou catalogue) :
```
node generator/build.js
```

## 🔴 Ce qui diffère encore du vrai site BigCartel

**1. Catalogue et images : résolu.** Le réseau est ouvert depuis le
2026-10-05, `node generator/import-catalog.js` a tourné pour de vrai contre
`vgthmind.bigcartel.com/products.json` (27 produits, 93 photos). Les données
produit (prix, descriptions, options) sont identiques à l'ancienne fixture :
le catalogue live n'a pas changé depuis le 2026-09-26, seules les photos
sont maintenant réellement téléchargées et servies localement (plus de
hotlink vers `assets.bigcartel.com`). À relancer après chaque changement
réel du catalogue (nouvelle pièce, prix, stock) : ni l'import ni le build
ne tournent automatiquement, personne ne surveille le catalogue BigCartel
pour relancer `import-catalog.js` tout seul.

**2. Les gabarits du thème datent toujours du 2026-09-26.** C'est le dernier
export complet (Custom CSS + Body + Layout + Head + zip officiel du thème)
présent dans `vgthmind-chantier/chantier/snapshots/`. Depuis cette date,
`ETAT.md` du dépôt privé documente une refonte quasi complète déjà appliquée
au brouillon réel (page Studio, nouveau panneau de recherche, nouveaux
systèmes de survol sections 4/5, nouvelle Section 3, nouveau curseur,
arrivée de page changée...) - le site que ce générateur produit reproduit
donc le brouillon tel qu'il était **il y a plusieurs semaines de travail**,
pas tel qu'il est aujourd'hui. Pour une vraie fidélité, il faut un export
frais et complet (Custom CSS + Body + Layout + Head) déposé dans
`vgthmind-chantier/chantier/snapshots/`, ou me dire explicitement de
continuer avec cette base en attendant. Concrètement, absents de ce site
généré : la page Studio, le panneau de recherche repensé, le panier (gabarit
`cart.html` présent mais pas branché au générateur), et toute vérification
que `vg-transitions-dev.js`/`.css` (chargés tels quels, mêmes fichiers que
le brouillon réel) rendent correctement contre ce DOM plus ancien.

**3. Pas de panier ni de paiement.** Étape 3 du plan, pas commencée :
`hidden_option_input`/`instant_checkout_button` sont stubbés (voir "Écarts
volontaires" plus bas), pas de Stripe Checkout, pas de Cloudflare Worker.

## Catalogue actuel (`data/catalog.json`)

**Import réel**, fait le 2026-10-05 : `node generator/import-catalog.js`
contre `https://vgthmind.bigcartel.com/products.json` (27 produits, 7
catégories). `catalog.json.source`/`.fetched_at` documentent cette
provenance. Les 93 photos produit sont téléchargées dans
`assets/products/<permalink>/<n>.<ext>` (34 Mo) et copiées par
`generator/build.js` dans `docs/assets/products/` à chaque génération, qui
est la racine réellement servie par GitHub Pages - le dépôt duplique donc
ces photos en deux endroits (~68 Mo au total), accepté comme compromis
simple plutôt qu'un symlink non portable en Git. Vérifié avant l'import :
le `/products.json` public ne contient aucune donnée personnelle (pas de
panier, pas de jeton de session - juste les produits publics : nom, prix,
description, photos, catégories). Node ne suit pas `HTTPS_PROXY`
nativement (contrairement à `curl`) ; `import-catalog.js` tunnelle donc ses
requêtes HTTPS via un `CONNECT` manuel vers le proxy de sortie du
bac-à-sable - voir le commentaire en tête du fichier si ça change
d'environnement. **À relancer manuellement après tout changement du
catalogue réel** (voir "Ce qui diffère" ci-dessus).

## Écarts volontaires avec les vrais gabarits BigCartel

Le DOM produit vise à être identique, mais le site n'a plus de backend
BigCartel - certains filtres/scripts ont donc été réécrits, pas juste copiés :

- **`theme/layout.html` ne charge plus jQuery + `api.js` + `theme.js` +
  l'appel `Product.find()`** (backend e-commerce natif de BigCartel, qu'on
  n'a plus) - remplacés par `assets/site.js` (le nôtre) + la bibliothèque
  libre [lazysizes](https://github.com/aFarkas/lazysizes) (pas du code
  BigCartel) pour les `<img class="lazyload" data-srcset="...">` déjà
  présentes dans les gabarits. **Bug réel trouvé en testant en local** :
  sans un script qui retire les classes `preloader`/`transition-preloader`
  du `<body>`, toute la page reste à `opacity:0` pour toujours (c'était le
  rôle de `theme.js`, perdu en le retirant) - `assets/site.js` s'en charge
  maintenant.
- **`instant_checkout_button`** (bouton PayPal/Stripe natif de BigCartel) :
  rendu vide plutôt qu'un bouton non fonctionnel.
- **`hidden_option_input`** (ajout au panier natif) : rendu avec
  `data-vg-todo="cart-wiring-step-3"` - le vrai panier/Stripe Checkout est
  l'étape 3 du plan, pas commencée.
- **`product_image_url`** : pointe vers l'image locale téléchargée par
  `import-catalog.js` (`data/catalog.json.imageMap`), retombe sur l'URL
  `assets.bigcartel.com` d'origine seulement si une image n'a pas de copie
  locale enregistrée.
- **Tous les liens racine** (`/`, `/products`, `/category/*`, `/contact`,
  `/cart`, `/assets/*`, et `{{ produit/categorie | ... }}.url`) viennent des
  vrais gabarits BigCartel, écrits pour un site servi depuis la racine d'un
  domaine. Ce site est une *project page* GitHub Pages
  (`vgthmind.github.io/shop/`, pas la racine) : `generator/build.js`
  applique donc un préfixe `/shop` en post-traitement du HTML rendu (une
  constante `BASE_PATH`, pas touché dans `theme/*.html` qui reste fidèle
  aux vrais exports BigCartel). À remettre à `''` (variable d'env
  `BASE_PATH`) le jour où ce site est déployé sur un domaine dédié plutôt
  que sous `/shop/`.

## Pages déjà générées par `node generator/build.js`

Accueil, Products (toutes), une page par catégorie, une page par produit,
Contact (texte statique, pas de formulaire fonctionnel). **Pas encore
générées** (gabarits absents de l'export du 2026-09-26, pas dans le thème
officiel) : Studio (page custom créée après coup dans BigCartel), le panneau
de recherche (vit entièrement dans `vg-transitions-dev.js`/`.css`, pas dans
les gabarits Liquid - devrait apparaître automatiquement une fois ce script
chargé pour de vrai, pas vérifié ici), le splash d'accueil (script du Body,
pas dans l'export de thème), le panier (gabarit `cart.html` présent mais pas
encore branché au générateur).

## Vérifié (serveur HTTP local + aperçu en ligne réel)

Les 27 produits sont bien dans le DOM généré (grille Products, fiches
produit, pages catégorie), navigation/sous-catégories/footer (réseaux
sociaux filtrés aux comptes réellement configurés)/panier/recherche (icône)
s'affichent correctement, aucune erreur JS bloquante. **7 bugs réels
trouvés et corrigés en testant** (pas juste supposés corrects) :
1. Classes `preloader`/`transition-preloader` jamais retirées -> page
   invisible pour toujours (voir "Écarts volontaires" ci-dessus).
2. `{{ categorie | link_to }}` (forme à 1 argument, un objet) rendait
   `[object Object]` : le moteur ajoutait silencieusement le contexte de
   rendu comme argument supplémentaire à CHAQUE filtre, même ceux appelés
   sans argument explicite - corrigé (seuls les filtres qui en ont
   réellement besoin le reçoivent désormais, et reçoivent la vraie valeur
   dont ils ont besoin, pas l'objet de contexte interne - voir bug 5).
3. `theme.images.logo_image != blank` était vrai même avec `logo_image`
   à `null` (le moteur comparait `null` à la chaîne vide littérale au lieu
   de reconnaître `blank`/`empty` comme une vraie notion de "rien") -
   corrigé, le logo texte s'affiche correctement.
4. (2026-10-05, après le vrai import) **Toutes les images produit
   restaient en hotlink vers `assets.bigcartel.com`** malgré l'import et le
   téléchargement réussis : `product_image_url` recevait l'objet interne
   `{scopes}` du moteur Liquid au lieu de la valeur `__imageMap` elle-même,
   donc le lookup échouait toujours en silence - corrigé dans `liquid.js`
   (résolution explicite de la variable demandée par le filtre).
5. **Tous les liens internes et les photos 404aient en ligne** : les vrais
   gabarits BigCartel écrivent des liens racine (`/products`, `/cart`,
   `/assets/site.js`...) qui supposent un site servi depuis la racine d'un
   domaine, pas depuis une *project page* GitHub Pages (`/shop/`) - corrigé
   par un préfixe `/shop` appliqué en post-traitement du HTML dans
   `build.js` (voir "Écarts volontaires").
6. **Les photos produit 404aient en ligne** même après la correction du
   bug 5 : `import-catalog.js` les télécharge à la racine du dépôt
   (`assets/products/`), jamais copiées dans `docs/` qui est la racine
   effective publiée par GitHub Pages - corrigé, `build.js` copie
   maintenant ce dossier à chaque build.
7. **`robots.txt` n'était jamais servi en ligne** (`Disallow: /`, requis
   tant que ce n'est pas la boutique officielle) : même cause que le bug 6,
   le fichier restait à la racine du dépôt au lieu de `docs/` - corrigé.

**Pas encore vérifiable** : chargement réel de `vg-transitions-dev.js`/`.css`
contre ce DOM généré (le script est chargé en ligne sur l'aperçu, mais les
transitions/survols/recherche n'ont pas été testés visuellement dans un
navigateur depuis cette session) - seule la structure HTML/CSS statique et
la résolution des liens/images sont vérifiées par requêtes HTTP directes.

## Suite (pas commencée)

- Étape 3 : panier multi-articles + Stripe Checkout via un Cloudflare
  Worker (frais de port à calculer - règles actuelles de la boutique à me
  donner si introuvables ailleurs), webhook Stripe pour marquer une pièce
  unique vendue.
- Étape 4 : reconnecter l'admin Sveltia (`admin/`) au nouveau schéma de
  catalogue (`data/catalog.json`, pas `data/products/*.json`) - décision à
  prendre sur comment fusionner les ajouts manuels avec les imports
  automatiques.
- Robots/indexation : `robots.txt` + `noindex` sont en place et confirmés
  servis sur l'aperçu en ligne (voir "Durcissement déjà en place" plus bas)
  - à repasser en indexable au lancement officiel seulement, pas avant.

---

## Sécurité (toujours valable, non modifié par le nouveau plan)

Contexte : un e-commerce français s'est fait pirater récemment (mentionné
par le propriétaire), et une campagne plus large a compromis 119 sites
marchands entre juillet et septembre 2026 via des scripts espions injectés
sur les pages de paiement (vol de plus de 600 000 numéros de carte,
technique dite "Magecart"). Une marque française de streetwear (ARNtreal,
~100 000 comptes) a aussi été piratée récemment - pas via sa plateforme
e-commerce elle-même, mais via un système annexe fait maison (concours,
affiliation).

### Pourquoi cette architecture résiste structurellement à ces deux scénarios

1. **Aucune page de paiement sur ce site, une fois l'étape 3 faite.** Le
   paiement passera par Stripe Checkout (page hébergée par Stripe,
   conformité PCI-DSS gérée par eux) - aucun formulaire de carte bancaire
   sur ce site.
2. **Aucune base de données, aucun compte client, aucun système fait
   maison.** Le contenu vit dans des fichiers texte (JSON) commit dans ce
   dépôt Git. Pas de mot de passe utilisateur stocké, pas de serveur perso à
   maintenir/patcher.
3. **Le seul secret sensible est un jeton d'accès GitHub** (pour Sveltia),
   limité à ce dépôt, jamais partagé, jamais stocké dans le code - plus,
   une fois l'étape 3 faite, les secrets du Cloudflare Worker Stripe
   (jamais dans ce dépôt non plus).

### Ce qu'il faut quand même absolument faire (côté humain, pas du code)

- **Active la double authentification (2FA)** sur ton compte GitHub, ton
  compte Stripe, et sur ton adresse email associée.
- **Ne partage jamais le jeton GitHub** avec qui que ce soit.
- **Vérifie régulièrement** (une fois par mois par exemple) la liste des
  connexions actives sur GitHub et sur Stripe.

### Durcissement déjà en place

- `robots.txt` : `Disallow: /` (tout bloqué tant que ce n'est pas la
  boutique officielle), copié dans `docs/` par `build.js` pour être
  réellement servi par GitHub Pages (racine du dépôt non servie - voir
  "Vérifié" ci-dessus, bug 7) - confirmé en ligne sur l'aperçu actuel.
- Contenu texte toujours inséré via `textContent`/échappement HTML
  (`generator/filters.js`), jamais via une concaténation HTML brute avec des
  données variables - empêche l'injection de code HTML/script depuis un
  champ produit.

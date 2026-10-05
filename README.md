# vgthmind — boutique (hors BigCartel)

Prototype autonome, gratuit, testé en parallèle — **rien n'est encore publié
ni connecté au domaine vgthmind.org.** Rien ici n'affecte
vgthmind.bigcartel.com, qui reste la vraie boutique en ligne pour l'instant.

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
                         les images) - voir "Bloqué" ci-dessous
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

## 🔴 Deux blocages réels, pas contournables depuis cette session

**1. Catalogue et images : réseau bloqué.** Cette session cloud ne peut pas
du tout atteindre `vgthmind.bigcartel.com` ni `assets.bigcartel.com` (403
"policy denial" du proxy réseau du bac à sable, confirmé par deux chemins
indépendants - `curl` direct et l'outil de fetch web). `generator/import-catalog.js`
est écrit et prêt (schéma vérifié contre un vrai `/products.json`), mais
**n'a jamais tourné contre le catalogue réel**. Pour le lancer pour de vrai,
il faut soit l'exécuter depuis un environnement qui atteint BigCartel (ta
session locale, par exemple), soit élargir l'accès réseau de cet
environnement cloud (menu de l'environnement dans la barre de titre de la
session -> Edit -> ajouter `vgthmind.bigcartel.com` et `assets.bigcartel.com`
aux domaines autorisés) puis relancer `node generator/import-catalog.js`
depuis ici.

**2. Les gabarits du thème datent du 2026-09-26.** C'est le dernier export
complet (Custom CSS + Body + Layout + Head + zip officiel du thème) présent
dans `vgthmind-chantier/chantier/snapshots/`. Depuis cette date, `ETAT.md` du
dépôt privé documente une refonte quasi complète déjà appliquée au brouillon
réel (page Studio, nouveau panneau de recherche, nouveaux systèmes de survol
sections 4/5, nouvelle Section 3, nouveau curseur, arrivée de page changée...)
- le site que ce générateur produit reproduit donc le brouillon tel qu'il
était **il y a plusieurs semaines de travail**, pas tel qu'il est aujourd'hui.
Pour une vraie fidélité, il faut un export frais et complet (Custom CSS +
Body + Layout + Head) déposé dans `vgthmind-chantier/chantier/snapshots/`,
ou me dire explicitement de continuer avec cette base en attendant.

## Catalogue actuel (`data/catalog.json`)

**Ce n'est pas un import réel** (bloqué, voir ci-dessus) : c'est une
conversion du `/products.json` du 2026-09-26 déjà présent dans le dépôt privé
(`chantier/snapshots/2026-09-26-1430/vgthmind-pages-en-ligne-2026-09-26-1435.json`,
qui lui-même documente être une copie du site **EN LIGNE d'alors**, donc déjà
l'ancien design, pas le brouillon). Vérifié avant utilisation : cette copie
ne contient aucune donnée personnelle (pas de panier, pas de jeton de
session - juste les 27 produits publics : nom, prix, description, photos,
catégories). Sert uniquement à prouver que le moteur de rendu fonctionne de
bout en bout. `catalog.json.source`/`.fetched_at` documentent cette
provenance. **À remplacer par un vrai `node generator/import-catalog.js`**
dès que le blocage réseau est levé.

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
- **`product_image_url`** : pointe vers une image locale téléchargée une
  fois `import-catalog.js` exécuté pour de vrai ; en attendant, retombe sur
  l'URL `assets.bigcartel.com` d'origine (cassée dans ce bac à sable, réseau
  bloqué - voir plus haut).

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

## Vérifié localement (serveur HTTP + Playwright, dans ce bac à sable)

Les 27 produits sont bien dans le DOM généré (grille Products, fiches
produit, pages catégorie), navigation/sous-catégories/footer (réseaux
sociaux filtrés aux comptes réellement configurés)/panier/recherche (icône)
s'affichent correctement, aucune erreur JS bloquante. **3 bugs réels trouvés
et corrigés en testant** (pas juste supposés corrects) :
1. Classes `preloader`/`transition-preloader` jamais retirées -> page
   invisible pour toujours (voir "Écarts volontaires" ci-dessus).
2. `{{ categorie | link_to }}` (forme à 1 argument, un objet) rendait
   `[object Object]` : mon moteur ajoutait silencieusement le contexte de
   rendu comme argument supplémentaire à CHAQUE filtre, même ceux appelés
   sans argument explicite - corrigé (seuls les filtres qui en ont
   réellement besoin le reçoivent désormais).
3. `theme.images.logo_image != blank` était vrai même avec `logo_image`
   à `null` (mon moteur comparait `null` à la chaîne vide littérale au lieu
   de reconnaître `blank`/`empty` comme une vraie notion de "rien") -
   corrigé, le logo texte s'affiche correctement.

**Pas vérifiable dans ce bac à sable** (réseau bloqué, voir plus haut) :
chargement réel de `vg-transitions-dev.js`/`.css` contre ce DOM généré, donc
aucune des transitions/survols/recherche n'a pu être testée en conditions
réelles - seule la structure HTML/CSS statique est vérifiée.

## Suite (pas commencée)

- Étape 3 : panier multi-articles + Stripe Checkout via un Cloudflare
  Worker (frais de port à calculer - règles actuelles de la boutique à me
  donner si introuvables ailleurs), webhook Stripe pour marquer une pièce
  unique vendue.
- Étape 4 : reconnecter l'admin Sveltia (`admin/`) au nouveau schéma de
  catalogue (`data/catalog.json`, pas `data/products/*.json`) - décision à
  prendre sur comment fusionner les ajouts manuels avec les imports
  automatiques.
- Robots/indexation : `robots.txt` + `noindex` sur les pages générées
  restent à vérifier/porter dans `theme/layout.html` - pas encore fait sur
  cette nouvelle base.

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
  boutique officielle).
- Contenu texte toujours inséré via `textContent`/échappement HTML
  (`generator/filters.js`), jamais via une concaténation HTML brute avec des
  données variables - empêche l'injection de code HTML/script depuis un
  champ produit.

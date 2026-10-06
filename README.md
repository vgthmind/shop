# vgthmind — boutique (hors BigCartel)

Prototype autonome, gratuit, testé en parallèle — **rien n'est publié ni
connecté au domaine vgthmind.org.** vgthmind.bigcartel.com reste la vraie
boutique.

**Aperçu (non indexé : `<meta name="robots" content="noindex, nofollow">` sur
chaque page) :** https://vgthmind.github.io/shop/

## Principe

Le site est une **copie à l'identique du brouillon BigCartel** : un
générateur Node rend les **vrais gabarits Liquid du thème** avec le **vrai
catalogue**, puis ajoute ce que BigCartel injecte lui-même autour (Custom
CSS + code Head avant `</head>`, code Body avant `</body>`). Les scripts du
brouillon (`vg-transitions-dev.js`, le Body) et ceux de BigCartel (jQuery,
`api.js`, `theme.js`) tournent sans modification de leur code.

```
theme/            gabarits RÉELS du brouillon, copiés à l'octet près depuis
                  l'instantané du 2026-10-05 (layout, home, products,
                  product, cart, contact, maintenance, theme.css,
                  settings.json)
theme/custom/     custom-css.css, head.html, body.html (éditeur BigCartel)
theme/pages/      contenu des pages Info & Terms, Contact, Studio
generator/        moteur Liquid + générateur (Node, zéro dépendance)
  build-catalog.js    data/products/*.json (admin) -> data/catalog.json
  build.js            rend theme/ + data/catalog.json -> docs/
  migrate-to-admin-products.js  outil ponctuel (déjà utilisé une fois, voir plus bas)
  import-catalog.js   outil ponctuel de RE-SEED depuis le catalogue BigCartel
                       EN LIGNE (jamais lancé automatiquement, voir plus bas)
admin/            interface de gestion (Sveltia CMS) - ajouter/modifier/
                  retirer une pièce sans toucher au code, voir "Admin" ci-dessous
data/products/    UNE PIÈCE = UN FICHIER JSON - la vraie source du catalogue,
                  éditée par admin/ (ou à la main)
data/categories.json  les 7 catégories (id/nom/URL stables), pas éditable par l'admin
assets/vg-shop-shim.js  shim "sous-dossier" (voir plus bas)
assets/theme/     logo + photo d'accueil du thème (images du brouillon)
assets/products/  photos produit (pièces migrées depuis BigCartel le 2026-10-05 ;
                   les nouvelles photos ajoutées par l'admin vont dans assets/products/uploads/)
assets/products-sized/  mêmes photos en WebP 24/320/540/800 px (generator/resize-images.js, cache)
assets/vg-shop-cart.js  panier (localStorage) + paiement via checkout-worker/
checkout-worker/  Cloudflare Worker : session Stripe Checkout, webhook, commandes (voir son README)
generator/shop-pages/   pages /merci, /paiement-annule, 404
data/catalog.json catalogue généré (par build-catalog.js) - NE PAS éditer à la main
docs/             site généré (servi par GitHub Pages : main / docs)
```

## Admin — ajouter/modifier/retirer une pièce sans toucher au code

Ouvrir `/shop/admin/` (Sveltia CMS), se connecter avec un jeton GitHub
"fine-grained" limité à ce dépôt (voir "Sécurité" plus bas), puis créer/
éditer/supprimer une fiche dans "Pièces". Chaque sauvegarde est un commit
direct sur `main` dans `data/products/<slug>.json` ; le `GitHub Action`
`.github/workflows/build-shop.yml` reconstruit alors automatiquement
`data/catalog.json` puis tout `docs/` et pousse le résultat — le site en
ligne se met à jour seul, en 1-2 minutes, sans qu'il soit nécessaire de
relancer quoi que ce soit à la main.

Pour reconstruire en local (pour vérifier avant de pousser, par exemple) :
```
npm ci                            # une fois (sharp, pour les tailles d'images)
node generator/build-catalog.js   # data/products/*.json -> data/catalog.json
node generator/resize-images.js   # photos -> assets/products-sized/ (nouvelles seulement)
node generator/build.js           # -> docs/
```
(= `npm run build`. Avant de pousser : `git pull --rebase`, l'Action pousse
aussi des commits.)

**`generator/import-catalog.js` n'est plus utilisé par le build normal.**
Le catalogue réel de BigCartel (27 pièces, importées le 2026-10-05) a été
migré une fois vers `data/products/*.json` par
`generator/migrate-to-admin-products.js` (déjà fait, pas à refaire) :
`data/products/*.json` est maintenant la seule source de vérité, modifiable
depuis `admin/` sans jamais retoucher au catalogue BigCartel en ligne. Si un
jour il faut re-synchroniser depuis BigCartel (ex. après une grosse mise à
jour faite là-bas), relancer `import-catalog.js` puis
`migrate-to-admin-products.js data/catalog.json` RÉÉCRIT entièrement les
fichiers `data/products/*.json` à partir de ce qui est en ligne sur
BigCartel — donc aussi les éditions faites depuis `admin/` entre-temps
(stock, prix, nouvelles pièces ajoutées à la main). À ne faire qu'à la
main, en ayant conscience de cet écrasement (comparer `git diff` avant de
pousser), jamais automatiquement.

Mettre à jour les gabarits : recopier un nouvel instantané du brouillon
(dépôt privé `vgthmind-chantier/chantier/snapshots/<date>-brouillon/`) dans
`theme/`, `theme/custom/`, `theme/pages/` — **en retirant toute donnée
personnelle de la page Info & Terms** (ce dépôt est public : le SIRET y est
remplacé par un renvoi vers les mentions légales de vgthmind.org).

## Ce que fait le générateur en plus des gabarits (écarts volontaires)

- **Sous-dossier `/shop/`** : les gabarits supposent un site à la racine
  d'un domaine. `build.js` préfixe les adresses dans le HTML (pas dans le
  code des `<script>`), et `assets/vg-shop-shim.js`, injecté en premier dans
  `<head>` :
  - préfixe les requêtes `fetch` / XHR vers une adresse racine
    (`/products.json`, `/product/<slug>.js`...) ;
  - fait lire aux scripts les liens SANS `/shop` (`getAttribute('href')`),
    comme sur BigCartel, l'attribut réel gardant `/shop` — sauf les liens
    vers un fichier `/shop/assets/...` (photos du zoom, que le Body met tel
    quel en `src` d'image) ;
  - préfixe les liens créés en JavaScript (tuiles, lien retour) ;
  - donne au Body, à `vg-transitions-dev.js` et au script de transition du
    `<head>` un `location` dont `pathname` est vu sans `/shop`.
  Le jour où la boutique est servie à la racine d'un domaine :
  `BASE_PATH=''` et le shim ne fait plus rien.
- **`vg-transitions-dev.js`** : téléchargé à chaque build depuis
  vgthmind.github.io (même fichier que le brouillon), servi depuis
  `docs/assets/vg/` enveloppé pour le `location` ci-dessus (le
  `<link rel="preload">` du Layout pointe sur cette copie).
- **Compléments au rendu** (le code des scripts n'est pas modifié) :
  `<html lang="en" translate="no">` (le Layout n'a pas de balise `<html>` :
  Safari iPhone proposait « Traduction disponible » à chaque page) ; règle
  qui masque HOME dans le menu mobile pour le lien `/shop/` (celle du fichier
  de transitions vise `href="/"`) ; lien « ← Produits » des pages catégorie
  et produit écrit dans le HTML, avec ses 2 règles de style reprises du Body
  dans `<head>` (sinon il n'apparaissait qu'après les scripts : saut du
  titre et du prix à l'arrivée sur iPhone).
- **Points d'accès BigCartel simulés** : `products.json`,
  `product/<slug>.js` (lu par `api.js` / `theme.js` sur les fiches),
  `cart.js` (vide : le panier vit dans `localStorage`, voir `assets/vg-shop-cart.js`).
- **`theme.css`** est lui-même un gabarit Liquid : rendu avec les réglages.
- **jQuery, `api.js`, `theme.js`** : chargés depuis les CDN, comme sur le
  brouillon (pas copiés ici, c'est le code de BigCartel). **À remplacer avant
  un vrai lancement hors BigCartel** (dépendance à leur CDN).
- Prix au format du brouillon (`money_format: code` → « 84,00 EUR ») ;
  pièces à option unique sans menu « Select variant » (comme BigCartel).

## Ajouts par rapport à BigCartel (2026-10-06)

- **Panier et paiement** : panier en `localStorage` rendu avec le balisage du
  gabarit panier ; un seul paiement Stripe Checkout pour tout le panier via
  `checkout-worker/` (prix, stock, port relus côté serveur ; mode test tant
  que `LIVE_MODE` = 0). Retour sur `/merci` ou `/paiement-annule`.
- **Stock** : quantité par pièce (1 = unique) ; le webhook Stripe la décompte
  et passe la pièce en Sold out (commit dans `data/products/`).
- **Commandes** : `/shop/admin/commandes.html`. Aide : `admin/AIDE.md`.
- **Photos** en 4 tailles WebP ; images du compte BigCartel servies d'ici ;
  CSS et JS de transitions copiés au build ; favicon ; page 404 ;
  `/contact` renvoie vers la page Contact.

## Ce qui diffère encore de BigCartel

- **jQuery, `api.js`, `theme.js`** toujours servis par leurs CDN.
- **Rebond « déjà sur la page »** et petites différences liées au
  sous-dossier : à vérifier en vidéo.
- Liste complète et à jour : rubrique BACKLOG de `chantier/ETAT.md` (dépôt privé).

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

## Lancement (le jour où /shop/ devient la boutique officielle)

`data/shop-settings.json` : `"public": true` (retire les `noindex`, ouvre
`robots.txt` sauf l'admin, ajoute la ligne `Sitemap:`), et `site_url` = la
vraie adresse si elle change (ex. domaine à soi : mettre aussi `BASE_PATH=''`
au build). Paiement live : voir `checkout-worker/README.md` et la liste
« Passage en live » du chantier.

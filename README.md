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
  import-catalog.js   importe le catalogue EN LIGNE + télécharge les photos
  build.js            rend theme/ + data/catalog.json -> docs/
assets/vg-shop-shim.js  shim "sous-dossier" (voir plus bas)
assets/theme/     logo + photo d'accueil du thème (images du brouillon)
assets/products/  photos produit téléchargées par import-catalog.js
data/catalog.json catalogue importé
docs/             site généré (servi par GitHub Pages : main / docs)
```

Mettre à jour :
```
node generator/import-catalog.js   # catalogue + photos depuis vgthmind.bigcartel.com
node generator/build.js            # régénère docs/
```
(Node n'est pas installé sur le PC : celui fourni avec Playwright convient,
`...\Python312\Lib\site-packages\playwright\driver\node.exe`.)

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
  `cart.js` (panier vide en attendant l'étape 3).
- **`theme.css`** est lui-même un gabarit Liquid : rendu avec les réglages.
- **jQuery, `api.js`, `theme.js`** : chargés depuis les CDN, comme sur le
  brouillon (pas copiés ici, c'est le code de BigCartel). **À remplacer avant
  un vrai lancement hors BigCartel** (dépendance à leur CDN).
- Prix au format du brouillon (`money_format: code` → « 84,00 EUR ») ;
  pièces à option unique sans menu « Select variant » (comme BigCartel).

## Ce qui diffère encore du brouillon BigCartel

- **Panier et paiement** : pas encore (étape 3). « Add to cart » envoie un
  formulaire vers `/shop/cart` que GitHub Pages ne sait pas traiter.
- **Formulaire de contact** (`/contact`) : pas de backend.
- **Rebond « déjà sur la page »** et petites différences liées au
  sous-dossier : à vérifier en vidéo.
- **Photos** : servies en taille unique (≈ 1000 px) au lieu des tailles
  adaptées du CDN BigCartel ; photo d'accueil 1,7 Mo.
- **favicon** absente sous `/shop/`.

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

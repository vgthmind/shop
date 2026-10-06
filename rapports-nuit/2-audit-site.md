# 2 — Audit du site public (FR et EN)

Rapport de nuit, lecture seule : **aucune correction appliquée**. Périmètre : les 47 pages HTML de `docs/` (hors admin) (accueil, 7 catégories, 27 fiches, panier, merci, paiement annulé, suivi, 404, Info & CGV, Mentions légales, Confidentialité, Studio, Contact), les e-mails (`checkout-worker/emails.ts`) et le Worker.
Méthode : lecture des sources (`theme/`, `generator/`, `data/products/`, `checkout-worker/`), script de contrôle des pages générées (titres, méta, liens, images), un seul test mobile automatisé (360 et 390 px, sans capture).
Les corrections se font dans les **sources** (pas dans `docs/`, qui est généré). Après toute correction dans `theme/` ou `admin/` : `node generator/build.js` (règle du dépôt).
Rien n'a été modifié concernant `LIVE_MODE`, `noindex`, `robots.txt`.

## Résumé

| Classe | Nombre |
|---|---|
| Bloquant avant lancement | 8 |
| Important | 25 |
| Confort | 14 |

**Ce qui va bien** : aucun lien interne cassé (tous les `href`/`src` de toutes les pages vérifiés) ; aucune page ne déborde en largeur sur mobile (360/390 px) ; aucune cible tactile < 24 px ni texte < 12 px visibles ; `viewport` correct ; `prefers-reduced-motion` géré ; photos produit en WebP 320/540/800 avec `srcset` et chargement différé ; canonical + JSON-LD Product sur les 27 fiches ; stock réel côté Worker ; aucun secret, clé ni jeton privé dans le dépôt (recherche `sk_`, `whsec_`, `re_`).

---

## A. BLOQUANT avant lancement

| # | Problème | Fichier : ligne | Correction proposée |
|---|---|---|---|
| A1 | **Médiateur de la consommation absent** (obligatoire pour vendre à des particuliers). Seul un commentaire HTML l'attend. | `theme/pages/mentions-legales.html:6` | Choisir un médiateur (liste CECMC), ajouter nom + adresse web + postale dans les deux langues, et le citer dans les CGV. |
| A2 | **Adresse de l'activité absente** des mentions légales (seulement « Vitry-sur-Seine »). Déjà dans ton ETAT (point 1, CCI). | `theme/pages/mentions-legales.html:3` et `:9` | Ajouter l'adresse complète une fois obtenue (domiciliation / CCI). |
| A3 | **CGV : « Colissimo, tarifs calculés selon le poids et la destination »** est faux : le Worker applique un port fixe **par pièce**, le plus élevé du panier, 2 zones (France / international). | `theme/pages/infos-conditions-generales.html:16` (EN) et `:34` (FR) ; réalité : `checkout-worker/index.ts:339-343` | Après le chantier frais d'envoi : réécrire le paragraphe d'après la grille réellement appliquée (zones, tarifs, délais). |
| A4 | **Pas de délai de livraison** ni de modalités de retour dans les CGV : « Ta pièce part sous quelques jours » (page Merci) est la seule indication. Les modalités de rétractation manquent : formulaire type, qui paie le retour, délai de remboursement (14 jours), état du bien, adresse de retour. | `generator/shop-pages/merci.html:5-6` ; `theme/pages/infos-conditions-generales.html:10-12`, `:28-30` | Ajouter une section « Délais » (préparation + transport par zone) et compléter « Rétractation » (déjà marquée « à faire valider par un juriste » : lignes 2, 11, 20, 29). |
| A5 | **Exclusion « commande personnalisée » (L221-28 3°) ambiguë** : tes « custom » (hoodies, shorts airbrush) sont des pièces **déjà faites**, vendues en stock, donc a priori **soumises** à la rétractation ; l'exclusion ne vaut que pour du sur-mesure commandé par le client. Reprise telle quelle dans les e-mails. | `infos-conditions-generales.html:3, 12, 21, 30` ; `checkout-worker/emails.ts:72` (FR), `:98` (EN) | Faire valider par un juriste (déjà noté). Proposition de principe : distinguer « pièces en stock (y compris customisées) : 14 jours » et « création sur commande (via DM) : non reprise ». |
| A6 | **Dépendance au CDN BigCartel** : `theme.js` (`assets.bigcartel.com/theme_assets/91/2.3.4/theme.js`) et `api.eur.js` sont chargés sur **toutes** les pages. Si le compte BigCartel est fermé, ces fichiers peuvent disparaître : le site cesserait de fonctionner (menus, panier, galerie). | `generator/build.js:57-58` ; visible dans `docs/index.html:2663,2670` ; en plus `theme/custom/body.html:382` (image CD sur `assets.bigcartel.com/product_images/…`) | **À régler avant de fermer BigCartel** : copier `theme.js` / `api.js` dans le dépôt (vérifier leur licence/usage) ou les réécrire ; rapatrier l'image du CD. |
| A7 | **Vidéos, config et scripts hébergés dans un autre dépôt** (`vgthmind.github.io/assets/bigcartel/…`) : 18 reels MP4 (1,3 à 1,7 Mo chacun), `cart-icon.png`, version d'origine de `vg-transitions-dev.js`. Si ce dépôt est renommé, privé ou vidé, le site perd icônes/vidéos. | `theme/custom/body.html:2, 85-102, 210` ; `theme/layout.html:26-27` ; `docs/index.html:1198` (icône panier) | Rapatrier dans ce dépôt (ou sur R2/Cloudflare) les fichiers réellement utilisés, ou documenter la dépendance. |
| A8 | **Prénom dans un fichier du dépôt public** (contrairement à ta consigne « seulement vgthmind »). | `checkout-worker/index.ts:81` (commentaire « décision de … ») | Remplacer par « vgthmind » ; vérifier aussi l'historique git (le prénom y reste visible tant que l'historique n'est pas nettoyé). |

> À noter pour le jour J (je n'y touche pas) : `robots.txt` et `data/shop-settings.json` (`public: false`), ligne Hébergement des mentions légales (ETAT point 2), `ALLOWED_ORIGIN` + `SITE_BASE` dans `checkout-worker/wrangler.toml` (CORS : le site sur `shop.vgthmind.org` sera refusé tant que ce n'est pas changé), URL de retour Stripe, domaine vérifié pour Apple Pay.

---

## B. IMPORTANT

### B1. Légal / cohérence CGV ↔ e-mails ↔ site

| # | Problème | Fichier : ligne | Correction |
|---|---|---|---|
| B1.1 | **Tutoiement / vouvoiement mélangés** : CGV, confidentialité, studio, contact en « vous » ; panier, merci, suivi, e-mails en « tu ». | `infos-conditions-generales.html:21-36` vs `generator/shop-pages/merci.html:3,6`, `emails.ts:51-74`, `assets/vg-shop-cart.js:353-364,457-465` | Choisir un registre (le tutoiement fait partie de ta marque ; le juridique peut rester « vous »). |
| B1.2 | **Code promo invisible dans l'e-mail client, l'e-mail vendeur et la page /suivi** : le total est celui payé, mais aucune ligne « Remise » → articles + port ≠ total. (`/orders` de l'admin affiche bien la remise.) | `checkout-worker/index.ts:505-526` (`buildOrder` sans `total_details.amount_discount`), `emails.ts:14-36` (`OrderData`, pas de champ remise) | Ajouter une ligne « Remise / Discount » dans `OrderData` et dans les deux modèles de mails + /track. |
| B1.3 | **E-mails : français seulement pour la France.** Belgique, Suisse, Luxembourg, Canada reçoivent l'anglais seul. | `checkout-worker/emails.ts:47` (`langFor`) | FR pour FR/BE/CH/LU/CA(QC) ou mail bilingue. |
| B1.4 | **Pas de mail de remboursement** et le Worker ignore `charge.refunded` (voir rapport 1, #33). | `checkout-worker/index.ts:430-455` | Traiter l'événement : mail + remise en stock + statut. |
| B1.5 | **Acceptation des CGV = simple texte** sous le bouton payer, pas de case à cocher (`custom_text.submit`). | `checkout-worker/index.ts:365-366` | Option Stripe `consent_collection[terms_of_service]=required` (URL des CGV à renseigner dans le tableau de bord Stripe). |
| B1.6 | **Prix : mention « TVA non applicable » uniquement dans les mentions légales**, rien près des prix ni au paiement. | `mentions-legales.html:3,9` ; fiches produit | Ajouter « TVA non applicable, art. 293 B / L.223-3… » (à faire confirmer : l'article cité, « L. 223-3 du CIBS », est inhabituel — la franchise en base est le **293 B du CGI** ; voir questions). |
| B1.7 | **Confidentialité incomplète** : ni base légale, ni transferts hors UE (Stripe, Resend, Cloudflare, GitHub = États-Unis), ni droit de réclamation CNIL, ni durée pour les e-mails ; **Instagram/Meta non cité** alors que son script est chargé. | `theme/pages/confidentialite.html:3,6` ; `theme/custom/head.html:1` | Compléter le texte (court) et revoir B2.3. |
| B1.8 | **Mentions légales : hébergeur = GitHub Pages** (adresse GitHub). Prévu à changer le jour J (ETAT point 2) ; vérifier aussi « Cloudflare » (Worker) et un éventuel autre hébergeur du domaine. | `mentions-legales.html:5,11` | Mettre à jour le jour J. |

### B2. Technique, SEO, vie privée

| # | Problème | Fichier : ligne | Correction |
|---|---|---|---|
| B2.1 | **Au lancement (`public: true`), seule `/suivi` garde `noindex`** : `/cart`, `/merci`, `/paiement-annule`, `/404`, `/contact` (redirection), `/category/all` et `/category/latest-drop` (doublons de `/products`) deviendraient indexables. | `generator/build.js:392` | Garder `noindex` sur les pages techniques ; `canonical` vers `/products` pour `all` ; à décider avant la bascule. (Je ne touche pas à cette logique.) |
| B2.2 | **`availability` du JSON-LD figée à la construction** (`quantity === 0`) : après la 1re vente, le stock réel (Worker) diminue mais la fiche Google dit toujours « InStock ». | `generator/build.js:383` | Faire reconstruire le catalogue à chaque vente (le Worker pourrait déclencher le build) ou retirer `availability` du JSON-LD jusqu'à synchronisation. |
| B2.3 | **`embed.js` d'Instagram chargé sur toutes les pages** (appel à Meta, IP du visiteur) alors que la vidéo n'est insérée qu'au clic. Impact vie privée + performance, non mentionné dans la confidentialité. | `theme/custom/head.html:1` ; `docs/index.html` (head) | Charger le script seulement au clic sur « play », ou le retirer si l'iframe suffit. |
| B2.4 | **`og:image` / `twitter:image` des fiches en chemin relatif** (`/shop/assets/…`) : les réseaux sociaux n'affichent pas l'aperçu (URL absolue exigée). L'accueil utilise un PNG de 988 Ko. | `generator/build.js:301,305` ; `docs/product/*/index.html:248,252` | URL absolue (`site_url` + chemin) et image WebP/JPEG ≈ 1200×630 de moins de 300 Ko. |
| B2.5 | **`lang="en"` sur toutes les pages**, y compris Confidentialité et Mentions légales (moitié français) ; `translate="no"` empêche le navigateur de traduire. Lecteurs d'écran et correcteurs lisent le français avec l'accent anglais. | `generator/build.js:354` | Garder `en` par défaut, mais marquer les blocs : `<div lang="fr">` autour de chaque partie française (`theme/pages/*.html`, fiches produit). |
| B2.6 | **Photos : alt peu utiles** : « Image 1 of CH_0002 », « Slideshow image 1 », vignettes `alt=""`. Les fiches `CH_0002`… n'ont pas de nom parlant. Une grille de 27 vignettes a `alt=""` (le nom est dans le lien, acceptable). | `theme/product.html:62` ; `theme/layout.html:238` | Alt = « {nom} — photo 1 (face / dos / détail) », champ « alt » par photo dans l'admin (rapport 1 #10). |
| B2.7 | **Poids des images de structure** : `cover.png` 1,77 Mo (1600×1600) = image principale de l'accueil (priorité haute) ; `logo.png` 424 Ko (1600×1200) chargé sur chaque page, même fichier en `srcset` 1x et 2x ; `bc/cover.png` 988 Ko ; `favicon.svg` 125 Ko. | `docs/assets/theme/` (sources : `assets/theme/`) ; `theme/layout.html:238` (slideshow), logo `layout.html` (srcset) | Convertir en WebP/AVIF (cover ≈ 150 Ko, logo ≈ 20 Ko), tailles réelles d'affichage, SVG optimisé. Gain estimé : ~2 Mo par première visite. |
| B2.8 | **`srcset` des grilles : PNG d'origine en dernière taille (960w)** : un écran large ou 2x charge le PNG (jusqu'à 900 Ko par vignette ; moyenne 360 Ko, 93 PNG, 34 Mo au total). | `docs/index.html:1852+` (généré par `generator/build.js`, `resize-images.js`) | Ajouter une taille WebP 1200 px et retirer le PNG du `srcset` (garder le PNG pour l'og:image seulement si besoin). |
| B2.9 | **`/status` public** : révèle les 7 premiers caractères de la clé Stripe (`sk_test`), le nombre de pièces, la dernière sauvegarde, et appelle l'API Stripe à chaque visite. | `checkout-worker/index.ts:205, 615-650` | Réserver à l'admin (jeton `Bearer`) ou réduire la sortie. |
| B2.10 | **`/checkout` sans limite** : un robot peut créer des sessions Stripe et **réserver tout le stock 32 min**, en boucle (blocage de vente). Seul `/track` est limité. | `checkout-worker/index.ts:307-337` (`reserve`), `:793-803` (`bump` n'est utilisé que pour le suivi) | Limite par IP (même mécanisme `bump`), plafond de réservations simultanées par IP, Turnstile (gratuit) si abus. |
| B2.11 | **Pays proposés à l'international : toute la liste Stripe**, y compris des destinations que Colissimo ne dessert pas ou sous sanctions (la liste contient notamment RU et BY) et des codes qui ne sont pas des pays à livrer (`ZZ`, `AC`, `TA`, `AQ`, `BV`). | `checkout-worker/index.ts:82-92` | Liste blanche des pays réellement livrés (UE, UK, CH, CA, US…). Décision à prendre avec le chantier frais d'envoi. |
| B2.12 | **Annulation d'une commande / remboursement ne remet pas la pièce unique en vente** (voir rapport 1 #33, #25). | `checkout-worker/index.ts` | Voir B1.4. |
| B2.13 | **Pas de pagination des commandes** (100 max) : au-delà, des commandes payées disparaissent de l'admin. | `checkout-worker/index.ts:701` | `starting_after` + cache KV. |
| B2.14 | **Panier et paiement partiellement en français seulement** : « Un instant… » (bouton), « (erreur) » dans le message d'échec, alors que l'interface est en anglais ; « Remove » reste en anglais seul. | `assets/vg-shop-cart.js:324, 359, 271` | Libellés bilingues, comme les autres messages (« EN / FR »). |
| B2.15 | **Titres et descriptions SEO génériques** : toutes les catégories partagent la même méta description ; fiches : `description` = les 300 premiers caractères de la fiche (anglais, sans ponctuation, ex. « White fleece neck warmer One size One-of-a-kind… »), `title` = « CH_0002 | vgthmind » sans type de pièce. | `generator/build.js:295-305` | Titre = « {nom} — {type}, pièce unique | vgthmind » ; description rédigée par pièce ou construite (type, matière, taille, « pièce unique faite main en France »), FR + EN. Champs dédiés dans l'admin. |
| B2.16 | **Noms de pièces peu parlants** : `CH_0002`, `SMA_0001`… dans les titres, le panier et les e-mails ; `Pantalon GP_0002  collection « VGTHM »` (double espace), `Pantalon rouge framboise ` (espace final). | `data/products/gp_0002.json:2`, `pantalon-rouge-framboise.json:2` | Nom = type + référence (« Hoodie customisé CH_0002 »), nettoyer les espaces. |
| B2.17 | **Frais de port incohérents d'une pièce à l'autre** : France 0 € (6 pièces de 85 à 315 €), 1,90 €, 2,35 €, 3,50 €, 4 €, 5 €, 5,35 €, 5,50 €, 5,70 € ; international de 1,90 € à 30 € (même gabarit, ex. hoodies 9 € ou 25 €, shorts SMA 8 € ou 30 €). Le panier prend le plus haut : une pièce « gratuite » accompagnée d'un hoodie à 25 € coûte 25 €. | `data/products/*.json` (`shipping_fr`, `shipping_intl`, lignes 20-30) | Chantier frais d'envoi : grille par catégorie/poids, jamais par fiche. |

---

## C. CONFORT

| # | Problème | Fichier : ligne | Correction |
|---|---|---|---|
| C1 | **Fautes dans les descriptions FR** : « Size M / S / L » à la place de « Taille » (12 fiches : ch_0002 à ch_0006, custom-hoodie, custom-tee-shirt-col-en-v, ja_0001, sa, sma_0001, sma_0003, sma_0004). | `data/products/<slug>.json:5` (ex. `ch_0002.json:5`) | « Taille M ». Le Worker lit déjà « Size » ou « Taille » pour les e-mails : aucun risque. |
| C2 | « **Epais** » sans accent (3 fiches). | `pantalon-dd001.json:5`, `pantalon-ff001.json:5`, `pantalon-vc001.json:5` | « Épais ». |
| C3 | « **Cotton bleu** » (FR) à la place de « Coton bleu ». | `data/products/sacoche.json:5` | « Coton bleu 100 % recouvert… ». |
| C4 | Ponctuation FR : « 100% coton/ Bord côte », « Tissu: », « 24à48h », « Stylisme/Modélisme: ». Espaces insécables avant `:` `%` `!` absents ; « 58cm » sans espace. | `custom-hoodie.json:5`, `sacoche.json:5`, `contact-914a3d.html:8`, `infos-conditions-generales.html:24-26` | Uniformiser (« 24 à 48 h », « 100 % coton »). |
| C5 | CGV FR : « venir poser vos questions **a** » (→ « à »), « moi même » (→ « moi-même »), « marques de **luxes** » (→ « luxe »), « confection de la gamme de montage » (obscur), phrase d'ouverture lourde (« dont le processus fonctionne entièrement en France »). | `infos-conditions-generales.html:21-26` | Réécrire (voir aussi A4). EN : « Feel free to come ask » ok. |
| C6 | CD : descriptions commençant par un tiret `-` ; « le cd » en minuscules. | `data/products/cd-vgtape.json:5` | Listes propres. |
| C7 | **Slugs incohérents** : `sa` (nom SMA_0002), `sacoche` (nom SC_0009), `short-coupe-évasée` (accent et nom « Short Collab Yazzart »), `contact-914a3d` (adresse héritée de BigCartel). Ton aide dit « sans accents ». | `data/products/sa.json`, `sacoche.json`, `short-coupe-évasée.json`, `generator/build.js:162` | Ne **pas** renommer sans redirection (liens existants, photos, reels). Prévoir un petit mécanisme `redirects` si tu veux nettoyer. |
| C8 | **Prix à décimales** : 210,70 € (DD001) ; CD à 8 € avec port 3,50 € / 4,50 €. | `data/products/pantalon-dd001.json:4` | Vérifier que c'est voulu. |
| C9 | **Tailles seulement dans le texte** (pas de champ) : l'e-mail les retrouve par expression régulière ; une fiche sans « Size/Taille » donne un e-mail sans taille. | `checkout-worker/index.ts:496` | Champ « Taille » dans l'admin (rapport 1 #5). |
| C10 | **Titres de page** : mélange FR/EN (« Cart | vgthmind », « Thank you », « Track my order » vs « Boutique — créations vgthmind », « Infos & conditions de vente »). H1 « Info & Terms » vs titre « Infos & conditions de vente ». | `generator/build.js` (pages techniques), `theme/pages/*` | Un seul format « {Nom FR} / {Nom EN} \| vgthmind ». |
| C11 | **Focus clavier retiré** sur les champs (remplacé par un changement de couleur de bordure). | `theme/custom/custom-css.css:358-361`, `theme/theme.css:3265` | Vérifier le contraste de la bordure ou remettre un `outline`. |
| C12 | **Contrastes non mesurés** (texte clair sur fonds colorés, `opacity:.55` sur les étapes du suivi). | `generator/build.js:102` (`.vg-track-steps li{opacity:.55}`) | Mesurer avec un outil (Lighthouse / axe), viser 4,5:1. |
| C13 | **Poids du dépôt** : PNG d'origine en double (`assets/` et `docs/assets/`, 34 Mo ×2), pack git ≈ 51 Mo ; chaque pièce ajoute ~4 Mo. | `assets/products/`, `docs/assets/products/` | Convertir les originaux en WebP/AVIF dès l'envoi. Studio photo (plan) : prévoir un format de sortie unique. |
| C14 | **Images de la page d'accueil et du logo sans dimensions explicites** (`width`/`height`) : risque de décalage de mise en page (CLS) ; `lazysizes` demande JS, aucun repli `<noscript>`. | `theme/layout.html` (logo, slideshow), `docs/index.html:1705,1765` | Ajouter `width`/`height` et un `<noscript>`. |

---

## D. Pages passées en revue (résumé)

| Page | État |
|---|---|
| Accueil, Produits, 7 catégories | Titres et canonical OK ; méta description identique sur les catégories (B2.15) ; lien interne OK. |
| 27 fiches | JSON-LD OK mais stock figé (B2.2) ; textes : C1–C6 ; og:image relatif (B2.4). |
| Panier | Fonctionne ; libellés partiels FR (B2.14) ; frais de port affichés (cohérents avec le Worker). |
| Merci / Paiement annulé / Suivi / 404 | Bilingues ; pas de canonical (voulu) mais indexables au lancement (B2.1). |
| Info & CGV | A3–A5, B1.1, C5. |
| Mentions légales | A1, A2, B1.6, B1.8. |
| Confidentialité | B1.7. |
| Studio / Contact | Textes propres ; C4 (« 24à48h ») ; lien Instagram identique partout. |
| E-mails (client, vendeur, expédiée) | B1.2, B1.3, B1.4 ; mise en page lisible, `alt` des photos présents. |

## E. Non vérifié

- Rendu visuel réel (aucune capture, comme demandé) : seuls débordements, tailles de cibles et de texte mesurés par script.
- Contrastes, lecteurs d'écran, navigation au clavier : à tester à la main (Lighthouse/axe).
- Vitesse mesurée (Lighthouse) : non lancée (l'environnement n'accède pas au site publié).
- Exactitude juridique : je signale des écarts probables ; seul un juriste ou la DGCCRF/CCI peut valider (A1, A4, A5, B1.6, B1.7).
- Le dépôt `vgthmind.github.io` (autre dépôt, hors périmètre) et la partie locale « suivi colis La Poste » (en pause) n'ont pas été examinés.

# 4 — Plan global du chantier restant

Rapport de nuit, lecture seule. S'appuie sur les rapports 1 (inventaire), 2 (audit), 3 (compta) et sur `ETAT.md`.
Tailles : **S** < 1 h · **M** ½ journée · **L** 1–2 jours · **XL** > 2 jours (travail assisté). Je ne fixe aucune date : je n'ai ni ton calendrier ni la date de renouvellement de BigCartel.

## 1. Les deux contraintes dures

1. **Inventaire (admin) fini avant de fermer BigCartel** : ce que tu coches dans le rapport 1 doit exister.
2. **Frais d'envoi finis avant de fermer BigCartel** : et, en plus, avant le **lancement public**, car les CGV annoncent aujourd'hui un calcul « selon le poids » qui n'existe pas (rapport 2, A3).

S'y ajoutent trois blocages « fermeture » que personne ne voit : dépendance de ton site au CDN BigCartel (A6), aux fichiers d'un autre dépôt (A7), et **l'historique des commandes / clients BigCartel à exporter avant fermeture** (conservation comptable 10 ans, voir §4).

## 2. Ordre conseillé

```
Phase 0  Décisions + démarches longues (toi)  ─────────────┐ en parallèle de tout le reste
Phase 1  Corrections rapides (textes, prénom, accents)     │
Phase 2  Frais d'envoi  ◀── bloque le lancement            │
Phase 3  Admin : ce que tu as coché (+ remboursements)     │
Phase 4  Paiement réel : coupon test, 1 € réel, domaine    ▼
Phase 5  Lancement public EN PARALLÈLE de BigCartel (BigCartel reste ouvert)
Phase 6  Compta automatique (dès les 1res ventes réelles) + trafic
Phase 7  Indépendance de BigCartel → sauvegarde → fermeture
(Studio photo : voie parallèle, voir phase S)
```

### Phase 0 — Décisions et démarches (toi ; aucune ligne de code) — à lancer tout de suite

| Tâche | Pourquoi maintenant | Délai probable |
|---|---|---|
| Cocher le rapport 1 (ce dont tu as besoin) | Dimensionne la phase 3 | 30 min |
| Répondre aux questions du §5 | Débloque 2, 3, 6 | 1 h |
| Choisir un **médiateur** de la consommation (A1) | Obligatoire avant vente à des particuliers | quelques jours (adhésion) |
| Obtenir l'**adresse de l'activité** (CCI, domiciliation) (A2) | Mentions légales | variable |
| Faire relire par un juriste : rétractation, « pièce personnalisée », CGV (A4, A5) | Les points sont déjà marqués « à faire valider » | 1 à 3 semaines |
| **Stripe** : lancer l'activation du compte réel (identité, IBAN) | Les vérifications peuvent durer | quelques jours |
| **BigCartel** : noter la date de renouvellement / facturation | Fixe la date limite de la phase 7 | 5 min |
| Exporter **commandes et clients BigCartel** (CSV) et les ranger | Obligation de conservation ; à faire avant tout risque | 30 min |

### Phase 1 — Corrections rapides de l'audit (S à M au total)

Sans risque, sans toucher au paiement : A8 (prénom), C1–C6 (accents, « Size/Taille », ponctuation), C5, B2.16 (noms), B2.14 (libellés du panier), B1.1 (tu/vous, après ton choix). Un seul lot, un seul `node generator/build.js`.

### Phase 2 — Frais d'envoi (M à L) — bloquant

1. **Décision de grille** (toi) : par poids, par catégorie de pièce, par zone ? (voir questions). Aujourd'hui : un tarif **par fiche**, le plus haut du panier gagne, 2 zones (rapport 2, B2.17).
2. Modèle dans le catalogue (ex. catégorie de colis → tarif par zone) + admin simplifié (une liste déroulante au lieu de deux nombres par fiche).
3. Worker : calcul du port + contrôle de la liste de pays (B2.11) + même calcul dans le panier (`assets/vg-shop-cart.js`).
4. Texte : CGV (A3, A4 : délais), page Merci, e-mails.
5. Tests : France / Belgique / Canada / hors UE, panier mixte, pièce gratuite + payante, code promo « livraison offerte » éventuel.

### Phase 3 — Admin : ce que tu as coché (M à XL selon les cases)

Ordre de priorité que je propose **dans ce que tu auras coché** :

1. **Remboursement complet** (événements Stripe, remise en stock, statut, mail) — rapport 1 #33–35 : **M**.
2. **Pagination des commandes** (> 100) + stats — #19, #45 : **M**.
3. **Export CSV** par période — #28, #47 + rapport 3 §3 : **M**.
4. Sauvegarde des statuts expédiée / préparation (#53) : **S**.
5. Catégories éditables, pages éditables, brouillons, alt par photo, SKU (#9, #50, #14, #10, #13) : **S à M** chacune.
6. **Variantes / tailles** (#5) : **seulement si tu en as besoin** (XL, touche fiche, panier, Stripe, e-mails, stock). À décider avant de commencer le reste, car cela change le modèle de données.

### Phase 4 — Paiement réel (M, surtout de ton côté)

Dans l'ordre de `ETAT.md` : coupon test + paiement test avec code → vérification de l'e-mail avec remise (B1.2) → Stripe live (clés, 1 € réel remboursé : bon test du remboursement de la phase 3) → `shop.vgthmind.org` (CNAME IONOS, **sans toucher à MX/SPF/DKIM**) → `ALLOWED_ORIGIN`, `SITE_BASE`, URLs de retour, vérification du domaine Apple Pay → `BASE_PATH=''`, `site_url`, `public:true` (ligne Hébergement des mentions légales, ETAT point 2). **Je ne touche à aucun de ces réglages** ; ce sont des étapes manuelles, à faire ensemble.

Avant `public:true`, passer la liste **« À noter pour le jour J »** du rapport 2 et décider B2.1 (pages techniques indexables).

### Phase 5 — Lancement public en parallèle de BigCartel

Les deux boutiques coexistent : le stock de pièces uniques doit être **retiré de l'une quand il est vendu sur l'autre**. Choisir une règle claire : soit les nouvelles pièces ne sont mises que sur la nouvelle boutique, soit les pièces vendues sur BigCartel sont mises à 0 à la main dans l'admin (page Stock). Durée de coexistence courte.

### Phase 6 — Compta et trafic

- **Compta** (rapport 3) : le pont Worker → Apps Script peut être développé et testé **dès la phase 3** (mode test Stripe) pour être prêt aux premières ventes réelles. Effort ≈ 2–3 jours.
- **Trafic** (après `public:true` seulement, sinon rien à indexer) :
  1. Google Search Console + sitemap, Bing Webmaster ;
  2. corrections SEO du rapport 2 : B2.2 (stock JSON-LD), B2.4 (og:image), B2.15 (titres/descriptions), B2.8 (poids des images → vitesse), B2.5 (`lang`) ;
  3. Google Merchant Center (fiches produit gratuites) — demande JSON-LD fiable + informations de livraison/retour ;
  4. Instagram : liens vers les fiches, tags produits, lien en bio vers la boutique ; redirections des anciennes URLs `vgthmind.bigcartel.com/product/...` ;
  5. mesure : Cloudflare Web Analytics (déjà là), objectifs de conversion.

### Phase S — Studio photo (voie parallèle, ne bloque rien)

Je n'ai aucune information sur ton « studio photo » (outil, local, format). Deux points d'interface avec le site :
- **Format de sortie** à fixer avant la production en série : WebP ou PNG détouré, ~1000–1200 px, < 150 Ko par photo (rapport 2, B2.7/B2.8/C13) ;
- **Texte alternatif** par photo (B2.6) : prévoir un champ dans le flux de travail.

### Phase 7 — Indépendance, sauvegarde, fermeture de BigCartel

À ne faire qu'après quelques ventes réelles sans incident sur la nouvelle boutique.

1. Rapatrier `theme.js`, `api.js` (A6), l'image du CD, les 18 reels et l'icône panier (A7) dans le dépôt.
2. Redirections des anciennes URLs de produit (si le domaine principal pointe vers la nouvelle boutique).
3. Vérifier que **plus aucune requête** ne part vers `assets.bigcartel.com` (un seul contrôle sur les pages générées).
4. Export final BigCartel : commandes, clients, produits, factures/relevés ; archive hors ligne.
5. Dernière vérification des **remboursements en cours** et des commandes non expédiées.
6. Fermer le compte **après** la date où tu n'as plus besoin de ses données.

## 3. Récapitulatif des tailles

| Phase | Taille | Dépend de |
|---|---|---|
| 0 Décisions / démarches | toi | — |
| 1 Corrections rapides | S–M | tu/vous (question) |
| 2 Frais d'envoi | M–L | décision de grille |
| 3 Admin | M–XL | cases cochées |
| 4 Paiement réel | M | 0 (Stripe, médiateur, adresse), 2, 3 (remboursement) |
| 5 Lancement parallèle | S | 4 |
| 6 Compta + trafic | L + M | 3 (remboursement), 5 |
| 7 Fermeture | M | 5 + délai de sécurité |

Chemin critique : **médiateur / adresse / juriste (0) + frais d'envoi (2) + remboursement (3) → 4 → 5**.

## 4. Pièges à garder en tête

- **Conservation** : les ventes faites sur BigCartel doivent rester accessibles 10 ans (exports archivés, pas seulement « dans BigCartel »).
- **Double vente** pendant la coexistence (pièces uniques) : règle claire (phase 5).
- **Aucune étape ne touche à `LIVE_MODE`, `noindex`, `robots.txt`, `public`** avant ton feu vert : ce sont des gestes de lancement, pas de développement.
- **Historique git public** : le prénom restera dans l'historique même une fois retiré du fichier (A8). Le nettoyer demande une réécriture d'historique : je ne le ferai jamais sans ton ordre explicite.
- **Un seul développeur, un seul compte GitHub** : activer le 2FA GitHub, c'est ce qui protège l'admin (rapport 1 #55).

## 5. Toutes mes questions, regroupées

### Inventaire / admin
1. Ne vendras-tu que des **pièces uniques**, ou aussi des **séries avec tailles** (merch, CD, tee) ? (décide si les variantes sont nécessaires)
2. Un bouton **Rembourser** dans ton admin, ou tu gardes Stripe pour cela ?
3. Un **reçu / une facture PDF** pour le client est-il voulu (Stripe peut envoyer un reçu) ?
4. **Newsletter** : oui ou non (consentement RGPD requis) ?
5. Besoin de **brouillons** invisibles, de **catégories éditables**, de **pages éditables** (CGV, Studio) depuis l'admin ?
6. **Commandes manuelles** (vente en direct / Instagram) : utile ?
7. Un **bon de livraison / étiquette** à imprimer ?
8. Veux-tu **cocher le rapport 1** ligne par ligne, ou je te propose une sélection minimale ?

### Frais d'envoi
9. Quelle **grille** : par poids, par type de pièce (haut / bas / accessoire), forfait par zone ? Avec combien de **zones** (France, UE, UK/Suisse, Canada, USA, reste du monde) ?
10. **Livraison offerte** au-delà d'un montant ? Pour la France ?
11. Quel **transporteur** et quels contrats (Colissimo, suivi, assurance, signature) ? Les tarifs réels que tu paies ?
12. **Délais de livraison** à annoncer, et délai de préparation ?
13. **Pays** à exclure (sanctions, Colissimo non desservi, risque douane) ? Les DROM-COM comme zone à part ?
14. Frais **de retour** : à ta charge ou à celle du client ?

### Légal / site
15. Quel **médiateur** ? Et l'**adresse** de l'activité pour les mentions légales ?
16. Qui valide les CGV (juriste ? CCI ? plateforme ?) et pour quand ?
17. La mention « **TVA non applicable, art. L. 223-3 du CIBS** » : est-ce celle indiquée par ton service des impôts (la franchise en base est classiquement l'art. 293 B du CGI) ?
18. **Tutoiement** partout sur le site et les mails, vouvoiement dans le juridique ?
19. Mails en **français** aussi pour Belgique, Suisse, Luxembourg, Canada ?
20. Les **pages techniques** (panier, merci, annulation, suivi) restent hors Google au lancement ?
21. Ok pour **rapatrier** dans ce dépôt les fichiers d'autres dépôts (reels, scripts) et copier `theme.js`/`api.js` de BigCartel ? (je ne le ferai pas sans ton accord)
22. Veux-tu que le **prénom** soit aussi retiré de l'historique git (réécriture d'historique, risquée), ou seulement du fichier actuel ?
23. **Noms de pièces** : garder `CH_0002`, `SMA_0001`… ou des noms parlants (« Hoodie customisé »…) ? Accord pour **renommer des slugs** avec redirections ?
24. **Instagram embed** : charger seulement au clic (privacy) ?

### Compta (détails dans le rapport 3, §5)
25. Structure de ton Sheet, code actuel d'Apps Script, préférence **push (A) ou pull (B)**.
26. Régime (micro, BIC/BNC, mensuel / trimestriel, versement libératoire) et règles port / remboursements / hors France / frais Stripe.
27. Ventes de **test** : ignorées ou dans un onglet à part ?

### Studio photo / trafic / calendrier
28. Qu'est-ce que le **studio photo** exactement (outil local ? génération ? détourage ? dépôt à part ?) et quelle sortie attends-tu ?
29. Formats et poids cibles des photos (WebP < 150 Ko ?) et **texte alternatif** : qui l'écrit ?
30. **Trafic** : quels canaux (Instagram, TikTok, YouTube déjà en pied de page, Google, publicité) et quel budget ?
31. Veux-tu **Google Merchant Center** (fiches gratuites sur Google Shopping) ?
32. Quelle est ta **date visée** de lancement public, et la **date de renouvellement BigCartel** ?
33. Coexistence BigCartel / nouvelle boutique : quelle règle pour les pièces uniques (nouvelle boutique seulement ? stock mis à 0 à la main ?) ?

---

### Proposition d'ETAT.md (5 lignes, non appliquée : tu m'as demandé de ne rien modifier hors `rapports-nuit/`)

```
Nuit du 2026-10-06 : 4 rapports dans rapports-nuit/ (branche nuit/audit, rien sur main, aucun code touché).
1 inventaire admin vs BigCartel (55 fonctions, à cocher) · 2 audit site (8 bloquants, 25 importants, 14 confort) · 3 compta (Worker → Apps Script + CSV) · 4 plan.
Chemin critique : médiateur + adresse + juriste, frais d'envoi, remboursements, puis Stripe live.
Toi : cocher le rapport 1, répondre aux 33 questions (rapport 4), choisir push/pull compta.
Ensuite : /clear, relire rapports-nuit/4-plan.md, décider de la phase 1.
```

# 1 — Inventaire : admin actuel vs admin BigCartel

Rapport de nuit (lecture seule, aucun code modifié). Base : branche `main`, fichiers `admin/`, `checkout-worker/`, `generator/`, `data/`.
Efforts : **S** = < 1 h · **M** = ½ journée · **L** = 1–2 jours · **XL** = > 2 jours. Estimations pour un développement assisté par Claude, hors temps de test et de validation côté Stripe/Cloudflare.
**Je ne décide rien** : la colonne « À toi » est vide, tu coches demain.

## A. Ce que fait l'admin actuel (3 pages + le Worker)

| Page / brique | Ce qu'elle fait | Fichiers |
|---|---|---|
| Pièces (Sveltia CMS, `admin/`) | Créer / modifier / retirer (archiver) une pièce : nom, slug, prix, description FR+EN, mots-clés de recherche, photos (ordre par glisser), catégories (multiples), « Latest Drop », quantité de départ, ports France / international, position, date. Chaque sauvegarde = un commit sur `main`, puis le site se reconstruit (1–2 min). | `admin/config.yml`, `data/products/*.json`, `.github/workflows/build-shop.yml` |
| Stock | Quantité réelle par pièce (Durable Object), « Sold out » à 0, réservation 30 min pendant un paiement, sauvegarde nocturne (180 j), sauvegarde manuelle, téléchargement, restauration depuis fichier. | `admin/stock.html`, `checkout-worker/index.ts` (`StockDO`, `/admin/stock`, `/admin/backup*`) |
| Commandes & stats | Liste des paiements (100 derniers) : nom, adresse, pièces, port, remise, total, test/réel ; filtres À expédier / Expédiées / Toutes / Stats ; recherche (VG-…, nom, e-mail) ; « en préparation » ; « expédiée » + n° de suivi ; e-mail « expédiée » FR+EN au client. Stats : commandes, CA, port, panier moyen, par mois, top pièces. | `admin/commandes.html`, `/orders*` du Worker |
| Paiement | Stripe Checkout, un seul tarif de port (le plus haut du panier, zone FR / international), codes promo Stripe, téléphone demandé, CGV acceptées, 150+ pays. | `checkout-worker/index.ts` `checkout()` |
| E-mails | Alerte vendeur + confirmation client (FR/EN selon pays) via Resend ; n° de commande court `VG-XXXXXX`. | `checkout-worker/emails.ts` |
| Suivi client | Page `/suivi` : n° VG + e-mail → statut (limitée à 15 essais / 15 min). | `generator/shop-pages/suivi.html`, `trackOrder()` |
| Connexion | OAuth GitHub, seul le compte `vgthmind` ; session signée 30 jours. | `vg-admin-auth.js`, `/auth`, `/callback` |
| Hors admin, dans Stripe | Paiements, remboursements, coupons / codes promo, rapports. | tableau de bord Stripe |

## B. Fonctions classiques de l'admin BigCartel

Légende : ✅ fait · 🟡 partiel · ❌ absent · ➖ sans objet pour ta boutique.

### Produits

| # | Fonction BigCartel | État | Détail / écart | Effort | À toi |
|---|---|---|---|---|---|
| 1 | Créer / modifier / supprimer un produit | ✅ | Sveltia. Le site met 1–2 min à se reconstruire (BigCartel : instantané). | — | ☐ |
| 2 | Archiver / masquer un produit | ✅ | Case « Retirée du site ». | — | ☐ |
| 3 | Prix, description, ordre d'affichage | ✅ | `position` à saisir à la main (pas de glisser-déposer des produits). | S (glisser) | ☐ |
| 4 | Prix barré / promotion sur un produit (« on sale ») | ❌ | Pas de champ `compare_at_price`, le Worker ne lit que `price`. | M | ☐ |
| 5 | **Options / tailles / variantes** (stock par taille) | ❌ | Aucune variante : chaque pièce est **unique** (une taille dans la description, ex. « Size EU42 »). `quantity` est un entier global. Les 27 fiches actuelles sont toutes des pièces uniques ou à quantité 0. Si tu veux un jour des séries avec tailles (merch, CD, tee), il faut un modèle `variants` : fiche, stock par variante, panier, Stripe, e-mails, suivi. | **XL** (L si limité à « taille + stock ») | ☐ |
| 6 | Quantité > 1 (petite série) | 🟡 | Géré par le Worker (`qty`) et le badge « Unique piece » disparaît, mais pas testé en réel ; aucune pièce n'a de série aujourd'hui. | S (test) | ☐ |
| 7 | Stock par produit, « Sold out » automatique | ✅ | Durable Object, atomique, réservation 30 min. Meilleur que BigCartel. | — | ☐ |
| 8 | Alerte stock bas | ❌ | Inutile pour des pièces uniques ; utile seulement avec des séries. | S | ☐ |
| 9 | Catégories (créer / renommer / affecter) | 🟡 | Affectation multiple ✅. Créer / renommer une catégorie = éditer `data/categories.json` **et** les options de `admin/config.yml` (liste en dur dans deux fichiers, non éditable depuis l'admin). | M (collection « Catégories » dans Sveltia + génération) | ☐ |
| 10 | Photos : envoi, ordre, suppression, texte alternatif | 🟡 | Envoi + ordre ✅. Pas de champ « alt » par photo (l'alt = nom de la pièce). Pas de contrôle automatique de poids/taille : tu dois fournir ~1000 px. | S (alt) / M (contrôle) | ☐ |
| 11 | Plusieurs photos par produit (jusqu'à 5+) | ✅ | Liste libre. | — | ☐ |
| 12 | Mots-clés / tags / recherche | ✅ | Champ « Mots-clés de recherche ». | — | ☐ |
| 13 | SKU / référence interne | 🟡 | Le slug (ex. `ch_0002`) fait office de référence ; pas de champ dédié. | S | ☐ |
| 14 | Produit en brouillon (non publié, prévisualisation) | ❌ | Seul « archivé » existe ; pas de brouillon visible uniquement de toi. | M | ☐ |
| 15 | Dupliquer un produit | ❌ | Sveltia a un bouton « Dupliquer » pour les entrées : à vérifier à l'usage. | S | ☐ |
| 16 | Import / export de produits CSV | ❌ | `data/products/*.json` est lisible, mais pas de CSV. Un import BigCartel a été fait une fois (`import-catalog.js`). | M | ☐ |
| 17 | Produits « mis en avant » | ✅ | Case « Latest Drop ». | — | ☐ |
| 18 | Précommande / « coming soon » | ❌ | | M | ☐ |

### Commandes

| # | Fonction | État | Détail | Effort | À toi |
|---|---|---|---|---|---|
| 19 | Liste des commandes, détail, recherche | 🟡 | ✅ mais **limité aux 100 derniers paiements** (`limit=100`, pas de pagination) et lecture directe de l'API Stripe à chaque affichage. Avec > 100 commandes, les anciennes disparaissent de la page. | M (pagination + cache KV) | ☐ |
| 20 | Statuts (nouvelle / en préparation / expédiée) | ✅ | Marqueurs en KV. Pas de « livrée » ni « annulée ». | S | ☐ |
| 21 | N° de suivi + e-mail d'expédition | ✅ | Le lien de suivi transporteur n'est pas automatique (suivi La Poste = chantier local en pause, non traité ici). | — | ☐ |
| 22 | Notes internes sur une commande | ❌ | | S | ☐ |
| 23 | Imprimer bordereau / bon de livraison / facture | ❌ | Pas de facture ni de reçu PDF. Stripe envoie un reçu si activé (à vérifier dans Stripe). Franchise de TVA (« TVA non applicable, art. L. 223-3 du CIBS » – mention à reprendre sur toute facture). | M (bon de livraison) / L (facture PDF numérotée) | ☐ |
| 24 | Modifier une commande (adresse, articles) | ❌ | À faire dans Stripe / par e-mail au client. | L | ☐ |
| 25 | Annuler une commande | ❌ | Rien ne remet la pièce en stock : voir remboursements. | M | ☐ |
| 26 | Commande manuelle (vente en direct / Instagram) | ❌ | Contournement possible : lien de paiement Stripe. Rien n'entre dans le stock ni la liste. | M | ☐ |
| 27 | Notification de nouvelle commande | ✅ | Alerte e-mail vendeur (Resend). | — | ☐ |
| 28 | Export CSV des commandes | ❌ | → voir rapport 3 (export par période). | M | ☐ |

### Clients

| # | Fonction | État | Détail | Effort | À toi |
|---|---|---|---|---|---|
| 29 | Liste clients, historique par client | ❌ | Les données de contact vivent dans Stripe (Clients) ; l'admin ne les agrège pas. Le Worker ne stocke pas de client. | M | ☐ |
| 30 | Export des e-mails (newsletter) | ❌ | Attention RGPD : consentement explicite requis, la page confidentialité ne mentionne pas de newsletter. | M + juridique | ☐ |
| 31 | Comptes clients / connexion | ➖ | BigCartel n'en propose pas non plus. | — | ☐ |
| 32 | Formulaire de contact | 🟡 | `/contact` redirige vers la page Contact (Instagram + e-mail). Le formulaire natif BigCartel n'existe plus. Pas de formulaire côté site. | M (formulaire → Worker → Resend) | ☐ |

### Remboursements, litiges

| # | Fonction | État | Détail | Effort | À toi |
|---|---|---|---|---|---|
| 33 | Rembourser (total / partiel) | 🟡 | Fait **dans Stripe** (AIDE.md). Le Worker ignore l'événement `charge.refunded` : l'admin « Commandes » ne montre pas l'état remboursé, **le stock n'est pas remis** (pièce unique restée « Sold out ») et rien ne remonte vers la compta. | M | ☐ |
| 34 | Bouton « Rembourser » dans l'admin | ❌ | Faisable via l'API Stripe `refunds` ; décision à prendre : garder Stripe comme seul endroit (plus sûr). | M | ☐ |
| 35 | E-mail client de remboursement | ❌ | | S | ☐ |
| 36 | Rétractation 14 jours / retours | ❌ | Process humain à écrire (voir audit, point CGV). | S (texte) | ☐ |
| 37 | Litiges / contestations | ➖ | Stripe (e-mails + tableau de bord). | — | ☐ |

### Promotions, livraison, taxes

| # | Fonction | État | Détail | Effort | À toi |
|---|---|---|---|---|---|
| 38 | Codes promo (%, montant, livraison offerte, limites, dates) | ✅ | Via Stripe (coupons + codes promotionnels). Champ affiché sur la page de paiement. Pas de gestion dans ton admin (lien Stripe). **Pas de test réel à ce jour** (ETAT.md : « coupon test à faire »). | S (test) | ☐ |
| 39 | Livraison offerte au-delà d'un montant | ❌ | | S–M | ☐ |
| 40 | Tarifs de livraison par zone | 🟡 | 2 zones seulement (FR / international, Canada inclus) ; un port **par pièce** (`shipping_fr`, `shipping_intl`), le panier paie le **plus haut** ; pas de tarif par poids, par pays (UE / hors UE / Canada / USA) ni par tranche de prix. C'est le chantier « frais d'envoi » (voir plan). | M à L selon le modèle choisi | ☐ |
| 41 | Retrait en main propre / retrait | ❌ | | S | ☐ |
| 42 | Taxes / TVA | ➖ | Franchise en base : aucune TVA calculée. À revoir si le CA dépasse le seuil. | — | ☐ |
| 43 | Droits de douane, pays exclus | 🟡 | Mention douane dans les mentions légales ; pays « ZZ »/autres inclus dans la liste Stripe (voir audit). | S | ☐ |
| 44 | Cartes cadeaux | ❌ | | L | ☐ |

### Statistiques, export, divers

| # | Fonction | État | Détail | Effort | À toi |
|---|---|---|---|---|---|
| 45 | Stats : ventes, CA, panier moyen, top produits | 🟡 | Onglet Stats ✅ mais calculé sur 100 commandes, test/réel séparés. | M (avec #19) | ☐ |
| 46 | Stats : visiteurs, sources, conversion | 🟡 | Cloudflare Web Analytics (hors admin). Pas de taux de conversion ni d'abandon de panier. | M | ☐ |
| 47 | Export CSV (produits, commandes, clients) | ❌ | Voir rapport 3. | M | ☐ |
| 48 | Domaine personnalisé, HTTPS | 🟡 | Prévu (`shop.vgthmind.org`, DNS IONOS) mais pas fait ; aujourd'hui GitHub Pages. | M | ☐ |
| 49 | Thème / design éditable | ✅ | Gabarits copiés du brouillon ; modifs = code. | — | ☐ |
| 50 | Pages éditables (CGV, Studio…) | ❌ | `theme/pages/*.html` = HTML dans le dépôt, non éditable via l'admin. | M (collection « Pages ») | ☐ |
| 51 | Intégrations (Google Analytics, Meta Pixel, Instagram) | 🟡 | Lien Instagram ✅ ; pas de pixel. | S | ☐ |
| 52 | Multi-devises / langues | 🟡 | EUR seul ; FR/EN par blocs de texte (description EN puis FR) et e-mails par pays. | — | ☐ |
| 53 | Sauvegarde des données | ✅ | Catalogue = git ; stock = sauvegarde nocturne ; commandes = Stripe. **Les statuts expédiée / préparation / n° de suivi sont uniquement en KV** (pas dans la sauvegarde `backup:*`) → à ajouter. | S | ☐ |
| 54 | Rôles / accès à plusieurs personnes | ❌ | Un seul compte GitHub autorisé (voulu). | M | ☐ |
| 55 | Sécurité admin (2FA) | 🟡 | Dépend du 2FA de ton compte GitHub (à activer s'il ne l'est pas). | S | ☐ |

## C. Les 5 écarts qui comptent le plus avant de fermer BigCartel (mon avis factuel, pas une décision)

1. **Remboursement** (#33) : stock non remis + invisible dans l'admin + compta.
2. **Commandes > 100** (#19, #45) : la page ne voit que les 100 derniers paiements.
3. **Frais d'envoi** (#40) : modèle actuel simpliste, à finir avant fermeture (déjà dans ton plan).
4. **Export CSV** (#28, #47) : indispensable pour le livre des recettes / URSSAF (rapport 3).
5. **Variantes** (#5) : seulement si tu comptes vendre autre chose que des pièces uniques (CD, merch).

## D. Questions pour toi (reprises dans le rapport 4)

- Vendras-tu des **séries avec tailles** (merch, CD) un jour, ou que des pièces uniques ?
- Un bouton **Rembourser** dans l'admin, ou tu gardes Stripe ?
- Une **facture / reçu PDF** pour le client est-il voulu ? (Stripe peut envoyer un reçu automatiquement.)
- **Newsletter** : oui / non ?

# Plan : un admin complet qui remplace BigCartel (avant avril 2027)

Phase plan seulement : rien modifié, rien commité (ce fichier est le seul ajout). Écrit en lisant tes outils (sans y toucher) et l'admin actuel.
Je n'ai recopié nulle part la clé secrète du script Google. Remarque sécurité en bas (§ Points d'attention).

---

## 1. Tableau : outil actuel → déjà dans l'admin → ce qui manque

| Outil actuel | Ce qui existe déjà dans l'admin vgthmind/shop | Ce qui manque |
|---|---|---|
| **Admin BigCartel** : commandes | `commandes.html` : paiements reçus, nom/adresse/pièces, « expédiée » + n° de suivi, e-mail « expédiée » FR/EN, export des ventes (`export.html`) | Recherche/filtre par statut, lien « rembourser » (Stripe), bouton « préparer la facture », voir le détail d'une commande en un clic. **À vérifier en pratique** : je n'ai pas ouvert la page en vrai, seulement lu son code et l'aide |
| Admin BigCartel : pièces | Édition via Sveltia (nom, slug, prix, description, photos, catégories, archivée, latest drop, quantité, ports) | Fiche avec **poids emballé + mode d'envoi + ports calculés** (Sveltia ne sait pas calculer) |
| Admin BigCartel : stock (0 = sold out) | `stock.html` : stock réel dans le Worker, à 0 = « Sold out », réservation 30 min, sauvegarde nocturne + restauration | Rien d'essentiel (juste : pas de bouton « sold out » manuel, mais mettre 0 fait pareil) |
| Admin BigCartel : codes promo | Pas d'écran. Les codes se créent dans Stripe, le champ apparaît seul au paiement | Plus tard : créer/voir les codes dans l'admin (via Stripe). En attendant, Stripe suffit |
| **Ajout Pièce BigCartel** (Python + Edge + détourage rembg) | `studio-photo.html` : détourage dans le navigateur, retouche, tailles, publication directe (photos + fiche) via GitHub | Le **formulaire** (titre, description, prix, quantité, catégories, couleur, pièce unique, reel) fusionné avec le studio en **une seule page** ; plus de Python, plus d'Edge, plus de BigCartel à piloter |
| **Frais de port** (calculateur Colissimo) | `shipping-calc.js` (zones, tranches, colis, port offert) + `shipping-config.json` (**chiffres d'exemple inventés**) + `expedition.html` (page de réglage) | Vrais tarifs Colissimo 2026, **poids par pièce**, mode colis/lettre, tarif lettre verte suivie, ports **enregistrés sur la pièce**, réglage « prix affiché » ; Worker non branché sur la grille |
| **Comptabilité** (Sheet « sales ») | `accounting.ts` écrit, testé, **non branché**, mais il envoie dans **un autre format** (signature HMAC, colonnes « Date / N° de pièce… ») qui **ne correspond pas** à ton script actuel | Réécrire l'envoi au format de ton script actuel (voir lot 5). `apps-script/compta.gs` à supprimer |
| **Facturation** (Facturier) | Rien (aucun lien) | Lien dans l'admin, bouton « préparer la facture » depuis une commande, anti-doublon compta |
| **Trafic** | `traffic.ts` + `traffic-core.js` + `trafic.html` (visiteurs en direct, pages, provenance, pays, appareil), sans cookie. **Non branché** ; un jeton Cloudflare Analytics existe aussi dans `shop-settings.json` | Brancher : balise sur les pages, route et Durable Object dans le Worker, texte de confidentialité |
| **Le Standard** | — | Voir § 4 |
| Offres et candidatures, Actualisation automatique | Hors sujet (hors vgthmind) | Rien, on n'y touche |

---

## 2. Plan en petits lots (dans l'ordre)

Légende : **Worker** = redéployer le Worker · **Secret** = ajouter un secret Cloudflare · **Toi** = action de ton côté.
Les lots sans Worker sont sans risque pour les ventes (site statique). Je ne rassemble pas les redéploiements : un lot = un test.

### Lot 1 : Grille de port Colissimo 2026 + calcul multi-pièces (code seul, testé)
- **Fait quoi** : remplace les chiffres inventés de `shipping-config.json` par les tranches Colissimo 2026 de ton calculateur (la tranche s'applique telle quelle, **plus d'interpolation**). Chaque pièce porte `poids_g` (emballé) + `mode` (`colis` / `lettre`). Le panier **additionne les poids** : ≤ limite lettre et tout en lettre → lettre ; sinon colis, tranche suivante si le poids passe un palier. Plusieurs colis si dépassement du poids max. Réglage « prix affiché » (3 modes : prix réel / marge en % / part incluse dans le prix de la pièce) **sans valeur par défaut**. Lettre verte : emplacement prévu, **vide** (je n'invente rien).
- **Worker** : non. **Secret** : non. **Toi** : me donner les infos lettre verte (questions 1-3).
- **Test** : `npm test` (j'ajoute des cas : 1 pièce 500 g → tranche 500 g ; 2 pièces 400+300 g → tranche 750 g ; lettre + colis mélangés ; pays hors zone). Je te montre un tableau « poids × zone » à comparer à ton calculateur.

### Lot 2 : Fiche pièce avec ports calculés (admin)
- **Fait quoi** : nouvelle page admin « Pièces » (liste + fiche). Tu saisis poids final emballé + mode ; la page affiche et **enregistre sur la pièce** le port de chaque zone (France, A, B, C, + autres selon la grille). Bouton « recalculer toutes les pièces » (les tarifs changent chaque janvier). Écrit `data/products/<slug>.json` par le même chemin GitHub que le studio photo. Sveltia reste en secours.
- **Worker** : non. **Secret** : non. **Toi** : aucune.
- **Test** : créer une pièce fictive, vérifier les ports affichés, enregistrer, voir le commit, voir la fiche publique reconstruite (1-2 min). Archiver la pièce de test.

### Lot 3 : Fusion « Ajout pièce » + studio photo (une seule page)
- **Fait quoi** : le formulaire d'Ajout Pièce (titre, description FR/EN, prix, quantité de départ, catégories, couleur, pièce unique, reel) et le studio (détourage, retouche, publication) dans un seul parcours : photos → détourage → fiche → ports (lot 2) → publier. Plus aucun pilotage de BigCartel.
- **Worker** : non. **Secret** : non. **Toi** : choisir ce que deviennent couleur/reel (question 11).
- **Test** : ajouter une pièce de bout en bout depuis le téléphone puis le PC ; vérifier photos, fiche, ports.

### Lot 4 : Panier et Worker sur la grille (le « lot Worker » déjà en attente)
- **Fait quoi** : le Worker calcule le port **lui-même** depuis les poids/modes des pièces (jamais confiance au navigateur), refuse les pays non livrés, utilise le sélecteur de pays déjà écrit (`vg-shipping-picker.js`). S'ajoute au reste du lot Worker déjà prévu (points 3, 5-9 du rapport 5). Les anciens champs `shipping_fr` / `shipping_intl` ne servent plus.
- **Worker** : **oui**. **Secret** : non. **Toi** : valider les vrais tarifs (lot 1), redéployer avec moi.
- **Test** : paiement Stripe **test** : 1 pièce France, 2 pièces France, 1 pièce Canada, pays refusé ; le port Stripe = le port affiché = le calcul admin. LIVE_MODE reste 0.

### Lot 5 : Comptabilité vers ton Sheet actuel (collection `sales`)
- **Fait quoi** : le Worker envoie chaque vente payée à ton script Google **tel qu'il est** (aucun changement côté Google, pas de nouveau Sheet). Format du script : une ligne `{ id, date, produit, category, canal, note, amount, source }` envoyée avec la clé dans le corps (c'est ce que fait Comptabilité aujourd'hui). Je propose : `id` = `site-VG-XXXXXX` (renvoyer la même ligne **met à jour**, pas de doublon), `category` = `vente`, `canal` = `Site`, `source` = valeur à confirmer (question 7). Pas de donnée client. File d'attente + rejeu déjà écrits, je les garde. Les ventes de test Stripe ne partent jamais (sauf `COMPTA_TEST=1`). Remboursement : ligne négative ou mise à jour de la vente (question 7).
- **Worker** : **oui**. **Secret** : **oui**, `COMPTA_URL` (adresse /exec) et `COMPTA_SECRET` (ta clé actuelle). **Tu les tapes toi-même** avec `wrangler secret put`, je ne les vois jamais. **Toi** : ajouter l'événement Stripe `refund.created` si on traite les remboursements.
- **Test** : en test avec `COMPTA_TEST=1` sur **une copie du Sheet** (ou en supprimant la ligne après) : 1 achat test → 1 ligne ; rejouer → toujours 1 ligne ; couper l'URL → file d'attente puis rejeu. Ensuite retirer `COMPTA_TEST`.

### Lot 6 : Commandes et stock au niveau de l'admin BigCartel
- **Fait quoi** : recherche/filtre des commandes, statut visible (à préparer / expédiée), détail d'une commande, lien Stripe pour rembourser, suivi (le suivi La Poste est « WIP » dans ETAT.md), à côté des codes promo : lien Stripe pour l'instant, écran dédié plus tard.
- **Worker** : probablement oui (petites routes de lecture). **Secret** : non. **Toi** : me dire ce qui te manque vraiment aujourd'hui sur la page Commandes (question 9).
- **Test** : sur des commandes de test, filtrer, ouvrir, marquer expédiée, envoyer l'e-mail.

### Lot 7 : Trafic en temps réel
- **Fait quoi** : brancher le module existant : balise `vg-traffic.js` sur toutes les pages (build), route `/t` et Durable Object `TrafficDO` dans le Worker (migration `wrangler.toml`), `trafic.html` déjà prête (compteur « en ce moment »). Texte de confidentialité fourni dans `rapports-nuit/trafic.md` à ajouter.
- **Worker** : **oui** (nouvelle migration de Durable Object, à faire en une seule fois). **Secret** : non. **Toi** : valider le texte de confidentialité ; décider du sort du jeton Cloudflare Analytics (question 10).
- **Test** : ouvrir le site dans 2 onglets → « visiteurs en ce moment » = 2 ; fermer un onglet → 1 après un court délai ; aucune IP ni cookie stockés.

### Lot 8 : Facturation
- **Fait quoi** : lien « Facturier » dans l'admin. **Facture depuis une commande : oui, c'est faisable.** Les données (client, adresse, lignes, port, total) sont dans le Worker (`/orders`). Mais le Facturier (artifact claude.ai) n'a aujourd'hui, à ma lecture, **pas d'entrée d'import**. Deux voies : (a) bouton « copier le récapitulatif » à coller à la main (zéro modification du Facturier) ; (b) petite modification du Facturier pour accepter un fichier/lien de commande (**je n'y touche pas sans ton accord**). Anti-doublon : le Facturier écrit lui aussi dans `sales` (`source: facturier`, `canal: Facturier`) : une facture faite pour une commande déjà envoyée par le site compterait **deux fois** le CA. Il faudra une règle (question 8).
- **Worker** : non pour (a). **Secret** : non. **Toi** : choisir (a) ou (b).
- **Test** : préparer une facture depuis une commande test ; vérifier qu'on ne compte pas la vente deux fois.

### Lot 9 : Le Standard et les raccourcis
- **Fait quoi** : voir § 4. Je te livre un `Le Standard.html` modifié **dans le dépôt** (copie à toi de remplacer sur le bureau), je ne touche pas à l'original.
- **Worker** : non. **Secret** : non. **Toi** : remplacer le fichier et les `.url`.
- **Test** : ouvrir chaque lien.

### Lot 10 : Fermeture de BigCartel (avant avril 2027)
- **Fait quoi** : liste de contrôle : export de l'historique (commandes, clients) depuis BigCartel pour archives, bascule Stripe en live (déjà prévue), DNS, vérifier que le Sheet reçoit bien les ventes réelles, **ne pas renouveler**.
- **Worker** : non. **Secret** : non. **Toi** : tout ce qui touche DNS/live/annulation.
- **Test** : une vraie commande de faible montant ; elle apparaît dans l'admin, le Sheet, le stock baisse.

---

## 3. Questions avant de commencer

**Lettre verte suivie (ne rien inventer, je te demande) :**
1. Tranches de poids (maximum en grammes) et **prix 2026 de chaque tranche**.
2. Limites de format/épaisseur (ex. épaisseur max) et poids maximum d'une lettre.
3. Valable pour quels pays ? (la lettre verte ne part normalement pas à l'étranger : que fait-on hors France, colis obligatoire ?)

**Colissimo :**
4. Mon seul tableau est celui de ton calculateur : France, zone A (UE + Suisse), B (Est hors UE, Maghreb, Norvège), C (reste du monde). Où classes-tu **Royaume-Uni, Canada, États-Unis**, et livres-tu les **DROM-COM** (je n'ai aucun tarif Outre-mer) ? Pays à bloquer ?
5. Le port Colissimo comprend-il le suivi/l'assurance que tu veux afficher dans les CGV ? Et l'emballage : le « poids final emballé » saisi sur la pièce suffit-il, ou j'ajoute un poids de carton quand plusieurs pièces partent ensemble (le fichier actuel en prévoit 80 g, inventé) ?

**Prix affiché au client :**
6. Réglage global ou aussi par pièce ? Et aujourd'hui, que veux-tu comme réglage de départ (réel, marge, part incluse) ? Je ne le fixe pas, le réglage restera « non choisi » tant que tu n'as pas décidé. Livraison offerte : on garde l'idée du seuil actuel (désactivé, chiffre d'exemple) ?

**Comptabilité :**
7. Je ne peux pas lire ton Sheet. Montre-moi **2 ou 3 lignes de ventes BigCartel** (date, produit, category, canal, note, amount, source ; rien de personnel) : valeur exacte de `source`, `amount` = pièces seul ou avec port, une ligne par commande ou par pièce, comment tu notais un remboursement. Dans tes fichiers, je vois seulement ce que fait le Facturier (`source: facturier`, `canal: Facturier`, `category: vente/bic/bnc`) et la liste de canaux de Comptabilité (« Site » existe déjà) ; la façon exacte dont BigCartel écrivait n'est **dans aucun fichier lu**.

**Facturation :**
8. Voie (a) copier-coller ou (b) j'ai le droit de modifier le Facturier (dans une copie du dépôt) pour l'import ? Pour le doublon : la vente reste comptée côté site et la facture est marquée « déjà comptée » ?

**Admin :**
9. Qu'utilises-tu vraiment dans l'admin BigCartel au quotidien (commandes) que tu ne retrouves pas dans `commandes.html` ?
10. Trafic : on garde Cloudflare Web Analytics (jeton déjà dans `shop-settings.json`) **et** le module maison, ou le module maison seul ?
11. Anciennes fiches : couleur, reel, « pièce unique » du formulaire d'Ajout Pièce : toujours utiles sur le nouveau site (les champs n'existent pas dans les fiches actuelles sauf `unique`) ?
12. Sveltia : je recommande une page « Pièces » maison (nécessaire pour calculer les ports et fusionner le studio), Sveltia gardé en secours jusqu'à validation. OK ?
13. Adresse finale du site (GitHub Pages ou domaine) : elle sert aux liens du Standard.

---

## 4. Le Standard : ce qu'il faudra changer

- « Boutique BigCartel » → lien du **nouveau site** (adresse finale, question 13).
- « Admin BigCartel » → **admin vgthmind/shop** (`/admin/`), avec ses raccourcis : Pièces, Studio photo, Commandes, Stock, Trafic.
- « Frais de port » (artifact) → **retirer** : intégré à la fiche pièce.
- « Comptabilité » : texte « Alimenté aussi par BigCartel et Facturier » → « par le site et Facturier ».
- Ajouter : Trafic (temps réel), lien Stripe (codes promo, remboursements).
- Garder « Facturier » ; « Offres et candidatures » reste dans le groupe à part.
- Hors Standard mais à nettoyer : `Admin BigCartel.url`, `Boutique BigCartel.url`, `Frais de port.url`, dossier `Ajout Piece BigCartel` (+ `Connexion BigCartel.bat`), `Ouvrir mes outils.html`, `outils-cloudflare/frais-de-port.html`.

---

## 5. Points d'attention

- **Clé du Sheet en clair** : la clé secrète du script Google est écrite en clair dans Comptabilité, Facturation (hors-ligne) **et dans les copies du dossier « Déploiement Cloudflare »**. Comme le script est ouvert à « Tout le monde » et protégé par cette seule clé, quiconque obtient ces fichiers peut lire/écrire ton Sheet. À terme : changer la clé (dans le script **et** dans les 3 outils) et ne plus déployer ces fichiers publiquement. À décider par toi, je n'y touche pas.
- Le module compta actuel du dépôt et `apps-script/compta.gs` partent d'un autre format que ton Sheet : on réécrit l'envoi (lot 5) et on supprime `compta.gs`.
- Les tarifs Colissimo changent chaque année : d'où « recalculer toutes les pièces » (lot 2).
- Rien de ceci ne modifie LIVE_MODE (reste 0).

---

## 6. Réponses de Jules (validation du plan) et décisions

Feu vert : lots 1, 2, 3 (sans Worker), un à la fois ; `npm test` après chaque lot, résultat montré, **ok de Jules avant de pousser**. Lots 4 à 10 en attente.

- **Lettre verte suivie** : tarifs officiels 2026 (laposte.fr), utilisée **pour la France seulement**. Hors France : colis. Une lettre suivie internationale existe chez La Poste mais coûte plus cher que Colissimo : non retenue.
- **Colissimo** : zones et tarifs officiels 2026 (sources dans `shipping-config.json`, champ `_sources`). Outre-mer prévus et **désactivés**. Pays bloqués : Russie, Biélorussie + destinations suspendues par La Poste.
- **Poids** : le poids saisi sur une pièce inclut son emballage ; plusieurs pièces = somme des poids, **pas de carton en plus**.
- **Prix affiché** : réglage global **non choisi** (décidé ailleurs), modifiable par pièce. Livraison offerte dès un seuil : prévue, **désactivée**.
- **Compta (lot 5)** : l'onglet `sales` ne contient que l'import historique BigCartel (une ligne par commande : `id = bigcartel-AAAA-MM-JJ-n`, `produit = Vente BigCartel`, `category = vente`, `canal = Site`, `note = Import historique Big Cartel`, `amount`, `source` vide). Pour le site, une ligne par commande payée : `id = site-VG-XXXXXX`, `date` = jour du paiement, `produit` = noms des pièces, `category = vente`, `canal = Site`, `note = Commande VG-XXXXXX`, `amount` = **total encaissé port compris**, `source = site`. Remboursement : **mise à jour de la même ligne** avec le montant réellement gardé (0 si total) et « remboursée » dans `note`.
- **Facturation (lot 8)** : voie (a) copier-coller. Une facture faite pour une commande du site **ne réécrit pas dans `sales`** (la vente reste comptée par le site).
- **Commandes (lot 6)** : tout automatisé et au même endroit : suivi de colis en temps réel (branche suivi-colis, quand La Poste aura validé l'API), détourage photo à l'ajout d'une pièce, calcul auto du port, le reste du plan.
- **Trafic (lot 7)** : on garde Cloudflare Web Analytics **et** le module maison.
- **Couleur / pièce unique / reel (lot 3)** : indispensables, à choisir à l'ajout d'une pièce, affichés tout seuls (pastille de couleur + badge « UNIQUE PIECE », vidéo reel). Écrits **dans les fiches de vgthmind/shop** (plus dans le dépôt portfolio) ; vérifier que les pièces existantes gardent pastille et badge.
- **Page « Pièces » maison** : OK, Sveltia en secours.
- **Adresse finale** : `vgthmind.org`, **même structure d'URL que BigCartel** (`/products/...`).

### Décisions du 2026-10-07 (conversation prix) : intégrées au lot 1
- Poids d'une pièce saisi **sans emballage** ; case « part seule » (trop volumineuse). Part seule = 1 colis (poids + carton 138 g) ; les autres partagent un colis (poids additionnés, un seul carton, nouveau colis au poids max de la zone). Lettre : enveloppe 20 g, 1 pièce max, France seulement. Carton et enveloppe modifiables (page Frais d'envoi).
- Prix payé par le client : France Colissimo offert (port intégré au prix des pièces) ; France lettre : 4 € ; UE : 1er colis (le plus lourd) 15 € puis vrai coût ; reste du monde : 29 € puis vrai coût. Réglage « par commande / par colis » et forfaits modifiables. Suisse, Royaume-Uni, Norvège… = palier « reste du monde » (hors UE).
- L'admin affiche coût réel / payé / écart (par commande, et par pièce et par zone via `quoteByZone`). Il signale quand le colis est moins cher que la lettre (`modeAdvice`).
- Outre-mer désactivés ; lettre internationale non activée ; États-Unis : règle du 17 sept. 2026 à vérifier (noté dans ETAT.md).
- Anciens outils de prix : « UE 2 kg 25,89 € » et « UE 1 kg 19,00 € / 5 kg 38,90 € » sont en réalité les tarifs **Outre-mer 1** ; la grille officielle donne UE 22,19 € (2 kg). « Hors UE 1 kg 37,30 € » ne correspond à aucune grille lue ; l'officiel zone C est 39,19 €.

# 3 — Lien avec ta compta (Google Sheet + Apps Script)

Rapport de nuit, lecture seule : **proposition**, rien n'est codé. Ton outil compta est séparé (hébergé à part, données dans un Google Sheet, Apps Script) : je n'y ai pas accès et n'ai rien supposé de sa structure (voir « Ce dont j'ai besoin »).
Aucun secret dans ce fichier : les URLs et clés iront dans les secrets Cloudflare (`wrangler secret put`), jamais dans le dépôt public.

## 1. Constat : ce que le Worker sait déjà

| Donnée voulue | Où elle est aujourd'hui | À ajouter |
|---|---|---|
| Date de paiement | `s.created` = date de **création** de la session (jusqu'à 32 min avant le paiement : une commande payée le 1er à 00:10 peut être comptée le 31) | Utiliser `charge.created` (date réelle du paiement) |
| N° `VG-XXXXXX` | `assignRef(env, session.id)` (stable, KV `ref:`/`sref:`) | — |
| Montant articles | `line_items[].amount_total` | — |
| Remise (code promo) | `total_details.amount_discount` (déjà lue par `/orders`) | La transmettre |
| Frais d'envoi | `shipping_cost.amount_total` | — |
| Total payé | `amount_total` | — |
| **Frais Stripe** | **non lus** | `payment_intent.latest_charge.balance_transaction` → `fee`, `net`, `fee_details` (un seul appel : `expand[]=payment_intent.latest_charge.balance_transaction`) |
| Pays | `shipping_details.address.country` | — (pays de **livraison** ; pays de la carte : `latest_charge.payment_method_details.card.country`, option) |
| Remboursement | **ignoré** (aucun événement `charge.refunded` / `refund.*` traité) | Écouter `refund.created` / `refund.updated` (+ `charge.refunded`) |
| Test / réel | `livemode` | N'envoyer que le réel (le test va dans un onglet « Test » ou est ignoré) |

Point d'accroche : `processPaid()` (`checkout-worker/index.ts:457`) est appelé à la fois par le webhook Stripe et par la page Merci (filet de sécurité) : **l'envoi compta doit être idempotent** (clé `compta:<session>` en KV, comme `mailed:<session>`).

## 2. Architecture recommandée (A) : le Worker pousse vers Apps Script

```
Stripe ──webhook──▶ Worker ──POST signé──▶ Apps Script (web app) ──▶ Google Sheet « Ventes »
                      │                          ▲
                      └─ KV : compta:<id> = envoyé │   cron nocturne : renvoi des échecs + contrôle
```

1. **Vente payée** (`checkout.session.completed` / `async_payment_succeeded`) : après `processPaid`, le Worker relit la session avec `expand[]=line_items&expand[]=payment_intent.latest_charge.balance_transaction`, construit **une ligne** et la poste en JSON.
2. **Remboursement** (`refund.created`, puis `refund.updated` quand `status=succeeded`) : le Worker retrouve la session (`GET /v1/checkout/sessions?payment_intent=pi_…`) donc le n° VG, et poste **une ligne de type « remboursement »** (montant négatif, id du remboursement, date, motif). Les frais Stripe d'origine **ne sont pas rendus** : à noter dans la ligne (colonne frais = 0 sur le remboursement).
3. **Litige** (optionnel) : `charge.dispute.created` / `.closed` → ligne « litige » (montant bloqué + frais de litige).
4. **Virements Stripe → banque** (optionnel) : `payout.paid` → onglet « Virements » pour le rapprochement bancaire.
5. **Fiabilité** : si Apps Script ne répond pas 200 (quota, panne), la ligne est gardée en KV (`compta:pending:<id>`) et rejouée par le cron de 03:30 (déjà en place pour le stock). Alerte e-mail (Resend, déjà configuré) si une ligne reste en échec > 24 h.
6. **Contrôle hebdomadaire** : le cron compare « nombre et somme des ventes Stripe de la semaine » à ce que le Sheet a reçu (réponse d'Apps Script) et t'écrit s'il y a un écart.

### Sécurité (dépôt public, donc tout ce qui est sensible est en secrets)

| Élément | Où | Remarque |
|---|---|---|
| URL du déploiement Apps Script | secret Worker `COMPTA_URL` | L'URL d'une web app « accessible à tous » est une adresse devinable seulement par fuite : traite-la comme un secret. |
| Clé partagée | secret Worker `COMPTA_SECRET` + propriété de script Apps Script | Apps Script **ne voit pas les en-têtes HTTP** : la signature est donc **dans le corps** (HMAC-SHA256 du JSON + horodatage ; rejet si > 5 min ; id déjà vu = ignoré). |
| Données personnelles | **non envoyées** | Pas de nom, pas d'adresse, pas d'e-mail : seulement n° VG, pays, montants. Minimise le RGPD (le Sheet n'a pas à contenir de données clients). |
| Droit du déploiement | « Exécuter en tant que : moi », « Accès : tout le monde » (obligatoire pour qu'un serveur l'appelle) | C'est pour cela que la signature est indispensable. |
| Redirection Apps Script | le `POST` répond par une redirection 302 vers `script.googleusercontent.com` | `fetch` du Worker suit la redirection ; le script ne s'exécute qu'**une fois** (comportement connu), mais l'idempotence reste nécessaire. |

### Colonnes proposées (onglet « Ventes »)

| Col. | Contenu | Exemple |
|---|---|---|
| A | `id_stripe` (clé unique : `cs_…` ou `re_…`) | `cs_live_a1…` |
| B | Date paiement (Europe/Paris, ISO) | `2026-11-03 14:22` |
| C | Type | `vente` / `remboursement` / `litige` |
| D | N° commande | `VG-K7M4QX` |
| E | Montant articles (avant remise) | `170,00` |
| F | Remise code promo | `-17,00` |
| G | Frais d'envoi facturés | `5,00` |
| H | **Total encaissé** (E+F+G) | `158,00` |
| I | Frais Stripe | `2,63` |
| J | Net reçu de Stripe (H − I) | `155,37` |
| K | Pays de livraison (ISO) | `FR` |
| L | Pièces (noms séparés par « ; ») | `Pantalon denim bleu` |
| M | Mode | `live` (`test` → onglet séparé) |
| N | Remboursement lié | `re_…` (partiel/total) |
| O | Note (code promo utilisé, motif de remboursement) | |

Les remboursements sont des **lignes négatives** distinctes (jamais une modification de la ligne d'origine) : l'historique reste auditable.

### Code à écrire (esquisse, sans secret)

- **Worker** : `sendCompta(env, row)` ≈ 40 lignes (construire la ligne, signer, `fetch`, marquer KV) ; extension de `processPaid` (2 lignes) ; deux nouveaux types d'événements dans `webhook()` (`refund.*`) ; reprise dans le cron ; lecture des frais via `expand`.
- **Apps Script** : `doPost(e)` ≈ 40 lignes : vérifier la signature et l'horodatage, chercher `id_stripe` dans la colonne A (doublon = répondre « déjà reçu »), `appendRow`, renvoyer `{ok:true, total_semaine}`. Prévoir un `LockService` (deux webhooks simultanés).

### Alternatives écartées ou possibles

| Option | Avantage | Inconvénient | Avis |
|---|---|---|---|
| **A. Worker → Apps Script** (recommandée) | Temps réel, aucun outil tiers, tu gardes la main | Un endpoint Google « public » à protéger par signature | ✅ |
| B. Apps Script **tire** les données (déclencheur horaire, appelle `GET /admin/export.json` du Worker avec un jeton) | Aucun endpoint public côté Google | Délai (≤ 1 h), jeton admin stocké dans Apps Script | Bonne alternative si tu refuses un endpoint public |
| C. Stripe → Zapier/Make → Sheet | Sans code | Payant, copie de données chez un tiers, pas de n° VG | ❌ |
| D. Export CSV mensuel + import à la main | Zéro risque technique | Oublis, erreurs de recopie | À garder en **secours** (voir §3) |

## 3. Export CSV des ventes par période (livre des recettes, URSSAF)

À mettre dans l'admin, page **Commandes & stats** : un bloc « Export compta » avec :

- **Période** : Mois (sélecteur mois/année), Trimestre (T1–T4 + année), Année, ou **dates libres**.
- **Boutons** : « Télécharger les recettes (CSV) », « Télécharger les frais Stripe (CSV) », « Synthèse de la période (CSV) ».
- **Mécanisme** : route admin `GET /admin/export.csv?from=2026-01-01&to=2026-03-31&type=recettes` (même jeton `Bearer` que le reste de l'admin) ; le Worker lit Stripe avec pagination (`starting_after`), filtre `livemode` (réel seulement, option « inclure le test »), et renvoie le fichier. Le navigateur le télécharge via `fetch` + blob (le jeton ne passe jamais dans l'URL).
- **Option** : conserver un **registre des ventes** dans le Worker (KV ou Durable Object) alimenté à chaque vente : l'export marche même si Stripe est indisponible et n'est pas limité par la pagination de l'API.

### Format

CSV **UTF-8 avec BOM**, séparateur **point-virgule**, **virgule décimale**, dates `JJ/MM/AAAA`, une ligne par mouvement, pas de formule, ouvrable tel quel dans Excel / Sheets en France.

**Recettes (livre des recettes)** :

| Colonne | Contenu |
|---|---|
| Date | date d'encaissement (paiement) |
| N° pièce | `VG-XXXXXX` (ou `re_…` pour un remboursement, avec renvoi au VG) |
| Nature | « Vente de marchandises » (à confirmer, voir questions) |
| Client | pays seulement (pas de nom) |
| Mode de règlement | « Carte bancaire (Stripe) » |
| Montant encaissé | total payé, port compris, **négatif** pour un remboursement |
| dont articles | |
| dont frais de port | |
| Remise | |
| Observations | code promo, remboursement partiel, etc. |

**Frais Stripe** : date, VG, frais, net, virement Stripe de rattachement (`po_…`, date de virement) : utile pour la comptabilité et le rapprochement bancaire (en micro-entreprise ils ne se déduisent pas, mais tu veux les voir).

**Synthèse** : une ligne par mois de la période : nombre de ventes, recettes brutes, remboursements, **recettes nettes (le chiffre à déclarer à l'URSSAF)**, port, frais Stripe, ventilation par pays (France / UE / hors UE).

### Règles à confirmer avec toi (et au besoin ton comptable / l'URSSAF)

- Le chiffre d'affaires déclaré est le montant **encaissé**, port compris, **avant** frais Stripe (je ne tranche pas : à vérifier).
- Un remboursement vient en **négatif sur la période où il est fait** (alternative : annuler la vente d'origine).
- Les ventes **hors France** sont-elles à isoler (export, DROM-COM : Guadeloupe, Réunion… sont dans la liste « International » du Worker) ?
- Franchise en base de TVA : aucune TVA à ventiler ; la mention légale (« art. L. 223-3 du CIBS ») est à revérifier (voir rapport 2, B1.6).

## 4. Effort et ordre

| # | Tâche | Effort |
|---|---|---|
| 1 | Lire les frais Stripe + date de paiement dans une fonction « ligne de vente » commune | S |
| 2 | Worker → Apps Script (signature, idempotence, reprise nocturne) + `doPost` | M |
| 3 | Remboursements (événements, lignes négatives, mail client, remise en stock : voir rapport 1 #33) | M |
| 4 | Export CSV recettes + frais + synthèse, boutons dans l'admin | M |
| 5 | Contrôle hebdomadaire automatique + alerte | S |
| 6 | Virements / litiges (optionnel) | S–M |
| 7 | Test complet en mode test Stripe (vente, remboursement partiel et total, code promo, doublon d'événement, Apps Script en panne) | M |

Total : environ 2 à 3 jours de travail assisté, plus ta validation du format côté compta.

## 5. Ce dont j'ai besoin de ta part

1. **La structure actuelle de ton Sheet** : noms d'onglets et en-têtes de colonnes (je m'y adapte plutôt que d'en imposer une nouvelle). Aucune donnée personnelle ni montant réel nécessaire.
2. Le **code actuel de ton Apps Script** (ou au moins : y a-t-il déjà un `doPost` / un déploiement web ?). Pas de clé ni d'URL dans le chat ni dans le dépôt.
3. **Qui crée le déploiement Apps Script** (moi en proposant le code, toi en le collant) et ta préférence entre **A (push)** et **B (pull)**.
4. Ton **régime** : micro-entreprise ? BIC vente de marchandises ou autre catégorie ? déclaration **mensuelle ou trimestrielle** ? versement libératoire de l'impôt ?
5. Ta règle pour : le **port** (inclus dans le CA ?), les **remboursements**, les **ventes hors France**, les **frais Stripe** (ligne de dépense à part ?).
6. Les **colonnes dont tu as besoin pour le livre des recettes** (modèle URSSAF ou ton propre modèle) et si tu veux aussi un **registre des achats** (autre sujet).
7. L'**adresse du dépôt de ta compta** si le code est sur GitHub (privé : ajoute-le à la session) ; sinon rien.
8. Ta décision sur le **jour de la bascule** : les ventes de test doivent-elles être ignorées ou aller dans un onglet « Test » ?

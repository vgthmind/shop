# Lancement de vgthmind : ce que TU fais, étape par étape (débutant)

Écrit le 2026-10-19. Rien de ce document n'est exécuté : le site reste en **mode test** jusqu'à ton feu vert. Détail technique et retour arrière : `CHECKLIST-BASCULE.md`, `BASCULE.md` §1, `BASCULE-JOUR-J.md`.
Règle : Claude ne déploie le Worker et ne pousse le site qu'après ton « OK » écrit dans le chat, à chaque fois. **Tu ne me donnes jamais une clé** : tu les colles toi-même dans le tableau de bord Cloudflare.

## Les mots à connaître
- **Secret du Worker** : une clé que Cloudflare garde cachée ; tu la poses dans le tableau de bord Cloudflare (partie B, étape 6), sans terminal.
- **Cloudflare est déjà connecté sur ce PC** (compte vgthm66@gmail.com) : tu n'as PAS à refaire `wrangler login`. Si un jour une commande répond « not authenticated » : tape `npx wrangler@4 login`, une page s'ouvre, clique « Allow ».

## ORDRE EXACT DU JOUR J (mis à jour le 2026-10-19 ; le détail de chaque étape est plus bas)
Rien n'a été basculé : site et Worker restent en test (LIVE_MODE 0). Chaque déploiement / `git push` = ton « OK » écrit dans le chat, à chaque fois.

| # | Qui | Quoi |
|---|---|---|
| A | **Claude**, puis **toi** | **Mode d'accès au site (nouveau, codé le 2026-10-19, pas encore déployé)** : à déployer EN PREMIER, avant la bascule. Sur ton OK écrit : (1) Worker (`/access`, `/admin/access`), (2) `git push` de `main` (Function `functions/_middleware.js` + écran « Entrer » + page admin). Puis `node outils/verifier-site.mjs https://vgthmind-shop.pages.dev --prive` (doit dire « mode d'accès : ouvert » et « en-têtes de sécurité présents »). **Toi** : admin > Réglages > Accès au site, essaie les 3 positions depuis l'iPhone (Fermé : bouton grisé ; Par code : champ ; Ouvert), puis remets **Ouvert**. |
| 0 | **Toi** (la veille ou le matin) | IONOS : ligne `www`, TTL = **300 s** (le TTL n'a PAS encore été changé : Claude n'était pas connecté à IONOS). 5 min avant la bascule au moins. Capture d'écran de toute la liste DNS avant. |
| 1 | **Toi** | Partie B Stripe : clé restreinte `rk_live_…` (avec Refunds) + webhook `whsec_…`, posés **toi-même** dans Cloudflare (Variables et secrets du Worker `vgthmind-shop-checkout`). Puis tu écris « clés live posées ». ⚠ Le compte Stripe affiché est « Site vgthmind » **relié à Big Cartel** : si Développeurs > Clés API ne te laisse pas créer de clé restreinte, dis-le-moi avant d'aller plus loin. |
| 2 | **Toi** | Ménage des données de test : Stripe > « Mode test » > Développeurs > « Supprimer toutes les données de test ». Moi (si tu es connecté à l'admin dans le navigateur) : `node outils/menage-donnees-test.mjs --avant=<date> --kv` (aperçu SUPPRIMÉ / GARDÉ, puis `--apply` sur ton OK). |
| 3 | **Claude** | `node outils/preparer-bascule.mjs --live-seul --apply`, `npm test`, puis **je te demande l'OK** et je déploie le Worker. Le site reste en test. |
| 4 | **Toi** | Essai à 1 € sur `vgthmind-shop.pages.dev` avec ta vraie carte (puis Apple Pay iPhone), puis remboursement dans l'admin (Commandes > « Rembourser… »). Tu me dis « essai fait ». **Claude** : je vérifie stock, mails, remboursement. |
| 5 | **Toi** | Cloudflare > Pages > vgthmind-shop > Custom domains > `www.vgthmind.org`, puis IONOS : `www` CNAME `vgthmind-shop.pages.dev`. Attendre « Active ». Tu me dis « domaine actif ». |
| 5b | **Toi** (lancement en douceur, facultatif) | Avant de dire « domaine actif », mets le site sur **Accès par code** (admin > Réglages > Accès au site, depuis l'iPhone) : le public qui arrive sur `www.vgthmind.org` ne voit que l'écran « Entrer » + champ du code, tes proches entrent avec le code. Quand tu veux lancer pour de bon : **Ouvert**. En cas de souci : **Fermé** (effet en quelques secondes ; déconnecte ceux qui sont entrés par code). |
| 6 | **Claude** | **D'abord remettre `bascule-prete-v2` à jour** avec les derniers commits de `main` (elle date du 2026-10-19 : `git merge main` dessus, build + tests, jamais de push sans ton OK). Puis : `node outils/preparer-bascule.mjs --live --apply`, `npm run build`, `npm test` (321 tests OK avec la bascule appliquée, vérifié le 2026-10-19), puis **OK de vgthmind** : Worker, puis `git push` du site (**chacun après ton OK**). |
| 7 | **Claude** | `node outils/verifier-site.mjs https://www.vgthmind.org` (doit finir par « Tout est bon »). |
| 8 | **Toi** | Mails de test vers `contact@` et `commande@`, test iPhone (lien Instagram compris), reconnexion à l'admin sur `www.vgthmind.org`. |
| 9 | **Toi** puis **Claude** | Search Console (`www.vgthmind.org` + `sitemap.xml`) ; IONOS : TTL `www` remis à 1 h ; je supprime la branche distante `bascule-prete` (sur ton OK). |

Notes techniques (2026-10-19) :
- **Mode d'accès** : réglage dans KV (Worker), lu par la Function Pages à chaque page (cache 5 s). Toujours accessibles même fermé : admin et connexion, suivi par lien secret (`/demande/?id=…&k=…`, `/suivi/`), retour Stripe (`/merci`, `/paiement-annule`), fichiers lus par le Worker (`/products.json`, `/site-config.json`), `/assets/*`. Le webhook Stripe et les mails parlent au Worker, jamais bloqués. Si le Worker est en panne, le site reste ouvert. **Fermé** bloque aussi côté Worker (503, message FR/EN) les nouveaux paiements panier (`/checkout`) et les nouvelles demandes (`/requests`) ; le webhook Stripe, l'acompte, le solde, le devis et le suivi des demandes déjà en cours (liens secrets) continuent. **Accès par code** ne bloque rien côté Worker : le code filtre les visites, pas les appels directs au Worker. Le code est gardé chiffré (non relisible, seulement remplaçable).
- On applique l'outil **sur `main`** (étape 3 puis 6). La branche locale `bascule-prete-v2` (commit 4f4dc41 = `main` + `preparer-bascule.mjs --apply` + build, LIVE_MODE 0) sert de contrôle : elle construit sans erreur, 321 tests OK. L'ancienne branche distante `bascule-prete` est périmée (101 commits de retard) : ne pas l'utiliser.
- Correctif : `tests/bascule.test.mjs` échouait dès que l'outil était appliqué (il lisait les vrais fichiers) ; il repart maintenant toujours de l'état de test.
- Une fois l'outil appliqué, `verifier-site.mjs` sur pages.dev doit s'utiliser avec `--prive`.
- Retour arrière avant poussée : `node outils/preparer-bascule.mjs --retour --apply`.

## A. Avant de lancer (tout est faisable aujourd'hui)
1. **Ménage des données de test** (je le fais, j'ai besoin de ta connexion) : ouvre le panneau « Browser » de l'application Claude, va sur `https://vgthmind-shop.pages.dev/admin/connexion`, touche « Se connecter avec GitHub » (ton compte), puis dis-moi « connecté ». Je lance l'aperçu, je te montre la liste « SUPPRIMÉ / GARDÉ », puis j'applique.
   Ensuite, **toi** : Stripe, bouton « Mode test » en haut, Développeurs, « Supprimer toutes les données de test » (je n'ai pas accès à ton Stripe).
2. **Prix** (tu décides, je ne touche à rien) :
   - Une pièce de la boutique : admin > Pièces > touche la photo > section « Prix et stock » > Prix > « Enregistrer ».
   - Les prix « à partir de » des demandes sur mesure (custom, sur-mesure), l'acompte, les délais : admin > Réglages > « Prix et délais » > « Enregistrer les réglages ».
   - Les frais de livraison : admin > Réglages > Livraison.
3. **Checklist iPhone** (voir la fin du message de Claude) : 10 minutes avec l'appli installée.

## Domaine : faire pointer vgthmind.org vers le nouveau site (IONOS, débutant)
Écrit le 2026-10-19. **Toi seul, chez IONOS : je ne touche à rien là-bas.** À faire le jour J (voir D, étape 3), pas avant : tant que tu ne changes pas la ligne `www`, BigCartel reste en ligne. Relevé DNS vérifié le 2026-10-19 depuis l'extérieur : `www` pointe toujours vers BigCartel, les MX sont ceux d'IONOS.

**On change UNE seule ligne** (`www`). Les adresses restent identiques (`/products`, `/product/…`, `/category/…`, `/contact`, `/cart` : le nouveau site les a toutes, voir `REDIRECTIONS.md`). Les mails (`contact@`, `commande@`) ne bougent pas : ils dépendent des lignes MX, qu'on ne touche pas.

### La veille (5 minutes)
1. ionos.fr, connecte-toi, **Domaines & SSL**, clique **vgthmind.org**.
2. Onglet **DNS**. **Fais une capture d'écran de toute la liste** (ta copie de secours) et envoie-la moi.
3. Ligne **`www`**, type **CNAME** (valeur `vgthmind.bigcartel.com`) : crayon, **TTL = 300 secondes**, Enregistrer. Ne change pas la valeur.

### Le matin du jour J (30 minutes)
1. **Cloudflare** (dash.cloudflare.com) : Workers & Pages > **vgthmind-shop** (le site, pas `vgthmind-shop-checkout`) > **Custom domains** > **Set up a custom domain** > `www.vgthmind.org` > **Continue**. Ne transfère pas le domaine chez Cloudflare.
2. **IONOS** > vgthmind.org > DNS, ligne à modifier :

   | Nom d'hôte | Type | Valeur actuelle | Nouvelle valeur |
   |---|---|---|---|
   | `www` | CNAME | `vgthmind.bigcartel.com` | **`vgthmind-shop.pages.dev`** |

   Crayon > remplace la valeur (sans `https://`, sans `/` final) > **Enregistrer**. Si IONOS refuse : supprime la ligne `www`, puis ajoute un CNAME `www` vers `vgthmind-shop.pages.dev`, TTL 300.
3. **Attendre** : Cloudflare > Custom domains, jusqu'à **Active** (2 à 30 minutes, certificat HTTPS).
4. **Vérifier** (tu me dis « domaine actif », je lance `node outils/verifier-site.mjs https://www.vgthmind.org`) :
   - `https://www.vgthmind.org/products` et une fiche `/product/…` s'ouvrent sur le nouveau site, avec le cadenas ;
   - **envoie-toi un mail de test** vers `contact@vgthmind.org` ET `commande@vgthmind.org` depuis une autre adresse : les deux doivent arriver ;
   - Resend > Domains : `vgthmind.org` reste **Verified** ;
   - `http://vgthmind.org/products` (sans www) : s'il t'envoie sur l'accueil et pas sur `/products`, dis-le-moi (la redirection d'IONOS ne garde peut-être pas le chemin ; on ajoutera une règle).

### Retour arrière (5 minutes)
IONOS, ligne `www` : remets `vgthmind.bigcartel.com`. BigCartel revient (TTL 300 s). Rien d'autre n'a changé.

### Les enregistrements à NE JAMAIS toucher
Si IONOS propose de « tout réinitialiser », de changer les serveurs de noms ou d'« optimiser » : **refuse**.

| Nom | Type | Rôle | Si tu y touches |
|---|---|---|---|
| `@` | **MX** `mx00.ionos.fr`, `mx01.ionos.fr` | Réception de `contact@`, `commande@` | Plus aucun mail reçu |
| `@` | **TXT** `v=spf1 include:_spf-eu.ionos.com ~all` | SPF : IONOS peut envoyer | Mails en spam |
| `@` | **A** `217.160.0.54`, **AAAA** `2001:8d8:100f:f000::200` | Redirige `vgthmind.org` vers `www` | Le domaine sans www ne s'ouvre plus |
| `send` | **MX** + **TXT** (amazonses.com) | Resend : retours d'envoi | Mails de commande en spam |
| `resend._domainkey` | **TXT** (longue clé `p=MIGf…`) | Resend : signature des confirmations de commande | Confirmations refusées |
| `s1-ionos._domainkey`, `s2-ionos._domainkey`, `s42582890._domainkey` | **CNAME** `*.dkim.ionos.com` | Signature DKIM IONOS | Mails IONOS en spam |
| `autodiscover` | **CNAME** `adsredir.ionos.info` | Réglage auto de la messagerie | Ajout du compte mail plus dur |
| `_dmarc` | **TXT** `v=DMARC1; p=none; rua=mailto:contact@vgthmind.org` | Anti-usurpation (déjà posé) | Perte de la surveillance |
| `_domainconnect`, `_dep_ws_mutex` | CNAME / TXT | Outils IONOS | Sans effet sur le site, laisse-les |

## B. Stripe en réel (15 minutes, toi seul)
1. Stripe : le compte doit être **activé** (identité, compte bancaire, SIRET). Tableau de bord > « Activer votre compte » si le bandeau est là.
2. Paramètres > Informations de l'entreprise : nom « vgthmind », libellé sur le relevé bancaire, e-mail de support contact@vgthmind.org.
3. Paramètres > Moyens de paiement : **Cartes, Apple Pay, Google Pay, Bancontact activés** (le Worker demande toujours carte + Bancontact : si Bancontact est coupé, la page de paiement ne s'ouvre pas).
4. Passe en **mode live** (désactive « Mode test » en haut à gauche), puis Développeurs > Clés API > « Créer une clé restreinte » : nom `vgthmind-worker-live`. Permissions : **Écriture** sur *Checkout Sessions*, *Coupons*, *Promotion Codes*, **Refunds** (remboursements depuis l'admin) ; **Lecture** sur *PaymentIntents*, *Charges*, *Products*, *Customers*, *Balance* (tout le reste : « Aucun »). Mis à jour le 2026-10-19 (Refunds et le devis ajoutés). Copie la clé `rk_live_…` (elle ne s'affiche qu'une fois).
5. Développeurs > Webhooks > « Ajouter un endpoint » : adresse `https://vgthmind-shop-checkout.vgthm66.workers.dev/webhook`, les 5 événements `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `payment_intent.payment_failed`, `checkout.session.async_payment_failed`. Copie le « secret de signature » `whsec_…`.
6. **Pose les deux clés dans Cloudflare (sans terminal)** :
   1. Va sur dash.cloudflare.com et connecte-toi.
   2. Menu de gauche : **Workers & Pages** (ou « Compute > Workers & Pages »). Clique sur le Worker **vgthmind-shop-checkout** (pas « vgthmind-shop », qui est le site).
   3. Onglet **Settings** (Paramètres), puis la section **Variables and Secrets** (Variables et secrets).
   4. Bouton **+ Add** (Ajouter). Type : choisis **Secret** (pas « Text »).
   5. **Variable name** : `STRIPE_SECRET_KEY` (exactement, majuscules et tiret bas). **Value** : colle la clé `rk_live_…`. Ne coche rien d'autre.
   6. Clique **Add** / **Save**, puis refais le bouton **+ Add** pour le 2e secret : nom `STRIPE_WEBHOOK_SECRET`, valeur = le `whsec_…` du webhook live.
   7. Clique **Deploy** (en haut ou en bas de la page) pour enregistrer. Les deux lignes doivent apparaître avec la mention « Secret » (valeur cachée).
   8. Écris-moi **« clés live posées »** (sans me les envoyer). Si tu avais déjà des secrets de test avec ces noms : clique le crayon à droite de la ligne et remplace la valeur ; ne crée pas de doublon.
   Les clés de test d'avant sont remplacées : jusqu'au passage en réel (étape D) le Worker refuse une clé live tant que `LIVE_MODE` vaut 0, donc rien ne bouge pour tes proches.

## C. Le nom de domaine (le matin du jour J, toi 30 minutes)
Pas-à-pas détaillé : section « Domaine » plus haut (avant la partie B). Seule la ligne `www` change.

## D. Le jour J avec Claude (dans cet ordre, je te guide)
1. Toi : tu me dis **« essai réel »** quand B est fait. Moi : `node outils/preparer-bascule.mjs --live-seul --apply` (le Worker passe en réel, le site reste de test), `npm test`. Moi : je déploie le Worker (ton OK écrit dans le chat d'abord).
2. Toi : essai à 1 € sur `vgthmind-shop.pages.dev` avec ta vraie carte (puis Apple Pay sur iPhone), puis remboursement dans l'admin (Commandes > la commande > « Rembourser… »). Je vérifie stock, mails, facture.
3. Toi : tu fais C (domaine). Moi : `node outils/preparer-bascule.mjs --live --apply` (site public, adresse www.vgthmind.org), `npm run build`, `npm test` ; puis Worker puis publication du site (`git push`), **chacun après ton OK**.
4. Moi : `node outils/verifier-site.mjs https://www.vgthmind.org` (doit finir par « Tout est bon »). Toi : test iPhone, lien Instagram compris.
5. Toi : te reconnecter à l'admin sur `www.vgthmind.org` (nouvelle adresse = nouvelle connexion).

## E. Après le lancement
- 48 h : regarde Stripe (paiements, webhooks en erreur) et ta boîte contact@.
- **Relecture juriste** (décision à toi, pas bloquante pour le lancement) : mentions légales et CGV, `chantier/CGV-A-VERIFIER.md` (médiateur, délai de rétractation, pays livrés), entreprise individuelle (EI) et ce qui figure sur tes factures, mention de TVA à adapter au 2027-01-01 (CIBS). Les factures sont faites par toi avec ton outil de facturation (le site n'envoie qu'une confirmation de commande) : aucune adresse de facturation n'est à saisir dans l'admin.
- Search Console : ajoute `www.vgthmind.org`, envoie `sitemap.xml`.
- IONOS : remets le TTL de `www` à 1 heure.
- Cloudflare Web Analytics : vérifie que le nouveau domaine est suivi.
- BigCartel : ne résilie pas avant 2 semaines ; exporte tes clients et commandes avant avril 2027.
- Plus tard : DMARC `_dmarc` (TXT `v=DMARC1; p=none; rua=mailto:contact@vgthmind.org`), puis `p=quarantine`.
- Je supprime la branche distante périmée `bascule-prete` (sur ton OK).
- **Après le lancement** : pastille de notification sur l'icône de l'appli iPhone (nécessite des notifications push, iOS 16.4+) : proposée une fois le site lancé.

## Retour arrière
Niveau 1 : clés de test remises + `LIVE_MODE = "0"` (je redéploie le Worker sur ton OK). Niveau 2 : IONOS, ligne `www` : remets `vgthmind.bigcartel.com` (BigCartel revient en 5 minutes). Niveau 3 : Cloudflare > Pages > Deployments > déploiement précédent > « Rollback ». Détail : `CHECKLIST-BASCULE.md`, phase 5.

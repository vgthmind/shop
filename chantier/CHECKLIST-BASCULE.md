# Checklist de bascule (version complète, relue le 2026-10-19) : ménage, Stripe live, domaine, mails, retour arrière

Rien de ce document n'est exécuté. Remplace la « CHECKLIST DE BASCULE » courte d'ETAT-DETAIL.md. Détails techniques : `BASCULE.md` §1 (Stripe), `BASCULE-JOUR-J.md` (domaine), `DNS-ACTUEL.md` (relevé DNS).
Règle : chaque étape « toi » est faite par vgthmind, chaque étape « moi » par Claude ; jamais de `wrangler deploy` ni de `git push` sans OK explicite, à chaque fois.

## Version de test EN LIGNE depuis le 2026-10-19 (la bascule part de cette version)
- Site : `https://vgthmind-shop.pages.dev` = commit b6f2cf7 (tâches 1 à 23 poussées). Worker : version **f3eed2a7-ddbc-45a1-a902-7116c6bd1154**, en mode test (`LIVE_MODE = "0"` : une clé Stripe live est refusée par le Worker, vérifié dans le code) ; la version d'avant est **59ce7672-9613-47ac-9593-a414b28a9501** (retour arrière du Worker : `cd checkout-worker` puis `npx wrangler@4 rollback 59ce7672-9613-47ac-9593-a414b28a9501`).
- Rien n'est branché sur vgthmind.org : BigCartel est intact, aucun DNS touché, site non public (bandeau « Version de test », noindex, robots Disallow).
- Vérifié en ligne le 2026-10-19 (375 et 1280 px) : 16 pages, 0 débordement, 0 image cassée ; accueil, liste, pièce unique, « Vendu », ancienne adresse -> bonne fiche, adresse inconnue -> /products ; panier (port et total au format français) ; page Stripe TEST ouverte (Carte, Apple Pay, Bancontact proposés, case « J'accepte les conditions de vente ») sans paiement ; formulaire « pièce sur demande » envoyé avec une photo ; admin : toute page /admin/*, y compris /admin/apercu/…, renvoie vers la connexion sans session ; `node outils/verifier-site.mjs https://vgthmind-shop.pages.dev --prive` : « Tout est bon ».
- NON vérifié en ligne (demande ta connexion GitHub, que Claude ne peut pas faire) : l'admin connecté (Commandes, Demandes, Réglages, Codes promo, champ Adresse, bouton Aperçu), le paiement complet avec une carte de test, Google Pay, et « Bientôt disponible » sur une vraie pièce (aucune pièce du catalogue n'est dans cet état).
- **Une demande d'essai « TEST Claude » (e-mail contact@vgthmind.org, avec 1 photo) est dans Demandes** : à ignorer, puis supprimée par le ménage de la phase 2 (ou Demandes > la demande > supprimer).
- Tant que la version de test est en ligne, tes proches peuvent payer avec la carte de test 4242 4242 4242 4242 (date future, CVC quelconque) : leurs commandes de test s'ajoutent à Commandes (badge « test ») et à ce que le ménage de la phase 2 nettoiera ; une pièce unique « achetée » en test passe « Vendu » jusqu'au ménage.

## Avant de commencer (débutant)
- **Terminal** : dans l'Explorateur Windows, ouvre le dossier `SITE\vgthmind-shop`, clic droit dans le vide > « Ouvrir dans le Terminal ». Toutes les commandes `node …`, `npm …` et `git …` de ce document se tapent là (une ligne, Entrée). Pour la partie Worker : `cd checkout-worker` d'abord.
- **« Aperçu »** : les outils `outils/preparer-bascule.mjs` et `outils/menage-donnees-test.mjs` n'écrivent et ne suppriment RIEN tant que tu n'ajoutes pas `--apply` à la fin de la commande. Tu peux donc les lancer autant de fois que tu veux pour voir. Ils annoncent en tête ce qu'ils vont faire.
- **« OK explicite »** : Claude ne déploie le Worker et ne pousse le site qu'après ton « OK » écrit dans le chat, à chaque fois. `Deployer-worker.bat` et `git push` sont les deux seuls gestes qui changent le site en ligne.
- **Où se trouve quoi** : site de test = `https://vgthmind-shop.pages.dev` ; admin = ce même site + `/admin/` ; boutique actuelle des clients = BigCartel (`www.vgthmind.org`), intouchée jusqu'à la phase 4 étape 3.
- Si une commande affiche une erreur que tu ne comprends pas : ne relance pas en boucle, copie-colle le message dans le chat.

## Phase 1 : dimanche, validation et déploiement de TEST
1. Dans le terminal : `npm test` (attendu : « fail 0 » ; quelques « skipped » sont normaux). Puis, après l'OK : double-clic sur `checkout-worker/Deployer-worker.bat` (Worker d'abord ; une page Cloudflare peut s'ouvrir : te connecter et « Autoriser » ; attendu à la fin : « Deployed »), puis `git push` (Claude le fait après ton OK) ; attendre 2 min la reconstruction Cloudflare (suivi : Cloudflare > Workers & Pages > vgthmind-shop > Deployments).
   **Le Worker a changé en local depuis le dernier déploiement** : `requests-core.ts` et `index.ts` (adresse de l'émetteur des factures lue dans les Réglages) et `wrangler.toml` (variable `INVOICE_SELLER_ADDRESS` retirée). Le déploiement du Worker est donc indispensable avant de tester le champ « Adresse » (un ancien Worker ignorerait l'adresse sans message d'erreur).
2. Suivre la « CHECKLIST DE TESTS POUR DIMANCHE » d'ETAT-DETAIL.md (PC puis iPhone), uniquement sur des commandes de TEST.
3. **Remplir l'adresse dans Réglages avant la première facture** : Demandes > Réglages > Facturation > Adresse, Enregistrer. Elle n'apparaît que sur les factures et avoirs (vérifier en ouvrant « Facture » d'une commande de TEST : « vgthmind, <adresse>, Vitry-sur-Seine, SIRET, contact@ », jamais de nom ni de prénom). Elle est gardée dans les données du site, pas dans le dépôt, et reste vide tant qu'elle n'est pas remplie.
4. Pièces masquées et programmées (nouveau comportement) : une pièce masquée n'a plus de fiche (son adresse renvoie vers /products, elle n'est ni listée, ni cherchable, ni dans le sitemap) ; une pièce programmée a une fiche « Bientôt disponible » sans bouton panier, et devient achetable à l'heure prévue (le site est reconstruit ~75 s avant). Une telle pièce restée dans un panier en est retirée (« Désolé, plus disponible : … »). Les pièces masquées n'ont donc plus d'aperçu public : à regarder une fois (Pièces > une pièce masquée > pas de lien « Voir sur le site »).
5. Codes promo : les codes désactivés, expirés ou épuisés sont dans une section repliée « Désactivés, expirés ou épuisés » sous les codes actifs.
6. En plus, à regarder : Codes promo (un code expiré s'affiche « expiré », un code épuisé « épuisé », sans bouton Réactiver) ; panier : sous-total, livraison et total au même format « 84,00 € » en français.

## Test local du Worker (sans rien déployer, déjà fait le 2026-10-19)
`node outils/worker-local.mjs` lance le vrai Worker en mémoire (faux Stripe test, faux Resend) ; fait le 2026-10-19 : panier > port > paiement (carte et Bancontact proposés) > webhook > mails (vendeur et client, réponses vers contact@) > page « Merci » > pièce unique « Vendu » et panier vidé ; formulaire « Proposer un projet » avec 2 photos > fichiers enregistrés > mails de confirmation et d'alerte. Pas testé : la page Stripe réelle (Bancontact, Apple Pay, Google Pay), faute de clé de test sur ce PC ; à voir à l'essai à 1 € de la phase 4.

## Phase 2 : ménage des données de test (après le dernier essai, AVANT Stripe live)
Outil : `node outils/menage-donnees-test.mjs` (aperçu par défaut : ne supprime rien tant que `--apply` n'est pas ajouté).
1. Noter le jour du dernier essai. `--avant` = le lendemain de ce jour (tout ce qui est plus ancien est du test ; une vraie demande reçue ensuite n'est jamais touchée).
2. Session admin : l'outil te la demande tout seul (« Colle ici la session admin… »). Pour l'obtenir : dans Chrome, admin ouvert et connecté, touche F12, onglet « Console » (si Chrome demande d'autoriser le collage, tape `allow pasting`), tape `copy(localStorage['vg-admin-session'])` + Entrée : elle est copiée, tu la colles dans le terminal. Elle donne accès à ton admin : ne la colle nulle part ailleurs, ferme le terminal ensuite.
3. Aperçu : `node outils/menage-donnees-test.mjs --avant=AAAA-MM-JJ --kv` (sans date, l'outil propose un exemple). Le `--kv` demande une connexion Cloudflare : une seule fois, `cd checkout-worker` puis `npx wrangler@4 login` (page Cloudflare > Autoriser). Si l'outil dit « session refusée », recopie la session (étape 2). Lire la liste « SUPPRIMÉ » / « GARDÉ ». Si quelque chose d'inattendu apparaît : ne rien lancer, me le montrer.
4. Si l'aperçu est juste : même commande + `--apply`.
5. Stripe, mode **Test** (bouton en haut), Développeurs, « Supprimer toutes les données de test » : efface les commandes, clients et codes promo de test.
6. Pièces de test : copier-coller les lignes `git rm …` affichées par l'aperçu, puis `npm run build`, `npm test`, commit local. (Pièces concernées aujourd'hui : `test` et `test-2`, déjà archivées.)
7. Relire à la main ce que l'outil ne touche pas : Demandes > Réglages (prix « à partir de », acompte, délais, photos des cartes), Expédition, Stock (chaque pièce = la bonne quantité).
8. Boîte contact@ (IONOS) : archiver les mails d'essai. Dans Studio : retirer les photos/vidéos d'essai.
9. Vérifier : Commandes vide, Demandes vide, Codes promo vide, Trafic à zéro (visites de test), Stock = quantités du catalogue.
SUPPRIMÉ : demandes créées avant `--avant` + leurs fichiers R2 ; lignes de stock modifiées par des ventes de test (retour à la quantité du catalogue) ; visites des jours de test ; dans KV : états expédiée/préparation/remboursée/numéros VG des commandes de test (`cs_test_…`), limites et connexions en cours, sauvegardes de commandes ; (à la main) commandes, clients et codes promo de test dans Stripe ; pièces de test du dépôt.
GARDÉ : pièces et photos (hors pièces de test), réglages (Demandes, délais, prix), grille d'expédition, drops programmés, sauvegardes du stock, sessions admin, commandes RÉELLES (`livemode`), compte Stripe, secrets du Worker.

## Phase 3 : préparatifs sans risque (les jours avant)
1. `npm audit` ; traiter `AUDIT.md` (GitHub App, en-têtes, Turnstile).
2. CGV relues par le juriste (`CGV-A-VERIFIER.md` : médiateur, TVA) ; mentions légales (seulement « vgthmind », Vitry-sur-Seine, SIRET) ; TVA « art. L. 223-3 du CIBS » à anticiper pour 2027-01-01.
3. Stripe (tableau de bord, mode live) :
   - compte activé ; informations de l'entreprise (nom « vgthmind », SIRET, libellé sur le relevé bancaire, e-mail de support contact@vgthmind.org) ; e-mails de reçu ;
   - Moyens de paiement : **Cartes ; Portefeuilles Apple Pay et Google Pay activés ; Bancontact activé**. Important : le Worker demande toujours `card` et `bancontact` (`PAYMENT_METHODS`) : si Bancontact n'est pas activé en live, la page de paiement ne s'ouvre pas du tout ;
   - Apple Pay et Google Pay : rien à enregistrer côté domaine (la page de paiement est hébergée par Stripe) ; ils s'affichent sur la carte selon l'appareil (Safari + carte dans Wallet ; Chrome + Google Pay) ;
   - clé restreinte `rk_live_…` (`BASCULE.md` §1.2 : écriture Checkout Sessions ; lecture PaymentIntents, Charges, Products, Customers ; écriture **Coupons** et **Promotion Codes**) ;
   - webhook live : adresse `https://vgthmind-shop-checkout.vgthm66.workers.dev/webhook`, 5 événements (`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `payment_intent.payment_failed`, `checkout.session.async_payment_failed`) ; copier le `whsec_…` (Bancontact est asynchrone : l'événement `async_payment_succeeded` est indispensable) ;
   - ne me donner aucune clé : dis seulement « clé live créée ».
4. Mails : Resend, Domains : `vgthmind.org` « Verified » ; `MAIL_FROM` = `vgthmind <commande@vgthmind.org>` (déjà dans `wrangler.toml`) ; les réponses des clients partent vers **contact@vgthmind.org** (en-tête reply-to dans le Worker) et le formulaire de contact arrive dans contact@ ; secret `ALERT_EMAIL` posé (alertes de commande) ; boîte contact@ testée (réception et réponse).
5. DNS (IONOS) : capture d'écran de la page DNS complète (`DNS-ACTUEL.md`), la veille TTL de la ligne `www` à 300 s. Ne jamais toucher MX, SPF, DKIM, `_dmarc`, `send`, `resend`, ni la ligne `@`.
6. Sauvegardes avant la bascule : admin > Commandes > « ⋯ Sauvegardes » > Sauvegarder maintenant, puis Télécharger ; Stock : sauvegarde ; Export compta ; `git tag avant-bascule` (local). **Noter l'id de version actuel du Worker** : `npx wrangler@4 deployments list` (dans `checkout-worker`).
7. Réglages prêts : `node outils/preparer-bascule.mjs` (aperçu des changements ; il refuse si `ALLOWED_ORIGIN` n'accepte pas le domaine). Rien n'est écrit avant `--apply`.
8. Une pièce « TEST 1 € » créée **visible** (pas masquée : une pièce masquée affiche sa fiche mais le paiement est refusé, le Worker ne lit que `products.json`), de préférence archivée juste après l'essai. Tant que `public` est `false`, le site reste hors Google.
9. Le bon moment : mardi ou mercredi matin, toi disponible 2 h, hors drop et hors promotion Instagram.

## Phase 4 : jour J (dans cet ordre)
1. **Stripe live sur le site encore en test** : toi, dans le terminal : `cd checkout-worker`, puis `npx wrangler@4 secret put STRIPE_SECRET_KEY` (le terminal demande la valeur : colle la clé `rk_live_…`, Entrée), puis `npx wrangler@4 secret put STRIPE_WEBHOOK_SECRET` (colle le `whsec_…` du webhook LIVE). Moi : `node outils/preparer-bascule.mjs --live-seul` (aperçu), puis avec `--apply` (LIVE_MODE = "1" seulement), `npm test` ; toi : `Deployer-worker.bat` (OK explicite). **À partir de là, la boutique de test n'accepte plus que de vraies cartes** : prévenir tes proches qu'ils ne peuvent plus tester jusqu'à un éventuel retour arrière (niveau 1).
2. **Essai réel à 1 €** sur `vgthmind-shop.pages.dev` avec ta vraie carte, puis remboursement : carte ; Apple Pay (iPhone) ; Google Pay (Android) si possible ; Bancontact (le bouton apparaît bien dans la page Stripe, l'essai réel seulement si tu as un compte belge). Vérifier : mail client reçu hors spam depuis commande@ (Gmail, « Afficher l'original » : SPF, DKIM, DMARC = PASS) ; répondre au mail : la réponse arrive dans contact@ ; mail vendeur ; commande dans l'admin (sans badge test) ; stock ; facture ; mail « expédiée » ; remboursement depuis l'admin ou Stripe. Archiver la pièce TEST 1 €.
   Si l'essai échoue : passer directement à « Retour arrière, niveau 1 ».
3. **Domaine** (`BASCULE-JOUR-J.md` étapes 1 à 3) : Cloudflare > Pages > vgthmind-shop > Custom domains > `www.vgthmind.org` ; IONOS : ligne `www` (CNAME) = `vgthmind-shop.pages.dev` ; attendre « Active » (HTTPS). L'ancienne boutique BigCartel reste visible pour une partie des visiteurs pendant ce temps.
   Sans www (`vgthmind.org/product/...`) : la redirection IONOS doit conserver le chemin (« avec le chemin / les sous-adresses »), sinon un ancien lien Instagram tomberait sur l'accueil.
4. **Site public** : moi : `node outils/preparer-bascule.mjs --live` (aperçu : vérifier « BASCULE COMPLÈTE » et les 4 lignes changées), puis la même commande avec `--apply` (public true, `site_url` et `SITE_BASE` = `https://www.vgthmind.org`), `npm run build`, `npm test` ; toi : `Deployer-worker.bat` puis `git push` (OK explicite pour chacun) ; attendre 2 min.
5. **Contrôle automatique** : `node outils/verifier-site.mjs https://www.vgthmind.org` (anciennes adresses BigCartel : les 27 `/product/…` + `/products` + 7 `/category/…` + `/cart` + `/contact`, robots, sitemap, canonical, admin protégé, sans www, CORS du Worker). Doit finir par « Tout est bon ».
6. **Test iPhone**, lien Instagram compris : accueil, une fiche, panier, paiement, suivi, 404, formulaire « Proposer un projet », mentions légales.
7. Admin : se reconnecter une fois sur `www.vgthmind.org` (nouvelle adresse = nouvelle session) ; Commandes, Demandes, Stock, Pièces s'ouvrent.
8. Annoncer. Google Search Console : ajouter `www.vgthmind.org`, envoyer `sitemap.xml`. Cloudflare Web Analytics : vérifier que le nouveau domaine est bien suivi. Lien Instagram : inchangé si adresse identique.

## Phase 5 : retour arrière (par niveau, du plus léger au plus complet)
Quand : paiement qui échoue, mails qui ne partent pas, anciennes adresses en 404, admin inaccessible, ou tout doute pendant les 48 premières heures.
1. **Niveau 1, Stripe** (phase 4 étape 1 ou 2) : moi `node outils/preparer-bascule.mjs --apply --retour` ; toi `wrangler secret put` avec les clés de TEST (`rk_test…`, `whsec` test) ; `Deployer-worker.bat`. Désactiver le webhook live dans Stripe. Rembourser les paiements réels déjà faits.
2. **Niveau 2, domaine** : IONOS, ligne `www` : remettre `vgthmind.bigcartel.com` (BigCartel revient en 5 min grâce au TTL à 300 s). Rien d'autre à toucher.
3. **Niveau 3, site** : `git revert` du commit de bascule puis `git push` (moi, OK explicite) ; ou Cloudflare > Pages > Deployments > déploiement précédent > « Rollback to this deployment » (1 clic, sans git).
4. **Niveau 4, Worker** : `npx wrangler@4 rollback <id noté en phase 3 étape 6>`.
5. **Données** : Commandes > Sauvegardes > « Restaurer depuis un fichier… » (état expédiée/préparation/numéros) ; Stock : sauvegarde `backup:latest` ; les paiements eux-mêmes restent dans Stripe.
6. Prévenir les clients dont le paiement était en cours ; rembourser dans Stripe les paiements incohérents. Ne pas résilier BigCartel avant 2 semaines au moins de recul.

## Phase 6 : après la bascule
- 48 h : surveiller Stripe (paiements, webhooks en erreur) et contact@ ; relire les 3 pages légales en ligne.
- Remettre le TTL de `www` à 1 h. Quelques semaines plus tard : DMARC `_dmarc` en TXT `v=DMARC1; p=none; rua=mailto:contact@vgthmind.org`, puis `p=quarantine`, puis `p=reject`.
- **Supprimer la branche distante `bascule-prete`** (périmée, remplacée par `outils/preparer-bascule.mjs`) : `git push origin --delete bascule-prete` (OK explicite).
- BigCartel : exporter clients et commandes, garder une copie des factures, fermer avant avril 2027.
- Facturation : mention de TVA selon le CIBS à partir du 2027-01-01 (voir CGV-A-VERIFIER.md).

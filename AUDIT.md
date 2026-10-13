# AUDIT.md : préparation de l'audit sécurité (lecture seule, 2026-10-14)

Rien n'a été modifié dans le code pour cet audit. Chaque point : risque, état constaté, correction proposée. Priorité : P1 avant la bascule live, P2 dans le mois, P3 confort.

## 1. Permission GitHub de l'admin (P1)
- **Constat** : l'admin se connecte par une OAuth App (`GITHUB_CLIENT_ID`) avec le scope `repo` (`checkout-worker/index.ts`, `scope: 'repo'`). `repo` donne accès en lecture/écriture à TOUS les dépôts, publics et privés, du compte. Le jeton est gardé en `sessionStorage` (un onglet) : bon, mais un script injecté dans l'admin pourrait le lire.
- **Risque** : si le jeton fuit (XSS, onglet partagé, extension), l'attaquant touche tous tes dépôts, pas seulement vgthmind/shop.
- **Correction** : remplacer l'OAuth App par une **GitHub App** installée sur le seul dépôt `vgthmind/shop`, permission « Contents : lecture et écriture » uniquement (rien d'autre). Le jeton obtenu ne vaut que pour ce dépôt et expire (8 h).
- **Étapes à faire de ton côté** (GitHub, une dizaine de minutes) :
  1. GitHub > Settings > Developer settings > GitHub Apps > New GitHub App. Nom : `vgthmind-admin`. Homepage : l'adresse du site.
  2. « Callback URL » : la page de retour de l'admin (la même que celle de l'OAuth App actuelle). Cocher « Request user authorization (OAuth) during installation ». Décocher « Webhook > Active ».
  3. Permissions du dépôt : **Contents = Read and write**. Aucune autre. « Where can this GitHub App be installed ? » : Only on this account.
  4. Create, puis noter le **Client ID** ; « Generate a new client secret » et le garder.
  5. Install App > choisir ton compte > **Only select repositories** > `shop` uniquement.
  6. Me donner le nouveau Client ID ; le secret se pose avec `npx wrangler secret put GITHUB_CLIENT_SECRET` (je prépare le changement du Worker, tu lances le déploiement).
  7. Une fois testé : supprimer l'ancienne OAuth App (Developer settings > OAuth Apps > Delete) et révoquer ses jetons.
- À coder de mon côté (non fait) : échange de code de l'App (les jetons d'App commencent par `ghu_`), suppression du scope `repo`.

## 2. Worker `vgthmind-shop-checkout` (P1)
- **Webhook Stripe** : signature vérifiée avec comparaison à temps constant (`verifyStripeSignature`, `timingSafeEqual`). OK. À vérifier : tolérance de date (rejouer un vieux webhook) et idempotence (une commande traitée une seule fois : déjà gérée par `st.mail` et le stock).
- **Modes** : `LIVE_MODE = "0"` + clé `sk_test_` : le Worker refuse une clé live tant que LIVE_MODE != "1" (index.ts ~493). OK. Risque : oublier de poser `LIVE_MODE` ET la clé live ensemble le jour J (voir checklist dans ETAT.md).
- **CORS** : `Access-Control-Allow-Origin` renvoie le site appelant seulement s'il est dans la liste, sinon le premier (`pickOrigin`). OK, mais vérifier que la liste ne contient plus l'ancien aperçu GitHub Pages après la bascule.
- **Limites de débit** : connexion admin (12 échecs par IP, puis 429), formulaire (3 demandes par IP et par heure, 30 par jour au total), contact. Risque : la limite globale de 30/jour peut être épuisée par un robot et bloquer de vrais clients (déni de service léger). Correction proposée : limite par IP seulement + Turnstile (anti-robot Cloudflare, gratuit) sur « Un projet ? » et Contact.
- **Secrets** : `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, secret du webhook, clé de session doivent être des secrets Wrangler, jamais dans `wrangler.toml`. À faire : `grep -rn "sk_\|re_\|whsec_" .` sur le dépôt et l'historique git (`git log -p -S"sk_live"`), et révoquer toute clé qui y aurait figuré. Le jeton Web Analytics de `shop-settings.json` est public par nature (OK).
- **Fichiers clients** (R2) : types et tailles limités (photos 10 Mo, vidéo 50 Mo), un `k` secret par demande. Vérifier que les noms de fichiers sont nettoyés (déjà `clean(name, 120)`) et que les réponses de téléchargement envoient `Content-Disposition` + `X-Content-Type-Options: nosniff`.
- **Mesures (nouveau)** : valeurs filtrées (nombres seulement pour les cm, 30 caractères max sinon). OK.

## 3. En-têtes HTTP du site (P2)
- **Constat** : `generator/_headers` ne pose que le cache et `X-Robots-Tag` sur /admin. Aucun en-tête de sécurité.
- **Correction proposée** (ajouter pour `/*`) :
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Frame-Options: DENY` (ou CSP `frame-ancestors 'none'`) : évite qu'on mette l'admin ou le paiement dans un cadre.
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Strict-Transport-Security: max-age=31536000` (une fois le domaine définitif en HTTPS).
  - **CSP** : à introduire d'abord en `Content-Security-Policy-Report-Only` ; le site charge des scripts de la boutique et Stripe (`js.stripe.com`), donc la liste est à établir avec soin avant de bloquer.
  - Ajouter `/assets/mesures/*` au cache (comme `/assets/media/*`).
- Pour `/admin/*` : ajouter une CSP stricte (scripts du site + `api.github.com` + le Worker seulement), c'est la page la plus sensible.

## 4. Formulaires publics (P2)
- Contact et « Un projet ? » : champ piège + délai minimum + limites de débit : OK. Les textes sont échappés à l'affichage (admin `esc()`, mails `esc()`) : à re-tester avec `<script>` et `"` dans chaque champ (nom, idée, mesures, précision).
- Les liens saisis par le client (`link`) doivent commencer par `https://` (déjà vérifié) ; dans l'admin, les afficher en texte, jamais en lien cliquable automatique sans `rel="noopener noreferrer"`.
- E-mail du client : le mail de confirmation part vers une adresse saisie par n'importe qui : risque d'utiliser le site pour spammer un tiers. Limité par les 3/heure/IP ; ajouter Turnstile pour fermer le sujet.

## 5. Stripe (P1)
- Acompte : session avec adresse de facturation obligatoire ; solde : adresse de livraison + téléphone + port calculé côté Worker (le client ne peut pas modifier le montant). OK.
- À vérifier avant le live : moyens de paiement activés (cartes, Apple Pay), reçus Stripe et factures (numérotation légale W-AAAA-NNN déjà gérée), webhook live créé (nouvelle clé `whsec_` à poser), 3D Secure, e-mail de contact et nom de l'entreprise dans le tableau de bord Stripe, remboursements depuis Commandes testés en test.
- Clés restreintes : utiliser une **clé restreinte** (`rk_live_`) avec seulement les droits utilisés (Checkout Sessions, Payment Intents, Refunds, Webhook Endpoints en lecture), pas la clé secrète complète.

## 6. E-mail (P2)
- SPF, DKIM (`resend._domainkey`) et DMARC `p=none` sont en place. À faire quelques semaines après le lancement : DMARC `p=quarantine` puis `p=reject` si les rapports (`rua=mailto:contact@vgthmind.org`) sont propres.
- Après `LIVE_MODE = "1"`, le préfixe `[TEST]` disparaît des objets.

## 7. Divers (P3)
- Sauvegarde nocturne des commandes : vérifier la restauration une fois à blanc.
- Dépendances (`npm audit`) : lancer avant la bascule ; `sharp` est la seule dépendance de développement.
- Journaliser dans le Worker les échecs de connexion admin et envoyer l'alerte e-mail existante au bout de N échecs.
- Données de test à supprimer avant le live (liste dans ETAT.md).

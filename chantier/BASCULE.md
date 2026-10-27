# Mise en production : Stripe live, domaine, e-mails, surveillance, factures (PLAN, rien n'est activé)

> **Le §2 (domaine) est remplacé par `BASCULE-JOUR-J.md`** (le site est sur Cloudflare Pages, plus sur GitHub Pages). Le reste (Stripe live §1, DMARC §3, checklist §6) reste valable.

Écrit le 2026-10-12. Rien de ce document n'a été exécuté : LIVE_MODE reste 0, aucun DNS touché.

## 1. Stripe en live (31) : ce que TU crées dans le tableau de bord Stripe
1. Stripe, coin haut-gauche : **désactive « Mode test »** (tu es en live).
2. Développeurs, Clés API, **Créer une clé restreinte**. Nom : `vgthmind-worker-live`. Permissions : **Écriture** sur *Checkout Sessions* ; **Lecture** sur *PaymentIntents*, *Charges*, *Products*, *Customers* ; et, pour les codes promo de l'admin : **Écriture** sur *Coupons* et *Promotion Codes* (facultatif : sans eux, la page « Codes promo » de l'admin affiche un message clair, le reste marche). Rien d'autre. Copie la clé (`rk_live_...`) : tu ne la reverras plus.
3. Développeurs, Webhooks, **Ajouter un endpoint** : adresse `https://vgthmind-shop-checkout.vgthm66.workers.dev/webhook` ; événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `payment_intent.payment_failed`, `checkout.session.async_payment_failed`. Copie le **secret de signature** (`whsec_...`).
4. Ne m'envoie ces deux valeurs **nulle part**. Dis-moi juste « clé live créée » : je te donne les commandes à coller : `wrangler secret put STRIPE_SECRET_KEY` (clé live), `wrangler secret put STRIPE_WEBHOOK_SECRET` (whsec live), puis `LIVE_MODE = "1"` dans `wrangler.toml` + redéploiement.
5. Paramètres, Moyens de paiement : carte (+ Apple Pay / Google Pay si tu veux). Paramètres, Informations de l'entreprise : nom « vgthmind », SIRET.
6. **Test réel** : une pièce fictive à 1 € (je la crée), tu paies avec ta vraie carte, je vérifie stock + mails, puis **Remboursement** depuis Stripe (Paiements, le paiement, Rembourser). Frais Stripe perdus : environ 0,25 €.
Retour arrière : `LIVE_MODE="0"` + secrets de test (`rk_test...`) + `npx wrangler@4 rollback <id>` (ids dans vgthmind-chantier/chantier/ETAT.md).

## 2. Domaine vgthmind.org chez IONOS (32) : état relevé aujourd'hui
- `www.vgthmind.org` : CNAME `vgthmind.bigcartel.com` (la boutique BigCartel).
- `vgthmind.org` (sans www) : A `217.160.0.54` (hébergement IONOS, sert surtout de redirection vers www).
- Mails : MX `mx00/mx01.ionos.fr`, SPF `v=spf1 include:_spf-eu.ionos.com ~all`. **Les boîtes commande@ et contact@ sont chez IONOS : NE PAS toucher aux MX ni au SPF du domaine principal.**
- Resend : `resend._domainkey` (DKIM) et `send.vgthmind.org` (SPF amazonses + MX retour) existent déjà.

**Plan** (GitHub Pages sert le site ; il faut un fichier `CNAME` dans `docs/`, `BASE_PATH=''`, `site_url`, `public:true`, et `ALLOWED_ORIGIN` / `SITE_BASE` du Worker = nouveau domaine) :
1. Veille : je prépare le build « racine » (BASE_PATH='', site_url https://www.vgthmind.org), je lance tous les tests, je prépare le Worker (SITE_BASE, ALLOWED_ORIGIN) sans le déployer.
2. Jour J, IONOS, Domaines, DNS : **modifier uniquement** l'enregistrement `www` : CNAME `vgthmind.bigcartel.com` vers `vgthmind.github.io`. Apex (`@`) : soit les 4 A de GitHub Pages (185.199.108.153, .109.153, .110.153, .111.153), soit garder la redirection IONOS vers www. **Ne pas toucher MX, SPF, DKIM, DMARC, `send`, `resend`.**
3. GitHub, dépôt, Settings, Pages : Custom domain `www.vgthmind.org` + « Enforce HTTPS » (certificat en 10 à 60 min).
4. Je déploie le Worker avec le nouveau domaine, je pousse le build racine, je teste (checklist §6).
- **Retour arrière** : redonner à `www` le CNAME `vgthmind.bigcartel.com` (1 clic dans IONOS), BigCartel revient en quelques minutes. Baisser le TTL de `www` à 300 s la veille. Redéployer l'ancien Worker (`rollback`).
- **Meilleur moment** : un mardi ou mercredi matin, hors drop et hors promotion Instagram, toi disponible 2 h. Éviter week-end et veille de sortie.
- Liens Instagram : `/product/<nom>` et `/category/...` sont identiques à BigCartel (voir REDIRECTIONS.md), rien ne casse une fois la racine prise. `/products.xml` existe aussi sur le nouveau site (flux Merchant/Meta généré).
- BigCartel : ne pas résilier avant 1 à 2 semaines de recul.

## 3. Domaine d'envoi Resend (33)
Relevé DNS : DKIM `resend._domainkey.vgthmind.org` présent ; `send.vgthmind.org` : SPF `include:amazonses.com` + MX `feedback-smtp.eu-west-1.amazonses.com` présents. Configuration Resend complète côté DNS. DMARC : `_dmarc.vgthmind.org` = valeur IONOS par défaut `v=DMARC1; p=none;` (aucune protection). **À faire (toi, 2 min)** : remplacer `_dmarc` par un TXT `v=DMARC1; p=none; rua=mailto:contact@vgthmind.org`, puis après 2 à 3 semaines sans souci `p=quarantine`. Vérifier dans Resend, Domains, que `vgthmind.org` affiche **Verified** (je n'ai pas accès à ton compte Resend). Test final : une commande test vers une adresse Gmail, « Afficher l'original » : SPF/DKIM/DMARC = PASS.

## 4. Colissimo sans API (34)
Déjà le cas : le port est calculé par `shipping-calc.js` + `shipping-config.json` (grille manuelle, page admin « Expédition »), aucune API La Poste n'est appelée. Branchement futur : le calcul passe par une seule fonction (`shipping-worker.ts`), une API pourra remplacer la grille en ne changeant que celle-ci. Mise à jour annuelle des tarifs (janvier) = à faire dans l'admin.

## 5. Surveillance (35) : NON FAIT (touche le Worker, décision à prendre)
Proposition : (a) Cloudflare, Notifications, « Workers : taux d'erreur élevé » vers contact@ (réglage de ton compte, 3 clics) ; (b) dans le Worker : en cas d'échec d'un envoi Resend ou d'une erreur dans `/webhook`, envoyer un mail d'alerte à ALERT_EMAIL ; (c) Stripe, Développeurs, Webhooks : alertes d'échec par mail (réglage Stripe). Je le code après ton OK.

## 6. Checklist « jour J » (37)
**Avant (J-1)** : `npm test` tout vert ; sauvegarde catalogue + commandes (admin) ; noter l'id de version Worker actuelle (vgthmind-chantier/chantier/ETAT.md) ; TTL DNS `www` à 300 s ; paiement live testé (§1.6) ; mail de test reçu hors spam ; rien publié sur Instagram ce jour-là.
**Pendant** : (1) Stripe live + secrets + LIVE_MODE=1 (Worker), (2) build racine poussé, (3) DNS `www` puis GitHub, (4) HTTPS actif, (5) tests : accueil, fiche, panier, paiement 1 € remboursé, mails commande + contact, suivi, 404, `/product/ch_0002`.
**Après** : surveiller Stripe et Resend 48 h ; Search Console + sitemap ; garder BigCartel 2 semaines ; remettre le TTL à 1 h.
**Retour d'urgence** : (1) DNS `www` vers `vgthmind.bigcartel.com` ; (2) Worker : `LIVE_MODE="0"` + secrets test + `npx wrangler@4 rollback <id précédent>` ; (3) prévenir les clients en cours de paiement ; (4) rembourser dans Stripe les paiements incohérents.

## 7. Factures PDF (30) : plan (non codé)
Numérotation de ton Facturier (relevée dans son code) : `AAAA-NNN` (ex. `2026-001`), compteur par année stocké dans son profil (`invoiceCounter`), mention « TVA non applicable, art. L. 223-3 du CIBS » (et non 293 B du CGI : ancien renvoi, remplacé par le CIBS en 2025/2026, à confirmer avec ton comptable), pénalités de retard et 40 €. **Liaison proposée** : le Worker numérote les factures du site avec un préfixe distinct **`W-AAAA-NNN`** (compteur propre, atomique dans le Durable Object) : pas de collision avec `AAAA-NNN` du Facturier, et la compta voit tout. Pas de moteur PDF dans le Worker : page `facture` imprimable / « Enregistrer en PDF » générée dans le navigateur (client via la page Suivi, toi via l'admin). À faire après ta réponse (question 5).

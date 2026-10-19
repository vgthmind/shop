# Lancement de vgthmind : ce que TU fais, étape par étape (débutant)

Écrit le 2026-10-19. Rien de ce document n'est exécuté : le site reste en **mode test** jusqu'à ton feu vert. Détail technique et retour arrière : `CHECKLIST-BASCULE.md`, `BASCULE.md` §1, `BASCULE-JOUR-J.md`.
Règle : Claude ne déploie le Worker et ne pousse le site qu'après ton « OK » écrit dans le chat, à chaque fois. **Tu ne me donnes jamais une clé** : tu les colles toi-même dans le tableau de bord Cloudflare.

## Les mots à connaître
- **Secret du Worker** : une clé que Cloudflare garde cachée ; tu la poses dans le tableau de bord Cloudflare (partie B, étape 6), sans terminal.
- **Cloudflare est déjà connecté sur ce PC** (compte vgthm66@gmail.com) : tu n'as PAS à refaire `wrangler login`. Si un jour une commande répond « not authenticated » : tape `npx wrangler@4 login`, une page s'ouvre, clique « Allow ».

## A. Avant de lancer (tout est faisable aujourd'hui)
1. **Ménage des données de test** (je le fais, j'ai besoin de ta connexion) : ouvre le panneau « Browser » de l'application Claude, va sur `https://vgthmind-shop.pages.dev/admin/connexion`, touche « Se connecter avec GitHub » (ton compte), puis dis-moi « connecté ». Je lance l'aperçu, je te montre la liste « SUPPRIMÉ / GARDÉ », puis j'applique.
   Ensuite, **toi** : Stripe, bouton « Mode test » en haut, Développeurs, « Supprimer toutes les données de test » (je n'ai pas accès à ton Stripe).
2. **Adresse de facturation** : admin > Réglages > Facturation > Adresse (numéro, rue, code postal) > « Enregistrer les réglages ». Sans elle, la première facture sort sans adresse.
3. **Prix** (tu décides, je ne touche à rien) :
   - Une pièce de la boutique : admin > Pièces > touche la photo > section « Prix et stock » > Prix > « Enregistrer ».
   - Les prix « à partir de » des demandes sur mesure (custom, sur-mesure), l'acompte, les délais : admin > Réglages > « Prix et délais » > « Enregistrer les réglages ».
   - Les frais de livraison : admin > Réglages > Livraison.
4. **Textes légaux** : le juriste valide `chantier/CGV-A-VERIFIER.md` (médiateur, délai de rétractation, pays livrés), l'entreprise individuelle (EI) et ce qui s'imprime sur les factures (nom ou non), la mention de TVA à adapter au 2027-01-01 (CIBS). Ce sont des décisions à toi.
5. **Checklist iPhone** (voir la fin du message de Claude) : 10 minutes avec l'appli installée.

## B. Stripe en réel (15 minutes, toi seul)
1. Stripe : le compte doit être **activé** (identité, compte bancaire, SIRET). Tableau de bord > « Activer votre compte » si le bandeau est là.
2. Paramètres > Informations de l'entreprise : nom « vgthmind », libellé sur le relevé bancaire, e-mail de support contact@vgthmind.org.
3. Paramètres > Moyens de paiement : **Cartes, Apple Pay, Google Pay, Bancontact activés** (le Worker demande toujours carte + Bancontact : si Bancontact est coupé, la page de paiement ne s'ouvre pas).
4. Passe en **mode live** (désactive « Mode test » en haut à gauche), puis Développeurs > Clés API > « Créer une clé restreinte » : nom `vgthmind-worker-live`. Permissions : **Écriture** sur *Checkout Sessions*, *Coupons*, *Promotion Codes* ; **Lecture** sur *PaymentIntents*, *Charges*, *Products*, *Customers*. Copie la clé `rk_live_…` (elle ne s'affiche qu'une fois).
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
La veille : IONOS > Domaines > vgthmind.org > DNS > ligne `www` > TTL **300 secondes**. Ne touche jamais aux lignes MX, SPF, DKIM, `_dmarc`, `send`, `resend`, ni à la ligne `@`.
1. Cloudflare (dash.cloudflare.com) > Workers & Pages > **vgthmind-shop** > onglet **Custom domains** > « Set up a custom domain » > `www.vgthmind.org` > Continue.
2. IONOS > DNS > ligne `www` (CNAME) : remplace `vgthmind.bigcartel.com` par `vgthmind-shop.pages.dev` > Enregistrer.
3. Cloudflare > Custom domains : attends « **Active** » (2 à 30 minutes, certificat HTTPS).
4. Resend (resend.com) > Domains : `vgthmind.org` doit être « **Verified** ».

## D. Le jour J avec Claude (dans cet ordre, je te guide)
1. Toi : tu me dis **« essai réel »** quand B est fait. Moi : `node outils/preparer-bascule.mjs --live-seul --apply` (le Worker passe en réel, le site reste de test), `npm test`. Moi : je déploie le Worker (ton OK écrit dans le chat d'abord).
2. Toi : essai à 1 € sur `vgthmind-shop.pages.dev` avec ta vraie carte (puis Apple Pay sur iPhone), puis remboursement dans l'admin (Commandes > la commande > « Rembourser… »). Je vérifie stock, mails, facture.
3. Toi : tu fais C (domaine). Moi : `node outils/preparer-bascule.mjs --live --apply` (site public, adresse www.vgthmind.org), `npm run build`, `npm test` ; puis Worker puis publication du site (`git push`), **chacun après ton OK**.
4. Moi : `node outils/verifier-site.mjs https://www.vgthmind.org` (doit finir par « Tout est bon »). Toi : test iPhone, lien Instagram compris.
5. Toi : te reconnecter à l'admin sur `www.vgthmind.org` (nouvelle adresse = nouvelle connexion).

## E. Après le lancement
- 48 h : regarde Stripe (paiements, webhooks en erreur) et ta boîte contact@.
- Search Console : ajoute `www.vgthmind.org`, envoie `sitemap.xml`.
- IONOS : remets le TTL de `www` à 1 heure.
- Cloudflare Web Analytics : vérifie que le nouveau domaine est suivi.
- BigCartel : ne résilie pas avant 2 semaines ; exporte tes clients et commandes avant avril 2027.
- Plus tard : DMARC `_dmarc` (TXT `v=DMARC1; p=none; rua=mailto:contact@vgthmind.org`), puis `p=quarantine`.
- Je supprime la branche distante périmée `bascule-prete` (sur ton OK).
- **Après le lancement** : pastille de notification sur l'icône de l'appli iPhone (nécessite des notifications push, iOS 16.4+) : proposée une fois le site lancé.

## Retour arrière
Niveau 1 : clés de test remises + `LIVE_MODE = "0"` (je redéploie le Worker sur ton OK). Niveau 2 : IONOS, ligne `www` : remets `vgthmind.bigcartel.com` (BigCartel revient en 5 minutes). Niveau 3 : Cloudflare > Pages > Deployments > déploiement précédent > « Rollback ». Détail : `CHECKLIST-BASCULE.md`, phase 5.

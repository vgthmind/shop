# À faire de ton côté — du plus rapide au plus long (que des clics, pas de terminal)

Mise à jour de la nuit du 12 → 13 octobre 2026. **Rien de ce qui suit n'est en ligne tant que tu n'as pas dit OK** (étape 1). Tout est sur la branche `claude/keen-hypatia-ikrv7l` ; la bascule du domaine est sur la branche `bascule-prete` (jamais fusionnée sans toi).

Dans Cloudflare, « ajouter un secret » = **dash.cloudflare.com → Workers & Pages → `vgthmind-shop-checkout` → Settings → Variables and Secrets → Add → Type : Secret → Nom + Valeur → Deploy**. Le secret n'apparaît ensuite plus jamais en clair (normal). Après chaque ajout, ouvre **Admin → État du système** : la ligne correspondante doit passer à `OK`.

## 0. À valider en rentrant — favicons, restes BigCartel, webhook (13 oct., journée)
Branche `favicons-audit-2026-10-13` (rien poussé, rien déployé, `bascule-prete` intact).
- **Favicons** : fond transparent, SVG + ICO + PNG ; iPhone = fond noir #0b0b0b (le chrome blanc ressort). Admin : même logo + pastille dorée. À vérifier à l'œil après publication (onglet clair/sombre, icône écran d'accueil iPhone ; si ancien favicon : ferme/rouvre l'onglet, ou change ICON_V dans generator/build.js).
- **Webhook Stripe (13 échecs, test)** : je n'ai pas pu lire les livraisons (tableau de bord Stripe figé dans mon navigateur). Côté Worker : le webhook renvoyait une erreur si products.json manquait quelques secondes (reconstruction du site) → corrigé (2 essais), à déployer avec le Worker. Si ça persiste : Stripe → Webhooks → ta destination → Livraisons → clique un échec : `400` = secret de signature à reposer (`npx.cmd wrangler secret put STRIPE_WEBHOOK_SECRET`, coller UNE fois) ; `500` = envoie-moi le texte de la réponse ; `503` = `STRIPE_SECRET_KEY` à reposer.
- **Décisions BigCartel** : (1) dossier `assets/bigcartel/` du dépôt portfolio (reels, icônes) : garder le nom ou migrer ; (2) `data/catalog.bigcartel-import.json` + `generator/import-catalog.js` : archiver ; (3) raccourci `Raccourcis/Admin BigCartel.url` et dossier `Archives BigCartel` : à supprimer quand tu veux ; (4) dossier `assets/theme/bc/` : simple nom, renommable.
- **Pré-audit robot** (PC+iPhone, FR+EN, fiches produit, pages légales, admin) : aucune image cassée, aucun défilement horizontal, titres et langue OK. Reste à ton œil : rendu visuel, animations, photos, textes.

## 1. Dire OK pour la mise en ligne de la nuit (10 secondes)
Écris-moi **« déploie la branche de la nuit »** : je fusionne la branche dans `main` (Cloudflare reconstruit le site en 1–2 min) puis je déploie le Worker. Contenu : voir RAPPORT-NUIT.md. Retour arrière : « annule le déploiement de la nuit ». Ensuite regarde le numéro **Admin v2026-10-13-d** en bas à gauche de n'importe quelle page de l'admin (sur iPhone : ferme et rouvre l'admin si tu vois un autre numéro).

## 2. Alerte de facturation Cloudflare (2 min)
dash.cloudflare.com → **Notifications** → **Add** → **Usage Based Billing** → produit **R2** (seuils : 5 Go de stockage, 500 000 opérations) → destinataire contact@vgthmind.org → Save. (Pour être prévenu si un jour tu dépasses la partie gratuite.)

## 3. DMARC (2 min, IONOS)
IONOS → Domaines → vgthmind.org → DNS : supprime l'enregistrement `_dmarc`, ajoute un TXT nommé `_dmarc` avec la valeur `v=DMARC1; p=none; rua=mailto:contact@vgthmind.org`. Puis Resend → Domains : « Verified ».

## 4. Webhook Stripe : 2 événements en plus (2 min)
Stripe → Développeurs → Webhooks → ton endpoint → **Ajouter des événements** : `payment_intent.payment_failed` et `checkout.session.async_payment_failed` (sinon pas d'alerte « paiement échoué »). À refaire le jour du passage en live.

## 5. Double authentification GitHub (3 min)
GitHub → Settings → Password and authentication → Two-factor (clé d'accès ou application). C'est la vraie protection de l'admin.

## 6. Drops de 18 h : le « Deploy Hook » (5 min)
1. dash.cloudflare.com → Workers & Pages → **vgthmind-shop** → Settings → **Builds** (ou « Deploy Hooks ») → **Add deploy hook** : nom `drop`, branche `main` → copie l'adresse (`https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/…`).
2. Ajoute-la comme secret du Worker (voir en haut) : nom **`DEPLOY_HOOK_URL`**. Vérifie sur « État du système » la ligne `DEPLOY_HOOK_URL posée`.
3. Admin → Pièces → **Programmer** (ou la fiche d'une pièce → statut « Programmée ») → `2026-11-06 18:00` (heure de Paris) → Enregistrer. La pièce apparaît à 18 h (± 20 s). Elle doit avoir au moins une catégorie. « Annuler la programmation » la remet en aperçu.

## 7. Ventes → ton Sheet de compta (5 min + 2 min avec moi)
Secrets du Worker (même chemin que ci-dessus), noms exacts : **`COMPTA_URL`** (l'adresse « /exec » de ton script Google) et **`COMPTA_SECRET`** (la propriété « SECRET » du script). Puis dis-moi « compta posée » : je fais un achat test sur une copie du Sheet, je vérifie la ligne, je retire le mode essai. Pas encore branchés : remboursements et acomptes.
Réglages → Compta a déjà le lien direct vers ta **Comptabilité** et ta **Facturation** (hors boutique seulement).

## 8. Relire les textes (10–20 min, à ton rythme)
- `chantier/CGV-A-VERIFIER.md` (médiateur, délai de rétractation, pays livrés) et `chantier/CGV-PROPOSITION.html` (surligné jaune = à remplir ; section 5 bis « sur demande »).
- **TVA** : décidé, « TVA non applicable, article 293 B du CGI » partout (mentions légales, factures). Rien à faire avant 2027.
- Page Confidentialité (durée de conservation des messages : 12 mois, choix de ma part).
- **Adresse de l'émetteur sur les factures** : une facture française porte normalement le nom et l'adresse du vendeur. Pour l'instant : « vgthmind, Vitry-sur-Seine, SIRET ». Si tu veux ajouter l'adresse : dis-le-moi.
- Nouveau texte (livraison) : « Livraison via La Poste (Colissimo, ou lettre suivie pour les petites pièces en France) ».

## 9. Test avec Claude, après la mise en ligne (2 min de ton temps)
- **Paiement test (mode test)** : dis « prépare le test de paiement » ; je publie une pièce fictive et te donne un lien Stripe. Tu tapes toi-même la carte `4242 4242 4242 4242` (date future, CVC 123, pays Belgique ou France). Dis « c'est payé » : je vérifie stock (0 = Sold out), les deux mails, puis je supprime la pièce. Je n'ai pas le droit de taper un numéro de carte, même de test.
- **Un éditeur à tester** : Admin → Pièces → toucher une photo (la fiche) → change juste une virgule dans la description d'une pièce → Enregistrer → regarde que le badge « Pièce unique », la pastille de couleur et le reel sont toujours là (j'ai déclaré ces champs dans l'éditeur pour qu'il ne les efface pas ; je ne peux pas le vérifier sans ta connexion GitHub).

## 10. Stripe en live (15 min) — le dernier verrou avant le lancement
Suis `chantier/BASCULE.md` §1 (clé restreinte live + webhook live). **Ne m'envoie ni la clé ni le secret** : ajoute-les toi-même dans les secrets du Worker (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), puis dis-moi « clé live créée » : je mets `LIVE_MODE=1` et je redéploie. Droits en plus pour les codes promo : Écriture sur « Coupons » et « Promotion Codes » (facultatif).

## 11. La bascule du domaine (1 h, un mardi ou mercredi matin)
Tout est dans **`chantier/BASCULE-JOUR-J.md`** : 2 clics côté Cloudflare, 1 ligne à changer chez IONOS (`www`), le reste c'est moi (fusion de `bascule-prete`, vérification automatique de toutes les anciennes adresses, dont celle de ton Instagram). Retour d'urgence en 1 clic.

## 12. Ce qui dépend de toi et que je ne peux pas inventer
Photo de la **collection grise** (image d'accueil) ; photo d'origine du **pantalon denim bleu** (détourage) ; liens Instagram manquants ; **médiateur de la consommation** ; adresse pour le retour/rétractation ; décision sur le **prix États-Unis** (29 € alors que La Poste facture ~35 € pour 500 g : tu perds ~6 € par envoi) ; tu/vous.

---

## Rappel : détourage depuis l'iPhone (inchangé, rien de nouveau à faire)
Sur le PC : dossier `detourage-server` → double-clic **`Lancer-detourage-iphone.bat`** → laisse la fenêtre noire ouverte → envoie-toi le lien « Détourage iPhone prêt » → ouvre-le dans Safari. À chaque lancement l'adresse change ; ne partage jamais ce lien (il contient le mot de passe). Détourage sur PC : `Lancer-detourage.bat`. Le serveur de détourage hébergé (Hugging Face) est abandonné : rien n'en a été poussé.

## Rappel : vidéos d'ouverture
Admin → **Vidéos d'ouverture** : choisis une vidéo (même .mov lourd de l'iPhone) : elle est convertie toute seule (garde l'écran allumé). À essayer sur ton iPhone et ton PC.

## Rappel : brouillon automatique du studio
Si tu quittes « Nouvelle pièce », un bandeau « Brouillon retrouvé » propose Reprendre ou Effacer (effacé après publication ou 14 jours).

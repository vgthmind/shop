# ETAT (2026-10-13)
- Audit en cours par lots. Déployés : lot 1, port, déconnexion, redirections, reconnexion iPhone (Worker 9de008fa, admin 2026-10-13-h). Lot 2 après feu vert.
- Voir ../ETAT.md pour les versions en ligne.
- Frais de port : calcul inchangé en attendant la validation du tableau par vgthmind (anciennes pièces = port fixe le plus élevé du panier ; grille poids/zones seulement pour les pièces du studio).
- Détails et suites : ../SITE/ETAT.md, chantier/JOURNAL.md (dépôt vgthmind-chantier).

## 2026-10-21 — Compta Sheet
- Fait : `8deb952` poussé (lasterr, trim, renvoi horaire, route `/admin/compta/resync`, 2 boutons dans Réglages → Compta, test 6/10 exclu). Rien déployé.
- Reste : 3 ventes live (VG-E8JYXV, VG-JYG3DN, VG-SKU9N8) toujours dans `compta:q:` ; remboursements du 20/10 (ch_3UScrk…, ch_3USct6…) jamais partis.
- Prochain pas : vgthmind lance Deployer-worker.bat, attend le build Pages, clique « Rattraper la compta » ; puis vérifier KV (`compta:q:` vide, `compta:lasterr`) et le Sheet. Ensuite seulement, rembourser le test restant (ch_3USkwe…).

## 2026-10-26 — Descriptions, compta, checklist
- Fait : 5 catégories relues en ligne (Latest Drop, All, Customs/Upcycling, Accessories, Merch). Seule erreur : « All » disait « all one-of-a-kind » alors que le CD (stock 5) et le cache-cou ne sont pas uniques → corrigé dans `data/seo.json` (« mostly one-of-a-kind » / « Pièces uniques pour la plupart »), NON poussé.
- Compta vérifiée (KV du Worker, lecture seule) : file `compta:q:` vide, `compta:lasterr` vide, `compta:ok:` = 3 ventes + 3 remboursements (clés uniques = pas de doublon), envoyés le 20/10. Le rattrapage du 21/10 est donc déjà fait, et ch_3USkwe… est déjà remboursé. Montant/date/port : calcul lu dans accounting-core.js (total encaissé, port séparé, date de Paris), tests OK. NON vérifié : lignes réelles du Sheet et vente future (script Google refuse la lecture sans jeton), liens Compta de l'admin sur PC/iPhone (admin demande la session).
- Checklist : `chantier/CHECKLIST-TESTS.md` refaite (22 points) + page cochable « Tests à faire à la main (PC + iPhone) » dans Outils Taff (bouton « Copier mes réponses »). Générateur dans le scratchpad, pas dans le dépôt.
- Prochain pas : OK de vgthmind pour pousser seo.json + checklist ; puis vgthmind déroule la checklist.

## 2026-10-26 — Travail en autonomie (vgthmind absent)
- « All » : en ligne et vérifiée (808eade, « mostly one-of-a-kind »).
- CSP /admin en nonces : EN LIGNE (734fd23, tests 358 OK). Le middleware pose un nonce neuf sur chaque `<script>` (HTMLRewriter) ; `script-src 'self' 'nonce-…' 'wasm-unsafe-eval'`, plus d'`unsafe-inline` pour les scripts (styles inchangés). Retirés : `onerror` (catalogue → écouteur en capture dans img-retry.js) et `onclick` du bon de commande. Repli sûr sans HTMLRewriter. Vérifié en local avec wrangler pages dev (vrai HTMLRewriter, nonce sur les 5 à 16 scripts de chaque page, catalogue chargé dans le navigateur, aucune violation CSP) et en ligne : build déployé (version 2026-10-26-1404), connexion 200, menu 401 sans session. NON vérifié en ligne connecté (session absente) : checklist points 12-13.
- Webhook Stripe, 2 échecs : NON diagnostiqués. Pas de clé Stripe ni de tableau de bord pour moi ; je vois seulement `webhook:last` = 21/10 20:05 UTC OK et les 4 ventes live traitées (mailed/refunded/compta). Causes déjà corrigées dans le code : products.json absent pendant une reconstruction (A-FAIRE.md) et objets Stripe étrangers (Big Cartel). A faire par vgthmind : Stripe > Développeurs > Webhooks > Livraisons > cliquer chaque échec (400 = whsec à reposer, 500 = me donner le texte, 503 = clé à reposer) et « Renvoyer ».
- DEPLOY_HOOK_URL et alerte R2 : rien à préparer côté code (lecture du secret et ligne d'état déjà en place). Demandent le tableau de bord Cloudflare : Pages > Paramètres > Deploy hooks (créer, copier l'URL) puis `npx wrangler secret put DEPLOY_HOOK_URL` ; Notifications > Usage Based Billing > R2 (5 Go, 500 000 opérations, vers contact@). Détail dans A-FAIRE.md.
- Bascule Standard.html + raccourci admin : DÉJÀ faite le 21/10 (Le Standard.html, Admin du site.url/.lnk et ranger-bureau.mjs pointent sur www.vgthmind.org ; il ne reste que les liens de l'ancien outils-e073a53c.pages.dev, qui est un autre site).
- A DECIDER / A FAIRE PAR vgthmind, rien touché : médiateur de la consommation, adresse de retour, tu/vous, prix USA 29 € (La Poste ~35 €), 2FA GitHub, DMARC.
- Checklist : 24 points (2 ajoutés pour tester l'admin après la CSP).

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

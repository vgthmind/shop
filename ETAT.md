# ETAT (2026-10-26, soir)
Site OUVERT en réel : www.vgthmind.org, Worker en LIVE_MODE 1. Le site (admin, pages, CGV avec adresse de retour) est à jour sur main. Le Worker déployé a les corrections factures / acompte / solde sans photos / promo ; il n'a pas encore les alertes Gmail ni la nature de compta (point 1).

## Reste à faire (le plus important d'abord)
1. TOI : poser le secret `npx wrangler secret put ALERT_EMAIL_2` (valeur = ta Gmail ; pas dans le dépôt public), puis relancer checkout-worker\Deployer-worker.bat. Apporte : alertes envoyées aussi sur la Gmail en plus de contact@ (transfert IONOS gardé), et nature de compta « Prestation de services » (location, collab, production visuelle, custom sur vêtement du client : case « Vêtement fourni par le client » dans le devis) ou « Vente de marchandises » (le reste). Le garde-fou m'interdit déploiements et secrets.
2. TOI : coller « Script Google compte pro (a coller).txt » (Outils Taff) dans Apps Script et redéployer : les lignes « Prestation de services » passent en BIC dans Ma comptabilité (remboursements inclus).
3. TOI : dérouler CHECKLIST-TESTS.md (19 points). Vérifié par moi : acompte 0,60 € du 26/10 arrivé en compta (clé compta:ok, file vide, aucune erreur). NON vérifié en ligne (pas de session admin ni client) : facture (ville unique, prix unitaire), avoir, solde sans photos, suppression d'un code promo ; couverts par tests automatiques, à confirmer à la main.
4. TOI : photo de la collection grise (image d'accueil) et photo d'origine du pantalon denim bleu.
5. TOI : 7 liens Instagram manquants : pantalon-dd001, pantalon-ff001, pantalon-vc001, SC_0009, sc_0008, short-ml001, short-sg001.
6. TOI : désactiver le renouvellement BigCartel avant avril 2027 (BigCartel gardé en secours).
7. SUIVI LA POSTE : à confirmer sur la prochaine vraie commande (mail « livrée », codes retour, validité de la clé). MOI : je regarde le KV après le prochain envoi.
8. MOI, 1er décembre 2026 : mention de TVA 2027 (VAT_MENTION_2027 + profil du Facturier ; 293 B valable jusqu'au 31/12/2026).
9. PLUS TARD : médiateur de la consommation ; styles en ligne de la CSP /admin ; sharp 0.35.5 (commit be02ee5, non fait).

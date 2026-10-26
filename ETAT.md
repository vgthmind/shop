# ETAT (2026-10-26)
Site OUVERT en réel : www.vgthmind.org, Worker en LIVE_MODE 1, main = 50fb2f1 + ce commit. Secrets du Worker présents (Stripe, webhook, Resend, COMPTA, LAPOSTE, TURNSTILE, DEPLOY_HOOK_URL). Rien n'est en attente de déploiement.

## Reste à faire (le plus important d'abord)
1. TOI : Stripe → Développeurs → Webhooks → Livraisons : ouvrir les 2 événements en échec, noter le code (400 = whsec à reposer, 500 = me donner le texte, 503 = clé à reposer) puis « Renvoyer ». Je ne peux pas les lire (pas d'accès Stripe).
2. TOI : dérouler CHECKLIST-TESTS.md (page « Tests à faire à la main » dans Outils Taff), surtout l'admin après la CSP (points 11-12) et la connexion iPhone (points 1-3), puis « Copier mes réponses » dans le chat.
3. TOI : Search Console : « Valider la correction » (404, Extraits de produits, Fiches de marchand) et vérifier que sitemap.xml est soumis.
4. TOI : photo de la collection grise (image d'accueil) et photo d'origine du pantalon denim bleu (détourage).
5. TOI : 7 liens Instagram manquants (reel_url) : pantalon-dd001, pantalon-ff001, pantalon-vc001, SC_0009 (sacoche), sc_0008, short-ml001, short-sg001.
6. TOI (décision) : adresse du vendeur sur les factures (aujourd'hui « vgthmind, Vitry-sur-Seine, SIRET »). Dis oui et je l'ajoute.
7. MOI, sur ton OK : ménage des branches distantes du dépôt. Déjà fusionnées dans main (sans risque) : favicons-audit-2026-10-13, mode-acces, nuit/corrections, nuit/envoi-trafic, nuit/integration, nuit/legal, nuit/studio-photo, test-acces. Non fusionnées (à regarder avant) : bascule-prete, bascule-prete-v2, claude/keen-hypatia-ikrv7l, nuit-2026-10-12 (+39 commits), nuit/audit, suivi-colis.
8. MOI, sur ton OK : restes BigCartel : Raccourcis/Admin BigCartel.url, dossier Archives BigCartel, data/catalog.bigcartel-import.json + generator/import-catalog.js (archiver), dossiers assets/bigcartel/ et assets/theme/bc/ (simples noms).
9. MOI, 1er décembre 2026 : vérifier le texte définitif de la mention de TVA 2027 (décret) ; variable VAT_MENTION_2027 du Worker + profil du Facturier (293 B valable jusqu'au 31/12/2026).
10. PLUS TARD (à revoir) : médiateur de la consommation (aucun pour l'instant) ; CSP /admin : styles en ligne encore autorisés (seuls les scripts sont en nonces).

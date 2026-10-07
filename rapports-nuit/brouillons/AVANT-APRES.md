# Tableau avant / après — relecture rapide

Base « avant » : version **commitée** de `theme/pages/*.html` (vos CGV modifiées en local ne sont pas visibles ici : à comparer à la main). Niveaux : **O** = obligatoire avant lancement, **R** = recommandé. Les références détaillées (Légifrance, service-public, CNIL, DGCCRF) sont dans `../legal.md`.

## A. Mentions légales (`mentions-legales.html`)

| # | Avant | Après | Pourquoi | Niv. |
|---|---|---|---|---|
| A1 | « Site édité par vgthmind, entrepreneur individuel » | Nom et prénom d'état civil + nom commercial « vgthmind » | LCEN 6-III-1 : identité de la personne physique | O |
| A2 | « Vitry-sur-Seine » seulement | Adresse complète de domiciliation | LCEN 6-III-1, L111-1 | O |
| A3 | Pas de téléphone | Ligne « Téléphone » | LCEN 6-III-1 ; L111-1 (à valider Q1) | O |
| A4 | Pas de directeur de publication | « Directeur de la publication : … » | LCEN 6-III-1 | O |
| A5 | Pas d'immatriculation | « Répertoire des métiers (RM) : … » ou « non applicable » | Registre d'immatriculation (Q2) | O |
| A6 | « TVA non applicable, art. L. 223-3 du CIBS » | « TVA non applicable, article 293 B du CGI » | Référence vérifiée ; CIBS non confirmé | O |
| A7 | « Contact : … ou formulaire de contact » | Email seul (+ téléphone) | Le formulaire n'existe pas | O |
| A8 | Hébergeur GitHub (adresse), pas de téléphone ; Cloudflare = « service de commande » | GitHub + champ téléphone ; Cloudflare nommé hébergeur des données de commande ; Stripe nommé | LCEN 6-III-1 b | O |
| A9 | Commentaire HTML « MEDIATEUR : emplacement prévu » | Rubrique « Médiation de la consommation » avec les coordonnées du médiateur | L612-1, L616-1, R616-1 | O |
| A10 | — | Rubrique « Propriété intellectuelle » | Protection des créations | R |
| A11 | — | Rubrique « Données personnelles » → lien vers la politique | Cohérence | R |

## B. Politique de confidentialité (`confidentialite.html`)

| # | Avant | Après | Pourquoi | Niv. |
|---|---|---|---|---|
| B1 | Pas de responsable de traitement | Identité + contact du responsable | RGPD art. 13.1.a | O |
| B2 | Données : nom, adresse, email | + téléphone (demandé par Stripe), n° commande/suivi, messages, données techniques (IP) ; paiement = Stripe seul | RGPD art. 13 ; `phone_number_collection` activé | O |
| B3 | Finalité unique « traitement et livraison » | 4 finalités avec **base légale** chacune (contrat, obligation légale, intérêt légitime) | RGPD art. 13.1.c | O |
| B4 | Stripe, Resend, Cloudflare cités ; « transporteur » | + **GitHub** et **La Poste/Colissimo** nommés ; rôle de chacun ; « aucune donnée vendue » | RGPD art. 13.1.e | O |
| B5 | Aucun transfert hors UE mentionné | Paragraphe transferts (US : Stripe, Resend, Cloudflare, GitHub ; Canada) + garanties DPF/CCT à confirmer | RGPD art. 13.1.f, 44-46 | O |
| B6 | « le temps de la commande + 10 ans » | Durées par catégorie : commandes [5 ans proposé], compta 10 ans, messages [3 ans proposé], sauvegardes 180 jours | RGPD art. 5.1.e ; L123-22 Code de commerce | O |
| B7 | Droits : accès, rectification, suppression ; « en DM Instagram » puis email | + limitation, opposition, portabilité, directives post-mortem ; **email d'abord** ; délai 1 mois ; réclamation **CNIL** (adresse) | RGPD art. 15-22, 77 ; LIL art. 85 | O |
| B8 | « Cloudflare Web Analytics n'utilise aucun cookie » | Section Cookies : cookie fonctionnel `announcementClosed` (8 h), mesure sans cookie, Stripe, contenus Instagram (choix A/B) | CNIL cookies ; `embed.js` | O |
| B9 | — | Mention « données nécessaires » | RGPD art. 13.2.e | R |
| B10 | Pas de date | « Dernière mise à jour : … » | Transparence | R |

## C. Conditions générales de vente (`cgv.html`)

| # | Avant | Après | Pourquoi | Niv. |
|---|---|---|---|---|
| C1 | « Les pièces réalisées sur commande personnalisée ne sont ni reprises ni échangées, sauf défaut de fabrication » | Bloc IMPORTANT : **pièces déjà réalisées (customs déjà terminés inclus) → rétractation 14 jours** ; seul le **sur-mesure** est exclu ; garanties légales pour tous | L221-28 3° s'applique aux biens faits selon les spécifications du consommateur ; un custom déjà fait et mis en vente n'en relève pas | O |
| C2 | Pas de définition des produits | Art. 2 : 2.1 pièces déjà réalisées (dont customs déjà faits) ; 2.2 commandes sur-mesure (définition, procédure) | Séparation claire demandée | O |
| C3 | Pas d'article « Vendeur » | Art. 1 : identité, SIRET, contact, version/date des CGV | L111-1, L221-5 | O |
| C4 | Prix : rien dans les CGV | Art. 3 : prix en euros TTC, « TVA non applicable art. 293 B », frais de livraison avant paiement, tarifs [À REMPLIR] | L112-1, arrêté 3/12/1987 | O |
| C5 | « Paiement sécurisé par carte, Apple Pay, Google Pay » | Art. 4.1 : commande **avec obligation de paiement**, formation du contrat au paiement accepté | L221-14 (Q9) | O |
| C6 | Pas de processus sur-mesure | Art. 4.2 : récapitulatif écrit (spécifications, prix, délais, rappel de l'exclusion) accepté par le client avant paiement | Preuve que le bien est « selon les spécifications » | O |
| C7 | Rien sur la confirmation | Art. 4.3 : mail de confirmation + CGV en PDF + formulaire ; archivage 10 ans des contrats ≥ 120 € ; facture sur demande | L221-13 ; L213-1 (seuil à vérifier) | O |
| C8 | Rien sur l'indisponibilité | Art. 4.4 : information + remboursement sous 14 jours | bonne pratique | R |
| C9 | « Livraison via Colissimo, délais et frais calculés… » (aucun délai) | Art. 5.1 : délai de préparation, date limite de livraison [À REMPLIR] ; à défaut 30 jours | L111-1, L221-5, L216-1 | O |
| C10 | Rien sur le retard | Art. 5.2 : mise en demeure, résolution, remboursement 14 jours | L216-2, L216-3 | O |
| C11 | Douane hors UE : phrase unique | Art. 5.4 : même contenu + colis refusé/non retiré pour frais de douane | Réduit les litiges (Q12) | R |
| C12 | Rien sur les risques/dommages | Art. 5.5 : transfert des risques à la livraison, signalement sous [7] jours | L216-4 | R |
| C13 | « Droit de rétractation de 14 jours, sauf… » (1 ligne) | Art. 6 complet : **point de départ** (réception, dernier colis), jours non ouvrables, **comment** se rétracter, **retour** sous 14 jours, **frais de renvoi** [choix], état de la pièce, **remboursement sous 14 jours** (frais de livraison standard inclus, mêmes moyens, retenue possible) | L221-18 à L221-25 | O |
| C14 | Pas de formulaire | **Formulaire type de rétractation** (annexe à l'art. R221-1) en fin de page, FR et EN | L221-5 2°, L242-1 (sinon délai porté à 12 mois, L221-20) | O |
| C15 | — | Art. 6.5 clients hors UE : droit accordé aux mêmes conditions [à confirmer] ; 6.6 commandes mixtes | Cohérence Canada (Q5) | R |
| C16 | — | Art. 7 : sur-mesure exclu **une fois récapitulatif accepté et payé** ; option d'annulation avant fabrication ; garanties maintenues | L221-28 3° | O |
| C17 | « 2 ans à compter de la livraison » pour les deux garanties ; « reprise, réparée ou remboursée selon le cas » | Art. 8 : conformité = 2 ans dès la délivrance, présomption 24 mois, **choix réparation/remplacement**, puis réduction/résolution ; vices cachés = **2 ans dès la découverte**, annulation ou réduction | L217-3 à L217-20 ; C. civ. 1641-1649 | O |
| C18 | « Contactez-moi en DM Instagram » | Email d'abord (preuve écrite), Instagram en complément | Preuve des réclamations | O |
| C19 | Pas de médiateur | Art. 10 : réclamation écrite préalable puis médiateur [À REMPLIR] | L612-1, L616-1, R616-1 | O |
| C20 | « Voir… Confidentialité / Mentions légales » | Art. 11 : lien vers la politique de confidentialité | Cohérence | R |
| C21 | — | Art. 12 propriété intellectuelle (+ droits sur les éléments fournis par le client) | Sur-mesure | R |
| C22 | — | Art. 13 droit français + protections impératives du pays de résidence ; langue (FR prévaut) | Rome I art. 6 | R |
| C23 | Commentaires HTML « À FAIRE VALIDER PAR UN JURISTE » | Supprimés | Visibles dans le code source | R |
| C24 | Phrase « VGTHMIND… » (3 étapes) | **Conservée telle quelle** (sous « À PROPOS ») ; ajout d'une phrase sur les variations propres aux pièces faites main | Valeur de marque ; conformité aux photos | R |

## D. Mails de confirmation (`mails-confirmation.md`)

| # | Avant | Après | Pourquoi | Niv. |
|---|---|---|---|---|
| D1 | Pied de mail d'une phrase : rétractation + lien CGV | Bloc « Informations à conserver » (vendeur, prix, livraison, rétractation, exception sur-mesure, garanties, médiation) FR et EN | L221-13 + L221-5 | O |
| D2 | Lien vers la page CGV seulement | + **PDF daté des CGV et du formulaire type en pièce jointe** (préférable) | Un lien n'est pas un support durable (CJUE C-49/11) | O |

## E. Instagram (`instagram-sans-script.md`)

| # | Avant | Après | Pourquoi | Niv. |
|---|---|---|---|---|
| E1 | `embed.js` d'Instagram chargé sur **46 pages** (`custom/head.html`) | Ligne supprimée (script inutile : aucun `blockquote.instagram-media`) | Aucune requête vers Meta par défaut | O |
| E2 | Fiches produit (20) : clic sur l'affiche → iframe Instagram | Affiche = **lien** vers le reel (nouvel onglet), plus d'iframe | Aucun contenu tiers sur le site | R (O si l'iframe est conservée sans info claire) |

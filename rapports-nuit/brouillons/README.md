# Brouillons juridiques (nuit/legal)

Fichiers **prêts à remplacer** le contenu de `theme/pages/` (même format : blocs `<p>`, English puis Français, `vg-lang-sep`, titres `h3-fs`, accents en entités HTML) :

| Brouillon | Remplace | 
|---|---|
| `mentions-legales.html` | `theme/pages/mentions-legales.html` |
| `confidentialite.html` | `theme/pages/confidentialite.html` |
| `cgv.html` | `theme/pages/infos-conditions-generales.html` |

Autres documents : `AVANT-APRES.md` (tableau de relecture), `mails-confirmation.md` (support durable, PDF), `instagram-sans-script.md` (retrait d'`embed.js`). Rapport d'origine : `../legal.md`.

## Comment appliquer (plus tard, sans conflit avec vos CGV locales)
1. Les brouillons partent de la version **commitée** des CGV. Comparez avec votre version locale (outil de diff) et reportez vos modifications dans `cgv.html` avant de remplacer.
2. Remplacer les `[À REMPLIR …]` (liste ci-dessous) ; chercher `REMPLIR` et `CONFIRMER` dans chaque fichier : il ne doit plus en rester.
3. Faire valider par le juriste (questions : fin de `../legal.md`).
4. Copier dans `theme/pages/`, puis `node generator/build.js` avant de commiter (règle de CLAUDE.md).

## Informations à fournir
- **Identité** : nom et prénom d'état civil (comme à l'INSEE) — éditeur, directeur de publication, vendeur, responsable de traitement.
- **Adresse** de domiciliation / d'activité (et **adresse de retour** des colis, si différente) ; **téléphone**.
- **Immatriculation** : numéro RM + département, ou « non applicable » (à confirmer avec la CCI/CMA).
- **Médiateur** : nom, adresse postale, site web, email/formulaire.
- **Livraison** : délai de préparation (jours ouvrés), date limite totale (jours), tarifs France / international, délai de signalement d'un dommage (proposé 7 jours), délai de réponse au service client (proposé 5 jours ouvrés).
- **Rétractation** : frais de renvoi **à la charge du client ou à la vôtre** (le brouillon propose « à votre charge », à confirmer) ; annulation gratuite d'une commande sur-mesure avant fabrication (option).
- **Sur-mesure** : procédure concrète pour passer commande (email, DM Instagram, produit dédié dans la boutique) — à décrire art. 2.2.
- **Garanties** : confirmer si des pièces sont d'occasion/récupérées revendues en l'état (présomption 12 mois au lieu de 24).
- **RGPD** : durées de conservation (propositions : commandes 5 ans, messages 3 ans), confirmation des garanties de transfert (DPF/CCT) de chaque prestataire, choix A ou B pour Instagram.
- **Dates** : « Version du … » (CGV) et « Dernière mise à jour » (confidentialité).

## Points à valider par le juriste avant mise en ligne
`[À CONFIRMER PAR LE JURISTE]` (CGV 6.5, rétractation hors UE) ; seuil d'archivage de 120 € (art. L213-1) ; formulation « commande avec obligation de paiement » côté Stripe ; distinction exacte pièce déjà faite / sur-mesure pour les pièces « custom ».

# À faire de ton côté (pas à pas, sans terminal)

Le Worker de paiement est **déjà mis à jour** (version `f5466451…`, voir `ETAT.md`). Il reste **1 petit usage à connaître** (A) et **1 test conseillé** (B).
Tu n'as jamais besoin d'ouvrir un terminal : tout se fait par double-clic.

---

## A. Détourage depuis l'iPhone (tunnel Cloudflare)

Testé de bout en bout sur ce PC : le tunnel démarre, le détourage aboutit par l'adresse Cloudflare avec le mot de passe, et il est refusé sans le mot de passe.
Gratuit, sans carte bancaire, sans compte.

**Sur le PC :**
1. Ouvre le dossier `vgthmind-shop`, puis `detourage-server`.
2. Double-clique sur **`Lancer-detourage-iphone.bat`** (le programme de Cloudflare, `cloudflared.exe`, est déjà téléchargé).
3. Au bout de quelques secondes, le message **« PRÊT »** s'affiche et une page **« Détourage iPhone prêt »** s'ouvre avec un long lien. Il est **déjà copié**.
4. **Laisse la fenêtre noire ouverte** tant que tu travailles sur l'iPhone. La fermer arrête tout.
   - Si Windows demande une autorisation (pare-feu) : **Autoriser**.

**Sur l'iPhone :**
1. Envoie-toi le lien (Messages à toi-même, Notes, AirDrop ou e-mail).
2. Ouvre-le **dans Safari**. Le studio « Nouvelle pièce » s'ouvre ; le lien se range tout seul dans l'iPhone.
3. Connecte-toi à GitHub comme d'habitude, ajoute tes photos : le détourage part vers ton PC (environ 10 à 30 secondes par photo).

**À savoir :**
- **À chaque lancement, l'adresse change** : renvoie le nouveau lien à l'iPhone (30 secondes). L'ancien lien ne marche plus.
- Le PC doit être **allumé, connecté à internet, avec la fenêtre noire ouverte**. Sinon le studio affiche « Le PC ne répond pas… ».
- **Ne partage jamais ce lien** : il contient le mot de passe de ton serveur de détourage. Si tu l'as envoyé par erreur :
  supprime le fichier `detourage-server\.token` (fichier caché : dans l'explorateur, onglet « Affichage » → « Éléments masqués »), puis relance le `.bat` : nouveau mot de passe, l'ancien lien est mort.
- Sur le PC, le détourage continue de marcher comme avant avec `Lancer-detourage.bat` (sans mot de passe, tout reste sur le PC).
- Une adresse fixe est possible mais demande un nom de domaine géré par Cloudflare (le tien est chez IONOS) : à voir plus tard, rien à faire maintenant.

---

## B. Test conseillé du panier avec le choix du pays (5 minutes)

Le panier propose maintenant « Pays de livraison » : le client choisit son pays **avant** de payer, le prix de livraison s'affiche pour ce pays,
et l'adresse demandée sur la page de paiement est limitée à ce pays.

1. Dans le studio, crée une pièce fictive (prix 10 €, poids 800 g, mode « Colis ») et publie-la. Attends 1 à 2 minutes que le site se reconstruise.
2. Sur le site, ajoute-la au panier et ouvre le panier. Choisis tour à tour **France** (livraison offerte), **Belgique** (15 €), **Allemagne** (15 €), **Canada** (29 €), **Russie** (refusée, bouton bloqué).
3. Mets une **ancienne pièce** dans le panier : ses frais restent ceux d'avant (par exemple 5 € en France, 25 € ailleurs pour ch_0002).
4. Le paiement lui-même est toujours bloqué tant que le site est en mode test avec une clé « live » (message « Paiement en mode test uniquement ») : c'est le réglage actuel, ne change rien.
5. Archive/supprime la pièce fictive depuis la page « Pièces » (ou demande-le à Claude).

---

## C. Rien à faire, mais bon à savoir : brouillon automatique

Le studio sauvegarde sur l'appareil les photos ajoutées, la vidéo et la fiche en cours. Si tu quittes la page (ou si Safari la recharge),
un bandeau **« Brouillon retrouvé »** propose **Reprendre** ou **Effacer**. Les photos sont de nouveau détourées à la reprise.
Le brouillon est effacé après une publication réussie, ou au bout de 14 jours.

---

## Ce qui reste de ton côté (inchangé)
Liens Instagram manquants, médiateur, adresse, CGV, TVA, passage Stripe live, DNS IONOS : voir `ETAT.md`.

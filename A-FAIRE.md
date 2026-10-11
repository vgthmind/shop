# À faire de ton côté (pas à pas, sans terminal)

Tout ce qui pouvait être fait sans toi est fait. Il reste **2 petites actions** (A et B) et **1 test** (C).
Tu n'as jamais besoin d'ouvrir un terminal : tout se fait par double-clic.

---

## A. Mettre à jour le Worker de paiement (frais de port des nouvelles pièces) — 2 minutes

Pourquoi : tant que ce n'est pas fait, le paiement continue de fonctionner comme avant, mais une pièce
ajoutée depuis le studio n'aura pas son port calculé par le Worker (il refusera le paiement au lieu de
mettre 0 €, c'est voulu : jamais de port gratuit par erreur).

1. Ouvre le dossier `vgthmind-shop`, puis le dossier `checkout-worker`.
2. Double-clique sur **`Deployer-worker.bat`**.
3. Une fenêtre noire s'ouvre. Si une page Cloudflare s'ouvre dans ton navigateur, connecte-toi et clique sur **Autoriser**.
4. Attends le message **« Deployed »** (ou « Uploaded »). Puis appuie sur une touche pour fermer.
5. Si tu vois une erreur rouge : recopie-la et colle-la dans Claude.

Ce que ça change : le Worker calcule le port des pièces ajoutées avec le studio (poids, mode lettre/colis, grille Colissimo
de la page « Expédition »). **Les anciennes pièces gardent exactement leur port actuel.** Mode test Stripe inchangé (aucun vrai paiement).

---

## B. Détourage depuis l'iPhone (tunnel Cloudflare) — 5 minutes la première fois

C'est gratuit, sans carte bancaire et sans compte à créer.

**Sur le PC :**
1. Ouvre le dossier `vgthmind-shop`, puis `detourage-server`.
2. Double-clique sur **`Lancer-detourage-iphone.bat`**.
3. La **première fois seulement**, il télécharge un petit programme de Cloudflare (`cloudflared`, environ 40 Mo, depuis le site officiel de Cloudflare). Attends 1 à 3 minutes.
   - Si Windows affiche « Windows a protégé votre ordinateur » : clique sur **Informations complémentaires** puis **Exécuter quand même**.
   - Si le pare-feu Windows demande une autorisation : clique sur **Autoriser l'accès**.
4. Au bout de quelques secondes, le message **« PRÊT »** s'affiche et une page **« Détourage iPhone prêt »** s'ouvre avec un long lien.
   Ce lien est **déjà copié** (tu peux aussi cliquer sur le bouton « Copier le lien »).
5. **Laisse la fenêtre noire ouverte** tant que tu travailles sur l'iPhone. La fermer arrête tout.

**Sur l'iPhone :**
1. Envoie-toi le lien : Messages (à toi-même), Notes, AirDrop ou e-mail.
2. Ouvre le lien **dans Safari**. Le studio « Nouvelle pièce » s'ouvre ; le lien se range tout seul dans l'iPhone puis disparaît de la barre d'adresse.
3. Connecte-toi à GitHub comme d'habitude, ajoute tes photos : le détourage part vers ton PC (comptez environ 10 à 30 secondes par photo).

**À savoir :**
- **À chaque lancement, l'adresse change** : il faut donc renvoyer le nouveau lien à l'iPhone (30 secondes). L'ancien lien ne marche plus.
- Le PC doit être **allumé, connecté à internet, avec la fenêtre noire ouverte**. Sinon le studio affiche « Le PC ne répond pas… ».
- **Ne partage jamais ce lien** : il contient le mot de passe de ton serveur de détourage. Si tu l'as envoyé à quelqu'un par erreur :
  supprime le fichier `detourage-server\.token` (il est caché si tu ne vois pas les extensions : active « Éléments masqués » dans l'explorateur), puis relance le `.bat` : un nouveau mot de passe est créé et l'ancien lien est mort.
- Sur le PC, le détourage continue de marcher comme avant avec `Lancer-detourage.bat` (sans mot de passe, tout reste sur le PC).
- **Je n'ai pas pu tester le tunnel lui-même** (je n'ai pas téléchargé `cloudflared` sans ton accord). J'ai testé le serveur, le mot de passe, la lecture du lien et le studio.
  Si le tunnel ne démarre pas ou si le lien ne marche pas, colle dans Claude le texte de la fenêtre noire.

**Pourquoi l'adresse change :** c'est la version gratuite « sans compte » de Cloudflare. Une adresse fixe est possible mais demande un nom de domaine
géré par Cloudflare (le tien est chez IONOS) : à voir plus tard avec Claude, rien à faire maintenant.

---

## C. Test conseillé du port d'une nouvelle pièce (après A) — 5 minutes

1. Dans le studio, crée une pièce fictive (prix 10 €, poids 800 g, mode « Colis ») et publie-la.
2. Sur le site, ajoute-la au panier, choisis **France** puis **International**, clique sur **Checkout**.
   - France : livraison offerte (c'est le réglage actuel de la grille : Colissimo offert en France).
   - International : 29,00 € (reste du monde) — c'est le tarif le plus élevé, car le pays n'est connu qu'après.
3. Ne paie pas (ou paie avec la carte de test Stripe `4242 4242 4242 4242`).
4. Archive/supprime la pièce fictive depuis la page « Pièces » (ou demande-le à Claude).

---

## D. Rien à faire, mais bon à savoir : brouillon automatique

Le studio sauvegarde maintenant, sur l'appareil, les photos ajoutées, la vidéo et la fiche en cours.
Si tu quittes la page (ou si Safari la recharge), un bandeau **« Brouillon retrouvé »** propose **Reprendre** ou **Effacer**
à la réouverture. Les photos sont à nouveau détourées à la reprise. Le brouillon est effacé après une publication réussie, ou au bout de 14 jours.

---

## Ce qui reste de ton côté (inchangé)
Liens Instagram manquants, médiateur, adresse, CGV, TVA, passage Stripe live, DNS IONOS : voir `ETAT.md`.

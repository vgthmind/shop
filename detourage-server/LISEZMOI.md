# Serveur de détourage — lancé sur ton PC (mode actuel)

Rôle : détourer les photos avec BiRefNet « lite » (licence MIT, usage commercial permis). Gratuit, sans compte ni carte, rien ne sort de ton PC.
Ne touche ni au Worker de paiement ni à Stripe.

## Utilisation (PC, Chrome)
1. Dans le dossier `vgthmind-shopdetourage-server`, **double-clique sur `Lancer-detourage.bat`**.
   La 1re fois : installation (quelques minutes) et téléchargement du modèle (224 Mo). Ensuite, ça démarre en ~10 s.
   Node.js doit être installé (c'est déjà le cas sur ton PC).
2. Laisse la fenêtre noire ouverte (elle affiche « Serveur de detourage lance… »). Ferme-la pour arrêter.
3. Ouvre le studio photo (« Nouvelle pièce ») dans **Chrome** : le champ « Serveur de détourage » doit contenir `http://localhost:7860` (valeur par défaut).
4. Chrome peut demander l'autorisation d'accéder aux appareils/réseau local : **Autoriser** (c'est ton propre PC).
5. Ajoute tes photos : le détourage part tout seul (~10 s par photo). Si le serveur n'est pas lancé, les photos restent « à détourer » ; lance le .bat puis clique ↻.

## iPhone (tunnel Cloudflare)
Double-clique sur **`Lancer-detourage-iphone.bat`** : il lance le serveur (écoute seulement sur ce PC) ET un tunnel Cloudflare « rapide » (gratuit, sans compte),
puis fabrique un lien à ouvrir sur l'iPhone (adresse du tunnel + mot de passe dans la partie après `#`, jamais envoyée à un site). Pas à pas : voir `A-FAIRE.md` à la racine.
- Sécurité : de l'extérieur, `/cut` exige le mot de passe (fichier `.token`, créé au premier lancement, ignoré par git) ; 20 refus par heure maximum, puis blocage ; en plus, seul le site vgthmind peut appeler le serveur depuis un navigateur.
- Depuis ce PC (`localhost:7860`), aucun mot de passe : comportement d'avant.
- L'adresse change à chaque lancement (tunnel sans compte) : renvoyer le nouveau lien à l'iPhone.
- Mode hébergeur (Docker / Cloud Run) : `DETOURAGE_OPEN=1` (déjà dans le Dockerfile) = pas de mot de passe, contrôle d'origine seulement.

---
# Autre mode : Google Cloud Run (non utilisé pour l'instant)

Rôle : détourer les photos avec BiRefNet « lite » (licence MIT) pour l'iPhone comme pour le PC.
Ne touche ni au Worker de paiement ni à Stripe. Aucune photo n'est conservée.

## Chiffres vérifiés (page officielle Cloud Run, oct. 2026 : https://cloud.google.com/run/pricing)
Niveau sans frais par mois, facturation « basée sur les requêtes » : **180 000 vCPU-secondes, 360 000 Gio-secondes, 2 millions de requêtes**,
appliqué sur les tarifs « niveau 1 ». **europe-west1 (Belgique)** est en niveau 1 (Paris europe-west9 aussi) : région choisie = **europe-west1**.
Mesuré ici : BiRefNet lite a besoin d'environ **5 Go de mémoire** au pic (4 threads, 9 s par photo sur mon PC) → réglage **4 vCPU / 8 Gio**.
Estimation : ~15 s × 4 vCPU = ~60 vCPU-s et ~120 Gio-s par photo → **~3 000 photos par mois dans le gratuit** (≈ 600 pièces de 5 photos).
Garde-fou dans le code : 100 détourages par jour maximum (variable `MAX_PER_DAY`), puis refus jusqu'au lendemain.
Petits coûts possibles hors Cloud Run (à confirmer sur ta facture) : stockage de l'image (~0,8 Go) dans Artifact Registry au-delà de son quota gratuit (quelques centimes/mois), sortie réseau (quelques centimes).
Une alerte de budget **prévient, elle ne bloque pas** : c'est pourquoi le service est limité à 1 instance et 100 photos/jour.

## 1. Compte et facturation
1. https://console.cloud.google.com — connecte-toi avec vgthm66@gmail.com, accepte les conditions.
2. Menu ☰ → **Facturation** → crée un compte de facturation (carte bancaire). Si on te propose l'essai gratuit de 300 $, tu peux l'accepter ou non ; le niveau sans frais de Cloud Run existe dans les deux cas.
3. Menu ☰ → **IAM et administration** → **Gérer les ressources** → **Créer un projet** : nom `vgthmind-detourage`, rattaché à ton compte de facturation.

## 2. Alerte de budget à 1 € (à faire AVANT le déploiement)
1. Menu ☰ → **Facturation** → **Budgets et alertes** → **Créer un budget**.
2. Nom : `alerte 1 euro`. Périmètre : projet `vgthmind-detourage` (ou tous les projets). Suivant.
3. Montant : **Budget ciblé** = **1 €** (la devise est celle du compte de facturation). Suivant.
4. Seuils : garde 50 %, 90 %, 100 % (tu peux ajouter 10 %). Coche **Envoyer des alertes par e-mail aux administrateurs de la facturation**. **Terminer**.
5. Si un jour tu reçois l'alerte : Facturation → **Gérer le compte de facturation** → ou le projet → **Désactiver la facturation** coupe tout.

## 3. Déployer le service
Prérequis : le dossier `detourage-server` doit être sur GitHub (branche main) : je le pousse.
1. Menu ☰ → **Cloud Run** → **Créer un service** (accepte d'activer les API proposées : Cloud Run, Cloud Build, Artifact Registry).
2. Choisis **Déployer en continu depuis un dépôt (source ou fonction)** → **Configurer avec Cloud Build**.
3. Autorise GitHub, choisis le dépôt **vgthmind/shop**, branche **^main$**.
4. Type de build : **Dockerfile**. Emplacement de la source : **/detourage-server/Dockerfile**. Enregistrer.
5. Nom du service : `detourage`. Région : **europe-west1 (Belgique)**.
6. Authentification : **Autoriser les appels non authentifiés** (c'est le serveur lui-même qui refuse tout site autre que le tien).
7. Facturation : **Basée sur les requêtes**. Autoscaling : **Nombre minimal d'instances 0**, **maximal 1**.
8. Déplie **Conteneur(s), volumes, mise en réseau, sécurité** :
   - Onglet Paramètres : **Mémoire 8 Gio**, **CPU 4**, **Délai d'expiration de la requête 300 s**, **Requêtes simultanées maximales par instance : 1**.
   - Active **Boost de CPU au démarrage** si proposé.
   - Variables (facultatif) : `ALLOWED_ORIGINS` = `https://vgthmind.github.io` (c'est déjà la valeur par défaut ; à compléter plus tard avec ton vrai domaine, séparé par une virgule).
9. **Créer**. La 1re construction prend 10 à 15 min (le modèle de 224 Mo est téléchargé).
10. Copie l'adresse du service (`https://detourage-xxxxx-ew.a.run.app`), ouvre `<adresse>/health` : tu dois lire `{"ok":true,"ready":true,...}`. Donne-moi l'adresse : je la mets dans le site.

## À savoir
- Le service s'éteint quand on ne s'en sert pas : le 1er détourage suivant prend 10 à 40 s de réveil (le studio l'affiche).
- Chaque nouvelle version déployée ajoute une image dans Artifact Registry : supprime les anciennes de temps en temps.
- Les libellés de la console peuvent légèrement changer ; dis-moi ce que tu vois si une étape ne correspond pas.

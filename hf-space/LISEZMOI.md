# Serveur de détourage (Espace Hugging Face) — mise en route, sans terminal

Rôle : détourer les photos avec BiRefNet « lite » (licence MIT, usage commercial permis), pour l'iPhone comme pour le PC.
Gratuit, sans clé ni jeton. Aucune photo n'est gardée. Ne touche ni au Worker de paiement ni à Stripe.

## 1. Créer le compte (une fois)
1. Va sur https://huggingface.co/join
2. E-mail : vgthm66@gmail.com — mot de passe : à toi. Nom d'utilisateur : **vgthmind**.
3. Ouvre l'e-mail de confirmation de Hugging Face et clique sur le lien.

## 2. Créer l'Espace (une fois)
1. Va sur https://huggingface.co/new-space
2. Owner : **vgthmind** — Space name : **detourage** (ne change pas ce nom, il est dans le site).
3. License : MIT. SDK : **Docker** puis **Blank**.
4. Hardware : **CPU basic · 2 vCPU · 16 GB · FREE**.
5. Visibilité : **Public** (obligatoire : un Espace privé demanderait un jeton).
6. Clique **Create Space**.

## 3. Mettre les 4 fichiers
1. Dans l'Espace : onglet **Files** → **Add file** → **Upload files**.
2. Glisse les 4 fichiers du dossier `vgthmind-shop\hf-space` : **Dockerfile**, **README.md**, **package.json**, **server.js**.
   (Pas `node_modules`, pas `models`, pas `package-lock.json`.) Accepte de remplacer le README.md existant.
3. Clique **Commit changes to main**.

## 4. Attendre et vérifier
1. L'Espace affiche « Building » (5 à 10 min la 1re fois), puis « Running ».
2. Ouvre https://vgthmind-detourage.hf.space/health : tu dois lire `{"ok":true,"ready":true,"error":null}`.
3. Dis-le moi dans Claude Code : je lance le test de bout en bout avec une vraie photo.

## À savoir
- L'Espace s'endort après ~48 h sans appel : le 1er détourage suivant le réveille (1 à 3 min, le studio l'affiche).
- Un détourage prend ~10 à 40 s par photo sur le processeur gratuit ; les photos sont traitées une par une.
- Seuls les sites listés dans la variable **ALLOWED_ORIGINS** peuvent appeler le serveur depuis un navigateur
  (par défaut `https://vgthmind.github.io`). Quand le site aura son vrai domaine : Espace → Settings →
  Variables and secrets → New variable → nom `ALLOWED_ORIGINS`, valeur `https://vgthmind.github.io,https://ton-domaine.fr`.
  Limite honnête : ça bloque les autres sites web, pas quelqu'un qui appellerait l'adresse hors navigateur ; le pire
  qu'il puisse faire est consommer le quota gratuit (sans accès à ta boutique ni à tes données).
- Si l'Espace est indisponible, les photos restent « à détourer » et la pièce n'est pas publiable ; bouton ↻ pour relancer.

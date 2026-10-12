# Créer ton jeton GitHub pour l'admin de la boutique

**À quoi ça sert :** l'admin (Catalogue, Poids & ports, Nouvelle pièce, et l'éditeur Sveltia) a besoin d'une « clé » pour enregistrer tes modifications dans la boutique. Cette clé s'appelle un **jeton**.

**Pourquoi un nouveau jeton :** l'ancienne connexion donnait une clé qui ouvrait **tous** tes projets GitHub, y compris ton portfolio. Le nouveau jeton n'ouvre **que la boutique**. Si quelqu'un te le volait, il ne pourrait toucher à rien d'autre.

Ça prend 5 minutes, une seule fois (puis une fois par an, quand il expire).

---

## Étape 1 — Créer le jeton (sur iPhone ou sur PC, même chose)

1. Ouvre ce lien dans Safari (iPhone) ou dans ton navigateur (PC) :
   **https://github.com/settings/personal-access-tokens/new**
2. Si GitHub te le demande, connecte-toi avec ton compte **vgthmind** (et tape ton code de vérification si on te le demande).
3. Tu arrives sur une page « New fine-grained personal access token ». Remplis de haut en bas :
   - **Token name** : tape `admin boutique`
   - **Resource owner** : laisse **vgthmind**
   - **Expiration** : choisis **366 days** (ou « Custom » et une date dans un an). GitHub t'enverra un mail avant la fin.
   - **Description** : tu peux laisser vide.
4. **Repository access** : touche **« Only select repositories »**.
   - Un menu « Select repositories » apparaît : touche-le, tape `shop`, puis touche **vgthmind/shop**.
   - Vérifie qu'il n'y a **que vgthmind/shop** dans la liste. Surtout pas « All repositories ».
5. **Permissions** : descends jusqu'à **« Repository permissions »** (ou touche le bouton **« Add permissions »** s'il est là, puis choisis **Contents**).
   - Sur la ligne **Contents**, choisis **« Read and write »**.
   - Ne touche à rien d'autre. (La ligne « Metadata : Read-only » se coche toute seule, c'est normal.)
6. Tout en bas, touche **« Generate token »**, puis confirme si GitHub te le redemande.
7. GitHub affiche ton jeton : une longue suite qui commence par **`github_pat_`**.
   - Touche l'icône **copier** (deux petits carrés) à côté.
   - ⚠️ GitHub ne te le montrera **qu'une seule fois**. Garde la page ouverte jusqu'à l'étape 2.

---

## Étape 2 — Le coller dans l'admin

1. Ouvre **https://vgthmind.github.io/shop/admin/catalogue.html**
2. Touche **« Se connecter avec GitHub »**. Une fenêtre GitHub s'ouvre et se ferme toute seule (c'est pour le stock).
3. Une petite fenêtre **« Jeton GitHub de la boutique »** apparaît.
   - Touche la case, puis **Coller**.
   - Touche **Valider**.
4. Le catalogue se charge : c'est bon. Le jeton reste gardé sur cet appareil.

À refaire **une fois sur chaque appareil** (iPhone et PC). Sur le 2e appareil, tu n'auras plus le jeton : crée-en simplement un 2e (étape 1, nom `admin boutique PC` par exemple). C'est prévu pour.

**Pour l'éditeur avancé Sveltia** (bouton « Éditeur avancé » du tableau de bord) : sur la page de connexion, touche **« Sign In Using Access Token »** (et pas « Sign In with GitHub »), colle le même jeton, valide.

---

## Étape 3 — Fermer l'ancienne porte (une fois le Worker redéployé)

À faire **après** l'étape « Redéployer le Worker » du rapport de la nuit.

1. Ouvre **https://github.com/settings/applications**
2. Dans **« Authorized OAuth Apps »**, touche l'application de la boutique (celle qui pointe vers `vgthmind-shop-checkout`), puis **« Revoke »** (révoquer) et confirme.
3. La prochaine fois que tu touches « Se connecter avec GitHub » dans l'admin, GitHub te redemandera ton accord une fois : accepte. Cette connexion-là ne peut plus rien modifier, elle sert juste à prouver que c'est toi.

---

## Si quelque chose ne va pas

| Message dans l'admin | Ce qu'il faut faire |
|---|---|
| « Ce jeton est un jeton classique… » | Tu as créé un jeton « classic ». Refais l'étape 1 avec le lien donné (il ouvre directement le bon type). |
| « Ce jeton n'a pas accès au dépôt vgthmind/shop » | À l'étape 4, tu n'as pas choisi vgthmind/shop. Crée un nouveau jeton. |
| « Le jeton ne peut pas écrire… » | À l'étape 5, Contents n'est pas sur « Read and write ». Crée un nouveau jeton. |
| « GitHub refuse ce jeton : il est expiré… » | Il a expiré ou a été mal copié. Crée un nouveau jeton (étape 1) et colle-le. |

**Téléphone perdu ou prêté :** sur https://github.com/settings/personal-access-tokens, touche le jeton de cet appareil puis **« Delete »**. Ou, depuis l'appareil lui-même : Tableau de bord de l'admin → **« Oublier le jeton sur cet appareil »**.

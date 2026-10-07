# Mail de confirmation : support durable (L221-13) — texte FR/EN prêt à coller

> Proposition uniquement. **`checkout-worker/emails.ts` n'a pas été modifié.** À appliquer plus tard, avec les champs `[À REMPLIR]` renseignés (mêmes valeurs que dans `cgv.html`).

## 1. Réponse : PDF joint ou non ?

**Oui, joindre un PDF des CGV est préférable — en plus d'un résumé dans le corps du mail.**

- L'obligation (art. L221-13 du Code de la consommation) : confirmer le contrat **sur un support durable**, avec toutes les informations de L221-5 (identité du vendeur, prix, livraison, rétractation + formulaire type, garanties, médiation…), au plus tard à la livraison.
- Un **simple lien** vers une page du site ne suffit pas : la page peut changer après la commande (la CJUE, affaire C-49/11 *Content Services*, a jugé qu'un lien ne constitue pas, en soi, un support durable).
- Le **corps du mail** est un support durable en pratique (le client le conserve), mais seul un **PDF daté** prouve *quelle version* des CGV s'appliquait le jour de la commande.
- Donc : (1) résumé légal dans le corps du mail (texte ci-dessous), (2) **PDF des CGV (FR+EN) + formulaire type en pièce jointe**, (3) lien vers la page en ligne pour la commodité.
- Mise en œuvre technique (à faire plus tard) : générer un PDF **versionné et jamais écrasé** (ex. `cgv-2026-10-07.pdf` dans `docs/`), que le Worker lit et joint (Resend accepte les pièces jointes via le champ `attachments`, en base64 ou par URL — à vérifier dans la doc Resend). Garder les anciennes versions en ligne. Taille attendue : < 200 Ko.
- Si le PDF ne peut pas être joint dans un premier temps : le texte complet ci-dessous dans le corps du mail est le minimum acceptable (question Q4 pour le juriste).

## 2. Textes pour `emails.ts`

Remplacent les clés `withdrawal` et `cgv` de l'objet `T` (FR et EN) et le pied de mail `legalFooter()`.

### FR (client en France) — bloc à placer sous « La suite »

```
INFORMATIONS À CONSERVER

Vendeur : [À REMPLIR : nom et prénom d'état civil], entrepreneur individuel (vgthmind) — SIRET 952 025 369 00028 — [À REMPLIR : adresse] — [À REMPLIR : téléphone] — vgthm66@gmail.com.

Prix : toutes taxes comprises (TVA non applicable, art. 293 B du CGI), frais de livraison inclus dans le total ci-dessus. Livraison hors Union européenne : droits de douane et taxes locales à votre charge.

Livraison : au plus tard [À REMPLIR : nombre] jours après la commande (délai de préparation de [À REMPLIR] jours ouvrés puis acheminement Colissimo). En cas de retard, vous pouvez me mettre en demeure puis résoudre le contrat (art. L216-2 et L216-3 du Code de la consommation).

Droit de rétractation (pièces déjà réalisées) : vous pouvez vous rétracter sans motif dans les 14 jours suivant la réception de la pièce (de la dernière pièce si livraisons séparées). Écrivez-moi à vgthm66@gmail.com ou utilisez le formulaire type joint. Renvoyez la pièce dans les 14 jours suivant votre notification, non portée, avec ses étiquettes ; les frais de renvoi sont [À REMPLIR : à votre charge / à ma charge]. Je vous rembourse (frais de livraison standard inclus) au plus tard 14 jours après avoir été informé de votre décision, par le même moyen de paiement.
Exception : les commandes sur-mesure, faites selon vos demandes, ne sont pas concernées (art. L221-28, 3° du Code de la consommation).

Garanties légales : garantie de conformité (2 ans à compter de la délivrance, art. L217-3 et suivants du Code de la consommation) et garantie des vices cachés (2 ans à compter de la découverte, art. 1641 et suivants du Code civil), pour toutes les pièces.

Médiation de la consommation : après une réclamation écrite restée sans réponse satisfaisante, vous pouvez saisir gratuitement [À REMPLIR : nom du médiateur, adresse, site web].

Conditions générales de vente complètes et formulaire type de rétractation : en pièce jointe (PDF, version du [À REMPLIR : date]) et en ligne : [lien CGV].
```

### EN (client hors France) — block under "What happens next"

```
INFORMATION TO KEEP

Seller: [À REMPLIR : nom et prénom d'état civil], sole proprietor (vgthmind) — SIRET 952 025 369 00028 — [À REMPLIR : adresse] — [À REMPLIR : téléphone] — vgthm66@gmail.com.

Price: all taxes included (VAT not applicable, art. 293 B of the French Tax Code); shipping is included in the total above. Delivery outside the European Union: customs duties and local taxes are paid by you.

Delivery: at the latest [À REMPLIR : number] days after the order ([À REMPLIR] business days of preparation, then Colissimo transit). If delivery is late, you may put me on notice and then terminate the contract (art. L216-2 and L216-3 of the French Consumer Code).

Right of withdrawal (pieces already made): you may withdraw without giving a reason within 14 days of receiving the piece (the last piece if delivered separately). Write to vgthm66@gmail.com or use the attached model form. Send the piece back within 14 days of notifying me, unworn, with its tags; return shipping is [À REMPLIR : at your expense / at my expense]. I will refund you (standard shipping included) no later than 14 days after being informed of your decision, by the same means of payment.
Exception: made-to-measure orders, made to your own requests, are not covered (art. L221-28 3° of the French Consumer Code).

Legal warranties: warranty of conformity (2 years from delivery, art. L217-3 et seq. of the French Consumer Code) and warranty against hidden defects (2 years from discovery, art. 1641 et seq. of the French Civil Code), for all pieces.

Consumer mediation: after a written complaint that remains unresolved, you may refer the matter free of charge to [À REMPLIR : nom du médiateur, adresse, site web].

Full terms of sale and model withdrawal form: attached (PDF, version of [À REMPLIR : date]) and online: [terms link].
```

### Formulaire type de rétractation (à mettre aussi dans le PDF)

FR :
```
FORMULAIRE TYPE DE RÉTRACTATION
(à compléter et renvoyer uniquement si vous souhaitez vous rétracter du contrat)
À l'attention de [À REMPLIR : nom et prénom d'état civil, adresse, vgthm66@gmail.com] :
Je vous notifie par la présente ma rétractation du contrat portant sur la vente du bien ci-dessous :
Commandé le / reçu le :
Numéro de commande :
Nom du consommateur :
Adresse du consommateur :
Signature du consommateur (uniquement en cas de notification sur papier) :
Date :
```
EN :
```
MODEL WITHDRAWAL FORM
(complete and return only if you wish to withdraw from the contract)
To [À REMPLIR : nom et prénom d'état civil, adresse, vgthm66@gmail.com]:
I hereby give notice that I withdraw from my contract of sale of the following goods:
Ordered on / received on:
Order number:
Name of consumer:
Address of consumer:
Signature of consumer (only if notified on paper):
Date:
```

## 3. Gabarit de code proposé (non appliqué)

```ts
// Dans T.fr / T.en : remplacer `withdrawal` par un tableau de paragraphes.
// legal: string[]   // un élément par paragraphe ci-dessus (titre « INFORMATIONS À CONSERVER » inclus)

function legalFooter(o: OrderData, t: (typeof T)['fr']) {
  const paras = t.legal.map((p) => `<p style="margin:0 0 8px;font:12px/1.5 ${FONT};color:#555">${esc(p)}</p>`).join('');
  return `<div style="margin:24px 0 0;padding-top:14px;border-top:1px solid ${LINE}">${paras}`
    + `<p style="margin:8px 0 0;font:12px/1.5 ${FONT};color:#555">${link(o.cgvUrl, esc(t.cgv))}</p></div>`;
}
// Version texte : ajouter `...t.legal` avant la ligne `${t.withdrawal} ${t.cgv} : ${o.cgvUrl}`.
// Pièce jointe : fetch du PDF versionné, puis `attachments: [{ filename: 'CGV-vgthmind-AAAA-MM-JJ.pdf', content: <base64> }]` dans l'appel Resend.
```

## 4. Points à valider (juriste)

- Le mail peut-il distinguer pièces déjà réalisées / sur-mesure ? Le Worker ne connaît pas aujourd'hui le type de commande ; le texte ci-dessus couvre les deux cas.
- Le choix « frais de renvoi à la charge du client » doit être identique dans les CGV, le mail et le formulaire.
- Langue : aujourd'hui tout pays ≠ FR reçoit l'anglais ; pour BE/CH/CA francophones, envisager FR+EN dans le même mail.

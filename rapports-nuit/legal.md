# Relecture juridique — vgthmind/shop (branche `nuit/legal`)

> Relecture documentaire uniquement, **aucune page modifiée**. Ce rapport n'est pas un avis juridique et ne remplace pas un avocat/juriste. Les sources sont celles que je connais ; celles que j'ai pu recouper en ligne cette nuit sont marquées ✔, les autres sont à re-vérifier sur Légifrance avant de coller les textes.
> Périmètre relu : `theme/pages/mentions-legales.html`, `confidentialite.html`, `infos-conditions-generales.html` (CGV, FR+EN dans la même page), `contact-914a3d.html`, `checkout-worker/emails.ts` (mails de commande), `checkout-worker/index.ts` (paramètres Stripe Checkout, rétention KV), `theme/layout.html` / `custom/head.html` (cookies, scripts tiers), `data/shop-settings.json`.
> Légende : **PRÉSENT / ABSENT / À CORRIGER** ; niveau **[OBLIG]** = obligatoire avant lancement, **[RECO]** = recommandé.
> Les textes proposés utilisent des champs `[À REMPLIR]`. Conformément à la consigne, aucun prénom : l'identité légale de l'EI (nom/prénom d'état civil) est à insérer par vgthmind.

---

## 0. Les 6 points les plus urgents

1. **Les « customs » (hoodie, tee-shirt…) sont des pièces déjà faites** (taille fixe, photos, fiche produit) : l'exception L221-28 3° ne vaut que pour un bien *confectionné selon les spécifications du consommateur ou nettement personnalisé*. Une pièce aérographiée en avance puis mise en vente n'est probablement **pas** exclue du droit de rétractation. [OBLIG] (§3)
2. **Médiateur de la consommation : absent** (simple commentaire HTML vide). [OBLIG] (§2)
3. **Mentions légales incomplètes** : pas de nom/prénom (« vgthmind » seul ne suffit pas pour une personne physique), pas d'adresse complète, pas de téléphone, pas de directeur de publication, hébergeur sans téléphone, Cloudflare non cité. [OBLIG] (§1)
4. **Rétractation : clause d'une ligne** — manque point de départ, modalités, **formulaire type**, frais de retour, remboursement sous 14 jours. Sans formulaire type ni information sur les frais de retour, le délai peut passer à 12 mois (L221-20) et les frais de retour restent à la charge du vendeur (L221-23). [OBLIG] (§3)
5. **Délai de livraison absent** (L111-1 / L221-5 / L216-1), alors que ce sont des pièces cousues main. [OBLIG] (§5)
6. **Politique de confidentialité trop courte** (pas de responsable de traitement, bases légales, transferts hors UE, droits complets, CNIL, tel collecté par Stripe non cité ; contact « DM Instagram » insuffisant). [OBLIG] (§6)

Constat à part : la mention TVA cite **« art. L. 223-3 du CIBS »**. La référence classique et vérifiée ✔ est **art. 293 B du CGI**. Je n'ai trouvé aucune source confirmant « L. 223-3 CIBS » : à remplacer par 293 B du CGI sauf avis contraire du comptable. [OBLIG] (§5)

---

## 1. Mentions légales (`mentions-legales.html`)

Sources : [LCEN, art. 6-III (Légifrance, loi 2004-575)](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000801164) ; [Code de la consommation L111-1, L221-5](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006069565/LEGISCTA000032220699) ; [service-public.fr « Mentions légales d'un site »](https://entreprendre.service-public.fr/vosdroits/F31228) ; [DGCCRF e-commerce](https://www.economie.gouv.fr/dgccrf/Publications/Vie-pratique/Fiches-pratiques/vente-a-distance-internet).

| Élément | Statut | Niveau |
|---|---|---|
| Statut (entrepreneur individuel), SIRET | PRÉSENT | — |
| **Nom et prénom** de l'éditeur (personne physique) | **ABSENT** : seule la marque « vgthmind » figure. LCEN 6-III-1 exige le nom/prénom de la personne physique. | OBLIG |
| **Adresse postale complète** (pas seulement « Vitry-sur-Seine ») | **ABSENT** (ETAT.md : adresse d'activité CCI en attente) | OBLIG |
| **Téléphone** (LCEN 6-III-1 ; L111-1 « coordonnées téléphoniques ») | **ABSENT**. La CJUE (C-298/07) admet une alternative au téléphone si elle permet un contact rapide et direct, mais la DGCCRF attend un numéro : à valider (Q1). | OBLIG |
| Email | PRÉSENT (vgthm66@gmail.com) | — |
| « ou formulaire de contact » | **À CORRIGER** : la page contact n'a pas de formulaire (mailto + Instagram). Mention obsolète. | OBLIG (cohérence) |
| **Directeur de la publication** | **ABSENT** (LCEN 6-III-1) : pour une EI, c'est l'éditeur lui-même | OBLIG |
| Immatriculation : RM (répertoire des métiers) si activité artisanale, ou RCS si commerciale ; code APE optionnel | **ABSENT** : un fabricant de vêtements est en principe artisan → « RM [dépt] » (Q2) | OBLIG |
| Hébergeur : nom, adresse, **téléphone** | **À CORRIGER** : GitHub cité avec adresse, téléphone absent ; **Cloudflare** (Worker, Durable Object, KV : données de commande et stock) non cité comme hébergeur de données | OBLIG |
| Mention TVA | **À CORRIGER** (voir §5) | OBLIG |
| Médiateur | **ABSENT** (voir §2) | OBLIG |
| Propriété intellectuelle (photos, créations, marque) | **ABSENT** | RECO |
| Bloc « Hébergement » à changer le jour J (ETAT.md) | À faire au passage `shop.vgthmind.org` / domaine | OBLIG au lancement |
| Commentaire HTML `<!-- MEDIATEUR … -->` et `À FAIRE VALIDER PAR UN JURISTE` visibles dans le code source public | À retirer au lancement | RECO |

**Texte FR proposé (remplace les deux blocs actuels)**

```html
<p><strong><span class="h3-fs">&Eacute;DITEUR</span></strong></p>
<p>Site &eacute;dit&eacute; par [NOM PR&Eacute;NOM &mdash; tels qu'au r&eacute;pertoire SIRENE], entrepreneur individuel, exer&ccedil;ant sous le nom commercial &laquo;&nbsp;vgthmind&nbsp;&raquo;.<br>
SIRET : 952 025 369 00028 &mdash; [RM [d&eacute;partement] / mention d'immatriculation si applicable]<br>
Adresse : [ADRESSE POSTALE COMPL&Egrave;TE], 94400 Vitry-sur-Seine, France<br>
T&eacute;l&eacute;phone : [NUM&Eacute;RO] &mdash; Email : vgthm66@gmail.com<br>
Directeur de la publication : [NOM PR&Eacute;NOM].<br>
TVA non applicable, article 293 B du CGI.</p>
<p><strong><span class="h3-fs">H&Eacute;BERGEMENT</span></strong></p>
<p>Site h&eacute;berg&eacute; par GitHub, Inc. (GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, &Eacute;tats-Unis ([T&Eacute;L&Eacute;PHONE si disponible]). Le service de commande et les donn&eacute;es de commande sont h&eacute;berg&eacute;s par Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, &Eacute;tats-Unis. Les paiements sont trait&eacute;s par Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower, Dublin 2, Irlande.</p>
<p><strong><span class="h3-fs">M&Eacute;DIATION DE LA CONSOMMATION</span></strong></p>
<p>Voir les <a href="/infos-conditions-generales">conditions g&eacute;n&eacute;rales de vente</a> (article &laquo;&nbsp;M&eacute;diation&nbsp;&raquo;).</p>
<p><strong><span class="h3-fs">PROPRI&Eacute;T&Eacute; INTELLECTUELLE</span></strong></p>
<p>Les cr&eacute;ations, photographies, textes et le nom vgthmind sont prot&eacute;g&eacute;s. Toute reproduction sans autorisation &eacute;crite est interdite.</p>
```

**Texte EN**

```html
<p><strong><span class="h3-fs">PUBLISHER</span></strong></p>
<p>Site published by [FIRST NAME LAST NAME &mdash; as registered], sole proprietor (entrepreneur individuel), trading as &ldquo;vgthmind&rdquo;.<br>
SIRET: 952 025 369 00028 &mdash; [trades register (RM) number if applicable]<br>
Address: [FULL POSTAL ADDRESS], 94400 Vitry-sur-Seine, France<br>
Phone: [NUMBER] &mdash; Email: vgthm66@gmail.com<br>
Publication director: [FIRST NAME LAST NAME].<br>
VAT not applicable, article 293 B of the French Tax Code (CGI).</p>
<p><strong><span class="h3-fs">HOSTING</span></strong></p>
<p>Website hosted by GitHub, Inc. (GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA ([PHONE if available]). The order service and order data are hosted by Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA. Payments are processed by Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower, Dublin 2, Ireland.</p>
<p><strong><span class="h3-fs">CONSUMER MEDIATION</span></strong></p>
<p>See the <a href="/infos-conditions-generales">terms of sale</a> (&ldquo;Mediation&rdquo; section).</p>
<p><strong><span class="h3-fs">INTELLECTUAL PROPERTY</span></strong></p>
<p>The designs, photographs, texts and the vgthmind name are protected. Any reproduction without written permission is prohibited.</p>
```

(Adresses Cloudflare/Stripe à re-vérifier sur leurs pages légales officielles avant publication.)

---

## 2. Médiateur de la consommation — **ABSENT** [OBLIG]

Sources : [Code de la consommation L612-1 (droit au médiateur), L616-1 et R616-1 (information du consommateur), L641-1 (sanction)](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006069565/LEGISCTA000032220933) ✔ ; [economie.gouv.fr — médiation de la consommation](https://www.economie.gouv.fr/mediation-conso) ✔ (liste officielle des médiateurs référencés par la CECMC).

- Tout professionnel vendant à des consommateurs doit **garantir** au consommateur un recours effectif à un médiateur, **adhérer** à un médiateur référencé, et **communiquer ses coordonnées et l'adresse de son site** sur le site, dans les CGV, et en cas de litige non résolu après réclamation écrite (L616-1, R616-1). Le défaut d'information est passible d'une amende administrative (L641-1). ✔
- Le médiateur est choisi dans la liste officielle (CECMC). Plusieurs médiateurs sectoriels ou transversaux acceptent les micro-entreprises ; la cotisation varie (demander des devis). **Décision à prendre : choisir et adhérer** (Q3). Tant qu'il n'y a pas d'adhésion, les champs ci-dessous restent à compléter.
- La plateforme européenne de RLL/ODR est, à ma connaissance, **fermée depuis juillet 2025** (règlement UE 2024/3228) : ne pas ajouter de lien « ec.europa.eu/consumers/odr ». À vérifier (Q3).

**Texte FR à ajouter dans les CGV (article « Médiation »)**

```html
<p><strong><span class="h3-fs">M&Eacute;DIATION DE LA CONSOMMATION</span></strong></p>
<p>En cas de litige, vous pouvez d'abord me contacter par &eacute;crit &agrave; vgthm66@gmail.com pour trouver une solution amiable. Si la r&eacute;clamation n'aboutit pas, vous avez le droit de recourir gratuitement au m&eacute;diateur de la consommation : [NOM DU M&Eacute;DIATEUR], [ADRESSE POSTALE], [SITE WEB], [EMAIL / FORMULAIRE EN LIGNE]. Le m&eacute;diateur ne peut &ecirc;tre saisi qu'apr&egrave;s une r&eacute;clamation &eacute;crite pr&eacute;alable aupr&egrave;s du vendeur.</p>
```

**Texte EN**

```html
<p><strong><span class="h3-fs">CONSUMER MEDIATION</span></strong></p>
<p>If a dispute arises, please first contact me in writing at vgthm66@gmail.com so we can find an amicable solution. If this does not resolve your complaint, you have the right to use, free of charge, the consumer mediator: [MEDIATOR NAME], [POSTAL ADDRESS], [WEBSITE], [EMAIL / ONLINE FORM]. The mediator can only be contacted after a prior written complaint to the seller.</p>
```

---

## 3. Droit de rétractation (CGV + mails)

Sources : [L221-18 (14 jours), L221-19, L221-20 (prolongation 12 mois), L221-21, L221-23 (frais de renvoi), L221-24 (remboursement 14 jours), L221-25, L221-28 3°, L221-5 2°, L221-13](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006069565/LEGISCTA000032220726) ; [formulaire type : annexe à l'art. R221-1](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032221030) ✔ (le contrat doit être accompagné du formulaire type, à peine de nullité de l'art. L242-1) ; [service-public.fr « Rétractation vente à distance »](https://www.service-public.fr/particuliers/vosdroits/F31207) ; [DGCCRF](https://www.economie.gouv.fr/dgccrf/droit-de-retractation).

| Point | Statut | Niveau |
|---|---|---|
| Principe 14 jours | PRÉSENT (CGV FR/EN, mails FR/EN) | — |
| Point de départ (réception du bien ; pour plusieurs biens livrés séparément, dernier colis) | **ABSENT** | OBLIG |
| Comment se rétracter (déclaration non ambiguë, email, adresse) | **ABSENT** | OBLIG |
| **Formulaire type de rétractation** | **ABSENT** | OBLIG |
| **Frais de retour** (à la charge du consommateur si le vendeur l'a indiqué ; sinon à ses frais) | **ABSENT** : à préciser (surtout vers le Canada, très coûteux) | OBLIG |
| Délai de renvoi (14 jours après notification) | **ABSENT** | OBLIG |
| **Remboursement** : sous 14 jours après décision, incl. frais de livraison standard, même moyen de paiement, possibilité de différer jusqu'à réception ou preuve d'expédition | **ABSENT** | OBLIG |
| Responsabilité en cas de dépréciation (manipulation au-delà du nécessaire) | **ABSENT** | RECO |
| Exception L221-28 3° (« confectionnés selon les spécifications du consommateur ou nettement personnalisés ») | **À CORRIGER** : voir ci-dessous | OBLIG |
| Cohérence mails ↔ CGV | Mêmes mots, mais le mail ne donne ni modalités ni formulaire. Un simple lien vers les CGV n'est pas un « support durable » au sens de L221-13 / CJUE C-49/11 (Content Services) : joindre le texte dans le mail (Q4). | OBLIG |
| Droit applicable aux clients UE hors France / Canada | Pas de clause. Pour les consommateurs UE, la protection impérative de leur pays de résidence s'applique (Rome I, art. 6) ; pour le Canada (notamment le Québec), règles locales (Q5). | RECO / Q5 |

### Problème de fond : les « customs » vendus sont-ils « personnalisés » ?
Les fiches `custom-hoodie`, `custom-tee-shirt-col-en-v` sont des pièces **déjà réalisées** (couleur, taille « Size L », photos). Si le client ne fournit pas de spécifications (choix du motif, de la taille sur mesure, texte…), le bien n'est pas « confectionné selon ses spécifications » : **le droit de rétractation s'applique**. L'exception ne vaut que pour une **vraie commande sur mesure/personnalisée** passée *après* un échange avec le client (pièce unique faite pour lui). Deux modèles possibles :
- (a) pièces « custom » prêtes à vendre → rétractation normale, le terme « custom » ne doit pas laisser croire le contraire ;
- (b) commande personnalisée sur demande (devis, échanges, paiement) → exception L221-28 3°, **à indiquer avant paiement, produit par produit**, et à faire accepter explicitement.
→ Q6 pour le juriste. En attendant, la phrase « Les pièces réalisées sur commande personnalisée ne sont ni reprises ni échangées sauf défaut de fabrication » est à corriger : les garanties légales (conformité, vices cachés) **s'appliquent aussi** aux pièces personnalisées.

**Texte FR proposé (remplace « DROIT DE RÉTRACTATION » et la phrase « IMPORTANT »)**

```html
<p><strong><span class="h3-fs">IMPORTANT</span></strong>&nbsp;: Les pi&egrave;ces r&eacute;alis&eacute;es sur commande personnalis&eacute;e, c'est-&agrave;-dire confectionn&eacute;es selon vos sp&eacute;cifications ou nettement personnalis&eacute;es, ne b&eacute;n&eacute;ficient pas du droit de r&eacute;tractation (article L221-28, 3&deg; du Code de la consommation). Elles restent couvertes par les garanties l&eacute;gales ci-dessous. Les autres pi&egrave;ces b&eacute;n&eacute;ficient du droit de r&eacute;tractation. V&eacute;rifiez bien la taille, le mod&egrave;le et les informations de la pi&egrave;ce avant de commander&nbsp;!</p>

<p><strong><span class="h3-fs">DROIT DE R&Eacute;TRACTATION</span></strong></p>
<p>Vous avez le droit de vous r&eacute;tracter de votre commande, sans donner de motif, dans un d&eacute;lai de 14 jours &agrave; compter du jour o&ugrave; vous (ou un tiers autre que le transporteur, que vous avez d&eacute;sign&eacute;) recevez la pi&egrave;ce ; en cas de commande de plusieurs pi&egrave;ces livr&eacute;es s&eacute;par&eacute;ment, &agrave; compter de la r&eacute;ception de la derni&egrave;re.</p>
<p>Pour exercer ce droit, notifiez-moi votre d&eacute;cision par une d&eacute;claration non &eacute;quivoque, par email &agrave; vgthm66@gmail.com ou par courrier &agrave; [ADRESSE POSTALE]. Vous pouvez utiliser le formulaire ci-dessous, sans que ce soit obligatoire. Il suffit d'envoyer votre communication avant la fin du d&eacute;lai de 14 jours.</p>
<p><strong>Retour de la pi&egrave;ce</strong> : renvoyez-la-moi sans retard excessif, au plus tard 14 jours apr&egrave;s m'avoir communiqu&eacute; votre d&eacute;cision, &agrave; l'adresse indiqu&eacute;e ci-dessus, propre, non port&eacute;e, avec ses &eacute;tiquettes. <strong>Les frais directs de renvoi sont &agrave; votre charge</strong> [OU : sont pris en charge par moi &mdash; &agrave; choisir]. Votre responsabilit&eacute; n'est engag&eacute;e qu'&agrave; l'&eacute;gard de la d&eacute;pr&eacute;ciation r&eacute;sultant de manipulations autres que celles n&eacute;cessaires pour &eacute;tablir la nature, les caract&eacute;ristiques et le bon fonctionnement du bien.</p>
<p><strong>Remboursement</strong> : je vous rembourse tous les paiements re&ccedil;us, y compris les frais de livraison standard (hors suppl&eacute;ment si vous avez choisi un mode de livraison plus co&ucirc;teux), sans retard excessif et au plus tard 14 jours apr&egrave;s avoir &eacute;t&eacute; inform&eacute; de votre d&eacute;cision. Je peux diff&eacute;rer le remboursement jusqu'&agrave; la r&eacute;cup&eacute;ration de la pi&egrave;ce ou jusqu'&agrave; ce que vous ayez fourni une preuve d'exp&eacute;dition. Le remboursement est effectu&eacute; par le m&ecirc;me moyen de paiement que celui utilis&eacute; pour la commande.</p>
<p><strong>Formulaire type de r&eacute;tractation</strong> (&agrave; compl&eacute;ter et renvoyer uniquement si vous souhaitez vous r&eacute;tracter)&nbsp;:<br>
&Agrave; l'attention de [NOM PR&Eacute;NOM, ADRESSE, EMAIL] :<br>
Je vous notifie par la pr&eacute;sente ma r&eacute;tractation du contrat portant sur la vente du bien ci-dessous :<br>
Command&eacute; le / re&ccedil;u le :<br>
Num&eacute;ro de commande :<br>
Nom du consommateur :<br>
Adresse du consommateur :<br>
Signature du consommateur (uniquement en cas de notification du pr&eacute;sent formulaire sur papier) :<br>
Date :</p>
```

**Texte EN**

```html
<p><strong><span class="h3-fs">IMPORTANT</span></strong>: Pieces made to your specifications or clearly personalised are not eligible for the right of withdrawal (article L221-28, 3&deg; of the French Consumer Code). They remain covered by the legal warranties below. All other pieces are eligible for the right of withdrawal. Please double-check size, model and details before ordering!</p>

<p><strong><span class="h3-fs">RIGHT OF WITHDRAWAL</span></strong></p>
<p>You have the right to withdraw from your order, without giving any reason, within 14 days from the day you (or a third party other than the carrier, indicated by you) receive the piece; if several pieces are delivered separately, from the day you receive the last one.</p>
<p>To exercise this right, notify me of your decision by an unequivocal statement, by email to vgthm66@gmail.com or by post to [POSTAL ADDRESS]. You may use the model form below, but it is not mandatory. It is enough to send your communication before the 14-day period expires.</p>
<p><strong>Returning the piece</strong>: send it back to me without undue delay and no later than 14 days after telling me of your decision, at the address above, clean, unworn, with its tags. <strong>You bear the direct cost of returning the piece</strong> [OR: I bear the cost &mdash; choose one]. You are only liable for any diminished value resulting from handling other than what is necessary to establish the nature, characteristics and functioning of the item.</p>
<p><strong>Refund</strong>: I will reimburse all payments received from you, including standard delivery costs (excluding any extra cost if you chose a more expensive delivery method), without undue delay and no later than 14 days after being informed of your decision. I may withhold the refund until I have received the piece back or you have provided proof of shipment. The refund uses the same payment method as the original order.</p>
<p><strong>Model withdrawal form</strong> (complete and return only if you wish to withdraw):<br>
To [NAME, ADDRESS, EMAIL]:<br>
I hereby give notice that I withdraw from my contract of sale of the following good:<br>
Ordered on / received on:<br>
Order number:<br>
Name of consumer:<br>
Address of consumer:<br>
Signature of consumer (only if this form is notified on paper):<br>
Date:</p>
```

**Mails (`emails.ts`, clés `withdrawal` / `cgv`, + texte)** : remplacer par une phrase plus complète qui renvoie aux modalités **et** joindre/coller le formulaire type dans le mail de confirmation.

FR : `Droit de rétractation de 14 jours à compter de la réception, sauf pour les pièces réalisées sur commande personnalisée (art. L221-28 3° du Code de la consommation). Modalités, frais de retour et formulaire type de rétractation ci-dessous / dans les conditions générales de vente.`
EN : `14-day right of withdrawal from receipt, except for pieces made to custom order (art. L221-28 3° of the French Consumer Code). Withdrawal procedure, return costs and model withdrawal form below / in the terms of sale.`

---

## 4. Garanties légales

Sources : [Code de la consommation, garantie légale de conformité, L217-3 à L217-20 (depuis l'ordonnance 2021-1247)](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006069565/LEGISCTA000043979816) ✔ ; [Code civil 1641 à 1649](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006070721/LEGISCTA000006150301) ✔ ; [arrêté du 18 décembre 2014 (information sur les garanties)](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000029912547) ✔ ; [service-public.fr « Garantie légale de conformité »](https://www.service-public.fr/particuliers/vosdroits/F11094).

| Point | Statut | Niveau |
|---|---|---|
| Existence des deux garanties, références des articles | PRÉSENT | — |
| Durée « 2 ans à compter de la livraison » pour **les deux** garanties | **À CORRIGER** : conformité = 2 ans à compter de la délivrance (L217-7 présume le défaut antérieur pendant 24 mois) ✔ ; vices cachés = action **dans les 2 ans suivant la découverte du vice** (art. 1648), pas à compter de la livraison | OBLIG |
| « réparée, reprise ou remboursée selon le cas » | **À CORRIGER** : en conformité, le consommateur **choisit** réparation ou remplacement, sans frais (L217-9) ; réduction du prix ou résolution seulement si impossible, disproportionné ou délai dépassé (L217-14) ; vices cachés : résolution ou réduction du prix (art. 1644) | OBLIG |
| Contact « DM Instagram » uniquement | **À CORRIGER** : ajouter l'email (preuve écrite) | OBLIG |
| Texte intégral/résumé des droits (gratuité, 30 jours, suspension pendant l'immobilisation L217-16…) | **ABSENT** | RECO |
| Nom/adresse du vendeur garant (arrêté 2014) | Couvert si §1 corrigé | OBLIG |
| Garantie commerciale | Aucune annoncée : ne pas en promettre (« repris, remboursé » = geste commercial éventuel, à formuler comme tel) | RECO |

**Texte FR (remplace « GARANTIE LÉGALE »)**

```html
<p><strong><span class="h3-fs">GARANTIES L&Eacute;GALES</span></strong></p>
<p>Je reste tenu des d&eacute;fauts de conformit&eacute; du bien au contrat et des vices cach&eacute;s, dans les conditions suivantes. <em>Cette garantie s'applique &eacute;galement aux pi&egrave;ces r&eacute;alis&eacute;es sur commande personnalis&eacute;e.</em></p>
<p><strong>Garantie l&eacute;gale de conformit&eacute;</strong> (articles L217-3 &agrave; L217-20 du Code de la consommation) : vous disposez de 2 ans &agrave; compter de la d&eacute;livrance du bien pour agir ; pendant 24 mois, le d&eacute;faut est pr&eacute;sum&eacute; exister au moment de la d&eacute;livrance. Vous pouvez choisir entre la r&eacute;paration et le remplacement du bien, sans frais ; si ces solutions sont impossibles, disproportionn&eacute;es ou non r&eacute;alis&eacute;es dans un d&eacute;lai de 30 jours, vous pouvez obtenir une r&eacute;duction du prix ou la r&eacute;solution du contrat. Vous n'avez pas &agrave; prouver que le d&eacute;faut existait lors de la d&eacute;livrance. Cette garantie ne vous emp&ecirc;che pas d'invoquer la garantie des vices cach&eacute;s.</p>
<p><strong>Garantie des vices cach&eacute;s</strong> (articles 1641 &agrave; 1649 du Code civil) : vous pouvez agir dans les 2 ans suivant la d&eacute;couverte du vice, et choisir entre l'annulation de la vente (avec remboursement) ou la r&eacute;duction du prix.</p>
<p>Pour toute demande, &eacute;crivez-moi &agrave; vgthm66@gmail.com (ou en DM Instagram) avec photos et num&eacute;ro de commande.</p>
```

**Texte EN**

```html
<p><strong><span class="h3-fs">LEGAL WARRANTIES</span></strong></p>
<p>I remain liable for lack of conformity and for hidden defects under the following conditions. <em>These warranties also apply to pieces made to custom order.</em></p>
<p><strong>Legal warranty of conformity</strong> (articles L217-3 to L217-20 of the French Consumer Code): you have 2 years from delivery to act; during 24 months, the defect is presumed to have existed at delivery. You may choose between repair and replacement, free of charge; if these are impossible, disproportionate or not carried out within 30 days, you may obtain a price reduction or terminate the contract. You do not have to prove that the defect existed at delivery. This warranty does not prevent you from relying on the warranty against hidden defects.</p>
<p><strong>Warranty against hidden defects</strong> (articles 1641 to 1649 of the French Civil Code): you may act within 2 years of discovering the defect, and choose between cancelling the sale (with a refund) or a price reduction.</p>
<p>For any claim, email me at vgthm66@gmail.com (or DM on Instagram) with photos and your order number.</p>
```

(Q7 : vérifier avec le juriste l'articulation avec les pièces d'occasion/upcyclées : la durée de présomption de L217-7 est de 12 mois pour les biens d'occasion.)

---

## 5. Prix, TVA, livraison, douane

Sources : [CGI art. 293 B](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000041468414) ✔ (mention « TVA non applicable, art. 293 B du CGI » : [service-public.fr](https://entreprendre.service-public.fr/vosdroits/F21746)) ; [arrêté du 3 décembre 1987 (prix TTC)](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000333770) ; [Code de la consommation L112-1, L111-1, L221-5, L216-1 à L216-6, L221-14](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006069565/LEGISCTA000032220699) ; [douane.gouv.fr](https://www.douane.gouv.fr/).

| Point | Statut | Niveau |
|---|---|---|
| Mention TVA | **À CORRIGER** : « art. L. 223-3 du CIBS » → **art. 293 B du CGI**. Aussi, la réforme du seuil de franchise (25 000 € annoncée pour le 1er juin 2026 selon les sources consultées) est à vérifier avec le comptable (Q8) | OBLIG |
| Prix « TTC » | **ABSENT** sur le site : en franchise, le prix payé est le prix final ; l'écrire clairement | RECO (OBLIG si prix annoncé) |
| Frais de livraison avant commande | Calculés et affichés dans Stripe Checkout avant paiement ; non indiqués dans les CGV ni le panier (« rates … calculated at checkout ») ; pas de grille | RECO → mettre une grille ou une fourchette (L111-1, L112-1) |
| **Délai de livraison / de fabrication** | **ABSENT** : obligatoire (L111-1 3°, L221-5 ; à défaut, 30 jours max L216-1 ; recours L216-2 à L216-6) | OBLIG |
| Droits de douane hors UE | PRÉSENT (CGV FR/EN, mail EN) ; absent du panier/fiche produit | RECO → ajouter au panier |
| Facture | Non mentionnée | RECO : « facture sur demande » |
| Mention « commande avec obligation de paiement » (L221-14) | Le bouton relève de Stripe (« Payer ») ; texte custom_text présent | À valider (Q9) |
| Acceptation CGV au paiement | Phrase informative Stripe seulement, pas de case (`custom_text` dans `index.ts`) | RECO → `consent_collection[terms_of_service]=required` (URL à renseigner côté Stripe) |
| Rupture de stock/indisponibilité, pièces uniques | Non traitées | RECO |

**Texte FR (articles à ajouter / remplacer dans « LIVRAISON & PAIEMENT »)**

```html
<p><strong><span class="h3-fs">PRIX</span></strong></p>
<p>Les prix sont indiqu&eacute;s en euros, nets de TVA : TVA non applicable, article 293 B du CGI. Les frais de livraison sont affich&eacute;s avant la validation du paiement.</p>
<p><strong><span class="h3-fs">COMMANDE ET PAIEMENT</span></strong></p>
<p>La commande est form&eacute;e lorsque vous validez le paiement. Paiement s&eacute;curis&eacute; par carte bancaire, Apple Pay ou Google Pay via Stripe ; je n'ai jamais acc&egrave;s &agrave; vos donn&eacute;es bancaires. Un email de confirmation vous est envoy&eacute;. Une facture est disponible sur simple demande &agrave; vgthm66@gmail.com. Si une pi&egrave;ce devenait indisponible apr&egrave;s votre commande, vous en seriez inform&eacute; et rembours&eacute; sans retard.</p>
<p><strong><span class="h3-fs">LIVRAISON</span></strong></p>
<p>Chaque pi&egrave;ce &eacute;tant faite &agrave; la main, le d&eacute;lai de pr&eacute;paration est de [X] jours ouvr&eacute;s, auquel s'ajoute le d&eacute;lai d'acheminement Colissimo ([X] jours en France, [X] jours &agrave; l'international). La date limite de livraison est [X] jours maximum apr&egrave;s la commande. Frais de livraison : France [X] &euro; ; international [X] &euro; (selon le poids et la destination, affich&eacute;s avant paiement). Si la livraison n'a pas lieu dans le d&eacute;lai indiqu&eacute;, vous pouvez me mettre en demeure par &eacute;crit puis, &agrave; d&eacute;faut d'ex&eacute;cution sous 7 jours, r&eacute;soudre le contrat (articles L216-2 &agrave; L216-6).</p>
<p><strong>Livraisons hors Union europ&eacute;enne (Canada compris)</strong> : les droits de douane, taxes &agrave; l'importation et frais locaux &eacute;ventuels sont &agrave; votre charge ; ils ne sont inclus ni dans le prix ni dans les frais de livraison et peuvent &ecirc;tre exig&eacute;s &agrave; la livraison par le transporteur ou l'administration locale.</p>
```

**Texte EN**

```html
<p><strong><span class="h3-fs">PRICES</span></strong></p>
<p>Prices are in euros, without VAT: VAT not applicable, article 293 B of the French Tax Code (CGI). Shipping costs are shown before you confirm payment.</p>
<p><strong><span class="h3-fs">ORDER AND PAYMENT</span></strong></p>
<p>The order is formed when you confirm payment. Secure payment by credit card, Apple Pay or Google Pay through Stripe; I never have access to your card details. You will receive a confirmation email. An invoice is available on request at vgthm66@gmail.com. If a piece became unavailable after your order, you would be informed and refunded without delay.</p>
<p><strong><span class="h3-fs">SHIPPING</span></strong></p>
<p>As each piece is handmade, preparation takes [X] business days, plus Colissimo transit ([X] days in France, [X] days internationally). The latest delivery date is [X] days after the order. Shipping costs: France &euro;[X]; international &euro;[X] (depending on weight and destination, shown before payment). If delivery does not take place within that period, you may put me on notice in writing and, if I do not deliver within 7 days, terminate the contract (articles L216-2 to L216-6 of the French Consumer Code).</p>
<p><strong>Deliveries outside the European Union (including Canada)</strong>: import duties, taxes and any local fees are your responsibility; they are not included in the price or shipping costs and may be charged on delivery by the carrier or local authorities.</p>
```

---

## 6. RGPD, données personnelles, cookies (`confidentialite.html`)

Sources : [CNIL — mentions d'information (art. 13 RGPD)](https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence) ; [RGPD art. 13, 15-22, 28, 30, 44-49](https://eur-lex.europa.eu/eli/reg/2016/679/oj) ; [Loi Informatique et Libertés art. 85 (directives post mortem)](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000886460) ; [CNIL — cookies et traceurs / mesure d'audience](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies-solutions-pour-les-outils-de-mesure-daudience) ; [Code de commerce L123-22 (10 ans, pièces comptables)](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006220305).

| Point | Statut | Niveau |
|---|---|---|
| Identité du responsable de traitement + contact | **ABSENT** (renvoi aux mentions légales à ajouter) | OBLIG |
| Données collectées : nom, adresse, email | PRÉSENT | — |
| **Téléphone** (collecté par Stripe : `phone_number_collection` activé), **IP/journaux** (GitHub Pages, Cloudflare), contenu des commandes, suivi (n° de suivi) | **ABSENT** | OBLIG |
| Finalités | **À CORRIGER** (seule « traitement et livraison ») : ajouter paiement, facturation/comptabilité, SAV/garanties/rétractation, prévention de la fraude, mesure d'audience | OBLIG |
| Bases légales (exécution du contrat ; obligation légale ; intérêt légitime) | **ABSENT** | OBLIG |
| Destinataires/sous-traitants : Stripe, Resend, Cloudflare, GitHub, transporteur | **À CORRIGER** : Stripe, Resend, Cloudflare cités ; **GitHub** (hébergeur, journaux de visite) et **Colissimo/La Poste** (transporteur nommé en CGV) non nommés ; rôle de chacun absent (Stripe = responsable propre pour la conformité/fraude) | OBLIG |
| **Transferts hors UE** (Stripe US, Resend US, Cloudflare US, GitHub US ; clients Canada) + garanties (Data Privacy Framework / clauses contractuelles types) | **ABSENT** | OBLIG |
| **Durées de conservation** | **À CORRIGER** : « le temps du traitement + 10 ans » : 10 ans vaut pour les pièces comptables (L123-22) ; les données de contact/livraison, hors pièces comptables, doivent avoir une durée distincte (ex. SAV/garantie). En pratique : sauvegardes KV 180 j (`BACKUP_DAYS`), `shipped:*`/`ref:*` du Worker sans expiration visible, jeton `done` 90 j. À aligner (Q10) | OBLIG |
| Droits : accès, rectification, effacement | PRÉSENT (partiel) | — |
| Droits manquants : **limitation, portabilité, opposition**, directives post mortem, **droit de réclamation auprès de la CNIL** (3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07 ; cnil.fr/plaintes) | **ABSENT** | OBLIG |
| Moyen d'exercice : « DM Instagram » en premier | **À CORRIGER** : l'email doit être le canal principal (Instagram ajoute un transfert à Meta) ; délai de réponse 1 mois | OBLIG |
| Caractère obligatoire/facultatif des données | **ABSENT** | RECO |
| Cookies : aucune bannière | **À VÉRIFIER** : `announcementClosed` (cookie fonctionnel 8 h, exempté) → à citer ; Cloudflare Web Analytics annoncé sans cookie (cohérent avec Cloudflare), mais l'exemption CNIL exige des conditions strictes (finalité limitée à l'audience, pas de croisement, données anonymisées) → **à documenter** (Q11) ; **`https://www.instagram.com/embed.js` chargé dans `custom/head.html` sur toutes les pages** : si un embed Instagram est affiché, Meta peut déposer des traceurs → consentement requis ; sinon retirer le script | OBLIG (Instagram) |
| Registre art. 30, accords sous-traitance (DPA Stripe/Resend/Cloudflare), analyse des risques | Hors site, non vérifiable | RECO |
| Page Stripe Checkout (cookies/données traités par Stripe) | À mentionner : « sur la page de paiement, Stripe agit selon sa propre politique » | RECO |

**Texte FR (remplace tout le bloc « DONNÉES PERSONNELLES »)**

```html
<p><strong><span class="h3-fs">POLITIQUE DE CONFIDENTIALIT&Eacute;</span></strong></p>
<p><strong>Responsable du traitement</strong> : [NOM PR&Eacute;NOM], entrepreneur individuel (vgthmind), [ADRESSE], vgthm66@gmail.com (voir <a href="/mentions-legales">Mentions l&eacute;gales</a>).</p>
<p><strong>Donn&eacute;es collect&eacute;es</strong> lors d'une commande : nom, adresse de livraison, email, t&eacute;l&eacute;phone (pour la livraison), contenu de la commande, donn&eacute;es de paiement (trait&eacute;es exclusivement par Stripe : je ne vois pas votre num&eacute;ro de carte), num&eacute;ro de suivi. Lors de la visite du site : donn&eacute;es techniques (adresse IP, navigateur) enregistr&eacute;es par l'h&eacute;bergeur, et statistiques de visite anonymes.</p>
<p><strong>Finalit&eacute;s et bases l&eacute;gales</strong> : traiter, payer, exp&eacute;dier et suivre votre commande, g&eacute;rer r&eacute;tractation et garanties (ex&eacute;cution du contrat) ; tenir la comptabilit&eacute; et la facturation (obligation l&eacute;gale) ; pr&eacute;venir la fraude et s&eacute;curiser le site, mesurer la fr&eacute;quentation sans vous identifier (int&eacute;r&ecirc;t l&eacute;gitime). Les champs de commande sont n&eacute;cessaires : sans eux, la commande n'est pas possible.</p>
<p><strong>Destinataires</strong> : Stripe Payments Europe (paiement, lutte contre la fraude), Resend (envoi des emails de commande), Cloudflare (service de commande, stockage des donn&eacute;es de commande, mesure d'audience), GitHub (h&eacute;bergement du site), La Poste / Colissimo (livraison). Aucune donn&eacute;e n'est vendue.</p>
<p><strong>Transferts hors Union europ&eacute;enne</strong> : certains prestataires (Stripe, Resend, Cloudflare, GitHub) peuvent traiter des donn&eacute;es aux &Eacute;tats-Unis, encadr&eacute;s par le Data Privacy Framework ou des clauses contractuelles types de la Commission europ&eacute;enne [&Agrave; V&Eacute;RIFIER prestataire par prestataire].</p>
<p><strong>Dur&eacute;es de conservation</strong> : donn&eacute;es de commande et de livraison : [X] ans apr&egrave;s la derni&egrave;re commande ; pi&egrave;ces comptables et factures : 10 ans (obligation l&eacute;gale) ; donn&eacute;es de contact (messages) : [X] ans ; sauvegardes techniques : 180 jours.</p>
<p><strong>Cookies et traceurs</strong> : le site n'utilise aucun cookie publicitaire. Un cookie fonctionnel m&eacute;morise la fermeture du bandeau d'annonce (8 heures). Les visites sont mesur&eacute;es par Cloudflare Web Analytics, sans cookie et sans vous identifier. Sur la page de paiement, Stripe applique sa propre politique.</p>
<p><strong>Vos droits</strong> : acc&egrave;s, rectification, effacement, limitation, opposition, portabilit&eacute;, et d&eacute;finition de directives sur le sort de vos donn&eacute;es apr&egrave;s votre d&eacute;c&egrave;s. Pour les exercer : vgthm66@gmail.com (r&eacute;ponse sous un mois ; justificatif d'identit&eacute; possible). Vous pouvez aussi saisir la CNIL : cnil.fr/plaintes (3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07).</p>
```

**Texte EN**

```html
<p><strong><span class="h3-fs">PRIVACY POLICY</span></strong></p>
<p><strong>Data controller</strong>: [FIRST NAME LAST NAME], sole proprietor (vgthmind), [ADDRESS], vgthm66@gmail.com (see <a href="/mentions-legales">Legal notice</a>).</p>
<p><strong>Data collected</strong> when you order: name, delivery address, email, phone number (for delivery), order contents, payment data (handled solely by Stripe: I never see your card number), tracking number. When you visit the site: technical data (IP address, browser) logged by the host, and anonymous visit statistics.</p>
<p><strong>Purposes and legal bases</strong>: processing, paying, shipping and following up your order, handling withdrawal and warranties (performance of the contract); bookkeeping and invoicing (legal obligation); fraud prevention and site security, and measuring traffic without identifying you (legitimate interest). The order fields are necessary: without them the order cannot be processed.</p>
<p><strong>Recipients</strong>: Stripe Payments Europe (payment, fraud prevention), Resend (order emails), Cloudflare (order service, order data storage, analytics), GitHub (website hosting), La Poste / Colissimo (delivery). No data is sold.</p>
<p><strong>Transfers outside the EU</strong>: some providers (Stripe, Resend, Cloudflare, GitHub) may process data in the United States, under the EU&ndash;US Data Privacy Framework or the European Commission's standard contractual clauses [TO BE CONFIRMED provider by provider].</p>
<p><strong>Retention</strong>: order and delivery data: [X] years after your last order; accounting records and invoices: 10 years (legal obligation); contact messages: [X] years; technical backups: 180 days.</p>
<p><strong>Cookies and trackers</strong>: the site uses no advertising cookies. A functional cookie remembers that you closed the announcement banner (8 hours). Visits are measured by Cloudflare Web Analytics, without cookies and without identifying you. On the payment page, Stripe applies its own policy.</p>
<p><strong>Your rights</strong>: access, rectification, erasure, restriction, objection, portability, and the right to set instructions for your data after your death. To exercise them: vgthm66@gmail.com (reply within one month; proof of identity may be requested). You may also lodge a complaint with the CNIL: cnil.fr/plaintes (3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07, France) or with your local data protection authority.</p>
```

---

## 7. Cohérence FR / EN et mails

| Constat | Niveau |
|---|---|
| Pages légales : FR et EN couvrent le même contenu (blocs superposés). Les deux sont complètes l'une comme l'autre, mais toutes deux trop courtes (§1 à §6). **Un défaut corrigé en FR doit l'être en EN.** | — |
| Mails : `langFor()` envoie l'anglais à tous les clients hors France, y compris Belgique/Suisse/Québec francophones ; la loi (français obligatoire pour le consommateur en France, Charte de la langue française pour le Québec) → Q5. Piste : choisir la langue selon `locale` Stripe plutôt que le pays. | RECO |
| Ton : CGV en « vous », mails en « tu », phrase Stripe en « tu » : pas illégal mais incohérent (à décider une fois) | RECO |
| Mail client FR : le pays FR n'a pas de phrase sur la douane (normal) ; le mail EN ajoute la douane pour tous les non-FR, **y compris UE** (« Orders outside the EU… » reste correct mais peut troubler un client belge) | RECO |
| Le mail de confirmation (L221-13) doit contenir ou joindre CGV complètes + formulaire de rétractation : actuellement seulement un lien | OBLIG |
| `shippedEmail` : pas de mention légale ; suffisant | — |
| Libellés : lien « Info & Terms » (menu) vs page CGV « Informations » : renommer « CGV / Terms of sale » | RECO |
| La phrase Stripe `custom_text` (FR+EN) reste cohérente avec les CGV ; ajouter la case de consentement | RECO |
| `theme/layout.html` : og:image et scripts (`vgthmind.github.io/assets/bigcartel/...`) encore sur l'ancien CDN BigCartel : pas légal, mais dépendance tierce à retirer avant le lancement (ETAT.md) | RECO |

---

## 8. Liens, mentions obsolètes, divers

- « formulaire de contact » (mentions légales) : n'existe pas → retirer.
- « art. L. 223-3 du CIBS » : référence non vérifiée → 293 B du CGI.
- Commentaires HTML `À FAIRE VALIDER PAR UN JURISTE` et `MEDIATEUR` dans les sources publiées : à nettoyer au lancement.
- Bloc « Hébergement » : à mettre à jour le jour J (ETAT.md) et citer Cloudflare + éventuel nouvel hébergeur du domaine (IONOS, DNS uniquement).
- Aucun lien mort détecté entre CGV → Confidentialité / Mentions (`/shop/...` correctement réécrits au build).
- `data/shop-settings.json` : le jeton de mesure Cloudflare est public par nature ; aucun secret dans le dépôt relu.
- Aucune mention d'âge minimum / majorité : RECO (« vente réservée aux personnes majeures ou avec accord du représentant légal »).
- Aucune clause « force majeure », « droit applicable », « langue du contrat » : RECO (pour un consommateur, le choix du droit français ne peut pas priver de la protection impérative de son pays).

**Textes RECO à ajouter dans les CGV**

FR :
```html
<p><strong><span class="h3-fs">DROIT APPLICABLE ET LITIGES</span></strong></p>
<p>Les pr&eacute;sentes conditions sont r&eacute;gies par le droit fran&ccedil;ais, sans pr&eacute;judice des dispositions imp&eacute;ratives de protection du consommateur de votre pays de r&eacute;sidence. En cas de litige, voir l'article &laquo;&nbsp;M&eacute;diation de la consommation&nbsp;&raquo;. Ces conditions sont r&eacute;dig&eacute;es en fran&ccedil;ais et en anglais ; en cas de divergence, la version fran&ccedil;aise pr&eacute;vaut.</p>
```
EN :
```html
<p><strong><span class="h3-fs">GOVERNING LAW AND DISPUTES</span></strong></p>
<p>These terms are governed by French law, without prejudice to the mandatory consumer protection rules of your country of residence. For disputes, see &ldquo;Consumer mediation&rdquo;. These terms are written in French and English; in case of discrepancy, the French version prevails.</p>
```

---

## 9. Questions précises à poser au juriste

1. **Identité/téléphone** : pour une EI vendant en ligne, la mention du nom/prénom d'état civil et d'un numéro de téléphone est-elle indispensable, ou une alternative (email + formulaire) est-elle acceptable ? Peut-on utiliser une adresse de domiciliation plutôt que le domicile, et faut-il activer la non-diffusion INSEE ?
2. **Immatriculation** : l'activité (confection de vêtements sur mesure/upcycling) relève-t-elle du Répertoire des métiers ? Quelle mention exacte (RM, mention « artisan ») dans les mentions légales et les CGV ?
3. **Médiateur** : quel médiateur référencé CECMC couvre la vente en ligne de vêtements par une micro-entreprise (coût, périmètre) ? Couvre-t-il les clients hors UE (Canada) ? Confirmer la fermeture de la plateforme européenne de RLL.
4. **Support durable** : l'email de confirmation doit-il contenir l'intégralité des CGV et le formulaire de rétractation (L221-13), ou un lien suffit-il ? Faut-il joindre un PDF ?
5. **International/Canada** : quelles règles s'imposent pour les clients UE hors France (loi du pays de résidence) et pour le Canada/Québec (langue française, contrats à distance) ? Faut-il limiter la vente ou adapter les CGV ?
6. **Customs** : quelles pièces « custom » tombent sous L221-28 3° ? Une pièce aérographiée à l'avance, sans demande du client, est-elle exclue ? Quelle procédure de commande sur mesure (échange préalable, acceptation explicite) sécurise l'exception ?
7. **Garanties** : comment rédiger les garanties pour des pièces upcyclées/récupérées (présomption 12 mois pour l'occasion) ? Peut-on limiter la garantie des vices cachés aux consommateurs ?
8. **TVA** : mention 293 B du CGI confirmée ? Impact de la réforme du seuil de franchise et du seuil de 10 000 € de ventes à distance UE (guichet OSS) sur les ventes vers la Belgique, l'Allemagne, etc. ? Dispositions pour les exportations (Canada) ?
9. **Parcours de commande** : le bouton Stripe (« Payer ») satisfait-il L221-14 (« commande avec obligation de paiement ») ? Faut-il une case de consentement aux CGV ?
10. **RGPD** : durées de conservation à retenir (clients, commandes, messages) ; sauvegardes KV (180 jours) et clés Worker sans expiration (`shipped:*`, `ref:*`) ; base légale du téléphone ; registre art. 30 et DPA à conserver ; faut-il une analyse d'impact (non a priori) ?
11. **Cookies/audience** : Cloudflare Web Analytics est-il couvert par l'exemption CNIL sans consentement ? Le script `instagram.com/embed.js` impose-t-il un bandeau de consentement ?
12. **Clauses** : clause de limitation de responsabilité, force majeure, retard de livraison postale (transfert des risques L216-4), litiges douane (colis refusés ou bloqués : à qui les frais ?), retours depuis l'étranger (frais, douane).
13. **Retours** : les frais de retour sont-ils à la charge du client ou du vendeur (choix commercial) ? Mention explicite pour le Canada (coût).
14. **Remboursement des frais de livraison** : confirmer le périmètre (livraison standard seulement) et le cas du colis refusé/non réclamé.
15. **Pièces uniques/stock** : clause en cas d'indisponibilité après paiement (remboursement sous 14 jours L216-?) et mention de variations propres à la matière récupérée.

---
*Rapport généré en relecture seule. Aucune page, aucun réglage (LIVE_MODE, noindex, robots.txt) n'a été modifié.*

# Règles de conception de l'interface

> **Ce document est contraignant.** Il ne décrit pas un goût, il fixe un
> vocabulaire — et un vocabulaire ne vaut que si personne n'en invente un
> second à côté.

La référence est [`maquettes/Composants.dc.html`](maquettes/Composants.dc.html),
l'artboard « Vocabulaire d'interface ». Les huit artboards de la phase 3 sont
dans [`maquettes/`](maquettes/), avec leur statut de données.

**Le kit vient de prospeo.** Les tokens de couleur, les trois familles
typographiques et l'anatomie du `Badge` sont repris **tels quels** de
`prospeo/apps/dashboard/src/ui/`. Ce n'est pas de la paresse : le contraste y a
déjà été mesuré, et `--color-text-muted` y est passé de `#6b7280` (3,60:1, sous
le seuil AA) à `#98a1b4`. Repartir de zéro aurait consisté à repayer cette
mesure.

---

## 1. Tout composant neuf part de ce vocabulaire

`Composants.dc.html` fixe, et c'est là qu'on va chercher avant d'inventer :

| Ce qu'il fixe | Ce que ça implique |
|---|---|
| **Les fondations couleur** | Aucune couleur n'existe hors des tokens de `theme.css`. |
| **Les trois familles** | Bricolage Grotesque pour les titres et les grands nombres, Instrument Sans pour l'interface, JetBrains Mono pour **tout chiffre comparable d'une ligne à l'autre** — rangs, correspondances, TJM, durées. Sans la chasse fixe, les deux colonnes de score ne s'alignent pas. |
| **Le couple de scores** | `final_score` et `fit_score` s'affichent **toujours ensemble**. Voir §3. |
| **Les six étapes du suivi et la sortie** | `StatusBadge` les porte toutes ; on n'en dessine pas une septième. |
| **Les quatre issues** | Un second axe, jamais une étape de plus. |
| **Les badges de fait** | Télétravail, engagement, IA/agents, confiance. Un fait se rend par un `Badge`, pas par une phrase colorée. |
| **Les huit absences** | Huit natures mesurées, huit rendus. Voir §3. |
| **Les infobulles** | Elles portent le *pourquoi*, jamais ce dont la décision dépend. |
| **Les actions** | Une action primaire par écran, les autres en contour. Le lien vers l'annonce d'origine porte toujours l'icône de sortie : il quitte l'application. |

**Un composant qui a besoin de quelque chose que le kit n'a pas : on étend le
kit, on ne le double pas.** Un second badge, une seconde carte, une seconde
infobulle sont des dialectes — et un dialecte se paie à chaque écran suivant.

## 2. Un composant important passe par une maquette approuvée

**Avant d'écrire un composant important, il faut une maquette validée.** Pas
une description en prose dans un plan : un artboard dans
[`maquettes/`](maquettes/), approuvé.

Est **important** un composant qui remplit au moins un de ces critères :

- il occupe une zone structurante d'un écran (une bande, un en-tête, un
  panneau, une colonne, une liste) ;
- il est **partagé par plusieurs écrans** ;
- il entre dans le kit ;
- il rend une **absence**, un état d'erreur ou un état de chargement ;
- il affiche un **chiffre** sur lequel quelqu'un va décider.

Ne sont pas importants : l'agencement interne d'un composant déjà maquetté, un
correctif de mise en page, un état supplémentaire d'un composant existant dont
la forme est déjà fixée.

**Quand la maquette et le code divergent, la maquette gouverne** — sauf si la
suivre obligerait à afficher un fait que le code ne peut pas rendre vrai (§3).
Dans ce cas, l'écart se documente ici, avec sa raison.

### Les écarts acceptés, et pourquoi

**Les tailles de police du couple de scores.** La maquette écrit `30px` pour
`final` et `17px` pour `fit` ; le code utilise `--text-2xl` (24px) et
`--text-lg` (15px). Ces deux valeurs de maquette **n'existent dans aucune
échelle** — ni celle de ce dépôt, ni celle de prospeo. Les suivre au pixel près
aurait obligé à inventer deux tokens hors échelle, ce que la règle « les tokens
sont repris tels quels » interdit précisément.

**La maquette a tort ici, et c'est un défaut de la maquette, pas du code** :
elle a été dessinée en pixels littéraux plutôt qu'en tokens. Si elle est un
jour reprise, c'est elle qu'il faut aligner sur l'échelle — pas l'inverse. Un
composant important ne doit **jamais** justifier une valeur hors échelle par
« la maquette le disait ».

## 3. Les règles qui priment sur la maquette

Elles ne sont pas négociables, et une maquette qui les contredirait est une
maquette à corriger.

### 3.1 Une absence se nomme, jamais elle ne se vide

**Huit absences ont été mesurées en base**, et elles ont huit rendus parce
qu'elles ne disent pas la même chose :

| Rendu | Ce que c'est | Compté |
|---|---|---:|
| *non publié par la source* | l'annonce existe, le champ non | — |
| *non précisé* | le modèle n'a rien dégagé du texte | 619 sans séniorité |
| **Non détectable — texte coupé** | `stack` vide **parce que** Adzuna coupe à 500 car. | 295 |
| **Aucune techno reconnue** | texte **complet**, et rien de technique dedans | 244 |
| *salaire non publié* | pas de montant : un zéro de bonus, pas un zéro d'euros | 568 |
| **unité incertaine** | le nombre existe, son unité non (P22) | 102 |
| **Hors périmètre — jamais lue** | collectée, jamais soumise à l'IA | 2 877 |
| **Jugement en échec** | l'appel a échoué (P16) | 0 aujourd'hui |

**Le piège, payé une fois pendant la conception** : 539 offres ont une `stack`
vide, et 539 offres sont en confiance basse. Les totaux coïncident — **les
ensembles non**. Seules 295 sont dans les deux cas ; 244 diffèrent de chaque
côté. Écrire « stack vide = texte tronqué » aurait donc été **faux sur 244
offres**, et aurait rendu deux causes opposées à l'identique à l'écran. La
vérification tient en une requête, et elle n'est pas facultative :

```sql
select count(*) filter (where jsonb_array_length(extraction->'stack')=0 and confidence='basse')  as vide_et_basse,
       count(*) filter (where jsonb_array_length(extraction->'stack')=0 and confidence<>'basse') as vide_mais_pas_basse,
       count(*) filter (where jsonb_array_length(extraction->'stack')>0 and confidence='basse')  as basse_mais_pas_vide
from offers_scored;
```

**« Pas encore » n'est pas « jamais », et « vide » n'est pas « zéro ».**

### 3.2 `null` est porteur de sens

Une offre sans score n'est pas une offre à zéro. Une offre hors périmètre n'est
pas une offre mal notée. `work_mode` nul sur **863 offres — 68 % du corpus** ne
signifie pas « pas de télétravail » : il signifie que l'annonce ne le dit pas.
Un filtre « full remote » qui masquerait silencieusement ces 863 offres est
exactement ce que le critère fondateur du dépôt interdit.

**Conséquence tenue par la maquette** : la ligne « non précisé » est visible,
chiffrée et cochable dans le panneau de filtres. Jamais un silence.

### 3.3 Ne jamais construire une affordance qui annonce un fait qu'aucun code ne peut rendre vrai

**Un chiffre motivant fondé sur rien est pire que pas de chiffre.**

Le cas qui a servi d'étalon : un compteur « N nouvelles offres aujourd'hui »
est **inconstructible** aujourd'hui. `first_seen_at` ne porte que deux jours
d'historique — 3 446 offres ont été « vues pour la première fois » le même
jour, tout le reste étant du rattrapage. Le compteur afficherait 833, puis ~70
le lendemain, sans que rien n'ait changé.

Le remplacement retenu — « 6 offres à décider » — compte les offres au-dessus
du seuil **sans décision enregistrée**. Il ne dépend d'aucun historique, il est
vrai dès le premier jour, et il sera encore vrai dans six mois.

La même règle gouverne la gamification : la **série** compte les jours avec au
moins une candidature *envoyée*, elle démarre à zéro et le dit ; l'**entonnoir**
affiche ses trois premiers étages comptés en base et laisse les deux derniers à
zéro tant que rien n'a été retenu.

### 3.4 Les deux scores vont toujours ensemble

`fit_score` est produit par le modèle, **figé**, et sa reproduction coûte de
l'argent. `final_score` y ajoute six bonus et malus lus dans `scoring_weights`,
**réglables et gratuits**. Ce sont deux natures différentes, et n'en montrer
qu'une ment.

Mesuré : une offre à `fit` 42 et `final` 79 dit « stack moyenne, mais coche
toutes tes préférences » ; une offre à `fit` 90 et `final` 89 dit l'inverse. Un
seul nombre confondrait ces deux situations opposées.

**Corollaire sur l'explicabilité** : la décomposition (`bonus_remote`,
`malus_technos`…) s'affiche sur la carte, en jetons signés. Un score opaque
n'est pas corrigeable à l'œil — c'était le but du découpage en base, et
l'interface doit le rendre.

### 3.5 Un doublon s'élit par confiance, jamais par score

Mesuré sur la mission ALLEGIS GROUP, jugée deux fois :

| Source | Texte | `fit` | Confiance | Rémunération extraite |
|---|---|---:|---|---|
| Adzuna | tronqué à 500 car. | 75 | basse | `salaire` 450–530 — **faux** |
| Free-Work | intégral | 58 | haute | `tjm` 450 — juste |

Élire par `final_score` mettrait donc en tête le jugement **le moins informé** :
celui qui n'a lu que 500 caractères a été plus généreux que celui qui a lu
l'annonce entière, dont le verdict est nettement plus précis.

**Ordre d'élection retenu** : confiance décroissante, puis longueur de
description, puis `final_score`, puis `published_at`, puis `id` pour que
l'ordre soit total.

Le repli se fait **à l'affichage**, sur titre normalisé + société, sans
attendre une migration : la clé de dédoublonnage existante rate **65 paires**
(80 lignes en trop sur 1 269), dont deux dans les quatorze premières lignes.

**Le titre se normalise après retrait d'un suffixe d'annotation**, pris dans
une liste blanche (`h/f`, `f/h`, `it`, `cdi`, `cdd`, `alternance`, `stage`).
Les sources suffixent le même intitulé chacune à sa façon : Adzuna écrit
« … obligatoire *(IT)* », France Travail « … *(H/F)* », Free-Work rien.

**Ne jamais retirer « tout parenthétique final »** : le titre Free-Work de
l'offre Digistrat se termine par un parenthétique porteur de sens —
« Développeur Full stack REACT/C# *(orienté front React)* ». L'amputer
produirait une clé différente de celle d'Adzuna, soit exactement l'inverse de
l'effet recherché. Les sept groupes que ce retrait forme ont été lus un par un :
aucune fusion abusive.

### 3.6 Jamais un montant dont l'unité est incertaine

**102 montants sur 599 ne sont pas annuels** (P22) : des taux horaires et des
mensuels mêlés à des salaires. Le schéma de sortie ne porte aucun champ
d'unité.

Trois rendus, jamais un nombre nu :

- unité sûre (`tjm`, ou `salaire` au-dessus de `salaire_floor`) → le montant ;
- unité incertaine → le montant **barré**, avec le badge « unité incertaine » ;
- rien d'extrait → *salaire non publié*, un jeton d'absence.

Quand deux sources se contredisent sur l'unité de la même offre, le repli
tranche et l'affiche — c'est le seul endroit où P22 se résout sans repayer les
jugements.

### 3.7 La couleur n'est jamais le seul indicateur d'un état

**Tout badge porte un mot**, sans exception. Et la couleur doit toujours être
doublée par **au moins un indice non coloré** : un point, ou une forme de
bordure. Toute pastille porte un `aria-label`. Une pastille réduite à sa
couleur est illisible pour huit pour cent des hommes, et pour tout le monde en
impression noir et blanc.

> **Précision du 2026-09-09, née d'une contradiction dans ce document.** Ce
> paragraphe disait « tout badge porte un point **et** un mot », sans
> condition — et la maquette approuvée dessine « Écartée » **sans point**, en
> trait discontinu. Une revue a signalé l'écart au lieu de choisir en silence.
>
> C'est la règle qui était trop absolue, pas la maquette. Le trait discontinu
> **est** un indice non coloré, et il en dit plus qu'un point : il marque une
> **sortie** du parcours, là où toutes les autres pastilles marquent une
> étape. Imposer le point aurait effacé cette distinction pour satisfaire la
> lettre d'une règle dont l'objet est ailleurs.
>
> Ce qui reste intangible : le **mot**, et le fait que la couleur ne soit
> jamais seule. La forme que prend le second indice est un choix de dessin.

**La confiance basse est en ambre, jamais en rouge** : elle ne signale pas une
offre douteuse, elle signale un texte coupé. Le modèle avait interdiction d'en
conclure un rejet.

### 3.8 Aucune chaîne en dur, aucune couleur en dur, aucun emoji

Tout texte affiché passe par `t()`. Français seul pour l'instant, mais la
structure ne doit pas rendre l'ajout d'une langue coûteux.

Aucune couleur littérale : uniquement des `var(--…)`. C'est la condition pour
qu'un thème clair reste livrable.

**Aucun emoji, nulle part.** Les icônes sont des SVG dessinés, au trait, sur
une grille de 16/20/24 px, d'un seul style.

## 4. Ce que les tests vérifient, et ce qu'ils ne verront jamais

Ce qui peut être mécanisé doit l'être : aucune couleur littérale hors du thème,
aucune famille typographique hors des tokens, aucune chaîne orpheline dans
`i18n`, le contraste des deux thèmes, et le piège de mise en page
(`text-overflow: ellipsis` posé sur un conteneur `flex` ou `grid`, où il n'a
aucun effet).

**Ce qu'aucun test ne verra :** une largeur, une hauteur, un débordement, un
chevauchement, une troncature. `jsdom` ne calcule aucune mise en page.

C'est précisément le domaine que la maquette approuvée du §2 couvre, et la
raison pour laquelle elle n'est pas une formalité. Sur la phase 2, sept revues
successives ont laissé passer un client d'API sans horloge parce qu'il était
hors du périmètre de chaque tâche prise isolément ; une mise en page cassée
passe de la même façon à travers une suite verte.

---

## 5. La maquette se suit à la lettre, et un manque se comble par un bouton désactivé

Le §2 dit que la maquette gouverne. Ce paragraphe dit **jusqu'où**, parce que
la phase 3 a été livrée avec une suite verte et un écran qui ne ressemblait
pas au dessin.

### 5.1 Ce qui est repris tel quel, sans arbitrage silencieux

**Chaque valeur de la maquette est une valeur à reprendre**, pas une
suggestion : espacements, marges, hauteurs de contrôle, rayons, épaisseurs de
trait, tailles d'icône, fonds, et **chaque icône dessinée**. Un composant qui
« ressemble » à la maquette sans en porter les valeurs est un composant à
reprendre.

Une seule sorte d'exception existe, et elle est déjà écrite au §2 : une valeur
de maquette **hors de l'échelle de tokens** s'aligne sur l'échelle, et l'écart
se documente ici. Tout le reste se suit.

**Le fond d'un élément n'est jamais laissé au hasard.** Un titre que la
maquette dessine sur le fond de la carte ne doit pas hériter d'un fond de
surface au passage : c'est l'écart le plus facile à ne pas voir en relisant du
CSS, et le plus visible à l'écran.

### 5.2 Un élément dessiné mais pas encore branché s'implémente **désactivé**

**On ne retire jamais de l'écran un élément que la maquette porte** au motif
que sa fonction n'existe pas encore. On le construit — bonne place, bonnes
dimensions, bonne icône — et on le pose `disabled`, avec un `title` ou un
`aria-label` qui dit pourquoi.

Ce que ça évite, et qui est arrivé : le bouton de réglages de la barre
d'application a disparu de l'écran, donc l'écart entre le dessin et le rendu
n'était plus visible nulle part — ni à l'œil, ni dans un test. Un bouton
désactivé, lui, se voit, se compte, et se rebranche en une ligne.

Ça ne contredit pas le §3.3 : un bouton désactivé n'**annonce aucun fait**. Ce
qui reste interdit, c'est un **chiffre** ou un **état** inventé pour remplir un
emplacement — un compteur à un nombre plausible, une date de relance calculée
de rien. Une commande sans effet se rend visible et inerte ; une donnée qu'on
n'a pas se nomme.

### 5.3 La maquette est mise à jour AVANT le code, jamais après

Une maquette qui décrit l'écran d'avant ne gouverne plus rien : elle induit en
erreur, et elle rend indécidable la question « qui a raison, le dessin ou le
rendu ». Donc, dans cet ordre :

1. la maquette change (`docs/design/maquettes/*.dc.html`) ;
2. le canvas est réassemblé et republié **au même lien** — il n'y en a qu'un ;
3. le code suit.

Le corollaire vaut aussi dans l'autre sens : quand le code a raison et la
maquette tort — le chemin vers l'écran de suivi manquait dans la barre
d'application, et le code l'avait inventé —, c'est **la maquette qu'on
corrige**, pas le code qu'on ampute.

### 5.4 La relecture qui manquait

`jsdom` ne calcule aucune mise en page (§4) : aucune suite verte ne dira jamais
qu'un bouton est collé à la carte du dessus. La seule relecture qui le voit est
**l'écran réel à côté de l'artboard**, à la même largeur. Elle se fait à la fin
de chaque chantier d'interface, et elle passe sur :

| Ce qu'on regarde | L'écart déjà payé |
|---|---|
| Chaque icône de la maquette est-elle là ? | Barre d'application : icône de document sur « Mon CV », bouton de réglages — les deux absents |
| Chaque élément de la maquette est-il là, même inerte ? | Le bouton de réglages, retiré au lieu d'être désactivé |
| Les espacements verticaux entre blocs | « Suivantes » collé à la carte du dessus, là où la maquette pose une marge |
| Les fonds, un par un | Le titre des cartes « Ce matin » portait un fond que la maquette ne dessine pas |
| Les libellés, mot pour mot | « Importer mon CV » là où la maquette écrit « Mon CV » |
| Ce que le code affiche en plus | « Mes candidatures », absent de la maquette — corrigé **dans la maquette** |

Cette liste n'est pas un exemple : ce sont les écarts constatés sur la phase 3
livrée, et ils sont suivis dans `ETAT.md`.

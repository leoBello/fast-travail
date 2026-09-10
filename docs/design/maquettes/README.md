# Maquettes — le tableau de bord

Les maquettes du tableau de bord. Les règles qu'elles fixent sont dans
[`../GUIDELINES.md`](../GUIDELINES.md), qui est contraignant.

**Canvas publié** : <https://claude.ai/code/artifact/fdde10d6-b696-4774-b2ba-db53d8262485>

**Il n'y a qu'un seul canvas, et c'est celui-là.** Toute évolution de
l'interface met ces fichiers à jour puis republie **au même lien** : une
maquette qui décrit l'écran d'avant ne gouverne plus rien, elle induit en
erreur. Un second canvas publié à côté est la même erreur sous une autre forme.

---

## Ce qu'il y a ici

Onze artboards, répartis en trois pages dans `canvas.json`.

| Fichier | Page | Ce qu'il montre |
|---|---|---|
| `Main.dc.html` | Application | L'écran du matin : le brief du jour en trois cartes de décision, puis toute la veille — **barre d'onglets par statut, page bornée à la fenêtre**. |
| `Detail.dc.html` | Application | Une offre en entier : le rang décomposé, les **deux jugements** d'un doublon, l'extraction, le suivi. |
| `VeilleRepliee.dc.html` | Application | Le même écran, bande « Ce matin » repliée : 15 lignes au lieu de 8, onglet « Toutes », colonne *Statut*. |
| `Suivi.dc.html` | Application | Les candidatures : l'entonnoir, le pipeline en colonnes, la série et le compteur anti-perte. |
| `OngletsSuivi.dc.html` | Application | Les quatre situations créées par les onglets : colonne contextuelle, onglet à zéro, date de relance absente, comptes pas encore reçus. |
| `Composants.dc.html` | Système | Le vocabulaire : fondations, couple de scores, statuts, badges de fait, **les huit absences**, actions, infobulles, vides. |
| `Etats.dc.html` | Système | Les états qui décident : le jour zéro, la panne de collecte, le compteur qu'on ne peut pas construire, les filtres, le réglage des poids. |
| `DirectionA.dc.html` | Directions | « Les trois cartes » — comparer d'un coup. **Portée aujourd'hui par `Main`.** |
| `DirectionB.dc.html` | Directions | « Une à la fois » — décider vite, sans comparer. |
| `DirectionC.dc.html` | Directions | « La colonne » — une lecture continue, sans frontière entre brief et liste. |
| `ArbitragesOnglets.dc.html` | Directions | Onglets et pagination : les deux arbitrages tranchés le 2026-09-09, avec les options écartées et leur coût. |

---

## Statut des données affichées

**Contrairement aux maquettes de prospeo, les offres affichées ici sont
réelles.** Elles sont comptées en base le 2026-09-09, et c'est délibéré :
plusieurs décisions de conception ne se voient que sur les données réelles.

**Ce qui vient de la base** — intitulés, employeurs, sources, `fit_score`,
`final_score`, verdicts, confiances, `stack`, rémunérations, et les décompositions
de bonus, qui sont arithmétiquement exactes (`58 + 12 + 15 + 1,5 = 86,5`). Les
trois premiers étages de l'entonnoir (4 146 / 1 269 / 61) et les huit compteurs
d'absence le sont aussi.

**Ce qui n'existe pas encore, et qu'aucune ligne de code ne rend vrai
aujourd'hui** :

- **la table de suivi de candidature** — donc les colonnes du pipeline, les
  états portés par les offres, les dates d'envoi et de relance ;
- **la série de jours** avec au moins une candidature ;
- **les relances dues** ;
- **les deux derniers étages de l'entonnoir** (retenues, postulées) ;
- **le compteur « jamais ouvertes »**, qui suppose de mémoriser les ouvertures.

Ils sont dessinés pour **décider de leur forme**, pas pour être construits
avant la migration qui les porte. C'est exactement la règle du §3.3 de
`GUIDELINES.md` : chaque écran montre aussi son état à zéro, et `Etats.dc.html`
porte le jour zéro complet.

Les liens sont des leurres : ils ne mènent nulle part par construction.

---

## Ce que ces maquettes ont établi, et qui n'était pas su avant

Trois constats sont sortis du dessin lui-même, en confrontant le vocabulaire
aux données réelles. Ils sont consignés dans `../ETAT.md`.

1. **`offers_scored` ne dédoublonne pas**, et la clé existante rate 65 paires
   portant un titre normalisé et une société identiques — dont deux dans les
   quatorze premières lignes du classement (P23). *Corrigé le 2026-09-09 : ces
   deux paires-là échappaient même à cette mesure, les sources suffixant le
   même intitulé (`(IT)`, `(H/F)`). Voir `../../ETAT.md`, P23.*
2. **Un doublon doit s'élire par confiance, pas par score**, sans quoi le
   classement met en avant le jugement rendu sur le texte le plus court.
3. **`stack` vide et confiance basse ont le même total et des ensembles
   différents** : 539 et 539, mais 295 seulement en commun.

---

## La mise à jour du 2026-09-09 — la veille par onglets

Postérieure à la livraison de la phase 3, née d'un défaut constaté à l'usage :
« Toute la veille » rend 1 272 lignes par pages de 50, donc la page défile, et
les offres décidées y restent mêlées aux 1 258 sans décision.

`Main.dc.html` a été **mis à jour** — pas doublé —, et trois artboards l'ont
rejoint (`VeilleRepliee`, `OngletsSuivi`, `ArbitragesOnglets`). Chiffres
comptés en base le 2026-09-09 : 1 258 sans décision, 6 postulées, 1 relancée,
7 écartées, 1 272 jugées.

Deux ajouts à `Main.dc.html` qui ne relèvent pas des onglets, et qui sont là
parce que la maquette gouverne :

- **le bouton « Mes candidatures »** dans la barre d'application. Il manquait :
  la maquette n'offrait aucun chemin vers l'écran de suivi, que le code a donc
  inventé de son côté. C'est la maquette qui avait tort ;
- **le bouton « Replier »** sur la bande « Ce matin », dont l'état est
  mémorisé.

Les trois arbitrages tranchés et les règles que ce dessin a imposées sont dans
[`../../ETAT.md`](../../ETAT.md), « La veille par onglets ».

---

## Rouvrir et modifier

Un `.dc.html` n'est **pas** une page autonome : il est enveloppé dans `<x-dc>`
et range ses feuilles et ses polices dans `<helmet>`. Ouvrir la source dans un
navigateur ne montre rien.

- **Regarder les maquettes** : ouvrir le canvas publié (lien ci-dessus).
- **Modifier** : éditer les `.dc.html`, puis réassembler `tableau-de-bord-fast-travail.html`
  et republier au même lien. Les fichiers sources font foi, jamais le fichier
  assemblé.

Les fichiers sont du HTML lisible et modifiable à la main : styles en ligne,
SVG dessinés, aucune icône de bibliothèque, aucun emoji.

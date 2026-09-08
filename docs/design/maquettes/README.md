# Maquettes — phase 3, le tableau de bord

Les maquettes qui précèdent le plan d'implémentation de la phase 3. Les règles
qu'elles fixent sont dans [`../GUIDELINES.md`](../GUIDELINES.md), qui est
contraignant.

**Canvas publié** : <https://claude.ai/code/artifact/be80ac9f-af1b-4490-b2ce-b7813a4ea393>

---

## Ce qu'il y a ici

Huit artboards, répartis en trois pages dans `canvas.json`.

| Fichier | Page | Ce qu'il montre |
|---|---|---|
| `Main.dc.html` | Application | L'écran du matin : le brief du jour en trois cartes de décision, puis toute la veille en liste. |
| `Detail.dc.html` | Application | Une offre en entier : le rang décomposé, les **deux jugements** d'un doublon, l'extraction, le suivi. |
| `Suivi.dc.html` | Application | Les candidatures : l'entonnoir, le pipeline en colonnes, la série et le compteur anti-perte. |
| `Composants.dc.html` | Système | Le vocabulaire : fondations, couple de scores, statuts, badges de fait, **les sept absences**, actions, infobulles, vides. |
| `Etats.dc.html` | Système | Les états qui décident : le jour zéro, la panne de collecte, le compteur qu'on ne peut pas construire, les filtres, le réglage des poids. |
| `DirectionA.dc.html` | Directions | « Les trois cartes » — comparer d'un coup. **Portée aujourd'hui par `Main`.** |
| `DirectionB.dc.html` | Directions | « Une à la fois » — décider vite, sans comparer. |
| `DirectionC.dc.html` | Directions | « La colonne » — une lecture continue, sans frontière entre brief et liste. |

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

1. **`offers_scored` ne dédoublonne pas**, et la clé existante rate 64 paires
   portant un titre normalisé et une société identiques — dont deux dans les
   quatorze premières lignes du classement (P23).
2. **Un doublon doit s'élire par confiance, pas par score**, sans quoi le
   classement met en avant le jugement rendu sur le texte le plus court.
3. **`stack` vide et confiance basse ont le même total et des ensembles
   différents** : 539 et 539, mais 295 seulement en commun.

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

# Reste à faire — après le dédoublonnage

**Établi le 2026-09-08**, une fois la phase 1 close : deux API, deux scrapers,
la confiance par requête et le dédoublonnage livrés et fusionnés.

Ce document existe pour que rien ne se perde entre deux chantiers. Il n'est pas
une liste de vœux : chaque entrée porte **ce qu'elle coûte**, **ce qu'elle
rapporte**, et **quand la faire**. Les descriptions détaillées et les mesures
restent dans [`ETAT.md`](ETAT.md), section « Problèmes ouverts » — ici on
décide, là-bas on documente.

Rappel du critère qui gouverne tout dans ce dépôt : **le coût est
asymétrique**. Une offre affichée en trop se repère d'un coup d'œil ; une offre
jamais affichée est perdue. Ce qui fait rater une offre passe donc devant ce
qui fait perdre du temps.

---

## Fait, ou décidé sans suite

| Sujet | Sort |
|---|---|
| Remesure du classement `trust` | **Fait le 2026-09-08, rien à changer** — voir plus bas |
| **P14** — fusions sans recouvrement de texte (cas Malt) | **Rien à coder, décidé** — un signal lexical confondrait un vrai doublon tronqué par Adzuna et un faux positif. Le réflexe suffit : devant un intitulé générique chez un intermédiaire (Malt, une ESN), regarder `offers_hidden_duplicates` |

### La remesure de `trust`, et pourquoi elle ne change rien

Le classement `anchored` / `net` datait d'un corpus de 1 253 offres, toutes
API. Il en compte **4 112** depuis l'arrivée de Free-Work et Collective.
Contribution marginale remesurée — les offres dont la requête est la **seule**
étiquette de confiance responsable de l'entrée :

| Requête | Marginales | Lecture à la main |
|---|---:|---|
| `adzuna:remote:fr-ts` | 11 | 2 pertinentes, 8 adjacentes, 1 hors sujet |
| `adzuna:local:javascript` | 13 | 1 pertinente, 4 adjacentes, 8 hors sujet |
| `adzuna:local:typescript` | 3 | 2 adjacentes, 1 hors sujet |
| `adzuna:local:react-ts`, `adzuna:local:nextjs` | 0 | rien à juger |

**`fr-ts` est excellente** : elle fait entrer RECRUT-INFO « Full Stack TS /
Java, full remote » et Konecta « Développeur Front-End / UX Engineer », deux
offres qui visent le profil exactement.

**`javascript` garde sa majorité de hors-sujet** — 8 sur 13 — et se maintient
pour la même raison qu'en septembre, désormais renforcée : la déclasser
coûterait DigDash « Développeur **Frontend** Java/Javascript », plus les deux
« Développeur Front-End Vue.js 3 **Marseille** » (Collective et Easy Partner,
la même mission vue de deux sources). Ce sont des postes front-end locaux, et
aucun n'a d'autre voie d'entrée. Huit lignes de bruit en bas d'une liste triée
coûtent moins que trois postes front-end jamais affichés.

**Les deux requêtes à 0 ne sont pas des candidates au déclassement** : leur
contribution marginale nulle signifie que leurs offres portent déjà React ou
TypeScript **dans le texte**, donc entrent par le lexique. C'est le
fonctionnement sain, pas un signe d'inutilité.

**Conclusion : aucune migration.** Un pari qui se confirme est un résultat, pas
une occasion de bouger quelque chose.

---

## Fait avant la phase 2

### Perf d'`offers_shortlist` — divisée par deux, le 2026-09-08

La liste quotidienne mettait **3,7 s**, et ce coût grandissait avec le corpus.
Le profil, mesuré : `offer_lexical_score` faisait une boucle imbriquée de
4 146 offres × 67 termes, soit **277 782 évaluations**, pour 5 832 ms.

La cause n'était pas le volume mais la **forme de la requête**. L'index GIN sur
`description_tsv` existe depuis la première migration, mais la vue exprimait la
correspondance par un `case l.match_type when 'fts' … when 'ilike' … end` dans
la condition de jointure : un `case` qui mélange deux opérateurs incompatibles
n'est pas indexable, donc les **56 termes `fts` sur 67** étaient évalués ligne
à ligne alors qu'ils étaient indexables.

Séparer les deux modes par une union rend la branche `fts` indexable :
`offer_lexical_score` passe de **5 832 à 1 781 ms**, et `offers_shortlist` de
**3,7 à 1,94 s**. Résultat prouvé identique — jointure externe complète entre
les deux formulations : 3 085 lignes de chaque côté, **zéro divergence**.

**Une vue matérialisée a été écartée**, alors qu'elle aurait été plus rapide
encore : `CLAUDE.md` promet que régler le lexique a un effet **immédiat** sur
les offres déjà collectées, parce que le score est une vue. Matérialiser
romprait cette promesse, et l'on réglerait à l'aveugle.

Le coût reste linéaire en offres × termes, avec une constante bien plus
petite. Si le corpus décuple encore, c'est la branche `ilike` — onze termes,
non indexable telle quelle — qu'il faudra regarder en premier.

## Après la phase 2, ou plus tard

Rangés par ce qu'ils coûtent si on ne les fait pas.

### P13 — La provenance ne dit pas la même chose selon la source

**Coût estimé : 1 h 30 à 2 h.** Ce n'est pas un correctif : les scrapers
**sautent** les offres déjà connues, donc `found_by_query_ids` y est figé au
run qui a découvert l'offre. Corriger touche leur boucle de collecte.

Ce que ça fausse : toute analyse de provenance croisée. Les deux API accumulent
jusqu'à cinq étiquettes, Free-Work en a une seule sur 99 offres sur 105, et
Collective **jamais plus d'une**. Une future analyse « quelle requête produit
les offres retenues » lirait donc un signal incomparable d'une source à
l'autre, sans le savoir.

Aucun effet aujourd'hui sur la sélection : aucune requête de scraper n'est
`anchored`, et elles n'ont pas à l'être — le lexique voit leur description
entière.

### P1 — Le rayon ne peut pas s'ajuster au kilomètre

**Coût estimé : 2 à 3 h**, le plus gros de la liste. Il faut importer un
référentiel INSEE de communes avec coordonnées, donc une migration de données
de référence, avant de pouvoir s'en servir.

`distance_marseille_km` est nul pour une bonne part des offres, donc le filtre
géographique repose sur le département : 13, 83, 84. Ça marche, mais le 13 va
jusqu'à Arles, à une heure et quart de Marseille.

**Le bon moment est la phase 3**, le tableau de bord : c'est là que le filtre
géographique devient visible et réglable, et que payer ce référentiel rapporte
immédiatement.

### P12 — Une offre Free-Work vue par trois facettes se paie trois fois

**Coût estimé : 1 h.** `knownExternalIds` est un instantané pris une seule fois
avant la boucle, jamais complété par les offres découvertes en cours de run.

Coût de collecte, pas de justesse : rien n'est faux en base, on télécharge
simplement trois fois la même page. À traiter quand le temps de collecte
deviendra gênant, ou en même temps que P13, qui touche la même boucle.

### P11 — Pages Free-Work sans `JobPosting`, journalisées mais jamais comptées

**Coût estimé : 30 à 45 min.** Le client avertit et saute une page de détail
dépourvue de JSON-LD, mais rien ne compte ces sauts. Si Free-Work changeait son
gabarit, la collecte tomberait à zéro **en silence**, avec des avertissements
que personne ne lit.

Petit, isolé, et c'est le genre de trou qui ne se remarque que le jour où il
coûte cher.

### P7 — La Corse s'encode de deux façons

**Coût estimé : 30 min.** Adzuna rend `2A` / `2B`, France Travail rend `20`.
Deux encodages du même territoire dans une même colonne. Sans effet sur le
filtre `('13','83','84')`.

À faire si la Corse devient une zone d'intérêt, sinon c'est du rangement.

### P2 — Précision de l'hybride

**Coût estimé : 45 min.** `/hybride/i` attrape « Cloud, OnPremise, hybride » et
« modèle hybride » au sens Agile — des faux positifs sur l'infrastructure ou la
méthodologie, pas sur le mode de travail.

Sans effet sur `offers_shortlist`, qui ne retient que `full` ou le département
local. À affiner seulement si la distinction hybride devient utile — c'est-à-
dire si vous décidez qu'un hybride à Aix vous intéresse.

### P5 — Signal local mince

**Rien à faire, ce n'est pas un défaut.** Le marché React marseillais est
réellement petit ; les quatre sources concordent. Le gisement est national et
full remote. C'est une contrainte de marché, consignée pour qu'aucune session
future ne la prenne pour un défaut d'outillage et n'aille « réparer » la
matrice de requêtes.

---

## Ce que ce document ne couvre pas

Les **phases 2 à 5** — scoring IA, tableau de bord, génération de CV et
lettres, suivi des candidatures — relèvent de [`ROADMAP.md`](ROADMAP.md).

Une réserve à connaître avant de les lire : **le `ROADMAP` ne fait plus foi tel
quel sur la phase 2.** Des changements sont prévus, et cette phase sera
précédée d'un brainstorming.

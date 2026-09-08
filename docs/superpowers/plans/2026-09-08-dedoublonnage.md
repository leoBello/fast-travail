# Plan — Le dédoublonnage, intra et inter-sources

**Objectif** : cesser d'afficher deux fois la même mission dans la liste
quotidienne, sans jamais masquer deux missions distinctes.

**P10 et P6 sont traités ensemble** parce que c'est le même problème vu de deux
côtés : la même annonce republiée sous un nouvel identifiant dans une source, et
la même annonce parue sur deux sources.

---

## Ce que la mesure a établi, et qui gouverne toute la conception

Tout ce qui suit a été mesuré en base le 2026-09-08, sur 3 170 offres et quatre
sources. **Rien ici n'est supposé.**

### 1. Le chiffre de P10 dans `ETAT.md` est gonflé, et la cause est instructive

`ETAT.md` annonce 57 groupes / 82 en excès, chiffre obtenu sur une clé
`(entreprise, intitulé)`. Cette clé **ignore la ville**, et c'est faux :

Collective diffuse pour des réseaux de recrutement. « Collaborateur Comptable
Confirmé H/F » chez **Achil** y apparaît **huit fois, dans huit villes
différentes** — Manosque, Aubière, Bourg-Saint-Maurice, Claye-Souilly,
Aix-en-Provence, Cagnes-sur-Mer, Dunkerque, La Valette-du-Var. Ce sont huit
postes distincts. Les fusionner détruirait de l'information, et masquerait
peut-être **le poste d'Aix-en-Provence derrière celui de Dunkerque**.

| Clé | Collective | France Travail | Adzuna | Free-Work | Excès total |
|---|---:|---:|---:|---:|---:|
| entreprise + intitulé | 160 | 46 | 35 | 1 | **241** |
| **+ ville** | 64 | 20 | 11 | 1 | **96** |

**60 % de ce qu'on appelait « doublon » était une mission distincte.**

### 2. Ce qui reste est du vrai doublon, vérifié à la main

Même intitulé, même entreprise, même ville, URL distinctes :

- **Collective** frappe un slug aléatoire par republication —
  `…-86p8`, `…-binz`, `…-euad`, `…-ik2f` pour la même « Chef de Mission ».
- **France Travail** réattribue un identifiant d'offre : `5968465`, `6640889`,
  `6704393`, `6704695` pour le même « Développeur d'Applications C# .NET » à
  Lille.

### 3. La ville ne peut PAS servir de clé inter-sources

Les trois sources décrivent le lieu à des granularités différentes :

| Source | Forme | Exemple |
|---|---|---|
| France Travail | préfixe département | `74 - Annecy` |
| Collective | préfixe code postal | `13100 Aix-en-Provence` |
| Free-Work | nom nu | `Marseille` |
| Adzuna | zone, parfois région | `Bouches-du-Rhône, Provence-Alpes-Côte d'Azur` |

Même après normalisation du préfixe numérique, l'inter-sources tombe de **48
groupes à 11** si l'on met la ville dans la clé. Les 37 perdus ont été
inspectés : ce sont **la même mission décrite plus ou moins finement**.

- `akanea` / « développeur » : Adzuna dit `Aubagne-Ouest, Marseille`,
  France Travail dit `13 - Penne-sur-Huveaune` — communes voisines.
- `amiltone` / « développeur java/angular » : Adzuna dit
  `Bouches-du-Rhône, Provence-Alpes-Côte d'Azur`, Free-Work dit `Marseille`.

### 4. Et le département ne peut pas non plus servir de clé

Il est `null` sur **2 660 offres sur 3 170**. Ce n'est pas un défaut : les
scrapers ne résolvent le département que pour la **zone cible** 13/83/84. Sur
Collective, 95 offres sur 2 711 en portent un — et les 95 sont dans la zone.
Une clé qui inclut le département grouperait donc tous les `null` ensemble, ce
qui refusionnerait les huit Achil.

### 5. Conclusion : la clé est asymétrique, et c'est mesuré, pas esthétique

| | Clé | Mesure |
|---|---|---:|
| **Intra**-source (P10) | `(source, entreprise, intitulé, ville)` | 135 groupes, 147 en excès |
| **Inter**-sources (P6) | `(entreprise, intitulé)` **sans géographie** | 48 groupes |

L'intra a besoin de la ville pour ne pas fusionner les Achil. L'inter ne peut
pas l'utiliser, mais n'en a pas besoin : deux sources différentes qui portent
la même entreprise **et** le même intitulé décrivent la même mission dans la
pratique observée.

---

## Décisions produit, tranchées par l'utilisateur

**Inter-sources : la ligne conservée est la plus informative.** Priorité à
celle qui porte un TJM (`rate_raw` non nul), puis à la description la plus
longue, puis à la plus récente. Concrètement Collective et Free-Work passent
devant, France Travail et Adzuna ne donnant jamais de TJM.

**Intra-source : la ligne conservée est la plus récente.** C'est celle dont
l'URL a le plus de chances de fonctionner encore.

**Conséquence à compenser, et c'est une exigence du plan** : garder la plus
récente perd l'ancienneté du poste, qui est un signal utile — un poste
longtemps en ligne est un poste difficile à pourvoir. La ligne conservée doit
donc exposer le `first_seen_at` **le plus ancien du groupe**, pas le sien.

---

## Contraintes globales

- **Une vue, pas une suppression, pas une colonne écrite à la collecte.**
  Non destructif, réversible, aucune re-collecte, et cohérent avec la règle du
  dépôt : ce qui se règle vit en base. Aucune ligne de `offers` n'est effacée
  ni modifiée par ce plan.
- **`verify` doit passer** :
  `export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify`.
  Deno est hors du PATH, l'export doit être dans le **même** appel shell.
- **Aucun contournement du linter** : `deno-lint-ignore`, `eslint-disable`,
  `@ts-ignore`, `@ts-expect-error`, `as any`, `as unknown as X` hors tests,
  `--no-check`, `--force`.
- **Toute évolution de schéma passe par une migration**, avec des écritures
  idempotentes. Aucune migration déjà appliquée n'est réécrite ; un commentaire
  est inerte et peut être rectifié.
- **Interroger la base** : `npx supabase db query --linked "<SQL>"`.
  `--linked` est **obligatoire**. SQL sur **une seule ligne** — une requête
  multi-ligne se fait manger par le shell et revient en « query: Too small ».
- **Une migration vide s'applique « avec succès » en ne faisant rien.**
  Vérifier la taille du fichier avant `db push`, et l'effet en base après.
  `git status` avant tout `db push`.
- **`unaccent` n'est pas installé** sur ce projet. Ne pas l'utiliser sans une
  migration `create extension`, et ne l'introduire que si la mesure le
  justifie — voir la tâche 1.
- Commentaires SQL en français **sans accents**. Documents en français normal.
- Aucun secret dans le dépôt. La référence `zbpbuzoukldbzfbbikhw` n'en est pas
  un ; les clés, si.

---

## Task 1 — La normalisation, et la preuve qu'elle ne fusionne rien à tort

**But** : poser les expressions de normalisation, et **mesurer leur effet de
bord** avant de bâtir quoi que ce soit dessus.

### Ce qu'il faut écrire

Une migration créant une vue `offer_dedup_keys` qui expose, pour chaque offre :

- `offer_id`
- `norm_company` — `lower(trim(company_name))`
- `norm_title` — `lower()` du titre débarrassé d'un suffixe de genre en fin de
  chaîne : `\s*\(?(h/?f|f/?h)\)?\s*$`, insensible à la casse
- `norm_city` — `lower(trim())` de la ville débarrassée d'un préfixe numérique
  de tête : `^[0-9]{2,5}\s*-?\s*`

Les offres dont `company_name` est `null` ou vide sont **exclues** du
dédoublonnage : sans entreprise, la clé n'a pas de sens et fusionnerait des
missions sans rapport. La vue doit le rendre explicite.

### La mesure exigée — c'est le cœur de la tâche

Une normalisation qui fusionne trop est pire que pas de normalisation. Avant de
rendre, **prouver** que chaque règle est sûre :

1. Combien de titres distincts la normalisation du suffixe de genre
   fusionne-t-elle, et sur un échantillon d'au moins dix, s'agit-il bien du
   même intitulé ? Chercher explicitement un contre-exemple où deux intitulés
   réellement différents deviendraient identiques.
2. Idem pour le préfixe numérique de ville. Attention au piège : une ville
   dont le nom **commence** par un nombre existe-t-elle dans la base ?
   Le vérifier plutôt que le supposer.
3. Combien d'offres sont exclues faute d'entreprise, et par source ?

Citer les nombres et les échantillons dans le rapport. **Un nombre non cité est
un nombre non mesuré.**

### Ce qu'il ne faut PAS faire

- Ne pas installer `unaccent` sans avoir mesuré ce qu'il apporterait.
- Ne pas toucher à `offers_ranked` ni à `offers_shortlist` : c'est la tâche 3.
- Ne pas écrire une ligne de TypeScript.

---

## Task 2 — Les groupes de doublons, et le choix du représentant

**But** : construire la vue qui, pour chaque offre, dit à quel groupe elle
appartient et si elle en est le représentant.

### Ce qu'il faut écrire

Une migration créant `offer_duplicate_groups`, bâtie sur `offer_dedup_keys`,
exposant au moins :

- `offer_id`
- `dup_group_id` — un identifiant stable du groupe
- `dup_count` — nombre d'offres du groupe
- `dup_sources` — les sources du groupe, triées
- `dup_first_seen_at` — le `first_seen_at` **le plus ancien du groupe**
- `is_primary` — vrai pour la seule ligne à conserver

### Les deux clés, asymétriques par nécessité mesurée

- **Intra**-source : `(source, norm_company, norm_title, norm_city)`
- **Inter**-sources : `(norm_company, norm_title)`, sans géographie

Un groupe inter-sources peut donc **contenir** plusieurs groupes intra. La vue
doit produire un résultat cohérent : une offre appartient à un seul groupe
final, et un seul représentant est élu par groupe final. À l'implémenteur de
choisir la construction — l'important est que le résultat soit **déterministe**
et que le raisonnement figure en commentaire.

### L'ordre d'élection du représentant, décidé par l'utilisateur

1. `rate_raw is not null` d'abord — l'offre qui porte un TJM
2. puis `length(description)` décroissant
3. puis `published_at` décroissant, `null` en dernier
4. puis `first_seen_at` décroissant — la plus récente
5. puis `id` — pour que l'ordre soit total et le résultat reproductible

Le critère 5 n'est pas décoratif : sans lui, deux exécutions peuvent élire des
représentants différents, et la liste quotidienne changerait sans raison.

### La mesure exigée

- Combien de groupes, combien d'offres masquées, par source et au total.
- **Prouver qu'aucun groupe n'a zéro ou deux représentants.** C'est la façon
  dont ce genre de vue casse en silence.
- Sur au moins dix groupes tirés au hasard, lire les intitulés et dire si le
  regroupement est juste. Chercher activement un faux positif.
- Vérifier nommément que **les huit offres Achil « Collaborateur Comptable
  Confirmé »** restent huit lignes distinctes.

---

## Task 3 — Brancher la sélection quotidienne

**But** : `offers_shortlist` cesse d'afficher les doublons.

### Ce qu'il faut écrire

Une migration qui :

1. ajoute à `offers_ranked` les colonnes de groupe (`dup_count`,
   `dup_sources`, `dup_first_seen_at`, `is_primary`) ;
2. restreint `offers_shortlist` aux représentants (`is_primary`).

Attention, deux pièges déjà payés dans ce dépôt :

- `offers_shortlist` est bâtie **sur** `offers_ranked` : Postgres refuse un
  `create or replace` qui change la liste de colonnes autrement qu'en ajoutant
  à la fin. Prévoir l'ordre de `drop` et de `create`.
- Le `comment on view offers_shortlist` **disparaît avec la vue**. Le recréer,
  et le vérifier : `select obj_description('offers_shortlist'::regclass);`

`dup_first_seen_at` doit être exposé même sur les lignes sans doublon (il vaut
alors le `first_seen_at` de l'offre) : une colonne qui n'existe que parfois est
une colonne qu'on oublie d'utiliser.

### La mesure exigée, avant et après

- Le décompte d'`offers_shortlist`, total et par source.
- **La liste des offres qui disparaissent**, avec leur intitulé, leur
  entreprise, et l'intitulé du représentant qui les remplace. Les lire, et dire
  si chaque disparition est justifiée. C'est la seule vérification qui compte :
  une offre masquée à tort est exactement le coût que ce plan doit éviter.
- Vérifier qu'**aucune offre n'est apparue** : le changement ne doit que
  retirer.

---

## Task 4 — Documentation et réglage

**But** : consigner, corriger ce que la mesure a démenti, et donner de quoi
surveiller.

### Ce qu'il faut faire

1. **Corriger `ETAT.md`** : P10 annonce un chiffre obtenu sur une clé sans
   ville, donc gonflé d'environ 60 %. Le corriger explicitement, à la manière
   des « Corrigé le … » que le document pratique déjà, en disant **pourquoi**
   — le cas Achil, huit villes, huit postes. Marquer P10 et P6 résolus si la
   mesure le confirme, et rafraîchir le tableau d'indicateurs **en le
   recomptant**, jamais en le recopiant.
2. **Mettre à jour la recette de `CLAUDE.md`** si les colonnes exposées
   changent ce qu'il est utile d'afficher.
3. **Ajouter une recette de surveillance** à la section de réglage d'`ETAT.md` :
   un SQL qui liste les plus gros groupes de doublons, pour repérer une source
   qui se mettrait à republier massivement. L'**exécuter** avant de l'écrire.
4. Consigner tout problème découvert en route, priorisé comme les P existants.

### Ce qu'il ne faut PAS faire

- Ne pas inventer de chiffres : chacun vient d'un `db query --linked` exécuté
  dans cette tâche.
- Ne pas toucher au code applicatif.

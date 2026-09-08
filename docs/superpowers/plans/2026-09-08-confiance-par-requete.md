# Plan — La confiance par requête

**Objectif** : retenir quelle(s) requête(s) ont ramené chaque offre, et faire
confiance aux requêtes **ancrées à une technologie** là où le texte reçu est
muet. C'est la réponse au fait mesuré n°1 du projet : Adzuna tronque toute
description à 500 caractères, donc le lexique de compétences y est aveugle.

**Chiffre qui justifie le plan**, mesuré en base le 2026-09-08 :
sur les 76 offres Adzuna en full remote, 11 passent la porte lexicale, 13
portent un signal rouge, 9 sortent en `offers_shortlist`. **54 sont invisibles
sans être suspectes** — `red_flags = 0`, `core_hits = 0`, `ai_hits = 0`. Elles
ne sont pas rejetées : on ne reçoit simplement pas le texte qui les
qualifierait. C'est ce stock que ce plan ouvre, sans réveiller le bruit de
`adzuna:remote:fr-dev` (« Business Developer », « Sales », « UX designer »).

---

## Décisions de conception, déjà tranchées

**1. On stocke l'ENSEMBLE des requêtes, pas la dernière.**
Une colonne scalaire marcherait aujourd'hui, mais seulement parce que
`priority` place les requêtes ancrées après les filets. Elle ferait dépendre
une règle de confiance d'un ordre d'exécution réglable en SQL — précisément le
piège qui a coûté la migration `20260907234512`. Un ensemble supprime le
couplage : la question devient « une requête ancrée a-t-elle vu cette offre »,
insensible à l'ordre d'écriture.

**2. La fusion se fait par union, en JavaScript, dans `upsertOffers`.**
Un upsert supabase-js écrase les colonnes qu'on lui passe ; il ne sait pas
exprimer un `found_by_query_ids | ARRAY[$1]` côté SQL. On relit donc la valeur
et on unionne — exactement le motif déjà retenu, mesuré et documenté pour
`seen_count`, et **sans aller-retour supplémentaire** : le `SELECT` existe déjà.
La non-atomicité a la même portée qu'alors : une source ne se collecte jamais
en parallèle d'elle-même, et les deux crons sont espacés d'une demi-heure pour
des exécutions de 11 et 17 secondes.

**3. La confiance est une ligne en base, jamais du code.**
Une colonne `trust` sur `search_queries`. La régler est un `UPDATE`, comme le
rayon, la matrice et le lexique. C'est le quatrième axe réglable.

**4. La règle de vue est purement ADDITIVE.**
`... OR (trouvée par une requête ancrée)`. Les 1 193 offres déjà en base ont
une provenance vide et gardent donc exactement leur sort actuel : aucune
régression possible, seulement des entrées. La provenance se peuple à partir de
la collecte suivante, comme prévu.

**5. La provenance est stampée dans `runCollection`, pas dans les mappers.**
`runCollection` est le seul endroit qui connaisse la requête courante pour les
six sources. La stamper là garantit qu'aucune source ne l'oublie, et évite de
dupliquer le geste dans chaque mapper. Elle ne rejoint donc PAS
`NormalizedOffer`, qui décrit ce qu'une **source** produit : la provenance est
ce que le **collecteur** sait, et voyage en paramètre d'`upsertOffers`.

---

## Contraintes globales

Elles sont non négociables et lient chaque tâche.

- **`verify` doit passer** :
  `export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify`
  Zéro erreur de lint, zéro erreur de formatage, zéro test rouge.
- **Aucun contournement du linter.** Interdits : `deno-lint-ignore`,
  `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `as any`,
  `as unknown as X` hors fichiers de test, `--no-check`, `--force`.
  Si le linter signale quelque chose, le code change, pas la règle.
- **`supabase/functions/_shared/` est runtime-neutre** : aucun `Deno.*`, aucun
  import `node:`. Contrôle :
  `grep -rn "Deno\.\|node:" supabase/functions/_shared/ --include=*.ts | grep -v "__tests__"`
  doit ne rien renvoyer.
- **Toute évolution de schéma passe par une migration**, données de référence
  comprises, avec des inserts/updates idempotents. Rien à la main dans le
  tableau de bord.
- **Interroger la base** : `npx supabase db query --linked "<SQL>"`.
  `--linked` est obligatoire. SQL sur **une seule ligne** — une requête
  multi-ligne se fait manger par le shell et revient en « query: Too small ».
- **`npm run fn:serve` ne sert pas à tester une collecte** : il réserve
  `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` et ignore silencieusement
  `.env.local`, écrivant dans une Postgres locale vide. Utiliser
  `npm run fn:local:ft` / `npm run fn:local:adzuna`.
- **Jamais de corps vide sur un endpoint de collecte** : `dryRun` vaut `false`
  par défaut, donc `{}` déclenche une vraie collecte. Attendre la ligne
  `Listening` puis envoyer un corps explicite.
- **Une migration vide s'applique « avec succès » en ne faisant rien.**
  Vérifier la taille du fichier avant `db push`, et l'effet en base après.
- **`git status` avant tout `db push`** : une copie de travail peut mentir.
- Aucun secret dans le dépôt. La référence de projet `zbpbuzoukldbzfbbikhw`
  n'en est pas un.
- Les trois axes réglables — rayon, matrice, lexique — ne se codent pas.
- Deno est hors du PATH : toute commande `deno` ou `npm run` doit être précédée,
  dans le **même** appel shell, de
  `export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links"`.
  L'état du shell ne persiste pas d'un appel à l'autre.

---

## Task 1 — Migration : provenance et confiance

**But** : créer les deux colonnes. Aucun changement de code applicatif, aucun
changement de vue. Cette tâche pose le réceptacle ; la suivante le remplit.

### Ce qu'il faut écrire

Une seule migration, nommée
`supabase/migrations/<horodatage>_query_provenance_and_trust.sql`, horodatée
selon la convention du dépôt (regarder les migrations existantes ; format
`YYYYMMDDHHMMSS`, postérieur à `20260908004235`).

Elle contient, dans cet ordre :

1. `alter table offers add column found_by_query_ids int[] not null default '{}'::int[];`
   — `not null default '{}'` et non `null` : « aucune requête connue » et
   « tableau vide » sont le même fait, et un tableau vide évite à toute requête
   ultérieure d'avoir à gérer `null` séparément de `{}`.
2. Un index GIN dessus :
   `create index offers_found_by_query_ids_idx on offers using gin (found_by_query_ids);`
   — l'opérateur `&&` (intersection) de la tâche 3 s'en sert.
3. `comment on column offers.found_by_query_ids is '...'` expliquant que
   c'est l'UNION des requêtes ayant ramené l'offre, accumulée collecte après
   collecte, et que les offres antérieures au 2026-09-08 ont un tableau vide.
4. `alter table search_queries add column trust text not null default 'net' check (trust in ('anchored', 'net'));`
   — défaut `net` : une requête nouvelle n'est pas digne de confiance tant que
   personne ne l'a classée. C'est le sens conservateur.
5. `comment on column search_queries.trust is '...'` : `anchored` = requête
   ancrée à une technologie, dont le seul fait d'avoir ramené l'offre est un
   signal suffisant ; `net` = filet large, dont les résultats exigent une
   confirmation lexicale.
6. Les `update search_queries set trust = 'anchored' where label in (...)` qui
   classent les requêtes ancrées. **Exactement ces sept étiquettes Adzuna** :
   - `adzuna:local:react-ts`
   - `adzuna:local:typescript`
   - `adzuna:local:nextjs`
   - `adzuna:local:javascript`
   - `adzuna:remote:fr-ts`
   - `adzuna:remote:fr-react`
   - `adzuna:remote:fr-js`

   **Aucune requête France Travail n'est classée `anchored`.** Raison à écrire
   en commentaire : sur France Travail le lexique voit la description entière
   et fait déjà le travail ; `motsCles` n'y indexe pas les technologies
   (mesuré : `React` 0, `TypeScript` 0, `Next.js` 0 à Marseille sur 31 jours),
   donc une requête FT ne peut rien garantir sur la stack. Les laisser toutes
   en `net` rend ce plan strictement sans effet sur la sélection FT.

   Restent `net` côté Adzuna, et il faut le dire en commentaire :
   `adzuna:local:it-jobs` (filet de catégorie, aucune garantie),
   `adzuna:local:dev-front`, `adzuna:local:dev-web`, `adzuna:remote:fr-dev`
   — le lemmatiseur d'Adzuna fait correspondre « développeur » à « Business
   Developer », c'est la source du bruit mesuré.

   Ce classement est un **pari documenté**, pas une mesure : il sera confronté
   aux offres réelles en tâche 4 et corrigé si la mesure le dément. Le dire
   dans le commentaire.

Le commentaire d'en-tête de la migration doit porter le chiffre qui justifie
tout : 76 offres Adzuna full remote, 9 retenues, **54 invisibles sans être
suspectes**.

### Vérification exigée avant de rendre

Toutes par `npx supabase db query --linked`, sur une seule ligne chacune :

- `git status` avant `db push`, et taille du fichier de migration non nulle.
- Après `db push` : les deux colonnes existent, avec le bon type et le bon
  défaut (interroger `information_schema.columns`).
- `select trust, count(*) from search_queries group by trust;` doit rendre
  7 `anchored` et le reste `net`.
- `select count(*) from search_queries where source = 'france_travail' and trust <> 'net';`
  doit rendre 0.
- `select count(*) from offers where found_by_query_ids <> '{}';` doit rendre
  0 — rien n'est encore peuplé, c'est normal et attendu.

Le rapport cite ces nombres. Un nombre non cité est un nombre non mesuré.

### Ce qu'il ne faut PAS faire

- Ne pas toucher aux vues. Elles changent en tâche 3.
- Ne pas toucher au code TypeScript. Il change en tâche 2.
- Ne pas modifier `priority` ni `enabled` d'aucune requête.

---

## Task 2 — Écriture de la provenance

**But** : peupler `offers.found_by_query_ids` à chaque collecte, par union.
La colonne existe déjà (tâche 1).

### Fichiers touchés

- `supabase/functions/_shared/upsert.ts`
- `supabase/functions/_shared/run-collection.ts`
- `supabase/functions/_shared/__tests__/upsert_test.ts`
- `supabase/functions/_shared/__tests__/run-collection_test.ts`

### Signature

`upsertOffers` reçoit un troisième paramètre, **la provenance du lot** :

```ts
export interface UpsertProvenance {
  /** Requête qui a ramené ce lot, ou null si la provenance est inconnue. */
  queryId: number | null;
}

export async function upsertOffers(
  db: DbClient,
  offers: NormalizedOffer[],
  provenance: UpsertProvenance,
): Promise<UpsertResult>
```

Le paramètre est **requis**, pas optionnel avec un défaut : un appelant qui
oublie la provenance doit échouer à la compilation, pas écrire silencieusement
des offres sans origine. C'est le point de tout le plan.

Un lot vient toujours d'une seule requête — `runCollection` appelle
`upsertOffers` après **chaque** requête —, donc la provenance est un paramètre
du lot et non un champ de chaque ligne. Ne pas l'ajouter à `NormalizedOffer` :
ce type décrit ce qu'une source produit, la provenance est ce que le
collecteur sait.

### Comportement attendu de `upsertOffers`

1. Le `SELECT` existant lit désormais aussi `found_by_query_ids` :
   `.select('external_id, seen_count, found_by_query_ids')`. **Aucun
   aller-retour supplémentaire.**
2. Pour chaque ligne du payload, `found_by_query_ids` vaut l'**union** du
   tableau relu (ou `[]` si l'offre est nouvelle ou si la colonne est `null`)
   et de `[provenance.queryId]` — ce dernier omis si `queryId` est `null`.
3. L'union ne doit pas produire de doublon : une offre ramenée dix fois par la
   même requête garde un tableau à un élément. C'est une **union**, pas une
   concaténation — à la différence de `seen_count`, qui lui compte bien chaque
   passage.
4. L'ordre du tableau n'est pas significatif, mais il doit être
   **déterministe** pour que les tests soient stables : trier numériquement.
5. Une offre déjà connue conserve les requêtes passées : l'ensemble
   s'accumule. Une requête désactivée plus tard laisse donc sa trace, et c'est
   voulu — « cette requête a trouvé cette offre » reste vrai.

### Comportement attendu de `runCollection`

Passer `{ queryId: query.id }` à l'appel `upsertOffers`. Rien d'autre ne
change : ni la télémétrie, ni le comptage new/updated, ni le `dryRun` (qui
n'écrit toujours rien).

### Tests exigés (TDD : rouge d'abord)

Dans `upsert_test.ts` :
- Offre nouvelle → `found_by_query_ids` vaut `[queryId]`.
- Offre connue avec `[7]`, collectée par la requête 12 → `[7, 12]`.
- Offre connue avec `[12]`, re-collectée par la requête 12 → `[12]`,
  **pas** `[12, 12]`.
- Offre connue dont la colonne relue est `null` → `[queryId]` (robustesse au
  fait que la colonne a été ajoutée après coup sur des lignes existantes).
- `queryId: null` → le tableau existant est préservé tel quel, et une offre
  nouvelle reçoit `[]`.
- Le tableau est trié.

Dans `run-collection_test.ts` : un test qui prouve que l'`id` de la requête
courante parvient bien à `upsertOffers` — et que deux requêtes différentes
dans la même boucle transmettent bien deux `id` différents.

### Vérification exigée avant de rendre — LA PLUS IMPORTANTE

`npm run verify` vert **ne suffit pas**. Le pire défaut de la phase 1 avait
tous ses tests verts parce qu'ils injectent un `fetch` factice. Il faut
**une collecte réelle** :

1. `export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run fn:local:adzuna`
   en arrière-plan, attendre la ligne `Listening`.
2. `curl` sur `http://localhost:8000` avec un corps **explicite** :
   `{"mode":"backfill","trigger":"manual","dryRun":false}`.
   Jamais `{}` — `dryRun` vaut `false` par défaut et un corps vide déclencherait
   quand même une vraie collecte, mais on veut ici que le corps soit lisible
   dans le rapport.
3. Puis en base, par `db query --linked`, sur une seule ligne chacune :
   - `select count(*) from offers where found_by_query_ids <> '{}';`
     — doit être franchement non nul côté Adzuna.
   - `select count(*) from offers where source = 'france_travail' and found_by_query_ids <> '{}';`
     — doit être 0 : la fonction FT n'a pas tourné, donc rien ne doit avoir
     bougé de ce côté.
   - Une requête montrant qu'au moins une offre porte **plusieurs** ids —
     c'est la preuve que l'union fonctionne et pas seulement l'écriture :
     `select count(*) from offers where array_length(found_by_query_ids, 1) > 1;`
   - Une requête vérifiant qu'aucun tableau ne contient de doublon :
     `select count(*) from offers where array_length(found_by_query_ids, 1) <> array_length(array(select distinct unnest(found_by_query_ids)), 1);`
     doit rendre 0.

Le rapport doit citer ces nombres. Un nombre non cité est un nombre non
mesuré.

### Ce qu'il ne faut PAS faire

- Ne pas déployer les fonctions. Le déploiement est en tâche 5.
- Ne pas toucher aux vues.
- Ne pas lancer la collecte France Travail.

---

## Task 3 — Les vues : exposer la provenance et ouvrir la sélection

**But** : rendre la provenance lisible, et ajouter la branche de confiance à
`offers_shortlist`. La provenance est peuplée depuis la tâche 2.

### Ce qu'il faut écrire

Une migration
`supabase/migrations/<horodatage>_shortlist_trusts_anchored_queries.sql`.

**1. `offers_ranked` gagne deux colonnes dérivées :**

- `found_by_labels text[]` — les étiquettes des requêtes ayant ramené l'offre,
  triées, pour que la provenance se lise sans jointure manuelle.
- `trusted_query boolean` — vrai si **au moins une** requête `anchored` figure
  dans `found_by_query_ids`.

Les deux se calculent par un `left join lateral` sur `search_queries`, ou par
sous-requêtes corrélées — au choix de l'implémenteur, mais la vue doit rester
lisible et ne pas dégrader le temps de réponse de façon absurde (c'est
`offers_ranked` qui sert de base à `offers_shortlist`, elle-même consultée
tous les jours à la main).

Attention : `offers_ranked` fait aujourd'hui `select o.*`, donc
`found_by_query_ids` y apparaît déjà automatiquement. Ne pas la dupliquer.

Attention aussi : Postgres refuse de remplacer une vue dont la liste de
colonnes change autrement qu'en ajoutant à la fin, et `offers_ranked` est
consommée par `offers_shortlist`. Prévoir l'ordre de `drop`/`create` — et
recréer `offers_shortlist` dans la même migration, ainsi que son `comment on
view`, qui disparaît avec la vue.

**2. `offers_shortlist` ajoute la branche de confiance :**

```
where o.red_flags = 0
  and (o.core_hits >= 1 or o.ai_hits >= 1 or o.trusted_query)
  and (o.department in ('13','83','84') or o.remote_label = 'full')
```

Le signal rouge reste **éliminatoire** — une requête ancrée ne rachète jamais
un signal rouge. La condition d'accessibilité géographique ne change pas.
Le changement est **purement additif** : aucune offre aujourd'hui retenue ne
peut sortir.

**3. La colonne `acces`** doit rester telle quelle.

### Mesure exigée, AVANT et APRÈS

C'est le cœur de la tâche. Comme pour la migration `20260908004235`, la valeur
de la vue se démontre par un décompte et par une inspection à la main.

Avant d'appliquer la migration, relever :
- `select count(*) from offers_shortlist;`
- la même par source.
- La liste des `id` retenus, pour pouvoir prouver après coup qu'aucune n'est
  sortie.

Après :
- Les mêmes décomptes.
- **La liste des offres ajoutées**, avec `title`, `company_name`,
  `found_by_labels`, `score`, `remote_label`. Les compter à la main en trois
  paquets : franchement pertinentes / adjacentes / hors sujet — exactement la
  méthode employée pour `ai_hits`.
- Vérifier qu'**aucune offre n'est sortie** de la sélection (le changement est
  additif ; si une offre disparaît, c'est un défaut, pas un réglage).

Ces nombres et cette liste vont dans le rapport. Ils serviront de matière à la
tâche 4, qui n'a pas d'autre source.

### Ce qu'il ne faut PAS faire

- Ne pas modifier `trust` d'aucune requête : c'est la tâche 4, une fois la
  mesure disponible.
- Ne pas modifier le lexique.
- Ne pas relâcher le signal rouge.

---

## Task 4 — Réglage sur la mesure, et documentation

**But** : confronter le pari de classement de la tâche 1 aux offres réellement
entrées, corriger si nécessaire, et consigner dans `ETAT.md`.

### Entrée

Le rapport de la tâche 3 : la liste des offres ajoutées, avec leur
`found_by_labels`.

### Ce qu'il faut faire

**1. Analyser par requête.** Pour chaque étiquette `anchored`, compter combien
d'offres elle a fait entrer, et quelle proportion est pertinente. Requête
utile :
`select unnest(found_by_labels) as label, count(*) from offers_shortlist group by 1 order by 2 desc;`
et la même restreinte aux offres qui n'entrent QUE par `trusted_query`
(`core_hits = 0 and ai_hits = 0`), qui sont celles que ce plan a ajoutées.

**2. Corriger le classement si la mesure le dément.** Les deux paris les plus
fragiles, identifiés d'avance :
- `adzuna:local:javascript` et `adzuna:remote:fr-js` — « JavaScript » est une
  technologie, mais large.
- `adzuna:local:nextjs` — volume mesuré très faible (0 / 2 offres), donc peu
  de matière pour juger.

Si une requête `anchored` fait entrer une majorité de hors-sujet, la repasser
en `net` par une **migration** (pas un `UPDATE` à la main : c'est une donnée de
référence, elle passe par une migration idempotente, conformément aux règles du
dépôt). Si tout tient, ne rien changer et le dire — un plan qui se confirme est
un résultat, pas une occasion de bouger quelque chose.

**3. Mettre `docs/ETAT.md` à jour.** C'est une exigence, pas une finition. Y
consigner :
- Le tableau d'indicateurs rafraîchi (compter en base, ne pas recopier).
- Les tâches de ce plan, dans une section propre.
- La décision de conception « ensemble plutôt que scalaire » **avec sa
  raison** — le couplage à `priority` qui a déjà coûté une migration.
- Le résultat mesuré : combien d'offres ajoutées, leur répartition à la main,
  et le classement `trust` final avec ce qui l'a justifié.
- Le nouvel axe réglable : `search_queries.trust`, réglable par migration.
- Tout problème découvert en route, priorisé comme les P1-P7 existants.

**4. Si la mesure dément une affirmation de `CLAUDE.md` ou d'`ETAT.md`**, la
corriger explicitement, à la manière de la ligne « Corrigé le 2026-09-08 » qui
existe déjà. Ne pas laisser deux versions d'un fait cohabiter.

### Ce qu'il ne faut PAS faire

- Ne pas inventer de chiffres : chaque nombre écrit dans `ETAT.md` doit venir
  d'un `db query --linked` exécuté dans cette tâche.
- Ne pas toucher au code applicatif.

---

## Task 5 — Déploiement et vérification de bout en bout

**But** : mettre en production le code changé et prouver que la chaîne
automatique écrit bien la provenance, PC éteint.

`_shared/run-collection.ts` et `_shared/upsert.ts` ont changé : **les deux**
fonctions les embarquent, donc **les deux** doivent être redéployées, pas
seulement Adzuna. Une fonction non redéployée continuerait de tourner sur
l'ancien bundle et écrirait des offres sans provenance — silencieusement.

### Ce qu'il faut faire

1. `npm run verify` vert, `git status` propre.
2. Redéployer les deux fonctions par `npx supabase functions deploy`
   (regarder les scripts npm existants du dépôt avant d'inventer une commande).
   `verify_jwt` reste à `true` sur les deux.
3. Déclencher une collecte réelle sur **chacune** des deux fonctions
   déployées, avec un corps explicite et `trigger: manual`.
4. Vérifier en base, par `db query --linked`, une ligne par requête :
   - `select source, count(*) filter (where found_by_query_ids <> '{}') as avec_provenance, count(*) as total from offers group by source;`
     — les deux sources doivent désormais avoir de la provenance.
   - Le décompte de `offers_shortlist`, par source.
   - Que le dernier `collection_runs` de chaque source est en `success`.
5. Ne rien changer aux jobs `pg_cron` : leur définition ne dépend pas du
   bundle, ils appellent la même URL. Le vérifier plutôt que le supposer —
   `select jobname, schedule, active from cron.job;`.

### Vérification exigée avant de rendre

Le rapport cite les nombres de l'étape 4 et l'identifiant des deux runs.

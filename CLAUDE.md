# fast-travail — règles du projet

Veille automatisée d'offres d'emploi pour un profil développeur front-end
React / TypeScript, zone Marseille / Aix-en-Provence et full-remote national.

| Document | À quoi il sert |
|---|---|
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Vision produit, les 5 phases, décisions structurantes et ce que la mesure a démenti |
| [`docs/RESTE-A-FAIRE.md`](docs/RESTE-A-FAIRE.md) | Ce qui reste, ce que chaque chantier coûte et rapporte, et quand le faire |
| [`docs/ETAT.md`](docs/ETAT.md) | **Où on en est, ce qui reste, problèmes ouverts priorisés.** À lire en premier pour reprendre le travail |
| [`docs/superpowers/specs/2026-09-07-collecte-offres-phase1-design.md`](docs/superpowers/specs/2026-09-07-collecte-offres-phase1-design.md) | Design détaillé de la phase 1 |
| [`docs/superpowers/plans/2026-09-07-collecte-api-france-travail-adzuna.md`](docs/superpowers/plans/2026-09-07-collecte-api-france-travail-adzuna.md) | Plan d'implémentation, tâche par tâche |
| [`docs/superpowers/specs/2026-09-08-scoring-ia-phase2-design.md`](docs/superpowers/specs/2026-09-08-scoring-ia-phase2-design.md) | Design de la phase 2, le scoring IA |
| [`docs/superpowers/plans/2026-09-08-scoring-ia-phase2.md`](docs/superpowers/plans/2026-09-08-scoring-ia-phase2.md) | Plan de la phase 2, tâche par tâche |
| [`docs/design/GUIDELINES.md`](docs/design/GUIDELINES.md) | **Règles de conception de l'interface — contraignantes.** À lire avant d'écrire un composant |
| [`docs/design/maquettes/README.md`](docs/design/maquettes/README.md) | Les maquettes de la phase 3, et ce que leurs données valent |
| [`docs/superpowers/plans/2026-09-09-tableau-de-bord-phase3.md`](docs/superpowers/plans/2026-09-09-tableau-de-bord-phase3.md) | Plan de la phase 3, tâche par tâche |

**Tenir `ETAT.md` à jour** fait partie du travail : chaque tâche terminée, chaque
problème découvert et chaque décision prise y sont consignés. C'est le document
qui permet de reprendre après une interruption.

## Qualité — non négociable

**Zéro erreur de lint, zéro erreur de formatage, zéro test rouge.** La porte
unique est :

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
```

`verify` enchaîne `fmt:check`, `lint`, `check` puis `test`. Il doit passer
avant tout commit. Une tâche dont `verify` échoue n'est pas terminée.

Le `check` (typecheck) n'est pas redondant avec `test` : les `index.ts` des
Edge Functions ne sont importés par aucun test, donc `deno test` ne les
typecheck pas. Sans cette étape, une erreur de type dans un point d'entrée
passerait inaperçue jusqu'au déploiement.

Piège à connaître en écrivant ces commandes : `deno check` accepte très bien
un **dossier**, mais un glob `**/*.ts` que le shell n'expanse pas matche zéro
fichier et sort en 0 — un succès silencieux qui ne vérifie rien. Toujours
passer un dossier.

**Aucun contournement du linter n'est autorisé.** Sont interdits :

| Interdit | Pourquoi |
|---|---|
| `// deno-lint-ignore` et `// deno-lint-ignore-file` | Masque le problème au lieu de le corriger |
| `// eslint-disable` sous toutes ses formes | Idem |
| `// @ts-ignore` | Éteint le typage à l'endroit exact où il servait |
| `// @ts-expect-error` | Même chose, avec une fausse impression de rigueur |
| `as any`, `as unknown as X` hors fichiers de test | Fait passer un mensonge de type pour une conversion |
| `--no-check`, `--allow-dirty`, `--force` | Contourne la vérification plutôt que la satisfaire |

Si le linter ou le compilateur signale quelque chose, **le code change, pas la
règle**. Le seul assouplissement admis concerne les faux clients de base de
données dans les fichiers `__tests__/`, où un `as unknown as DbClient` est le
moyen normal de fabriquer un double de test.

### Exclure n'est pas contourner

`supabase/functions/deno.json` exclut `**/__tests__/fixtures/**` du formatage.
Ce n'est pas un contournement : une fixture est la **capture verbatim** d'une
réponse d'API externe. La reformater masquerait sa nature, et chaque nouvelle
capture ferait échouer `verify` sans qu'une ligne de code ait bougé. Une
exclusion se justifie quand le fichier n'est pas du code du projet ; jamais
quand le code déplaît au linter.

## Outillage

- **Deno 2.9.6** est installé mais **hors du PATH** hérité par les shells.
  Toute commande `deno` ou `npm run` qui l'invoque doit être précédée, dans le
  **même** appel shell, de :
  `export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links"`
  L'état du shell ne persiste pas entre deux appels.
- **Toute commande `deno` doit porter `--config supabase/functions/deno.json`.**
  Deno découvre `deno.json` en remontant depuis le répertoire courant, jamais en
  descendant : sans ce drapeau, l'import map n'est pas résolue et le typecheck
  échoue sur `@std/assert`. Les scripts npm le font déjà.
- **Supabase CLI** : toujours `npx supabase`, jamais `supabase` nu. La version
  est pinnée en devDependency, donc reproductible.
- **`supabase functions serve` ne sert pas à tester une collecte.** La commande
  **réserve** les noms `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` et ignore
  **silencieusement** les valeurs de `.env.local`. Une collecte lancée ainsi
  écrit dans une Postgres locale éphémère et vide en croyant écrire sur le
  projet distant : aucune erreur, aucune ligne, un faux succès complet. Pour un
  essai local contre la base distante, lancer le point d'entrée directement —
  `npm run fn:local:ft` ou `npm run fn:local:adzuna`, qui font
  `deno run --env-file=.env.local`. L'absence de `verify_jwt` en local est
  normale : il est appliqué par la plateforme, pas par `Deno.serve`.
- **VS Code** : l'extension `denoland.vscode-deno` est **indispensable**. Sans
  elle, le serveur TypeScript de Node analyse les Edge Functions et signale des
  erreurs qui n'existent pas (`Deno.serve` inconnu, imports en `.ts` refusés).
  `.vscode/settings.json` active Deno uniquement sur `supabase/functions/`.
  Prettier et ESLint sont exclus de ce dossier par `.prettierignore` et
  `.eslintignore` : leurs conventions Node y sont fausses.
- **`deno fmt` et Prettier ne peuvent pas voir les mêmes fichiers.** C'est une
  boucle sans issue, prouvée dans les deux sens en phase 3 : chacun impose des
  conventions que l'autre annule (guillemets, largeur de ligne...), donc les
  faire tourner tous les deux sur le même dossier les fait alterner à
  l'infini au lieu de converger. Les cibles `fmt`/`lint`/`check` (racine)
  restent **exactement** `supabase/functions/ scripts/` : `dashboard/` ne doit
  **jamais** y être ajouté. `dashboard/` a son propre `verify` (Prettier,
  ESLint, `tsc`, Vitest — voir `dashboard/package.json`), agrégé par
  `npm run verify` via `verify:deno` puis `verify:dashboard`, jamais fusionné
  dans les commandes Deno.
- **Depuis ESLint 9, le *flat config* ne lit plus `.eslintignore`.** Le
  fichier à la racine est **décoratif** — gardé pour la trace et pour tout
  outil qui le lirait encore, mais ce n'est pas lui qui protège
  `supabase/functions/` d'ESLint. Les exclusions réelles vivent dans le
  tableau `ignores` d'`eslint.config.js`, qui fait foi.

## Frontières d'architecture

**`supabase/functions/_shared/` est runtime-neutre.** Aucun `Deno.env`, aucun
accès `Deno.*`, aucun import `node:` dans ces fichiers — la configuration
arrive **en paramètre**. Ces fichiers sont importés tels quels par les
scrapers, des scripts Deno locaux sous `supabase/functions/_scrapers/`, hors
Edge Functions. Contrôle :

```bash
grep -rn "Deno\.\|node:" supabase/functions/_shared/ --include=*.ts | grep -v "__tests__"
```

Cette commande doit ne rien renvoyer. La lecture de l'environnement
(`requireEnv`) appartient aux `index.ts` de chaque fonction, qui sont du code
Deno assumé.

**L'orchestration de collecte est mutualisée** dans
`_shared/run-collection.ts` et sert les quatre sources (France Travail, Adzuna,
Free-Work, Collective.work). Les `index.ts` ne font que
lire l'environnement, charger les requêtes et déléguer. Ne jamais dupliquer la
boucle.

**Le code partagé reste sous `supabase/functions/_shared/`**, pas à la racine :
le CLI n'embarque dans le bundle que ce qui se trouve sous `supabase/functions`,
sauf avec le flag expérimental `--use-api`.

**`supabase/functions/_scrapers/`** : scripts Deno locaux, hors Edge
Functions — Free-Work et Collective.work, lancés manuellement ou par le
Planificateur Windows, jamais par `pg_cron`. Seuls les `main.ts` de chaque
scraper lisent l'environnement (`Deno.env`, `Deno.args`) ; le reste
(`_scrapers/_shared/`, les clients, les mappers) suit la même règle de
neutralité runtime que `supabase/functions/_shared/` — configuration reçue en
paramètre, jamais lue directement.

**Le fait qui coûterait une demi-heure à quelqu'un d'autre** : `deno fmt`
formate le HTML, et l'exclusion `**/__tests__/fixtures/**` de
`supabase/functions/deno.json` est résolue relativement au dossier de **ce
fichier** (`supabase/functions/deno.json`), pas à la racine du dépôt. Une
fixture HTML placée hors de `supabase/functions/` — par exemple sous un
`scripts/` ou un `_scrapers/` à la racine — ferait donc échouer `fmt:check`
sans que l'exclusion existante ne la couvre. C'est la raison pour laquelle le
code des scrapers vit sous `supabase/functions/_scrapers/` et non à la racine
du dépôt ; ce n'est devinable qu'en le mesurant une fois.

**La règle de politesse des scrapers** est en base, pas dans le code : les
colonnes `min_delay_ms`, `max_pages_per_run`, `user_agent`, `robots_allows` de
`sources` (voir « Base de données » plus bas) pilotent chaque exécution.
`robots.txt` est revérifié à **chaque** collecte, jamais mis en cache d'une
exécution à l'autre — une autorisation constatée un jour ne vaut rien le
lendemain. L'agent utilisateur est honnête (`fast-travail/0.1 (veille
personnelle)`), jamais un navigateur usurpé, et ne porte aucune adresse
personnelle. Un seul en vol à la fois vers une même source : jamais de
parallélisme.

## Base de données

- **Toute évolution de schéma passe par une migration.** Ne rien créer à la main
  dans le tableau de bord : la base et le dépôt divergeraient.
- **Les données de référence passent aussi par des migrations**, avec des
  inserts idempotents (`on conflict do nothing`). `seed.sql` ne s'exécute que
  sur un `db reset` local, et il n'y a pas de base locale ici.
- **RLS activé sur toutes les tables, sans aucune policy.** Seule la clé
  `service_role` accède aux données. Une table sans RLS rendrait la base
  lisible depuis Internet via la clé `anon`, qui est publique par nature.
- **Pour interroger ou modifier la base distante, utiliser
  `npx supabase db query --linked "<SQL>"`.** C'est le chemin direct : il
  exécute du SQL arbitraire sur le projet distant, sans Docker ni script
  intermédiaire. **Le drapeau `--linked` est obligatoire** — sans lui, la
  commande cible une base *locale* qui n'existe pas ici et échoue sur un refus
  de connexion trompeur.
- **`db diff` ne fonctionne pas sur cette machine** : il exige un démon Docker
  pour sa base fantôme, et Docker Desktop n'est pas démarré. Vérifier le schéma
  par `db query --linked` à la place, ou fonctionnellement en écrivant puis en
  relisant une ligne de sonde.

## Secrets

- `.env.local` est gitignoré et ne doit **jamais** être commité, ni son contenu
  recopié dans un rapport, un commentaire ou un message.
- **Ce qui est secret, et ce qui ne l'est pas.** Sont sensibles : la clé
  `service_role`, le mot de passe de la base, les identifiants France Travail et
  Adzuna. Ne le sont pas : la **référence du projet** (`zbpbuzoukldbzfbbikhw`),
  qui est le nom d'hôte public de toutes les requêtes du projet et apparaît dans
  n'importe quel onglet réseau. Elle peut donc figurer dans une migration. La clé
  `anon` est publique par conception, mais reste hors du dépôt par hygiène : elle
  passe par Vault.
- Les secrets des Edge Functions passent par `npx supabase secrets set`.
- Le jeton utilisé par les jobs `pg_cron` passe par **Vault**
  (`vault.decrypted_secrets`, secret nommé `cron_auth_key`), jamais en clair dans
  la définition du job. **C'est la clé `anon`, pas `service_role`** : le job n'a
  besoin que de franchir `verify_jwt`, tandis que l'Edge Function reçoit sa propre
  clé `service_role` injectée par Supabase pour écrire en base. Moindre privilège :
  une fuite de ce jeton ne permettrait rien de plus qu'appeler la fonction, RLS
  étant actif sans aucune policy.
- `verify_jwt` reste à `true` sur toutes les fonctions : une Edge Function
  déployée est une URL publique sur Internet. « Pas d'authentification » signifie
  pas d'auth *utilisateur* dans l'application, pas un endpoint ouvert à tous.

## Ce que la mesure a démenti

Deux suppositions du design initial se sont révélées fausses à l'usage. Elles
sont documentées ici parce qu'elles orientent toute décision future sur les
sources.

**`motsCles` de France Travail n'indexe pas les technologies.** Mesuré à
Marseille, rayon 40 km, 31 jours : `React` 0, `TypeScript` 0, `Next.js` 0.
Onze des dix-neuf requêtes initiales rendaient 0 à 3 offres. La collecte ratisse
donc large avec le vocabulaire réel du marché (`informatique`,
`ingénieur d'études`, codes ROME), et **le lexique de compétences est le filtre
principal** — c'est lui qui trouve « React » dans les descriptions.

**Sur Adzuna, la requête est le filtre — l'inverse de France Travail.** Adzuna
tronque **toute** description à 500 caractères : mesuré sur 50 offres, longueur
min 500, médiane 500, max 500, et 50 sur 50 finissent par « … ». Le lexique ne
voit donc que ce début de texte, là où la stack technique figure presque
toujours plus loin — 1 offre sur 50 mentionne « react » dans ce qu'on reçoit.
Mais l'index d'Adzuna voit le texte intégral : sur 19 offres rendues par
`what_phrase=full remote`, 13 ne portent pas la locution dans les 500
caractères reçus. D'où des requêtes **précises** sur Adzuna, et un ratissage
large sur France Travail. Ne jamais tenter de compenser la troncature par du
code : c'est impossible.

**`React` est inutilisable comme mot-clé Adzuna** : le lemmatiseur français y
confond « React » et « réacteur ». `what_and=React` à Marseille rend 60 offres
dont 8 titres de réacteurs nucléaires et 1 seule contenant « react » comme mot ;
`what_exclude=réacteur` les rend **toutes** à zéro, vraies offres React
comprises. Le terme ne s'emploie qu'ancré à un second (`React TypeScript`) ou à
une locution exacte. Le lexique n'est pas menacé : `react` y est en `fts`, et la
recherche plein texte française ne confond pas les deux radicaux.

**Le full remote national vient de la requête, pas du texte.** `what_phrase`
impose une locution dans le texte intégral, et `extra_params.implies_remote`
comble le silence des 500 caractères reçus ; le texte garde le dernier mot
quand il dit quelque chose. Seule « full remote » se combine à `what_and` : les
locutions accentuées ou porteuses de `%` rendent 0 en combinaison.

Deux autres pièges Adzuna vérifiés : `what` n'est pas un ET logique (utiliser
`what_and`), et `category=it-jobs` est un filet à part, jamais combiné aux
mots-clés — catégorie et mots-clés sont deux requêtes séparées.

**Corrigé le 2026-09-08** : « Adzuna est la source principale, React y rend 36
offres à Marseille » était faux. Ce 36 était un `count`, gonflé par la collision
« réacteur ». Le signal React local réel est de 5 offres sur 31 jours
(`React TypeScript`). Adzuna gagne en revanche nettement sur le **full remote
national** — 63 offres sur 31 jours contre 9 pour France Travail sur 699.

## Consulter les offres

```sql
select source, title, company_name, city, acces,
       coalesce(rate_raw, salary_raw) as remu,
       score, matched_terms, found_by_labels, trusted_query,
       distance_marseille_km, dup_count, dup_first_seen_at
from offers_shortlist
order by score desc, published_at desc;
```

`dup_count` dit en combien d'exemplaires ce poste a été vu (1 s'il est seul).
`dup_first_seen_at` est la date de la **première** offre du groupe, pas celle
de la ligne affichée. Un poste vu depuis longtemps sous plusieurs
republications (`dup_count` élevé, `dup_first_seen_at` ancien) est un signal
— dur à pourvoir, ou très demandé.

**L'annonce affichée n'est pas toujours la plus récente**, et c'est le piège
à connaître avant de cliquer sur un lien. L'ordre d'élection est : d'abord
celle qui porte un **TJM**, puis la **description la plus longue**, puis la
plus récemment publiée, puis celle vue en premier (`first_seen_at`), puis
l'`id` pour que l'ordre soit total. La fraîcheur ne vient donc qu'en
troisième position.

En pratique le piège est **rare** : mesuré le 2026-09-08, sur les 87 lignes de
la sélection, **3 groupes seulement** ont plus d'un candidat éligible, et
**2 lignes** affichent autre chose que la plus fraîche. L'une est le groupe
KLANIK « Ingénieur IA », qui montre l'annonce France Travail du 21 août — sa
description complète l'emporte — en masquant une annonce Adzuna du
3 septembre. Si un lien est mort, c'est `offers_hidden_duplicates` qu'il faut
regarder : une republication plus fraîche y attend peut-être.

**Interroger `offers_shortlist`, jamais `offers_ranked` avec une clause écrite
à la main.** La vue encode la règle complète — signal rouge éliminatoire, puis
`core_hits` **ou** `ai_hits` **ou** une requête de confiance, puis
l'accessibilité géographique — et cette règle a changé deux fois. La recette
précédente de ce fichier filtrait sur `core_hits >= 1` : mesurée le
2026-09-08, elle rendait 32 lignes là où la sélection réelle en compte 87, et
**20 seulement** des 87 ont un `core_hits`. Elle cachait donc 67 offres, dont
exactement le gisement full-remote — Adzuna tronquant à 500 caractères, une
offre y est retenue par la requête qui l'a trouvée, pas par son texte.

`found_by_labels` dit **quelle requête** a ramené l'offre, et `trusted_query`
si l'une d'elles est ancrée à une technologie. Sur les 87 offres retenues, 29
n'entrent **que** par ce chemin : elles n'ont ni `core_hits` ni `ai_hits`, et
sans lui elles seraient invisibles. Ces nombres bougent chaque matin, deux
crons collectant à 6 h et 6 h 30 : les recompter, jamais les recopier.

**`offers_shortlist` ne montre qu'un représentant par groupe de doublons.**
`offers_hidden_duplicates` liste la contrepartie — les offres masquées et
l'exemplaire qui les remplace — pour que rien ne se perde vraiment.

Piège à connaître : cette vue répond à « qui est le représentant sur **tout**
le corpus » (`is_primary`), pas à « qu'est-ce qui a disparu de **ma**
sélection du jour ». Depuis que le dédoublonnage se fait dans la sélection
elle-même, les deux questions n'ont plus toujours la même réponse — mesuré :
2 des 87 lignes affichées ont `is_primary = false`. Voici la seconde
question, telle qu'elle s'exécute :

```sql
with elig as materialized (
  select id, source, title, company_name, url
  from offers_ranked
  where red_flags = 0
    and (core_hits >= 1 or ai_hits >= 1 or trusted_query)
    and (department in ('13', '83', '84') or remote_label = 'full')
),
affichees as materialized (select id from offers_shortlist)
select * from elig e where e.id not in (select id from affichees);
```

**`materialized` n'est pas décoratif** : sans lui le planificateur rejoue les
vues à chaque ligne, et la requête expire au lieu de répondre — c'est
mesuré, deux fois sur deux. Rendu du 2026-09-08 : 5 offres écartées,
cohérent avec une sélection qui passe de 92 à 87.

Les coûts ne sont pas du même ordre et ne se lisent pas ensemble :
`offers_shortlist` met environ **0,76 s**, contre 3,7 s avant les migrations
`20260908230000` et `20260908240000`, qui ont rendu indexables les deux
branches du lexique — GIN sur `description_tsv` pour les 56 termes `fts`,
GIN trigramme pour les 11 termes `ilike`. Le coût reste linéaire en offres ×
termes, avec une constante bien plus petite. `offers_hidden_duplicates` met environ
**0,27 s** : elle formait un produit cartesien complet et coûtait 3,8 s, en
deux temps corrigés — d'abord une CTE `materialized`, qui l'a rendue bon
marché sans la rendre linéaire, puis la suppression de l'auto-jointure au
profit d'une fonction de fenêtrage, qui a fait tomber le produit de
719 879 lignes filtrées à 703.

## Consulter les offres jugées par l'IA

C'est la recette à préférer depuis la phase 2 : `offers_shortlist` répond à
« qu'est-ce que le lexique a reconnu », `offers_scored` à « qu'est-ce qui
correspond au CV ». Les deux ne se recouvrent pas — remesuré le 2026-09-08 au
soir, après les correctifs de la revue finale, **5 des 17** offres notées 70 ou
plus et **33 des 61** notées plus de 50 sont **absentes** d'`offers_shortlist`.
Ces quatre nombres bougent à chaque collecte *et* à chaque migration qui touche
au barème (`20260909040000` a changé les `final_score` eux-mêmes) : les
recompter, jamais les recopier — la recette est dans `docs/ETAT.md`.

```sql
select title, company_name, city, final_score, fit_score, engagement, work_mode,
       compensation_min, compensation_max, duration_months, agentic_ai,
       confidence, truncated_input, verdict
from offers_scored
order by final_score desc, published_at desc
limit 40;
```

`final_score` **combine deux natures de chose**, et c'est le seul point à
comprendre avant de s'en servir :

| | Qui le produit | Nature | Coût d'un changement d'avis |
|---|---|---|---|
| `fit_score` et `verdict` | `claude-sonnet-5`, une fois, à l'écriture | **Figé** | Repaie les offres concernées |
| Les bonus et malus (`bonus_remote`, `malus_technos`…) | La vue, en lisant `scoring_weights` | **Réglable** | `UPDATE`, gratuit, rétroactif |

L'IA ne juge que la **correspondance de compétences**. Elle ne sait rien de vos
préférences sur le télétravail, le TJM ou la durée — c'est vérifiable dans les
verdicts, qui n'en parlent jamais. Ces sept préférences sont quatorze lignes de
`scoring_weights`, appliquées par la vue.

**`confidence = 'basse'` signale une offre jugée sur un texte tronqué**, pas
une offre douteuse. Adzuna coupe toute description à 500 caractères et refuse
le scraping de la page d'origine (403 sur tout, `robots.txt` compris) : le
modèle reçoit donc la mention explicite que le texte est incomplet, et il doit
répondre `basse` **au lieu de rejeter**. Mesuré le 2026-09-08 : 539 offres sur
1 269 en confiance basse, et `truncated_input` vaut vrai sur exactement les 557
offres Adzuna du périmètre. Une offre en confiance basse avec un bon
`final_score` mérite qu'on aille lire l'annonce, pas qu'on l'écarte.

**Ce qu'un `UPDATE` coûte, et ce qu'il ne coûte pas** — la distinction qui fait
toute la valeur du dispositif :

| Ce qu'on change | Ce qu'il faut faire | Ce que ça coûte |
|---|---|---|
| Un poids de préférence | `UPDATE scoring_weights` | **Rien.** Tout le corpus est reclassé au prochain `select` |
| Les consignes de jugement | Éditer le prompt **et** incrémenter `PROMPT_VERSION` | **Repaie** toutes les offres, ~1 centime pièce |
| Le CV ou `profile_skills` | Migration **et** nouveau `profile_version` | **Repaie** toutes les offres |

La sélection des candidates se fait sur `(prompt_version, profile_version)` :
une offre déjà jugée sous les versions courantes n'est jamais rappelée. Changer
l'une des deux versions **sans** vouloir repayer est donc impossible, et c'est
délibéré — un corpus jugé sous deux prompts différents ne se compare pas.
Éditer le prompt **sans** faire évoluer `PROMPT_VERSION` est le piège inverse,
et le pire des deux : les anciens jugements restent, les nouveaux arrivent sous
d'autres consignes, et rien ne distingue les deux populations.

**Le piège de réglage, mesuré** : `final_score` est écrêté par
`least(100, …)`, et le plafond **absorbe** les réglages sur les offres déjà
fortes. Monter un poids ne change rien à une offre déjà à 100 — mesuré le
2026-09-08, 3 offres y sont exactement, et les 8 offres à 90 ou plus ne
portent que 5 valeurs distinctes. **Juger l'effet d'un poids sur les rangs, ou
sur les colonnes de détail, jamais sur la moyenne** : un attendu du type
« après > avant » conclurait à tort à un échec. La bonne sonde :

```sql
select title, final_score, bonus_remote, bonus_remuneration, malus_technos,
       rank() over (order by final_score desc) as rang
from offers_scored order by final_score desc limit 20;
```

**Coût de la vue** : environ **26 ms** (`explain analyze`, deux `Hash Join`,
`loops=1`), contre ~0,76 s pour `offers_shortlist`. Le jugement est déjà
matérialisé en table ; il n'y a plus de recherche plein texte dans le chemin.
On peut donc la recombiner sans les précautions `materialized` qu'exigent les
vues de la phase 1.

**Une offre dont le jugement a échoué n'apparaît nulle part.** Elle écrit sa
ligne dans `offer_ai_scores` avec `fit_score` nul — c'est voulu, sans quoi elle
reviendrait indéfiniment dans la file et serait re-payée — mais `offers_scored`
l'exclut et aucune vue ne la signale. Le seul moyen de savoir :

```sql
select s.offer_id, o.title, s.error, s.scored_at
from offer_ai_scores s join offers o on o.id = s.offer_id
where s.error is not null order by s.scored_at desc;
```

Cette requête doit rendre **0 ligne**. Elle en a rendu 75 pendant l'amorçage,
et personne ne l'aurait su sans aller la poser (voir P16 dans `ETAT.md`).

Les axes réglables sont des **lignes en base**, jamais du code :

| Axe | Où | Comment l'ajuster |
|---|---|---|
| Rayon | `search_queries.radius_km` | `UPDATE` |
| Matrice de requêtes | `search_queries` | `UPDATE`, mais voir ci-dessous |
| Lexique | `skill_lexicon` | `UPDATE` |
| **Poids de préférence** | `scoring_weights` | `UPDATE`, gratuit et rétroactif |
| **Confiance par requête** | `search_queries.trust` | **migration** |
| **Compétences du profil** | `profile_skills` | **migration**, et ça **repaie** |

Les quatre premiers s'ajustent par un `UPDATE`, sans redéploiement ni
re-collecte : le score est une vue. `scoring_weights` est le seul de ce
chantier à coûter zéro — c'est pour ça que les préférences y ont été mises
plutôt que dans le prompt.

`search_queries.trust` est une **donnée de référence** au même titre que la
matrice, et un reclassement se justifie par une mesure : il passe donc par une
migration, qui porte cette mesure en commentaire. Deux requêtes ont déjà été
déclassées ainsi.

`profile_skills` est le seul axe **payant**. Ses 16 termes partent dans le
prompt avec le CV : les modifier change ce que le modèle a lu, donc impose de
faire évoluer `profile_version`, donc **repaie les 1 269 offres** (~1 centime
pièce). Ne pas faire évoluer la version serait pire que de payer : le corpus
porterait deux populations jugées sur deux profils différents, sans rien pour
les distinguer.

Deux pièges de manipulation, tous deux sans garde-fou en base :

- **Désactiver, jamais supprimer** une ligne de `search_queries`.
  `found_by_query_ids` est un `int[]`, qui ne peut pas porter de clé
  étrangère : supprimer une requête retirerait silencieusement son étiquette
  et pourrait faire **sortir** une offre de la sélection. `enabled = false`
  est propre et rétroactif — il retire aussi la confiance.
- **Ne jamais réécrire les `keywords` d'une requête `anchored`** : créer une
  nouvelle étiquette. L'id survit à la redéfinition, donc toutes les offres
  déjà estampillées resteraient dignes de confiance à vie sur la foi d'un
  texte de requête qui n'existe plus, sans le moindre signal.

## Consulter le tableau de bord

Phase 3, livrée le 2026-09-09. C'est la première interface du dépôt — tout ce
qui précède se consultait en SQL. SPA **Vite + React**, sous `dashboard/`, et
non Next.js (voir ROADMAP.md, phase 3, et la raison du choix). Trois écrans :
le matin (le brief du jour, seuil réglable, puis toute la veille en dessous),
le détail d'une offre (les deux jugements quand un groupe est vu par deux
sources), le suivi (pipeline à six étapes, entonnoir, série, taux de réponse).

**Pour la lancer** :

1. `npx supabase secrets set DASHBOARD_TOKEN=<valeur>` doit déjà avoir été
   posé côté fonction (fait une fois ; ne pas reposer sans raison — voir
   « Secrets »), et `api-dashboard` déployée (`npm run fn:deploy:api-dashboard`
   depuis la racine).
2. `dashboard/.env` (gitignoré, jamais commité) rempli avec les trois
   variables que `dashboard/.env.example` documente : `VITE_DASHBOARD_API_URL`
   (l'URL de la fonction déployée), `VITE_SUPABASE_ANON_KEY` (la clé `anon`,
   publique par conception mais hors dépôt par hygiène), `VITE_DASHBOARD_TOKEN`
   (le même secret que `DASHBOARD_TOKEN`, requis en en-tête
   `x-dashboard-token`).
3. `npm run dash:dev` depuis la racine (ou `npm --prefix dashboard run dev`) —
   sert la SPA en local sur Vite. Pour un aperçu du bundle de production tel
   qu'il serait réellement chargé, `npm --prefix dashboard run build` puis
   `npm --prefix dashboard run preview`.

**Aucune des trois barrières n'est une authentification** — la clé `anon`,
`verify_jwt` (vérifié à la passerelle avant que le code de la fonction
tourne), et le secret partagé `x-dashboard-token` (vérifié par
`api-dashboard` avant tout accès base). Elles suffisent tant que la SPA n'est
servie **qu'en local** : quiconque a le poste peut déjà lire `dashboard/.env`.
**Si la SPA est publiée un jour, il faut une vraie authentification avant** —
le secret partagé se retrouverait alors dans un bundle JavaScript public,
lisible par quiconque ouvre les outils de développement du navigateur.

**Redéployer après toute modification de `supabase/functions/api-dashboard/`
ou de `_shared/dashboard-*.ts`** : la SPA appelle une fonction déployée, pas
le code local. Un oubli de redéploiement est silencieux — aucun test ne le
détecte, la fonction répond toujours 200, juste avec l'ancien comportement.
Vérifier après coup : `npx supabase functions list` porte `updated_at` par
fonction, à comparer à l'heure du dernier commit qui l'a touchée.

**Vérifier qu'une candidature a bien été enregistrée, et propagée à tout le
groupe de doublons** — la même sonde que celle jouée en tâche 11 :

```sql
select offer_id, status, applied_at, status_changed_at from offer_applications;
select offer_id, status, heritee from offer_application_state where offer_id in (<les id du groupe>);
```

Une ligne dans `offer_applications` ne porte que l'`offer_id` réellement
cliqué (`heritee = false`) ; `offer_application_state` la propage à tout le
groupe (`heritee = true` sur les autres membres) — c'est cette dernière vue,
jamais `offer_applications` seule, qu'il faut lire pour savoir ce qu'affiche
le tableau de bord sur une offre republiée par plusieurs sources.

**Mesures (2026-09-09, en base à 4 511 offres / 1 339 jugées, bundle en
production)** :

| Mesure | Valeur |
|---|---:|
| `offer_display_groups` (`explain analyze`, hors premier appel à froid) | ~76 ms |
| `offer_application_state`, table vide | ~0,3 ms |
| `offer_application_state`, avec une ligne réelle | ~87 ms |
| `offers_dashboard` (`order by final_score desc limit 20`) | ~104-127 ms |
| Bundle de production (`dashboard/dist`, JS + CSS, non gzippé) | 452 KiB (421 KiB JS, 35 KiB CSS) |
| Bundle gzippé | 142 kB (136 kB JS, 6 kB CSS) |
| Premier affichage (`first-paint`), 3 navigations à froid, Chromium headless | 120 à 184 ms |
| Premier contenu peint (`first-contentful-paint`) | 168 à 236 ms |

Le premier appel à une vue après une connexion neuve (`db query --linked`) paie
un coût de démarrage à froid isolé (~630 ms mesuré une fois) : toujours
mesurer sur au moins trois appels et retenir les suivants, comme documenté
plus haut pour `offer_display_groups`. Détail complet, sorties brutes de
l'épreuve de bout en bout et méthode de mesure :
`.superpowers/sdd/task-11-report.md`.

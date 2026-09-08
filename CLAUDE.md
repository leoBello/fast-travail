# fast-travail — règles du projet

Veille automatisée d'offres d'emploi pour un profil développeur front-end
React / TypeScript, zone Marseille / Aix-en-Provence et full-remote national.

| Document | À quoi il sert |
|---|---|
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Vision produit, les 5 phases, décisions structurantes et ce que la mesure a démenti |
| [`docs/ETAT.md`](docs/ETAT.md) | **Où on en est, ce qui reste, problèmes ouverts priorisés.** À lire en premier pour reprendre le travail |
| [`docs/superpowers/specs/2026-09-07-collecte-offres-phase1-design.md`](docs/superpowers/specs/2026-09-07-collecte-offres-phase1-design.md) | Design détaillé de la phase 1 |
| [`docs/superpowers/plans/2026-09-07-collecte-api-france-travail-adzuna.md`](docs/superpowers/plans/2026-09-07-collecte-api-france-travail-adzuna.md) | Plan d'implémentation, tâche par tâche |

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
plus récemment publiée, puis la plus récemment vue, puis l'`id` pour que
l'ordre soit total. La fraîcheur ne vient donc qu'en troisième position :
mesuré le 2026-09-08, **15 groupes intra-source sur 129** affichent une ligne
qui n'est pas la plus récente, et le groupe KLANIK « Ingénieur IA » montre
une annonce du 21 août en masquant une du 3 septembre. Si un lien est mort,
c'est `offers_hidden_duplicates` qu'il faut regarder : une republication plus
fraîche y attend peut-être.

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
`offers_shortlist` met environ **3,7 s**, dont 3,3 s dans
`offer_lexical_score` — un coût **linéaire** en offres × termes du lexique,
qui grandira avec le corpus. `offers_hidden_duplicates` met environ
**0,5 s**, après correction : elle était quadratique et coûtait 3,8 s pour
un produit cartésien complet.

Les axes réglables sont des **lignes en base**, jamais du code :

| Axe | Où | Comment l'ajuster |
|---|---|---|
| Rayon | `search_queries.radius_km` | `UPDATE` |
| Matrice de requêtes | `search_queries` | `UPDATE`, mais voir ci-dessous |
| Lexique | `skill_lexicon` | `UPDATE` |
| **Confiance par requête** | `search_queries.trust` | **migration** |

Les trois premiers s'ajustent par un `UPDATE`, sans redéploiement ni
re-collecte : le score est une vue. Le quatrième est une **donnée de
référence** au même titre que la matrice, et un reclassement se justifie par
une mesure : il passe donc par une migration, qui porte cette mesure en
commentaire. Deux requêtes ont déjà été déclassées ainsi.

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

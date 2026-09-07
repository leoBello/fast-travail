# Phase 1 — Collecte d'offres d'emploi : design

**Date** : 2026-09-07
**Statut** : validé
**Périmètre** : collecte de données uniquement. Pas de dashboard, pas d'authentification utilisateur, pas de scoring IA.

## 1. Objectif

Automatiser la veille d'offres d'emploi pour un profil développeur front-end senior (React / TypeScript / Next.js) basé à Marseille, en recherche de CDI ou de missions freelance. La phase 1 alimente une base PostgreSQL exploitable en SQL ; le scoring IA et l'interface viendront ensuite.

Objectif utilisateur réel : **trouver un poste rapidement**. Toute décision d'architecture qui n'y contribue pas directement est reportée.

## 2. Décisions cadrantes

| Décision | Choix retenu | Raison |
|---|---|---|
| Hébergement | **Supabase Cloud (free tier)**, Next.js en local plus tard | `pg_cron` tourne même PC éteint ; pas de Docker à maintenir ; aucune migration si un déploiement suit |
| Première brique | **Edge Function France Travail**, seule | Chronologie voulue : développer → tester → ajuster → déployer, puis scoring, puis le reste |
| Stratégie géographique | **Rayon concentrique depuis Marseille (`13055`), `distance=40`**, provenance stockée | Ajuster le rayon devient un `WHERE` SQL, pas une re-collecte |
| Full-remote national | **Inclus dès cette fonction** | Le CV indique explicitement « télétravail ou hybride » : le remote est central, pas un bonus |
| Auth utilisateur | **Aucune** | Usage local, mono-utilisateur |
| Freelance | **Pas attendu de France Travail** | L'API ne diffuse quasiment pas de missions freelance ; ce canal viendra de Free-Work et Malt |

### Principe directeur

Les trois axes réglables du système — **rayon**, **matrice de mots-clés**, **lexique de compétences** — sont des **lignes en base de données**, jamais du code. Les régler ne demande ni redéploiement ni re-collecte.

## 3. Faits vérifiés sur l'API France Travail

Source : [francetravail.io](https://francetravail.io/data/api/offres-emploi), corroboré par des implémentations publiques.

- **Token OAuth2** : `https://entreprise.francetravail.fr/connexion/oauth2/access_token` (realm partenaire), grant `client_credentials`, scope `api_offresdemploiv2 o2dsoffre`
- **Recherche** : `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search`
- **Paramètres** : `motsCles`, `commune` (code INSEE), `distance` (0–100 km, défaut 10), `departement`, `codeROME`, `typeContrat`, `publieeDepuis`, `sort`, `range`
- **Plafond dur** : `range` ne dépasse pas `1000-1149`, soit **1 150 résultats maximum par requête**. Pages de 10/25/50/100/150.
- **Header `Content-Range: offres 0-49/287543`** : donne le **vrai total disponible**, même au-delà du plafond → permet de *détecter* une troncature silencieuse
- Codes INSEE utiles : Marseille `13055`, Aix-en-Provence `13001`
- Quota : 10–20 requêtes/seconde

### À vérifier pendant le développement

Ces points ne sont pas documentés de façon fiable et seront tranchés empiriquement, fixtures à l'appui :

1. Comportement de `motsCles` sur les variantes orthographiques : `front-end` / `frontend` / `front end`
2. Sémantique des mots-clés multi-mots : ET logique, ou phrase exacte ?
3. Existence et comportement d'un filtre `teletravail`

## 4. Les deux mécanismes centraux

### 4.1 `publieeDepuis` neutralise le plafond de 1 150

Le cron tourne quotidiennement : il n'a besoin que du **delta**. Avec `publieeDepuis=3`, chaque requête ne remonte que les offres publiées dans les trois derniers jours — quelques dizaines, pas des milliers. Le plafond de 1 150 devient un non-sujet, y compris sur la passe nationale sans `commune`. Le chevauchement de trois jours couvre un jour de cron raté ; le dédoublonnage absorbe les répétitions.

Le **premier run** est un rattrapage : `mode: 'backfill'` force `publieeDepuis=31` pour amorcer la base. Les runs suivants sont en `mode: 'delta'`.

### 4.2 `Content-Range` détecte la troncature

Chaque requête enregistre `total_available` lu dans le header. Si `total_available > 1150`, la ligne de télémétrie est marquée `truncated = true` : signal explicite qu'il faut découper la requête ou réduire `published_since_days`. Sans ça, la troncature est invisible.

## 5. Exploitation du CV : deux couches distinctes

Le CV n'est pas utile au même endroit que les mots-clés. `motsCles` est un instrument grossier — interroger `Jest` ou `e-commerce` ne remonte rien d'exploitable. D'où deux couches.

### Couche 1 — Requêtes : maximiser le recall

On interroge sur l'**identité de poste** et les technos à fort signal uniquement. 19 requêtes par run.

**Passe locale** — Marseille `13055`, rayon 40 km (12 requêtes)

| Catégorie | Mots-clés |
|---|---|
| Technos noyau | `React`, `TypeScript`, `Next.js` |
| Identité de poste | `front-end`, `développeur web`, `développeur JavaScript`, `full stack` |
| Séniorité (7 ans d'XP) | `lead développeur`, `tech lead front` |
| Vocabulaire ESN | `ingénieur d'études`, `consultant développeur` |
| Signal rare | `Supabase` |

**Passe full-remote nationale** — pas de `commune` (4 requêtes) : `React`, `TypeScript`, `Next.js`, `développeur front-end`

**Passe IA/LLM nationale** (3 requêtes) : `LLM`, `IA générative`, `agent IA`

Justification des entrées non évidentes :

- `ingénieur d'études` / `consultant développeur` — l'unique CDI du CV est une ESN, à Aix-en-Provence. Canal prouvé, dont les offres ont des intitulés génériques et cachent la stack dans la description : une recherche « React Marseille » les rate entièrement.
- Passe IA/LLM nationale — compétences rares sur le marché français (MCP, développement agentique, intégration d'API LLM) et marché massivement remote.

Écartés délibérément : **Java EE** (2019–2021, périmé, ramènerait des offres Java hors cible), **WordPress** (remonte massivement du bas de gamme), **Python / PyTorch** (trop éloigné de la cible).

### Couche 2 — Lexique de compétences : le CV miné, exploitable sans IA

Le CV est miné en ~70 termes pondérés stockés en table. Chaque offre est confrontée à ce lexique **en SQL** sur le texte intégral de sa description. Résultat immédiat, coût nul, aucun appel à Claude : « cette offre mentionne 9 compétences dont 3 du noyau, et zéro signal rouge ».

| Rang | Poids | Termes |
|---|---|---|
| Noyau | **+3** | react, typescript, next.js, nextjs |
| IA — différenciateur rare | **+3** | llm, mcp, agentique, prompt, ia générative, claude, openai, copilot, cursor, rag |
| Compétences fortes | **+2** | javascript, node.js, angular, postgresql, supabase, firebase, api rest, oauth, sso, jest, react testing library, tdd, tests unitaires, ci/cd, gitlab, microservices, event-driven, performance, scalabilité, google cloud functions |
| Contexte / bonus | **+1** | agile, scrum, safe, pi planning, revue de code, responsive, html5, css3, es6, python, anglais, e-commerce, billetterie, dématérialisation, retail, sharepoint, wordpress, apps script |
| Signaux rouges | **−3** | php, symfony, laravel, drupal, .net, c#, java ee, alternance, stage, bac+2, junior, débutant |

La catégorie **signaux rouges** est celle qui économise le plus de temps : le marché dev français est saturé de PHP/Symfony et d'offres junior/alternance, qui remonteront inévitablement dans les requêtes `développeur web` et `full stack`.

**Conséquence sur le schéma** : la table des offres doit stocker la **description intégrale**, pas seulement titre et URL. C'est la surface de matching du CV, en lexical maintenant et en IA plus tard.

**Hors périmètre phase 1** : aucune table « profil/CV structuré ». Elle ne servirait qu'au scoring IA et à la génération de lettres, donc elle arrivera avec le scoring. Le lexique seul est introduit maintenant parce qu'il sert immédiatement.

## 6. Schéma de base de données

### `offers`

```sql
create table offers (
  id                uuid primary key default gen_random_uuid(),
  source            text not null,              -- 'france_travail' | 'adzuna' | 'free_work' | 'malt'
  external_id       text not null,              -- id natif de la source
  url               text,
  title             text not null,
  description       text,                       -- texte intégral : surface de matching CV
  company_name      text,
  contract_type     text,                       -- code brut (CDI, CDD, MIS, LIB…)
  contract_label    text,
  city              text,
  postal_code       text,
  commune_insee     text,
  department        text,
  latitude          double precision,
  longitude         double precision,
  is_remote         boolean,
  remote_label      text,
  salary_raw        text,
  experience_raw    text,
  published_at      timestamptz,
  search_origin_insee text,                     -- '13055', ou null pour la passe nationale
  search_radius_km    int,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  seen_count        int not null default 1,
  raw               jsonb not null,             -- payload complet : re-parser sans re-collecter
  description_tsv   tsvector generated always as (
                      to_tsvector('french', coalesce(title,'') || ' ' || coalesce(description,''))
                    ) stored,
  unique (source, external_id)
);
```

**Dédoublonnage** : la contrainte `unique (source, external_id)` porte toute la logique. Chaque run fait `insert … on conflict (source, external_id) do update set last_seen_at = now(), seen_count = seen_count + 1, raw = excluded.raw`. Le chevauchement de trois jours de `publieeDepuis` s'absorbe sans code dédié, et `seen_count` révèle gratuitement les offres qui traînent depuis des semaines — signal d'offre fantôme ou de poste difficile à pourvoir.

Pas de colonne `distance_km` : elle se calcule en vue depuis lat/lon, pour que l'ajustement du rayon reste un `WHERE`.

**Dédoublonnage inter-sources** (même poste sur France Travail et Adzuna) : hors périmètre phase 1. Sera traité quand une seconde source existera.

### `search_queries` — la matrice, en données

```sql
create table search_queries (
  id                   serial primary key,
  source               text not null default 'france_travail',
  label                text not null unique,     -- 'local:react', 'remote:typescript', 'ia:llm'
  keywords             text,                     -- valeur de motsCles
  commune_insee        text,                     -- '13055' ou null (national)
  radius_km            int,                      -- 40 ou null
  extra_params         jsonb not null default '{}',  -- typeContrat, codeROME, teletravail…
  published_since_days int not null default 3,
  priority             int not null default 100,
  enabled              boolean not null default true
);
```

Les 19 requêtes de la section 5 sont chargées par `seed.sql`. Désactiver une requête est un `UPDATE`.

### `collection_runs` et `collection_query_results` — la télémétrie

C'est ce qui rend la matrice empiriquement réglable au lieu d'être devinée.

```sql
create table collection_runs (
  id             uuid primary key default gen_random_uuid(),
  source         text not null,
  trigger        text not null,          -- 'cron' | 'manual'
  mode           text not null,          -- 'backfill' | 'delta'
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running',   -- running | success | partial | failed
  offers_new     int not null default 0,
  offers_updated int not null default 0,
  error          text
);

create table collection_query_results (
  id              bigserial primary key,
  run_id          uuid not null references collection_runs(id) on delete cascade,
  query_id        int  not null references search_queries(id),
  http_status     int,
  total_available int,        -- lu dans Content-Range
  fetched         int,
  new_offers      int,
  updated_offers  int,
  truncated       boolean,    -- total_available > 1150
  duration_ms     int,
  error           text
);
```

Après quelques runs, ces tables répondent à deux questions : quel mot-clé ne rapporte rien (→ le désactiver) et lequel est tronqué (→ le découper ou réduire `published_since_days`).

### `skill_lexicon` — le CV miné

```sql
create table skill_lexicon (
  id         serial primary key,
  term       text not null unique,
  weight     int  not null,
  category   text not null,     -- core | ai | strong | context | red_flag
  match_type text not null default 'fts',   -- 'fts' | 'ilike'
  enabled    boolean not null default true
);
```

`match_type` existe parce que les termes pointés ou tirés (`next.js`, `node.js`, `event-driven`, `.net`, `c#`) se tokenisent mal en `tsvector` : ceux-là passent en `ILIKE`.

### Vues

```sql
-- score lexical : une VUE, donc modifier un poids recalcule tout sans re-collecte
create view offer_lexical_score as
select o.id as offer_id,
       sum(l.weight)                                   as score,
       array_agg(l.term order by l.weight desc)        as matched_terms,
       count(*) filter (where l.category = 'core')     as core_hits,
       count(*) filter (where l.category = 'ai')       as ai_hits,
       count(*) filter (where l.category = 'red_flag') as red_flags
from offers o
join skill_lexicon l
  on l.enabled
 and case l.match_type
       when 'fts'   then o.description_tsv @@ plainto_tsquery('french', l.term)
       when 'ilike' then (o.title || ' ' || coalesce(o.description,'')) ilike '%' || l.term || '%'
     end
group by o.id;

-- vue de travail : offre + score + distance depuis Marseille
create view offers_ranked as
select o.*, s.score, s.matched_terms, s.core_hits, s.ai_hits, s.red_flags,
       haversine_km(43.2965, 5.3698, o.latitude, o.longitude) as distance_marseille_km
from offers o
left join offer_lexical_score s on s.offer_id = o.id;
```

`haversine_km` est une fonction SQL `immutable` à créer dans la migration des vues.

Requête de travail immédiate en phase 1, sans dashboard :

```sql
select title, company_name, city, score, matched_terms
from offers_ranked
where red_flags = 0 and core_hits >= 1
order by score desc;
```

## 7. Arborescence

```
fast-travail/
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/
│  │  ├─ 0001_offers.sql
│  │  ├─ 0002_collection_telemetry.sql
│  │  ├─ 0003_skill_lexicon.sql
│  │  └─ 0004_views.sql
│  ├─ seed.sql                      -- 19 requêtes + ~70 termes du lexique
│  └─ functions/
│     ├─ _shared/
│     │  ├─ types.ts                -- NormalizedOffer, types DB
│     │  ├─ db.ts                   -- client service-role
│     │  ├─ upsert.ts               -- upsert dédoublonné + comptage new/updated
│     │  ├─ run-tracker.ts          -- ouverture/fermeture de collection_runs
│     │  └─ logger.ts
│     └─ collect-france-travail/
│        ├─ index.ts                -- entrée HTTP + orchestration
│        ├─ auth.ts                 -- OAuth2 client_credentials + cache token
│        ├─ client.ts               -- search(), Content-Range, pagination, retry 429/403
│        ├─ mapper.ts               -- payload FT → NormalizedOffer
│        └─ __tests__/
│           ├─ fixtures/            -- vraies réponses API figées
│           ├─ mapper_test.ts
│           └─ client_test.ts
├─ docs/superpowers/specs/
├─ .env.local.example
└─ README.md
```

**Frontière d'extension** : chaque source aura son `mapper.ts` produisant le même `NormalizedOffer`, et `_shared/upsert.ts` assure dédoublonnage et télémétrie de façon identique pour toutes. Free-Work n'aura qu'un fetcher HTML et un mapper à écrire — aucune logique dupliquée.

Pas de Next.js scaffoldé : aucun dashboard en phase 1. Il s'ajoutera à la racine sans rien déplacer.

## 8. Anatomie de `collect-france-travail`

```
POST /functions/v1/collect-france-travail
body: { mode: 'delta' | 'backfill', dryRun?: boolean, queryIds?: number[] }
```

1. Ouvrir une ligne `collection_runs`
2. Obtenir le token OAuth2, caché en mémoire du module jusqu'à expiration
3. Charger les `search_queries` actives, ou celles de `queryIds` (itérer sur une seule requête en développement)
4. Pour chaque requête, séquentiellement :
   - construire les paramètres ; en `backfill`, `publieeDepuis` forcé à 31
   - paginer `range=0-149`, `150-299`… jusqu'à épuisement de `total_available`
   - lire `Content-Range` → `total_available` ; si > 1150, `truncated = true`
   - mapper → upsert → compter nouvelles et mises à jour
   - écrire la ligne `collection_query_results`
   - sur **429** : backoff exponentiel puis retry ; sur **403** ou 429 répété : marquer cette requête en échec et passer à la suivante
5. Clôturer le run : `success`, `partial` ou `failed`
6. Renvoyer un résumé JSON

### Philosophie d'erreur

**Une requête qui échoue ne doit jamais tuer le run.** Isolation par requête, run en `partial`. C'est ce qui garantira que le scraping Free-Work, fragile par nature, ne cassera jamais la collecte API.

### Le flag `dryRun`

Il tape la vraie API et exécute réellement le mapping, mais **n'écrit rien** et renvoie les offres mappées dans la réponse. C'est l'outil de la boucle « développer → tester → ajuster » : la justesse du mapping se vérifie immédiatement, sans polluer la base.

## 9. Stratégie de test

| Niveau | Outil | Dépend des identifiants API ? |
|---|---|---|
| Unitaire — mapping, parsing `Content-Range`, pagination, backoff | `deno test` avec `fetch` mocké et fixtures | **Non** — écrivable dès maintenant |
| Intégration lecture | `supabase functions serve` + `curl` avec `dryRun: true` | Oui |
| Intégration écriture | même chose, `dryRun: false` vers la base cloud | Oui |
| Déploiement | `supabase functions deploy`, puis planification `pg_cron` | Oui |

## 10. Secrets, cron et sécurité

**Secrets** (`supabase secrets set`) : `FT_CLIENT_ID`, `FT_CLIENT_SECRET`. `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectés automatiquement dans les Edge Functions.

**Cron**, une fois la fonction validée : un job `cron.schedule` quotidien à 6h qui appelle la fonction via `net.http_post`, avec la clé de service lue depuis **Vault** (`vault.decrypted_secrets`) et non écrite en clair dans la définition du job. Corps de la requête : `{"mode":"delta","trigger":"cron"}`.

### Deux points que « pas d'authentification » ne couvre pas

1. **Une Edge Function déployée est une URL publique sur Internet.** Supabase exige par défaut un JWT valide (`verify_jwt = true`) : **conserver ce réglage**. « Pas d'auth » signifie pas d'authentification *utilisateur* dans l'application, pas un endpoint ouvert.
2. **RLS activé sur toutes les tables, sans aucune policy.** La clé `anon` ne peut alors rien lire ; seule la `service_role` écrit. Corollaire permanent : la `service_role` reste côté serveur Next.js local, jamais exposée au navigateur.

## 11. Hors périmètre de cette phase

- Dashboard Next.js
- Authentification utilisateur
- Scoring IA (Claude Haiku) et table de profil/CV structuré
- Génération de CV et de lettres (Claude Sonnet)
- Sources Adzuna, Free-Work, Malt — l'architecture les accueille, l'implémentation vient après
- Dédoublonnage inter-sources
- Historique de candidatures

## 12. Prérequis avant de coder

1. **Identifiants France Travail** : compte sur `francetravail.io`, création d'une application, souscription à l'API « Offres d'emploi v2 » → `client_id` / `client_secret`. *En cours côté utilisateur.*
2. **Projet Supabase Cloud** créé : URL du projet + clé `service_role`. *À confirmer.*
3. **Outillage local** : Deno et Supabase CLI (absents de la machine). Node 26.3.0, npm 11.16.0 et Docker 29.6.2 sont présents.

Le niveau de test unitaire ne dépend d'aucun de ces prérequis et peut démarrer immédiatement.

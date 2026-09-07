# Phase 1 — Collecte d'offres d'emploi : design

**Date** : 2026-09-07
**Statut** : validé
**Périmètre** : collecte de données uniquement — 2 API + 4 scrapers. Pas de dashboard, pas d'authentification utilisateur, pas de scoring IA.

## 1. Objectif

Automatiser la veille d'offres d'emploi pour un profil développeur front-end senior (React / TypeScript / Next.js) basé à Marseille, en recherche de CDI ou de missions freelance. La phase 1 alimente une base PostgreSQL exploitable en SQL ; le scoring IA et l'interface viendront ensuite.

Objectif utilisateur réel : **trouver un poste rapidement**. Toute décision d'architecture qui n'y contribue pas directement est reportée.

## 2. Décisions cadrantes

| Décision | Choix retenu | Raison |
|---|---|---|
| Hébergement | **Supabase Cloud (free tier)**, région `eu-west-3` | `pg_cron` tourne même PC éteint ; aucune migration si un déploiement suit |
| **Runtime** | **Split : API en Edge Functions, scrapers en scripts Node locaux** | Les limites des Edge Functions rendent le scraping HTML inexécutable — voir §6 |
| Stratégie géographique | **Rayon concentrique depuis Marseille (`13055`), `distance=40`**, provenance stockée | Ajuster le rayon devient un `WHERE` SQL, pas une re-collecte |
| Full-remote national | **Inclus dès la première fonction** | Le CV indique explicitement « télétravail ou hybride » : le remote est central, pas un bonus |
| Surface de scraping | **Sitemaps XML, pas les pages de listing** | URLs canoniques en XML, sans sélecteurs CSS qui cassent au redesign |
| Auth utilisateur | **Aucune** | Usage local, mono-utilisateur |
| Freelance | **Ne viendra pas de France Travail** | L'API ne diffuse quasiment pas de missions ; c'est le rôle des 4 scrapers |

### Principe directeur

Les trois axes réglables du système — **rayon**, **matrice de mots-clés**, **lexique de compétences** — sont des **lignes en base de données**, jamais du code. Les régler ne demande ni redéploiement ni re-collecte.

## 3. Les sources retenues

### Retenues (6)

| # | Source | Type | Canal | Runtime |
|---|---|---|---|---|
| 1 | **France Travail** | API OAuth2 | CDI, ESN | Edge Function |
| 2 | **Adzuna** | API clé | CDI, agrégateur | Edge Function |
| 3 | **Free-Work** | Scraping | Missions **et** CDI, référence IT France | Script Node |
| 4 | **Codeur.com** | Scraping | Missions, gros volume, qualité hétérogène | Script Node |
| 5 | **Collective.work** | Scraping | Missions, collectifs de freelances | Script Node |
| 6 | **Kicklox** | Scraping | Missions techniques | Script Node |

### Écartées, et pourquoi

| Source | Raison de l'exclusion |
|---|---|
| FreelanceRepublik | Listing public limité, fonctionnement sur-mesure. Réintégrable en peu d'effort si les 4 scrapers tiennent |
| 404Works | Accès aux missions souvent derrière une inscription payante |
| Comet | Pas de listing public — rien à scraper |
| Malt | Marketplace de profils, pas de listing public. Garder le profil à jour, sans collecte |
| Crème de la Crème | Marketplace sélective fermée, même logique |

Un scraper sans page publique à lire n'existe pas : les quatre dernières sont exclues par leur modèle, pas par manque d'effort.

## 4. Faits vérifiés — API France Travail

Source : [francetravail.io](https://francetravail.io/data/api/offres-emploi), corroboré par des implémentations publiques.

- **Token OAuth2** : `https://entreprise.francetravail.fr/connexion/oauth2/access_token` (realm partenaire), grant `client_credentials`, scope `api_offresdemploiv2 o2dsoffre`
- **Recherche** : `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search`
- **Paramètres** : `motsCles`, `commune` (code INSEE), `distance` (0–100 km, défaut 10), `departement`, `codeROME`, `typeContrat`, `publieeDepuis`, `sort`, `range`
- **Plafond dur** : `range` ne dépasse pas `1000-1149`, soit **1 150 résultats maximum par requête**. Pages de 10/25/50/100/150.
- **Header `Content-Range: offres 0-49/287543`** : donne le **vrai total disponible**, même au-delà du plafond → permet de *détecter* une troncature silencieuse
- Codes INSEE utiles : Marseille `13055`, Aix-en-Provence `13001`
- Quota : 10–20 requêtes/seconde

### À trancher empiriquement pendant le développement

1. Comportement de `motsCles` sur les variantes orthographiques : `front-end` / `frontend` / `front end`
2. Sémantique des mots-clés multi-mots : ET logique, ou phrase exacte ?
3. Existence et comportement d'un filtre `teletravail`

## 5. Faits vérifiés — API Adzuna

Source : [developer.adzuna.com](https://developer.adzuna.com/docs/search).

- **Recherche** : `https://api.adzuna.com/v1/api/jobs/fr/search/{page}` — le code pays `fr` est dans le chemin, la page aussi
- **Auth** : `app_id` et `app_key` en query string (pas d'OAuth)
- **Paramètres** : `what`, `what_exclude`, `where`, `results_per_page`, `max_days_old`, `sort_by`, `full_time`, `permanent`, `salary_min`
- **`results_per_page`** : 50 au maximum d'après les sources secondaires
- **`max_days_old`** joue le rôle de `publieeDepuis` chez France Travail → même stratégie de delta quotidien

### À vérifier pendant le développement

1. Existence et unité du paramètre `distance` (associé à `where`) — non confirmé dans la doc consultée
2. Quota quotidien réel du free tier — non documenté publiquement
3. Valeur maximale effective de `results_per_page` et plafond de pagination

## 6. Contrainte de runtime : pourquoi le scraping sort des Edge Functions

Limites vérifiées des Supabase Edge Functions, **free tier** ([doc officielle](https://supabase.com/docs/guides/functions/limits)) :

- **150 s de wall clock** par invocation
- **2 s de temps CPU** par requête

Confrontées aux contraintes de politesse du scraping (2–5 s entre requêtes) :

> 150 s ÷ 3 s de délai ≈ 50 requêtes maximum par invocation — acceptable.
> Mais parser 50 pages HTML en **2 s de CPU** est impossible : le parsing HTML est précisément CPU-bound.

Et **Playwright ne tourne pas dans une Edge Function** : l'isolate Deno n'embarque aucun binaire Chromium.

### La conséquence

| | Sources | Runtime | Déclenchement |
|---|---|---|---|
| **API** | France Travail, Adzuna | Edge Functions (Deno) | `pg_cron` quotidien, **PC éteint** |
| **Scrapers** | Free-Work, Codeur.com, Collective.work, Kicklox | Scripts Node/TS locaux | `npm run collect:scrapers`, ou Planificateur de tâches Windows |

Ce que le split débloque :

- **Plus aucune limite CPU ni wall clock** sur le scraping — le vrai bloquant disparaît
- **Playwright redevient disponible** si un site s'avère rendu en JS
- **Débogage réel** : HTML, sélecteurs et erreurs visibles dans le terminal, pas dans des logs distants
- Node 26 exécute le TypeScript nativement, comme Deno → le code partagé reste du **TS neutre importable par les deux**

Coût assumé : **les scrapers ne tournent que PC allumé.** Acceptable — la recherche est active et quotidienne, et les deux sources à fort volume (France Travail ~500 k, Adzuna ~900 k) restent en cron fiable côté cloud.

### Règle de partage du code

Les fichiers de `shared/` ne touchent **jamais** à une API spécifique au runtime : ni `Deno.env`, ni `node:process`. La configuration est **injectée en paramètre** ; chaque runtime lit son propre environnement et la passe. C'est ce qui permet un seul `NormalizedOffer` et un seul `upsert` pour six sources.

## 7. Les deux mécanismes centraux des collectes API

### 7.1 Le delta quotidien neutralise les plafonds

Le cron tourne quotidiennement : il n'a besoin que du **delta**. Avec `publieeDepuis=3` (France Travail) ou `max_days_old=3` (Adzuna), chaque requête ne remonte que les offres publiées dans les trois derniers jours — quelques dizaines, pas des milliers. Le plafond de 1 150 devient un non-sujet, y compris sur la passe nationale sans `commune`. Le chevauchement de trois jours couvre un jour de cron raté ; le dédoublonnage absorbe les répétitions.

Le **premier run** est un rattrapage : `mode: 'backfill'` force la fenêtre à 31 jours pour amorcer la base. Les runs suivants sont en `mode: 'delta'`.

### 7.2 `Content-Range` détecte la troncature

Chaque requête enregistre `total_available` lu dans le header. Si `total_available > 1150`, la ligne de télémétrie est marquée `truncated = true` : signal explicite qu'il faut découper la requête ou réduire `published_since_days`. Sans ça, la troncature est invisible.

## 8. Exploitation du CV : deux couches distinctes

Le CV n'est pas utile au même endroit que les mots-clés. `motsCles` est un instrument grossier — interroger `Jest` ou `e-commerce` ne remonte rien d'exploitable. D'où deux couches.

### Couche 1 — Requêtes : maximiser le recall

On interroge sur l'**identité de poste** et les technos à fort signal uniquement. 19 requêtes par run pour France Travail.

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

Adzuna réutilise la même matrice via `what`, mappée sur ses propres paramètres. Les scrapers n'ont pas de matrice : ils parcourent le sitemap et laissent le filtrage au lexique.

### Couche 2 — Lexique de compétences : le CV miné, exploitable sans IA

Le CV est miné en ~70 termes pondérés stockés en table. Chaque offre est confrontée à ce lexique **en SQL** sur le texte intégral de sa description. Résultat immédiat, coût nul, aucun appel à Claude : « cette offre mentionne 9 compétences dont 3 du noyau, et zéro signal rouge ».

| Rang | Poids | Termes |
|---|---|---|
| Noyau | **+3** | react, typescript, next.js, nextjs |
| IA — différenciateur rare | **+3** | llm, mcp, agentique, prompt, ia générative, claude, openai, copilot, cursor, rag |
| Compétences fortes | **+2** | javascript, node.js, angular, postgresql, supabase, firebase, api rest, oauth, sso, jest, react testing library, tdd, tests unitaires, ci/cd, gitlab, microservices, event-driven, performance, scalabilité, google cloud functions |
| Contexte / bonus | **+1** | agile, scrum, safe, pi planning, revue de code, responsive, html5, css3, es6, python, anglais, e-commerce, billetterie, dématérialisation, retail, sharepoint, wordpress, apps script |
| Signaux rouges | **−3** | php, symfony, laravel, drupal, .net, c#, java ee, alternance, stage, bac+2, junior, débutant |

La catégorie **signaux rouges** est celle qui économise le plus de temps, et elle devient encore plus utile avec les scrapers : Codeur.com a un volume élevé et une qualité hétérogène, le lexique est ce qui rend ce flux supportable.

**Conséquence sur le schéma** : la table des offres doit stocker la **description intégrale**, pas seulement titre et URL. C'est la surface de matching du CV, en lexical maintenant et en IA plus tard.

**Hors périmètre phase 1** : aucune table « profil/CV structuré ». Elle ne servirait qu'au scoring IA et à la génération de lettres, donc elle arrivera avec le scoring. Le lexique seul est introduit maintenant parce qu'il sert immédiatement.

## 9. Stratégie de scraping

### 9.1 `robots.txt` — vérifié le 2026-09-07

| Site | Directives `User-agent: *` | Contrainte qui en découle |
|---|---|---|
| Free-Work | `Disallow: /login`, `/logout`, `/fw-deals` | Listings autorisés. **`Wget`, `HTTrack`, `Yandex`, `Baiduspider`, `MJ12bot` sont bannis nommément** → notre User-Agent doit être le nôtre, jamais un de ceux-là |
| Codeur.com | `Disallow: /system/projects/`, **`Disallow: /*?*` avec `Allow: /*?page=*`** | **Query strings interdites sauf la pagination.** Aucun filtre en URL : on parcourt `?page=N` et on filtre côté nous |
| Collective.work | `Disallow: /style-guide` | Rien de bloquant |
| Kicklox | `Disallow:` (vide = tout autorisé) | Rien de bloquant |

Le `robots.txt` de chaque source est **revérifié à chaque run** et mis en cache 24 h. S'il change et interdit le chemin visé, le scraper s'arrête proprement et marque le run `partial` — pas de contournement.

### 9.2 Le sitemap comme surface de collecte

Les quatre sources publient un sitemap XML (Free-Work : `https://statics.free-work.com/sitemapindex.xml`). Chaque scraper suit donc deux étapes :

1. **Découverte** — lire le sitemap, extraire les URLs d'offres et leur `lastmod`. Aucun sélecteur CSS, aucune mise en page à parser.
2. **Détail** — ne fetcher que les URLs **inconnues ou modifiées** (comparaison à `offers.external_id` / `last_seen_at`), puis extraire les champs du HTML.

Bénéfice décisif : la découverte ne casse pas au redesign, et le volume de pages de détail à fetcher chaque jour tombe à ce qui est réellement nouveau — quelques dizaines, conforme au brief.

### 9.3 Politesse et arrêt automatique

- **Délai de 2 à 5 s** entre requêtes, jitter aléatoire, jamais de parallélisme sur un même domaine
- **User-Agent propre et stable**, identifiant l'outil
- **Plafond dur de pages par source et par run** (configurable, ~40 par défaut)
- **`429`** → backoff exponentiel, puis abandon de la source pour ce run
- **`403`** → **arrêt immédiat** de la source, aucune reprise dans le run. Un 403 est un refus, pas une erreur transitoire
- Toute source qui s'arrête est journalisée en `partial` ; **elle ne fait jamais échouer les autres**

### 9.4 Cheerio d'abord, Playwright en dernier recours

Chaque scraper commence en HTTP + Cheerio. Playwright n'est introduit que si une source s'avère rendue en JS, et **pour cette source uniquement**. Collective.work (Webflow) et Kicklox (WordPress) sont a priori du HTML statique ; Free-Work et Codeur.com sont à vérifier à l'écriture.

### 9.5 Cadre légal

Collecte de données publiques, à usage strictement personnel, sans reproduction publique, avec respect du `robots.txt` et volumes faibles. Le scraping reste **une source bonus, jamais une dépendance critique** : l'architecture garantit qu'aucune de ses défaillances n'affecte les collectes API.

## 10. Schéma de base de données

### `offers`

```sql
create table offers (
  id                uuid primary key default gen_random_uuid(),
  source            text not null,              -- france_travail | adzuna | free_work | codeur | collective | kicklox
  external_id       text not null,              -- id natif, ou hash d'URL canonique pour les scrapers
  url               text,
  title             text not null,
  description       text,                       -- texte intégral : surface de matching CV
  company_name      text,
  contract_type     text,                       -- codes France Travail, ou 'freelance' / 'mission'
  contract_label    text,
  city              text,
  postal_code       text,
  commune_insee     text,
  department        text,
  latitude          double precision,
  longitude         double precision,
  is_remote         boolean,
  remote_label      text,
  -- rémunération : salariat et missions
  salary_raw        text,                       -- salaire annoncé (CDI/CDD)
  rate_raw          text,                       -- TJM annoncé ("500-600 €/jour")
  duration_raw      text,                       -- durée de mission ("6 mois renouvelable")
  start_date_raw    text,                       -- démarrage ("ASAP", "septembre 2026")
  experience_raw    text,
  published_at      timestamptz,
  -- provenance de la requête qui l'a trouvée
  search_origin_insee text,                     -- '13055', ou null pour une passe nationale
  search_radius_km    int,
  -- cycle de vie
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  seen_count        int not null default 1,
  raw               jsonb not null,             -- payload ou champs extraits : re-parser sans re-collecter
  description_tsv   tsvector generated always as (
                      to_tsvector('french', coalesce(title,'') || ' ' || coalesce(description,''))
                    ) stored,
  unique (source, external_id)
);
```

**Dédoublonnage** : la contrainte `unique (source, external_id)` porte toute la logique. Chaque run fait `insert … on conflict (source, external_id) do update set last_seen_at = now(), seen_count = seen_count + 1, raw = excluded.raw`. Le chevauchement de trois jours de la fenêtre de delta s'absorbe sans code dédié, et `seen_count` révèle gratuitement les offres qui traînent depuis des semaines — signal d'offre fantôme ou de poste difficile à pourvoir.

Pour les scrapers, `external_id` est l'identifiant natif s'il existe dans l'URL, sinon un hash stable de l'URL canonique.

Pas de colonne `distance_km` : elle se calcule en vue depuis lat/lon, pour que l'ajustement du rayon reste un `WHERE`.

**Dédoublonnage inter-sources** (une même mission sur Free-Work *et* Codeur, une même offre sur France Travail *et* Adzuna) : **hors périmètre phase 1**, mais c'est la première dette à payer en phase 2 — avec 6 sources, le recoupement devient certain.

### `search_queries` — la matrice, en données

```sql
create table search_queries (
  id                   serial primary key,
  source               text not null default 'france_travail',
  label                text not null unique,     -- 'ft:local:react', 'adzuna:remote:typescript'
  keywords             text,                     -- motsCles (FT) ou what (Adzuna)
  commune_insee        text,                     -- '13055' ou null (national)
  radius_km            int,                      -- 40 ou null
  extra_params         jsonb not null default '{}',
  published_since_days int not null default 3,
  priority             int not null default 100,
  enabled              boolean not null default true
);
```

Ne concerne que les sources API. Désactiver une requête est un `UPDATE`, sans redéploiement.

### `sources` — état et politesse par source

```sql
create table sources (
  key             text primary key,      -- 'free_work', 'codeur', …
  kind            text not null,         -- 'api' | 'scrape'
  base_url        text,
  sitemap_url     text,
  enabled         boolean not null default true,
  min_delay_ms    int not null default 3000,
  max_pages_per_run int not null default 40,
  user_agent      text,
  robots_checked_at timestamptz,
  robots_allows   boolean,
  last_run_at     timestamptz,
  last_status     text
);
```

Les réglages de politesse sont ainsi des données, pas des constantes dans le code : ralentir une source qui renvoie des 429 est un `UPDATE`.

### `collection_runs` et `collection_query_results` — la télémétrie

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
  query_id        int references search_queries(id),   -- null pour un scraper
  unit_label      text,        -- 'ft:local:react', ou 'sitemap' / 'detail-pages'
  http_status     int,
  total_available int,         -- Content-Range (FT), count (Adzuna), URLs du sitemap
  fetched         int,
  new_offers      int,
  updated_offers  int,
  truncated       boolean,     -- total_available > plafond de la source
  duration_ms     int,
  error           text
);
```

Après quelques runs, ces tables répondent à trois questions : quel mot-clé ne rapporte rien (→ le désactiver), lequel est tronqué (→ le découper), et quel scraper commence à échouer (→ le réparer ou le désactiver).

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

`haversine_km` est une fonction SQL `immutable` créée dans la migration des vues.

Requête de travail immédiate en phase 1, sans dashboard :

```sql
select source, title, company_name, city, coalesce(rate_raw, salary_raw) as remu, score, matched_terms
from offers_ranked
where red_flags = 0 and core_hits >= 1
order by score desc, published_at desc;
```

## 11. Arborescence

Le code partagé vit dans **`supabase/functions/_shared/`**, et non à la racine. Raison vérifiée : le CLI Supabase embarque automatiquement dans le bundle tout dossier préfixé d'un underscore sous `supabase/functions`, alors qu'importer depuis hors de `supabase/` exige le flag expérimental `--use-api` (CLI ≥ 2.13.3). L'architecture ne repose pas sur un flag expérimental. Les scripts Node importent ces fichiers par chemin relatif — l'emplacement leur est indifférent.

Les données de référence (sources, requêtes, lexique) sont chargées par une **migration**, pas par `seed.sql` : `seed.sql` ne s'exécute que sur un `db reset` local, or il n'y a pas de base locale dans cette architecture. Les inserts sont idempotents (`on conflict do nothing`).

```
fast-travail/
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/
│  │  ├─ …_offers.sql
│  │  ├─ …_sources.sql
│  │  ├─ …_collection_telemetry.sql
│  │  ├─ …_skill_lexicon.sql
│  │  ├─ …_views.sql
│  │  └─ …_seed_reference_data.sql   -- sources + 19 requêtes + ~70 termes, idempotent
│  └─ functions/
│     ├─ deno.json                   -- import map partagée
│     ├─ _shared/                    -- TS neutre : importable par Deno ET par Node
│     │  ├─ types.ts                 -- NormalizedOffer, SourceKey, types DB
│     │  ├─ db.ts                    -- client Supabase, config INJECTÉE en paramètre
│     │  ├─ upsert.ts                -- upsert dédoublonné + comptage new/updated
│     │  ├─ run-tracker.ts           -- ouverture/fermeture de collection_runs
│     │  └─ logger.ts
│     ├─ collect-france-travail/
│     │  ├─ index.ts                -- entrée HTTP + orchestration
│     │  ├─ auth.ts                 -- OAuth2 client_credentials + cache token
│     │  ├─ client.ts               -- search(), Content-Range, pagination, retry
│     │  ├─ mapper.ts               -- payload FT → NormalizedOffer
│     │  └─ __tests__/
│     │     ├─ fixtures/
│     │     ├─ mapper_test.ts
│     │     └─ client_test.ts
│     └─ collect-adzuna/
│        ├─ index.ts
│        ├─ client.ts
│        ├─ mapper.ts
│        └─ __tests__/
├─ scrapers/                        -- scripts Node/TS locaux
│  ├─ lib/
│  │  ├─ http.ts                    -- fetch poli : délai, jitter, UA, retry 429, arrêt 403
│  │  ├─ robots.ts                  -- lecture + cache 24 h + vérification de chemin
│  │  ├─ sitemap.ts                 -- parsing du sitemap → URLs + lastmod
│  │  └─ runner.ts                  -- boucle découverte → détail → upsert → télémétrie
│  ├─ free-work/
│  │  ├─ index.ts                   -- config de la source
│  │  ├─ parser.ts                  -- HTML détail → NormalizedOffer
│  │  └─ __tests__/fixtures/        -- pages HTML réelles figées
│  ├─ codeur/
│  ├─ collective/
│  └─ kicklox/
├─ docs/superpowers/specs/
├─ package.json                     -- scripts : collect:free-work, collect:scrapers, test
├─ .env.local.example
└─ README.md
```

**Frontière d'extension** : chaque source produit le même `NormalizedOffer` ; `_shared/upsert.ts` assure dédoublonnage et télémétrie de façon identique pour les six. Un nouveau scraper = un `index.ts` de config + un `parser.ts` + des fixtures. `scrapers/lib/` (politesse, robots, sitemap, boucle) est écrit une seule fois.

Les scrapers importent le code partagé par chemin relatif : `import type { NormalizedOffer } from '../../supabase/functions/_shared/types.ts'`.

Pas de Next.js scaffoldé : aucun dashboard en phase 1. Il s'ajoutera à la racine sans rien déplacer.

## 12. Anatomie de `collect-france-travail`

```
POST /functions/v1/collect-france-travail
body: { mode: 'delta' | 'backfill', dryRun?: boolean, queryIds?: number[] }
```

1. Ouvrir une ligne `collection_runs`
2. Obtenir le token OAuth2, caché en mémoire du module jusqu'à expiration
3. Charger les `search_queries` actives, ou celles de `queryIds` (itérer sur une seule requête en développement)
4. Pour chaque requête, séquentiellement :
   - construire les paramètres ; en `backfill`, la fenêtre passe à 31 jours
   - paginer `range=0-149`, `150-299`… jusqu'à épuisement de `total_available`
   - lire `Content-Range` → `total_available` ; si > 1150, `truncated = true`
   - mapper → upsert → compter nouvelles et mises à jour
   - écrire la ligne `collection_query_results`
   - sur **429** : backoff exponentiel puis retry ; sur **403** ou 429 répété : marquer la requête en échec et passer à la suivante
5. Clôturer le run : `success`, `partial` ou `failed`
6. Renvoyer un résumé JSON

### Philosophie d'erreur, valable pour les six sources

**Une unité de collecte qui échoue ne doit jamais tuer le run, et une source qui échoue ne doit jamais affecter les autres.** Isolation par requête et par source, run en `partial`. C'est ce qui garantit que le scraping, fragile par nature, ne cassera jamais les collectes API.

### Le flag `dryRun`

Il tape la vraie API et exécute réellement le mapping, mais **n'écrit rien** et renvoie les offres mappées dans la réponse. C'est l'outil de la boucle « développer → tester → ajuster » : la justesse du mapping se vérifie immédiatement, sans polluer la base. Les scrapers exposent le même flag en option CLI.

## 13. Séquencement

Le périmètre n'est pas réduit, il est ordonné pour qu'aucune brique n'en bloque une autre. Chaque étape est livrable indépendamment.

| Ordre | Brique | Ce qu'elle valide |
|---|---|---|
| 1 | Migrations + seed + lexique | Le schéma, avant toute collecte |
| 2 | **France Travail** | Toute la chaîne : mapping, upsert, télémétrie, cron |
| 3 | **Adzuna** | L'abstraction multi-source, à moindre coût (API simple) |
| 4 | **Free-Work** | L'abstraction scraping : robots, sitemap, politesse, parsing |
| 5 | Codeur.com, Collective.work, Kicklox | Mécanique : un config + un parser chacun |

Le risque que cet ordre écarte : écrire quatre scrapers avant qu'un seul ne fonctionne, et se retrouver avec quatre scrapers à moitié cassés et aucun pipeline qui tourne.

## 14. Stratégie de test

| Niveau | Outil | Dépend d'un accès externe ? |
|---|---|---|
| Unitaire API — mapping, `Content-Range`, pagination, backoff | `deno test`, `fetch` mocké + fixtures JSON | **Non** |
| Unitaire scraping — parsing HTML, sitemap, robots | `node --test`, fixtures HTML/XML réelles figées | **Non** |
| Intégration lecture | `supabase functions serve` + `dryRun: true` / CLI `--dry-run` | Oui |
| Intégration écriture | même chose, `dryRun: false` vers la base cloud | Oui |
| Déploiement | `supabase functions deploy`, puis planification `pg_cron` | Oui |

Les fixtures sont des **réponses et pages réelles figées**, capturées une fois. C'est ce qui rend les parsers de scraping testables sans retaper les sites, et qui transforme un redesign en test rouge plutôt qu'en collecte silencieusement vide.

## 15. Secrets, cron et sécurité

**Secrets Edge Functions** (`supabase secrets set`) : `FT_CLIENT_ID`, `FT_CLIENT_SECRET`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`. `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectés automatiquement.

**Secrets locaux** (`.env.local`, gitignoré) : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` pour les scrapers Node.

**Cron**, une fois chaque fonction validée : un job `cron.schedule` quotidien appelant la fonction via `net.http_post`, avec la clé de service lue depuis **Vault** (`vault.decrypted_secrets`) et jamais écrite en clair dans la définition du job. France Travail et Adzuna sont planifiés séparément, à des heures distinctes.

### Deux points que « pas d'authentification » ne couvre pas

1. **Une Edge Function déployée est une URL publique sur Internet.** Supabase exige par défaut un JWT valide (`verify_jwt = true`) : **conserver ce réglage**. « Pas d'auth » signifie pas d'authentification *utilisateur* dans l'application, pas un endpoint ouvert.
2. **RLS activé sur toutes les tables, sans aucune policy.** La clé `anon` ne peut alors rien lire ; seule la `service_role` écrit. Corollaire permanent : la `service_role` reste côté serveur (Edge Functions, scripts Node locaux), jamais exposée au navigateur.

## 16. Hors périmètre de cette phase

- Dashboard Next.js
- Authentification utilisateur
- Scoring IA (Claude Haiku) et table de profil/CV structuré
- Génération de CV et de lettres (Claude Sonnet)
- Dédoublonnage inter-sources — **première dette à payer en phase 2**
- Historique de candidatures
- Sources écartées au §3 (FreelanceRepublik, 404Works, Comet, Malt, Crème de la Crème)

## 17. Prérequis

### 17.1 Identifiants France Travail — ✅ fait

Compte `francetravail.io`, application créée, souscription à « Offres d'emploi v2 », `client_id` et `client_secret` récupérés.

### 17.2 Projet Supabase Cloud — ✅ fait

Projet créé en `eu-west-3`, référence / URL / clé `service_role` et mot de passe de base notés, extensions `pg_cron` et `pg_net` activées, schéma vierge (tout passe par les migrations du dépôt).

### 17.3 Identifiants Adzuna — ⬜ à faire

Créer un compte sur `developer.adzuna.com` et récupérer `app_id` et `app_key`. Gratuit et immédiat. Ne bloque que l'étape 3 du séquencement.

### 17.4 Outillage local — ⬜ à faire

Installer **Deno** et le **Supabase CLI** (absents de la machine). Node 26.3.0, npm 11.16.0 et Docker 29.6.2 sont déjà présents.

### Ce qui n'attend aucun prérequis

Migrations SQL, `seed.sql`, et l'ensemble des tests unitaires (mapping, `Content-Range`, pagination, backoff, parsing HTML et sitemap sur fixtures) s'écrivent hors ligne. Seule l'installation de Deno et du Supabase CLI conditionne le démarrage.

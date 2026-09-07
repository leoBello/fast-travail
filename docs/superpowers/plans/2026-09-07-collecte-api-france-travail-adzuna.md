# Plan A — Collecte API (France Travail + Adzuna) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alimenter une base Supabase PostgreSQL en offres d'emploi collectées quotidiennement depuis les API France Travail et Adzuna, avec dédoublonnage, télémétrie par requête et score lexical dérivé du CV, sans dashboard ni scoring IA.

**Architecture :** Deux Edge Functions Deno (une par source API) déclenchées par `pg_cron` sur Supabase Cloud, partageant `supabase/functions/_shared/` (types, client DB, upsert, télémétrie). Chaque source possède son `mapper.ts` produisant le même `NormalizedOffer` ; le dédoublonnage repose entièrement sur la contrainte `unique (source, external_id)`. Les axes réglables — rayon géographique, matrice de mots-clés, lexique de compétences — sont des lignes en base, jamais du code.

**Tech Stack :** Deno 2.9.6 · TypeScript · Supabase (PostgreSQL 15+, Edge Functions, pg_cron, pg_net, Vault) · Supabase CLI en devDependency npm · `@supabase/supabase-js` v2 · `jsr:@std/assert` pour les tests

**Spec de référence :** [`docs/superpowers/specs/2026-09-07-collecte-offres-phase1-design.md`](../specs/2026-09-07-collecte-offres-phase1-design.md)

**Périmètre :** ce plan couvre les étapes 1 à 3 du séquencement du spec (§13). Les 4 scrapers font l'objet du plan B, à écrire quand ce plan tourne.

## Global Constraints

- **Runtime Edge Functions** : Deno. Aucun accès `node:*` dans `supabase/functions/`.
- **`_shared/` est runtime-neutre** : jamais de `Deno.env` ni de `node:process` dans ces fichiers. Toute configuration est passée en paramètre. C'est la condition pour que le plan B (scrapers Node) réutilise ces fichiers sans duplication.
- **Emplacement du code partagé** : `supabase/functions/_shared/`. Ne pas le déplacer à la racine — le CLI n'embarque dans le bundle que ce qui est sous `supabase/functions`, sauf flag expérimental `--use-api`.
- **Données de référence par migration**, jamais par `seed.sql` : il n'y a pas de base locale dans cette architecture. Tous les inserts de référence sont idempotents (`on conflict do nothing`).
- **RLS activé sur toutes les tables, avec zéro policy.** Seule la clé `service_role` écrit et lit.
- **`verify_jwt` reste à `true`** sur les deux fonctions. Ne jamais le désactiver.
- **Aucune clé en dur, jamais commitée.** `.env.local` est gitignoré ; les secrets Edge Functions passent par `supabase secrets set` ; la clé de service du cron passe par Vault.
- **Fenêtre de collecte** : `delta` = 3 jours, `backfill` = 31 jours.
- **Géographie par défaut** : commune INSEE `13055` (Marseille), `distance = 40` km.
- **Plafond France Travail** : 1 150 résultats par requête, pages de 150 (`range=0-149`).
- **Isolation des erreurs** : une requête qui échoue n'interrompt jamais le run ; le run se termine en `partial`.
- **Commandes CLI** : toujours `npx supabase …`, jamais `supabase` nu. Le CLI existe aussi en global sur cette machine, mais `npx` résout vers la devDependency, donc la version reste pinnée dans le dépôt et reproductible.
- **Node** : 26.3.0 (exécute TypeScript nativement). **Supabase CLI** : 2.117.0, présent en global et en devDependency.
- **Deno 2.9.6 est installé mais hors du PATH hérité par les shells de cette session.** Toute commande `deno` doit être précédée, dans le même appel shell, de :
  ```bash
  export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links"
  ```
  L'état du shell ne persiste pas entre les appels : répéter cet `export` dans **chaque** commande qui invoque `deno`, `npm test` inclus.
- **Orchestration mutualisée** : la boucle de collecte vit dans `_shared/run-collection.ts` et sert les deux sources (et les scrapers du plan B). Les `index.ts` de chaque fonction ne font que lire l'environnement, charger les requêtes et appeler `runCollection`. Ne pas dupliquer la boucle.
- **`Deno.env` reste hors de `_shared/`** : la lecture de l'environnement (`requireEnv`) appartient à chaque `index.ts`, qui est du code Deno assumé. C'est la frontière qui garde `_shared/` réutilisable par Node.

## Protocole d'exécution

Ce plan s'exécute **en sous-agents pilotés** : un sous-agent frais par tâche, suivi d'une revue, avant de passer à la suivante. Un sous-agent démarre sans contexte — ce protocole est ce qui lui dit comment travailler.

### Skills que chaque sous-agent d'implémentation DOIT charger

| Skill | Quand | Pourquoi ici |
|---|---|---|
| `test-driven-development` | **Tâches 3 à 7, 10** — tout code TypeScript | Le plan donne le test avant l'implémentation pour chaque étape. Le skill impose de vérifier que le test échoue d'abord, ce qui prouve qu'il teste réellement quelque chose |
| `verification-before-completion` | **Toutes les tâches, sans exception** | Interdit d'annoncer « fait » sans la sortie de commande à l'appui. Ce plan contient des `Expected:` explicites à chaque étape : ce sont eux, la preuve |
| `systematic-debugging` | Dès qu'un test échoue autrement qu'attendu, ou qu'un appel API renvoie l'inattendu | Les tâches 7 et 10 confrontent le mapper à de vraies réponses d'API : c'est là que les surprises arrivent, et il ne faut pas y bricoler au hasard |
| `receiving-code-review` | À la réception du retour de revue | Vérifier techniquement chaque remarque avant de l'appliquer, plutôt que d'acquiescer |

### Skills pour les tâches non-code

| Tâche | Skill | Note |
|---|---|---|
| 0 (outillage) | `verification-before-completion` | Chaque installation se prouve par une commande de version |
| 1, 2 (SQL) | `verification-before-completion` | Les étapes de contrôle SQL du plan sont la preuve : comptages, `db diff`, test de la vue de score |
| 9, 11 (déploiement, cron) | `verification-before-completion` | Un cron n'est validé que par une ligne `trigger = 'cron'` réellement présente dans `collection_runs` |

### Revue après chaque tâche

Chaque tâche est relue avant de passer à la suivante, en deux temps :

1. **Revue de conformité au plan** — les fichiers annoncés existent-ils, les tests annoncés passent-ils, les `Expected:` sont-ils tenus ? Une tâche dont un `Expected:` n'est pas vérifié est rejetée.
2. **Revue de code** via `/code-review` sur le diff de la tâche — correction, réutilisation, simplification.

**Critères de rejet spécifiques à ce projet**, à vérifier à chaque revue :

- Un fichier de `_shared/` qui touche à `Deno.env` ou `node:process` → **rejet**. La neutralité runtime est la condition de réutilisation par le plan B.
- Une clé, un token ou une référence de projet en dur dans un fichier commité → **rejet**.
- `verify_jwt` passé à `false` → **rejet**.
- Une table créée sans `enable row level security` → **rejet**.
- Un `catch` qui avale une erreur sans l'écrire dans `collection_query_results` → **rejet**. La télémétrie est le seul moyen de savoir qu'une requête a cessé de produire.
- Un test qui ne fait qu'affirmer le comportement de l'implémentation qu'il accompagne, sans avoir été vu échouer → **rejet**.

### Ordre non négociable

Les tâches 3 et 4 produisent les types et fonctions que toutes les suivantes consomment. Les tâches 5, 6 et 7 sont indépendantes entre elles une fois 3 et 4 faites, mais la tâche 9 les requiert toutes les trois, via la boucle mutualisée de la tâche 8. Ne pas paralléliser 1 et 2 : la tâche 2 insère dans les tables créées par la tâche 1.

---

### Task 0: Outillage, initialisation du projet et liaison au projet Supabase

**Files:**
- Create: `package.json`
- Create: `.env.local.example`
- Create: `supabase/config.toml` (généré par `npx supabase init`)
- Create: `supabase/functions/deno.json`
- Create: `README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: rien.
- Produces: un dépôt lié au projet Supabase distant, `npx supabase` fonctionnel, `deno` sur le PATH, et l'import map que toutes les tâches suivantes utilisent (`@supabase/supabase-js`, `@std/assert`).

- [ ] **Step 1: Vérifier Deno avec le PATH complété**

Deno est installé, mais hors du PATH hérité par les shells de cette session. Il n'y a rien à installer : il suffit de compléter le PATH dans chaque commande qui l'invoque.

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno --version
```

Expected : `deno 2.9.6` (ou supérieur).

L'état du shell ne persiste pas entre deux appels : **répète cet `export` dans chaque commande utilisant `deno`**, y compris `npm test`. Exemple type, utilisé partout dans ce plan :

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read supabase/functions/
```

- [ ] **Step 2: Vérifier le Supabase CLI (déjà installé)**

```bash
npx supabase --version
```

Expected : `2.117.0` ou supérieur. Le CLI est déjà présent en devDependency **et** en global sur cette machine — rien à installer. Si la commande échoue, relance `npm install --save-dev supabase`.

- [ ] **Step 3: Compléter `package.json`**

Le fichier existe mais ne contient que `devDependencies`. Remplace-le intégralement :

```json
{
  "name": "fast-travail",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Veille automatisée d'offres d'emploi dev web — collecte API et scraping",
  "scripts": {
    "db:push": "supabase db push",
    "db:diff": "supabase db diff",
    "fn:serve": "supabase functions serve --env-file .env.local",
    "fn:deploy:ft": "supabase functions deploy collect-france-travail",
    "fn:deploy:adzuna": "supabase functions deploy collect-adzuna",
    "test": "deno test --config supabase/functions/deno.json --allow-read --allow-env supabase/functions/",
    "fmt": "deno fmt supabase/functions/"
  },
  "devDependencies": {
    "supabase": "^2.117.0"
  }
}
```

Garde la version de `supabase` déjà présente dans ton `package.json` actuel plutôt que de la forcer.

- [ ] **Step 4: Initialiser Supabase et lier le projet distant**

```bash
npx supabase init
npx supabase login
npx supabase link --project-ref <TA_REFERENCE_PROJET>
```

`npx supabase init` crée `supabase/config.toml`. `login` ouvre le navigateur. `link` demande le mot de passe de la base — celui noté à la création du projet.

Expected : `Finished supabase link.`

- [ ] **Step 5: Créer l'import map Deno**

Create `supabase/functions/deno.json` :

```json
{
  "compilerOptions": {
    "lib": ["deno.window", "deno.ns"],
    "strict": true
  },
  "imports": {
    "@supabase/supabase-js": "npm:@supabase/supabase-js@2",
    "@std/assert": "jsr:@std/assert@1"
  },
  "fmt": {
    "singleQuote": true,
    "lineWidth": 100
  }
}
```

- [ ] **Step 6: Créer `.env.local.example` et compléter `.gitignore`**

Create `.env.local.example` :

```bash
# Projet Supabase (Settings -> API)
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=

# France Travail (francetravail.io -> ton application)
FT_CLIENT_ID=
FT_CLIENT_SECRET=

# Adzuna (developer.adzuna.com)
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
```

Append to `.gitignore` :

```
.env.local
supabase/.temp/
supabase/.branches/
```

- [ ] **Step 7: Créer `.env.local` avec les vraies valeurs**

```bash
cp .env.local.example .env.local
```

Renseigne les six valeurs à la main. **Ce fichier ne doit jamais être commité** — vérifie-le à l'étape suivante.

- [ ] **Step 8: Vérifier que `.env.local` est bien ignoré**

```bash
git status --short --untracked-files=all | grep -c ".env.local$"
```

Expected : `0`. Si le résultat est `1`, `.gitignore` n'est pas correct — corrige avant de continuer.

- [ ] **Step 9: Créer le README**

Create `README.md` :

```markdown
# fast-travail

Veille automatisée d'offres d'emploi pour développeur front-end React / TypeScript,
zone Marseille / Aix-en-Provence et full-remote national.

## Architecture

- **API** (France Travail, Adzuna) : Edge Functions Deno déclenchées par `pg_cron` sur Supabase Cloud.
- **Scrapers** (Free-Work, Codeur.com, Collective.work, Kicklox) : scripts Node locaux — plan B.
- **Code partagé** : `supabase/functions/_shared/`, TypeScript runtime-neutre, importable par Deno et Node.

Design : `docs/superpowers/specs/2026-09-07-collecte-offres-phase1-design.md`

## Commandes

    npm run db:push          # applique les migrations sur le projet distant
    npm test                 # tests unitaires Deno
    npm run fn:serve         # sert les Edge Functions en local
    npm run fn:deploy:ft     # déploie la collecte France Travail

## Consulter les offres

    select source, title, company_name, city, coalesce(rate_raw, salary_raw) as remu,
           score, matched_terms
    from offers_ranked
    where red_flags = 0 and core_hits >= 1
    order by score desc, published_at desc;
```

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json .gitignore .env.local.example README.md supabase/config.toml supabase/functions/deno.json
git commit -m "chore: initialise le projet, le CLI Supabase et l'import map Deno"
```

---

### Task 1: Migrations du schéma

**Files:**
- Create: `supabase/migrations/<ts>_offers.sql`
- Create: `supabase/migrations/<ts>_sources.sql`
- Create: `supabase/migrations/<ts>_collection_telemetry.sql`
- Create: `supabase/migrations/<ts>_skill_lexicon.sql`
- Create: `supabase/migrations/<ts>_views.sql`

**Interfaces:**
- Consumes: projet lié (Task 0).
- Produces: les tables `offers`, `sources`, `search_queries`, `collection_runs`, `collection_query_results`, `skill_lexicon`, la fonction `haversine_km(double precision, double precision, double precision, double precision) returns double precision`, et les vues `offer_lexical_score` et `offers_ranked`. Les noms de colonnes définis ici sont ceux que `NormalizedOffer` (Task 3) doit refléter exactement.

- [ ] **Step 1: Créer le fichier de migration `offers`**

```bash
npx supabase migration new offers
```

Écris dans le fichier créé :

```sql
create table offers (
  id                  uuid primary key default gen_random_uuid(),
  source              text not null,
  external_id         text not null,
  url                 text,
  title               text not null,
  description         text,
  company_name        text,
  contract_type       text,
  contract_label      text,
  city                text,
  postal_code         text,
  commune_insee       text,
  department          text,
  latitude            double precision,
  longitude           double precision,
  is_remote           boolean,
  remote_label        text,
  salary_raw          text,
  rate_raw            text,
  duration_raw        text,
  start_date_raw      text,
  experience_raw      text,
  published_at        timestamptz,
  search_origin_insee text,
  search_radius_km    int,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  seen_count          int not null default 1,
  raw                 jsonb not null,
  description_tsv     tsvector generated always as (
                        to_tsvector('french', coalesce(title, '') || ' ' || coalesce(description, ''))
                      ) stored,
  constraint offers_source_external_id_key unique (source, external_id)
);

create index offers_description_tsv_idx on offers using gin (description_tsv);
create index offers_published_at_idx     on offers (published_at desc nulls last);
create index offers_source_idx           on offers (source);
create index offers_last_seen_at_idx     on offers (last_seen_at desc);

alter table offers enable row level security;
comment on table offers is 'Offres collectées, une ligne par offre unique par source. Aucune policy RLS : seule la service_role accède.';
```

- [ ] **Step 2: Créer le fichier de migration `sources`**

```bash
npx supabase migration new sources
```

```sql
create table sources (
  key               text primary key,
  kind              text not null check (kind in ('api', 'scrape')),
  base_url          text,
  sitemap_url       text,
  enabled           boolean not null default true,
  min_delay_ms      int not null default 3000,
  max_pages_per_run int not null default 40,
  user_agent        text,
  robots_checked_at timestamptz,
  robots_allows     boolean,
  last_run_at       timestamptz,
  last_status       text
);

alter table sources enable row level security;
comment on table sources is 'Etat et reglages de politesse par source. Ralentir une source est un UPDATE, pas un deploiement.';
```

- [ ] **Step 3: Créer le fichier de migration de la télémétrie**

```bash
npx supabase migration new collection_telemetry
```

```sql
create table search_queries (
  id                   serial primary key,
  source               text not null default 'france_travail',
  label                text not null unique,
  keywords             text,
  commune_insee        text,
  radius_km            int,
  extra_params         jsonb not null default '{}'::jsonb,
  published_since_days int not null default 3,
  priority             int not null default 100,
  enabled              boolean not null default true
);

create table collection_runs (
  id             uuid primary key default gen_random_uuid(),
  source         text not null,
  trigger        text not null check (trigger in ('cron', 'manual')),
  mode           text not null check (mode in ('backfill', 'delta')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running'
                 check (status in ('running', 'success', 'partial', 'failed')),
  offers_new     int not null default 0,
  offers_updated int not null default 0,
  error          text
);

create table collection_query_results (
  id              bigserial primary key,
  run_id          uuid not null references collection_runs(id) on delete cascade,
  query_id        int references search_queries(id),
  unit_label      text,
  http_status     int,
  total_available int,
  fetched         int,
  new_offers      int,
  updated_offers  int,
  truncated       boolean,
  duration_ms     int,
  error           text
);

create index collection_query_results_run_id_idx on collection_query_results (run_id);
create index collection_runs_started_at_idx      on collection_runs (started_at desc);

alter table search_queries            enable row level security;
alter table collection_runs           enable row level security;
alter table collection_query_results  enable row level security;
```

- [ ] **Step 4: Créer le fichier de migration du lexique**

```bash
npx supabase migration new skill_lexicon
```

```sql
create table skill_lexicon (
  id         serial primary key,
  term       text not null unique,
  weight     int  not null,
  category   text not null check (category in ('core', 'ai', 'strong', 'context', 'red_flag')),
  match_type text not null default 'fts' check (match_type in ('fts', 'ilike')),
  enabled    boolean not null default true
);

alter table skill_lexicon enable row level security;
comment on table skill_lexicon is 'CV mine en termes ponderes. Modifier un poids recalcule tous les scores via la vue offer_lexical_score.';
```

- [ ] **Step 5: Créer le fichier de migration des vues**

```bash
npx supabase migration new views
```

```sql
create or replace function haversine_km(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) returns double precision
language sql
immutable
returns null on null input
as $fn$
  select 6371 * 2 * asin(sqrt(
    pow(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    pow(sin(radians(lon2 - lon1) / 2), 2)
  ));
$fn$;

create view offer_lexical_score as
select o.id                                            as offer_id,
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
       when 'ilike' then (o.title || ' ' || coalesce(o.description, '')) ilike '%' || l.term || '%'
     end
group by o.id;

create view offers_ranked as
select o.*,
       coalesce(s.score, 0)                       as score,
       coalesce(s.matched_terms, '{}'::text[])    as matched_terms,
       coalesce(s.core_hits, 0)                   as core_hits,
       coalesce(s.ai_hits, 0)                     as ai_hits,
       coalesce(s.red_flags, 0)                   as red_flags,
       haversine_km(43.2965, 5.3698, o.latitude, o.longitude) as distance_marseille_km
from offers o
left join offer_lexical_score s on s.offer_id = o.id;
```

Le `coalesce` sur les colonnes du score est indispensable : sans lui, une offre qui ne matche aucun terme sort avec `red_flags = null`, et le filtre `where red_flags = 0` la ferait disparaître silencieusement.

- [ ] **Step 6: Appliquer les migrations sur le projet distant**

```bash
npm run db:push
```

Expected : la liste des migrations appliquées, puis `Finished supabase db push.`

- [ ] **Step 7: Vérifier le schéma appliqué**

```bash
npx supabase db diff --schema public
```

Expected : aucune différence rapportée. Si `db diff` liste des objets, une migration n'a pas été appliquée.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations
git commit -m "feat(db): schéma des offres, sources, télémétrie, lexique et vues de score"
```

---

### Task 2: Données de référence (sources, 19 requêtes, lexique du CV)

**Files:**
- Create: `supabase/migrations/<ts>_seed_reference_data.sql`

**Interfaces:**
- Consumes: les tables de Task 1.
- Produces: 2 lignes dans `sources`, 19 lignes dans `search_queries` (labels `ft:*`), ~70 lignes dans `skill_lexicon`. Les labels `ft:local:react` etc. sont ceux que la télémétrie affichera.

- [ ] **Step 1: Créer la migration de seed**

```bash
npx supabase migration new seed_reference_data
```

Écris dans le fichier créé :

```sql
-- Sources API. Les scrapers seront ajoutés par le plan B.
insert into sources (key, kind, base_url, enabled, user_agent) values
  ('france_travail', 'api', 'https://api.francetravail.io', true, 'fast-travail/0.1 (veille personnelle)'),
  ('adzuna',         'api', 'https://api.adzuna.com',       true, 'fast-travail/0.1 (veille personnelle)')
on conflict (key) do nothing;

-- Matrice France Travail : passe locale Marseille rayon 40 km
insert into search_queries (source, label, keywords, commune_insee, radius_km, published_since_days, priority) values
  ('france_travail', 'ft:local:react',        'React',                  '13055', 40, 3, 10),
  ('france_travail', 'ft:local:typescript',   'TypeScript',             '13055', 40, 3, 10),
  ('france_travail', 'ft:local:nextjs',       'Next.js',                '13055', 40, 3, 10),
  ('france_travail', 'ft:local:frontend',     'front-end',              '13055', 40, 3, 20),
  ('france_travail', 'ft:local:dev-web',      'développeur web',        '13055', 40, 3, 20),
  ('france_travail', 'ft:local:dev-js',       'développeur JavaScript', '13055', 40, 3, 20),
  ('france_travail', 'ft:local:fullstack',    'full stack',             '13055', 40, 3, 20),
  ('france_travail', 'ft:local:lead',         'lead développeur',       '13055', 40, 3, 30),
  ('france_travail', 'ft:local:techlead',     'tech lead front',        '13055', 40, 3, 30),
  ('france_travail', 'ft:local:ingenieur',    'ingénieur d''études',    '13055', 40, 3, 30),
  ('france_travail', 'ft:local:consultant',   'consultant développeur', '13055', 40, 3, 30),
  ('france_travail', 'ft:local:supabase',     'Supabase',               '13055', 40, 3, 40)
on conflict (label) do nothing;

-- Matrice France Travail : passe full-remote nationale (pas de commune)
insert into search_queries (source, label, keywords, commune_insee, radius_km, published_since_days, priority) values
  ('france_travail', 'ft:remote:react',       'React',                null, null, 3, 50),
  ('france_travail', 'ft:remote:typescript',  'TypeScript',           null, null, 3, 50),
  ('france_travail', 'ft:remote:nextjs',      'Next.js',              null, null, 3, 50),
  ('france_travail', 'ft:remote:frontend',    'développeur front-end',null, null, 3, 50)
on conflict (label) do nothing;

-- Matrice France Travail : passe IA / LLM nationale
insert into search_queries (source, label, keywords, commune_insee, radius_km, published_since_days, priority) values
  ('france_travail', 'ft:ia:llm',             'LLM',              null, null, 3, 60),
  ('france_travail', 'ft:ia:generative',      'IA générative',    null, null, 3, 60),
  ('france_travail', 'ft:ia:agent',           'agent IA',         null, null, 3, 60)
on conflict (label) do nothing;

-- Lexique : noyau (+3)
insert into skill_lexicon (term, weight, category, match_type) values
  ('react', 3, 'core', 'fts'),
  ('typescript', 3, 'core', 'fts'),
  ('next.js', 3, 'core', 'ilike'),
  ('nextjs', 3, 'core', 'fts')
on conflict (term) do nothing;

-- Lexique : IA, différenciateur rare (+3)
insert into skill_lexicon (term, weight, category, match_type) values
  ('llm', 3, 'ai', 'fts'),
  ('mcp', 3, 'ai', 'fts'),
  ('agentique', 3, 'ai', 'fts'),
  ('prompt', 3, 'ai', 'fts'),
  ('ia générative', 3, 'ai', 'fts'),
  ('claude', 3, 'ai', 'fts'),
  ('openai', 3, 'ai', 'fts'),
  ('copilot', 3, 'ai', 'fts'),
  ('cursor', 3, 'ai', 'fts'),
  ('rag', 3, 'ai', 'fts')
on conflict (term) do nothing;

-- Lexique : compétences fortes (+2)
insert into skill_lexicon (term, weight, category, match_type) values
  ('javascript', 2, 'strong', 'fts'),
  ('node.js', 2, 'strong', 'ilike'),
  ('angular', 2, 'strong', 'fts'),
  ('postgresql', 2, 'strong', 'fts'),
  ('supabase', 2, 'strong', 'fts'),
  ('firebase', 2, 'strong', 'fts'),
  ('api rest', 2, 'strong', 'fts'),
  ('oauth', 2, 'strong', 'fts'),
  ('sso', 2, 'strong', 'fts'),
  ('jest', 2, 'strong', 'fts'),
  ('react testing library', 2, 'strong', 'fts'),
  ('tdd', 2, 'strong', 'fts'),
  ('tests unitaires', 2, 'strong', 'fts'),
  ('ci/cd', 2, 'strong', 'ilike'),
  ('gitlab', 2, 'strong', 'fts'),
  ('microservices', 2, 'strong', 'fts'),
  ('event-driven', 2, 'strong', 'ilike'),
  ('performance', 2, 'strong', 'fts'),
  ('scalabilité', 2, 'strong', 'fts'),
  ('google cloud functions', 2, 'strong', 'fts')
on conflict (term) do nothing;

-- Lexique : contexte et bonus (+1)
insert into skill_lexicon (term, weight, category, match_type) values
  ('agile', 1, 'context', 'fts'),
  ('scrum', 1, 'context', 'fts'),
  ('safe', 1, 'context', 'fts'),
  ('pi planning', 1, 'context', 'fts'),
  ('revue de code', 1, 'context', 'fts'),
  ('responsive', 1, 'context', 'fts'),
  ('html5', 1, 'context', 'fts'),
  ('css3', 1, 'context', 'fts'),
  ('es6', 1, 'context', 'fts'),
  ('python', 1, 'context', 'fts'),
  ('anglais', 1, 'context', 'fts'),
  ('e-commerce', 1, 'context', 'ilike'),
  ('billetterie', 1, 'context', 'fts'),
  ('dématérialisation', 1, 'context', 'fts'),
  ('retail', 1, 'context', 'fts'),
  ('sharepoint', 1, 'context', 'fts'),
  ('wordpress', 1, 'context', 'fts'),
  ('apps script', 1, 'context', 'fts')
on conflict (term) do nothing;

-- Lexique : signaux rouges (-3)
insert into skill_lexicon (term, weight, category, match_type) values
  ('php', -3, 'red_flag', 'fts'),
  ('symfony', -3, 'red_flag', 'fts'),
  ('laravel', -3, 'red_flag', 'fts'),
  ('drupal', -3, 'red_flag', 'fts'),
  ('.net', -3, 'red_flag', 'ilike'),
  ('c#', -3, 'red_flag', 'ilike'),
  ('java ee', -3, 'red_flag', 'ilike'),
  ('alternance', -3, 'red_flag', 'fts'),
  ('stage', -3, 'red_flag', 'fts'),
  ('bac+2', -3, 'red_flag', 'ilike'),
  ('junior', -3, 'red_flag', 'fts'),
  ('débutant', -3, 'red_flag', 'fts')
on conflict (term) do nothing;
```

Note l'apostrophe doublée dans `'ingénieur d''études'` — c'est l'échappement SQL, pas une coquille.

- [ ] **Step 2: Appliquer la migration**

```bash
npm run db:push
```

Expected : `Finished supabase db push.`

- [ ] **Step 3: Vérifier les comptages**

Dans le SQL Editor du dashboard Supabase :

```sql
select 'sources' as t, count(*) from sources
union all select 'search_queries', count(*) from search_queries
union all select 'skill_lexicon', count(*) from skill_lexicon;
```

Expected : `sources = 2`, `search_queries = 19`, `skill_lexicon = 64` (4 noyau + 10 IA + 20 fortes + 18 contexte + 12 signaux rouges).

- [ ] **Step 4: Vérifier que la vue de score fonctionne sur une offre fabriquée**

Toujours dans le SQL Editor :

```sql
insert into offers (source, external_id, title, description, raw)
values ('france_travail', 'TEST-0001',
        'Développeur Front-End React Senior',
        'Mission en React, TypeScript et Next.js. Stack Supabase et PostgreSQL. TDD avec Jest. Pas de PHP.',
        '{}'::jsonb);

select title, score, core_hits, ai_hits, red_flags, matched_terms
from offers_ranked where external_id = 'TEST-0001';
```

Expected : `core_hits >= 3` (react, typescript, next.js — et possiblement `nextjs` selon la façon dont le dictionnaire français tokenise `Next.js`), `red_flags = 1` (php), et un `score` strictement positif.

Si `core_hits` vaut 2 ou moins, c'est que le terme `next.js` en `ilike` ne matche pas : vérifie que sa ligne a bien `match_type = 'ilike'` et non `'fts'`. C'est le piège que la colonne `match_type` existe précisément pour éviter.

- [ ] **Step 5: Supprimer l'offre de test**

```sql
delete from offers where external_id = 'TEST-0001';
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations
git commit -m "feat(db): données de référence — sources, 19 requêtes FT, lexique CV de 74 termes"
```

---

### Task 3: `_shared/types.ts` et `_shared/db.ts`

**Files:**
- Create: `supabase/functions/_shared/types.ts`
- Create: `supabase/functions/_shared/db.ts`
- Create: `supabase/functions/_shared/logger.ts`
- Test: `supabase/functions/_shared/__tests__/types_test.ts`

**Interfaces:**
- Consumes: les noms de colonnes de Task 1.
- Produces:
  - `type SourceKey = 'france_travail' | 'adzuna' | 'free_work' | 'codeur' | 'collective' | 'kicklox'`
  - `type CollectionMode = 'backfill' | 'delta'`
  - `interface NormalizedOffer` — voir le code ci-dessous, c'est le contrat central du projet
  - `interface SearchQueryRow`
  - `interface DbConfig { url: string; serviceRoleKey: string }`
  - `type DbClient = SupabaseClient`
  - `createDbClient(cfg: DbConfig): DbClient`
  - `emptyOffer(source: SourceKey, externalId: string, title: string): NormalizedOffer`
  - `log(level, message, data?)`

- [ ] **Step 1: Écrire `types.ts`**

Create `supabase/functions/_shared/types.ts` :

```ts
// Runtime-neutre : aucun accès à l'environnement d'exécution dans ce fichier.
// Ce fichier est importé par les Edge Functions (Deno) ET par les scrapers (Node).

export type SourceKey =
  | 'france_travail'
  | 'adzuna'
  | 'free_work'
  | 'codeur'
  | 'collective'
  | 'kicklox';

export type CollectionMode = 'backfill' | 'delta';
export type RunTrigger = 'cron' | 'manual';
export type RunStatus = 'running' | 'success' | 'partial' | 'failed';

/** Contrat unique produit par toutes les sources. Les noms reflètent les colonnes de `offers`. */
export interface NormalizedOffer {
  source: SourceKey;
  external_id: string;
  url: string | null;
  title: string;
  description: string | null;
  company_name: string | null;
  contract_type: string | null;
  contract_label: string | null;
  city: string | null;
  postal_code: string | null;
  commune_insee: string | null;
  department: string | null;
  latitude: number | null;
  longitude: number | null;
  is_remote: boolean | null;
  remote_label: string | null;
  salary_raw: string | null;
  rate_raw: string | null;
  duration_raw: string | null;
  start_date_raw: string | null;
  experience_raw: string | null;
  /** ISO 8601, ou null si la source ne la fournit pas. */
  published_at: string | null;
  search_origin_insee: string | null;
  search_radius_km: number | null;
  raw: unknown;
}

/**
 * Forme canonique d'une ligne de `collection_query_results`.
 * Source de vérité unique : run-tracker.ts (écriture) et run-collection.ts
 * (construction pendant la boucle de collecte) importent ce type d'ici,
 * pour n'avoir qu'un seul endroit à corriger si la table évolue.
 */
export interface QueryReportLine {
  query_id: number | null;
  unit_label: string;
  http_status: number | null;
  total_available: number | null;
  fetched: number;
  new_offers: number;
  updated_offers: number;
  truncated: boolean;
  duration_ms: number;
  error: string | null;
}

export interface SearchQueryRow {
  id: number;
  source: string;
  label: string;
  keywords: string | null;
  commune_insee: string | null;
  radius_km: number | null;
  extra_params: Record<string, unknown>;
  published_since_days: number;
  priority: number;
  enabled: boolean;
}

/** Fenêtre de collecte en jours, selon le mode. */
export const WINDOW_DAYS: Record<CollectionMode, number> = {
  delta: 3,
  backfill: 31,
};

/**
 * Offre neutre : tous les champs optionnels à null.
 * Les mappers partent de là et ne renseignent que ce que leur source fournit,
 * ce qui garantit qu'aucun champ n'est oublié quand le type évolue.
 */
export function emptyOffer(
  source: SourceKey,
  externalId: string,
  title: string,
): NormalizedOffer {
  return {
    source,
    external_id: externalId,
    title,
    url: null,
    description: null,
    company_name: null,
    contract_type: null,
    contract_label: null,
    city: null,
    postal_code: null,
    commune_insee: null,
    department: null,
    latitude: null,
    longitude: null,
    is_remote: null,
    remote_label: null,
    salary_raw: null,
    rate_raw: null,
    duration_raw: null,
    start_date_raw: null,
    experience_raw: null,
    published_at: null,
    search_origin_insee: null,
    search_radius_km: null,
    raw: null,
  };
}
```

- [ ] **Step 2: Écrire le test de `emptyOffer` et `WINDOW_DAYS`**

Create `supabase/functions/_shared/__tests__/types_test.ts` :

```ts
import { assertEquals } from '@std/assert';
import { emptyOffer, WINDOW_DAYS } from '../types.ts';

Deno.test('emptyOffer renseigne l\'identité et met tout le reste à null', () => {
  const offer = emptyOffer('france_travail', 'ABC123', 'Développeur React');

  assertEquals(offer.source, 'france_travail');
  assertEquals(offer.external_id, 'ABC123');
  assertEquals(offer.title, 'Développeur React');
  assertEquals(offer.description, null);
  assertEquals(offer.latitude, null);
  assertEquals(offer.rate_raw, null);
  assertEquals(offer.search_radius_km, null);
});

Deno.test('emptyOffer couvre toutes les clés de NormalizedOffer', () => {
  const offer = emptyOffer('adzuna', 'X', 'Y');
  // Verrou anti-oubli : si une colonne est ajoutée au type sans être ajoutée
  // à emptyOffer, ce compte change et le test échoue.
  assertEquals(Object.keys(offer).length, 25);
});

Deno.test('la fenêtre de collecte vaut 3 jours en delta et 31 en backfill', () => {
  assertEquals(WINDOW_DAYS.delta, 3);
  assertEquals(WINDOW_DAYS.backfill, 31);
});
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils passent**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read supabase/functions/_shared/__tests__/types_test.ts
```

Expected : `ok | 3 passed`. Si le second test échoue sur le compte de clés, corrige le nombre attendu **après** avoir vérifié qu'aucun champ ne manque dans `emptyOffer`.

- [ ] **Step 4: Écrire `db.ts`**

Create `supabase/functions/_shared/db.ts` :

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Configuration injectée : ce fichier ne lit JAMAIS l'environnement lui-même. */
export interface DbConfig {
  url: string;
  serviceRoleKey: string;
}

export type DbClient = SupabaseClient;

export function createDbClient(cfg: DbConfig): DbClient {
  if (!cfg.url) throw new Error('DbConfig.url manquant');
  if (!cfg.serviceRoleKey) throw new Error('DbConfig.serviceRoleKey manquant');

  return createClient(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 5: Écrire `logger.ts`**

Create `supabase/functions/_shared/logger.ts` :

```ts
export type LogLevel = 'info' | 'warn' | 'error';

export function log(level: LogLevel, message: string, data?: unknown): void {
  const line = { level, message, at: new Date().toISOString(), ...(data ? { data } : {}) };
  const text = JSON.stringify(line);
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}
```

- [ ] **Step 6: Vérifier que tout typecheck**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno check --config supabase/functions/deno.json supabase/functions/_shared/db.ts supabase/functions/_shared/logger.ts supabase/functions/_shared/types.ts
```

Expected : `Check file:///...` sans erreur.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared
git commit -m "feat(shared): NormalizedOffer, client DB à config injectée et logger"
```

---

### Task 4: `_shared/upsert.ts` et `_shared/run-tracker.ts`

**Files:**
- Create: `supabase/functions/_shared/upsert.ts`
- Create: `supabase/functions/_shared/run-tracker.ts`
- Test: `supabase/functions/_shared/__tests__/upsert_test.ts`

**Interfaces:**
- Consumes: `NormalizedOffer`, `DbClient`, `SourceKey` (Task 3).
- Produces:
  - `interface UpsertResult { new: number; updated: number }`
  - `upsertOffers(db: DbClient, offers: NormalizedOffer[]): Promise<UpsertResult>`
  - `startRun(db, args: { source: SourceKey; trigger: RunTrigger; mode: CollectionMode }): Promise<string>` — renvoie l'id du run
  - `finishRun(db, runId: string, args: { status: RunStatus; offersNew: number; offersUpdated: number; error?: string | null }): Promise<void>`
  - `recordQueryResult(db, runId: string, row: QueryReportLine): Promise<void>` — `QueryReportLine` est la forme canonique d'une ligne de `collection_query_results`, définie dans `types.ts` (Task 3) et partagée avec `run-collection.ts` (Task 8) pour qu'une colonne ajoutée à la table ne soit à répercuter qu'à un seul endroit

- [ ] **Step 1: Écrire le test de `upsertOffers` avec un faux client**

Le comptage `new` / `updated` ne peut pas être déduit d'un `upsert` seul : Postgres ne dit pas quelles lignes existaient. On lit donc d'abord les `external_id` déjà connus, puis on upsert, puis on compte par différence. Le test verrouille exactement ce comportement.

Create `supabase/functions/_shared/__tests__/upsert_test.ts` :

```ts
import { assertEquals } from '@std/assert';
import { upsertOffers } from '../upsert.ts';
import { emptyOffer } from '../types.ts';
import type { DbClient } from '../db.ts';

/**
 * Faux client : reproduit uniquement les deux chaînes d'appels que upsertOffers utilise.
 *  - select('external_id').eq('source', s).in('external_id', ids)
 *  - upsert(rows, { onConflict })
 */
function fakeDb(known: string[]): { db: DbClient; upserted: unknown[][] } {
  const upserted: unknown[][] = [];
  const db = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                in(_col2: string, ids: string[]) {
                  const data = ids
                    .filter((id) => known.includes(id))
                    .map((id) => ({ external_id: id }));
                  return Promise.resolve({ data, error: null });
                },
              };
            },
          };
        },
        upsert(rows: unknown[], _opts: unknown) {
          upserted.push(rows);
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as DbClient;
  return { db, upserted };
}

Deno.test('upsertOffers compte toutes les offres comme nouvelles quand la base est vide', async () => {
  const { db, upserted } = fakeDb([]);
  const offers = [
    emptyOffer('france_travail', 'A1', 'Dev React'),
    emptyOffer('france_travail', 'A2', 'Dev TypeScript'),
  ];

  const result = await upsertOffers(db, offers);

  assertEquals(result, { new: 2, updated: 0 });
  assertEquals(upserted.length, 1);
});

Deno.test('upsertOffers distingue les offres déjà connues', async () => {
  const { db } = fakeDb(['A1']);
  const offers = [
    emptyOffer('france_travail', 'A1', 'Dev React'),
    emptyOffer('france_travail', 'A2', 'Dev TypeScript'),
  ];

  const result = await upsertOffers(db, offers);

  assertEquals(result, { new: 1, updated: 1 });
});

Deno.test('upsertOffers ne touche pas la base pour une liste vide', async () => {
  const { db, upserted } = fakeDb([]);

  const result = await upsertOffers(db, []);

  assertEquals(result, { new: 0, updated: 0 });
  assertEquals(upserted.length, 0);
});

Deno.test('upsertOffers dédoublonne les external_id en doublon dans le même lot', async () => {
  const { db, upserted } = fakeDb([]);
  const offers = [
    emptyOffer('france_travail', 'A1', 'Dev React'),
    emptyOffer('france_travail', 'A1', 'Dev React (doublon dans le lot)'),
  ];

  const result = await upsertOffers(db, offers);

  // Deux requêtes de la matrice peuvent renvoyer la même offre : un upsert
  // contenant deux fois la même clé échouerait côté Postgres.
  assertEquals(result, { new: 1, updated: 0 });
  assertEquals((upserted[0] as unknown[]).length, 1);
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read supabase/functions/_shared/__tests__/upsert_test.ts
```

Expected : FAIL — `Module not found "./upsert.ts"`.

- [ ] **Step 3: Écrire `upsert.ts`**

Create `supabase/functions/_shared/upsert.ts` :

```ts
import type { DbClient } from './db.ts';
import type { NormalizedOffer } from './types.ts';

export interface UpsertResult {
  new: number;
  updated: number;
}

/**
 * Insère ou met à jour un lot d'offres et renvoie le comptage new/updated.
 *
 * Le dédoublonnage repose sur la contrainte unique (source, external_id).
 * Postgres ne dit pas quelles lignes préexistaient : on lit donc les
 * external_id déjà connus avant d'écrire, puis on compte par différence.
 */
export async function upsertOffers(
  db: DbClient,
  offers: NormalizedOffer[],
): Promise<UpsertResult> {
  if (offers.length === 0) return { new: 0, updated: 0 };

  // Un même lot peut contenir deux fois la même offre (deux mots-clés qui la
  // remontent tous les deux). Postgres refuse un upsert avec clé dupliquée.
  const deduped = new Map<string, NormalizedOffer>();
  for (const offer of offers) {
    deduped.set(`${offer.source}::${offer.external_id}`, offer);
  }
  const rows = [...deduped.values()];
  const source = rows[0].source;
  const ids = rows.map((r) => r.external_id);

  const { data: existing, error: selectError } = await db
    .from('offers')
    .select('external_id')
    .eq('source', source)
    .in('external_id', ids);

  if (selectError) throw new Error(`lecture des offres connues : ${selectError.message}`);

  const known = new Set((existing ?? []).map((r: { external_id: string }) => r.external_id));

  const payload = rows.map((offer) => ({
    ...offer,
    last_seen_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await db
    .from('offers')
    .upsert(payload, { onConflict: 'source,external_id' });

  if (upsertError) throw new Error(`upsert des offres : ${upsertError.message}`);

  const updated = ids.filter((id) => known.has(id)).length;
  return { new: rows.length - updated, updated };
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read supabase/functions/_shared/__tests__/upsert_test.ts
```

Expected : `ok | 4 passed`.

- [ ] **Step 5: Écrire `run-tracker.ts`**

Create `supabase/functions/_shared/run-tracker.ts` :

```ts
import type { DbClient } from './db.ts';
import type { CollectionMode, QueryReportLine, RunStatus, RunTrigger, SourceKey } from './types.ts';

export async function startRun(
  db: DbClient,
  args: { source: SourceKey; trigger: RunTrigger; mode: CollectionMode },
): Promise<string> {
  const { data, error } = await db
    .from('collection_runs')
    .insert({ source: args.source, trigger: args.trigger, mode: args.mode })
    .select('id')
    .single();

  if (error) throw new Error(`ouverture du run : ${error.message}`);
  return (data as { id: string }).id;
}

export async function finishRun(
  db: DbClient,
  runId: string,
  args: {
    status: RunStatus;
    offersNew: number;
    offersUpdated: number;
    error?: string | null;
  },
): Promise<void> {
  const { error } = await db
    .from('collection_runs')
    .update({
      status: args.status,
      offers_new: args.offersNew,
      offers_updated: args.offersUpdated,
      error: args.error ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (error) throw new Error(`clôture du run : ${error.message}`);
}

/**
 * Écrit une ligne de télémétrie. N'échoue jamais bruyamment : perdre une ligne
 * de télémétrie ne doit pas faire échouer une collecte réussie.
 */
export async function recordQueryResult(
  db: DbClient,
  runId: string,
  row: QueryReportLine,
): Promise<void> {
  const { error } = await db
    .from('collection_query_results')
    .insert({ run_id: runId, ...row });

  if (error) console.error(`télémétrie non enregistrée : ${error.message}`);
}
```

> **Ajout après revue** — un fichier `supabase/functions/_shared/__tests__/run-tracker_test.ts`
> couvre `recordQueryResult` : il vérifie que la fonction n'échoue jamais bruyamment quand
> l'écriture de télémétrie est refusée par la base. Perdre une ligne de télémétrie ne doit pas
> faire échouer une collecte par ailleurs réussie.

- [ ] **Step 6: Typecheck**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno check --config supabase/functions/deno.json supabase/functions/_shared/upsert.ts supabase/functions/_shared/run-tracker.ts
```

Expected : aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared
git commit -m "feat(shared): upsert dédoublonné avec comptage new/updated et suivi des runs"
```

---

### Task 5: Authentification OAuth2 France Travail

**Files:**
- Create: `supabase/functions/collect-france-travail/auth.ts`
- Test: `supabase/functions/collect-france-travail/__tests__/auth_test.ts`

**Interfaces:**
- Consumes: rien de `_shared`.
- Produces:
  - `interface FtAuthConfig { clientId: string; clientSecret: string }`
  - `getAccessToken(cfg: FtAuthConfig, fetchImpl?: typeof fetch): Promise<string>`
  - `resetTokenCache(): void` — nécessaire pour isoler les tests

- [ ] **Step 1: Écrire le test**

Create `supabase/functions/collect-france-travail/__tests__/auth_test.ts` :

```ts
import { assertEquals, assertRejects } from '@std/assert';
import { getAccessToken, resetTokenCache } from '../auth.ts';

const cfg = { clientId: 'id-test', clientSecret: 'secret-test' };

function fakeFetch(
  token: string,
  expiresIn: number,
  calls: { count: number; lastBody?: string; lastUrl?: string },
): typeof fetch {
  return ((url: string | URL, init?: RequestInit) => {
    calls.count += 1;
    calls.lastUrl = String(url);
    calls.lastBody = String(init?.body ?? '');
    return Promise.resolve(
      new Response(
        JSON.stringify({ access_token: token, expires_in: expiresIn, token_type: 'Bearer' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
  }) as unknown as typeof fetch;
}

Deno.test('getAccessToken demande un token en client_credentials avec le bon scope', async () => {
  resetTokenCache();
  const calls = { count: 0 };
  const token = await getAccessToken(cfg, fakeFetch('tok-1', 1500, calls));

  assertEquals(token, 'tok-1');
  assertEquals(calls.count, 1);

  const body = new URLSearchParams((calls as { lastBody?: string }).lastBody);
  assertEquals(body.get('grant_type'), 'client_credentials');
  assertEquals(body.get('client_id'), 'id-test');
  assertEquals(body.get('client_secret'), 'secret-test');
  assertEquals(body.get('scope'), 'api_offresdemploiv2 o2dsoffre');

  // Le realm partenaire est obligatoire et passe par la query string.
  const url = (calls as { lastUrl?: string }).lastUrl ?? '';
  assertEquals(url.includes('realm=%2Fpartenaire'), true);
});

Deno.test('getAccessToken réutilise le token tant qu\'il est valide', async () => {
  resetTokenCache();
  const calls = { count: 0 };
  const f = fakeFetch('tok-2', 1500, calls);

  await getAccessToken(cfg, f);
  await getAccessToken(cfg, f);
  await getAccessToken(cfg, f);

  assertEquals(calls.count, 1);
});

Deno.test('getAccessToken redemande un token dont l\'expiration est imminente', async () => {
  resetTokenCache();
  const calls = { count: 0 };
  // 30 s d'expiration, sous la marge de sécurité de 60 s : jamais mis en cache.
  const f = fakeFetch('tok-3', 30, calls);

  await getAccessToken(cfg, f);
  await getAccessToken(cfg, f);

  assertEquals(calls.count, 2);
});

Deno.test('getAccessToken remonte une erreur explicite sur réponse non-2xx', async () => {
  resetTokenCache();
  const failing = (() =>
    Promise.resolve(new Response('accès refusé', { status: 401 }))) as unknown as typeof fetch;

  await assertRejects(
    () => getAccessToken(cfg, failing),
    Error,
    'token France Travail refusé (401)',
  );
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read supabase/functions/collect-france-travail/__tests__/auth_test.ts
```

Expected : FAIL — `Module not found "../auth.ts"`.

- [ ] **Step 3: Écrire `auth.ts`**

Create `supabase/functions/collect-france-travail/auth.ts` :

```ts
const TOKEN_URL =
  'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const SCOPE = 'api_offresdemploiv2 o2dsoffre';
/** Marge avant expiration : on ne réutilise pas un token qui expire dans moins d'une minute. */
const SAFETY_MARGIN_MS = 60_000;

export interface FtAuthConfig {
  clientId: string;
  clientSecret: string;
}

let cachedToken: string | null = null;
let cachedUntil = 0;

/** À appeler entre deux tests pour isoler le cache module-scope. */
export function resetTokenCache(): void {
  cachedToken = null;
  cachedUntil = 0;
}

export async function getAccessToken(
  cfg: FtAuthConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (cachedToken && Date.now() < cachedUntil) return cachedToken;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: SCOPE,
  });

  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`token France Travail refusé (${response.status})`);
  }

  const payload = await response.json() as { access_token: string; expires_in: number };
  const ttlMs = payload.expires_in * 1000;

  // Un token à durée de vie courte n'est pas mis en cache : le remettre en
  // cache ferait échouer la requête suivante avec un 401 difficile à lire.
  if (ttlMs > SAFETY_MARGIN_MS) {
    cachedToken = payload.access_token;
    cachedUntil = Date.now() + ttlMs - SAFETY_MARGIN_MS;
  } else {
    resetTokenCache();
  }

  return payload.access_token;
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read supabase/functions/collect-france-travail/__tests__/auth_test.ts
```

Expected : `ok | 4 passed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/collect-france-travail
git commit -m "feat(ft): authentification OAuth2 client_credentials avec cache de token"
```

---

### Task 6: Client France Travail — `Content-Range`, pagination, backoff

**Files:**
- Create: `supabase/functions/collect-france-travail/client.ts`
- Test: `supabase/functions/collect-france-travail/__tests__/client_test.ts`

**Interfaces:**
- Consumes: `SearchQueryRow`, `CollectionMode`, `WINDOW_DAYS` (Task 3).
- Produces:
  - `const FT_MAX_RESULTS = 1150`, `const FT_PAGE_SIZE = 150`
  - `interface ContentRange { start: number; end: number; total: number }`
  - `parseContentRange(header: string | null): ContentRange | null`
  - `buildSearchParams(query: SearchQueryRow, mode: CollectionMode, range: string): URLSearchParams`
  - `interface FtPage { offers: unknown[]; contentRange: ContentRange | null; httpStatus: number }`
  - `fetchPage(args: { query, mode, token, rangeStart, fetchImpl?, sleepImpl? }): Promise<FtPage>`
  - `fetchAllPages(args: { query, mode, token, fetchImpl?, sleepImpl? }): Promise<{ offers: unknown[]; totalAvailable: number | null; truncated: boolean; httpStatus: number }>`

- [ ] **Step 1: Écrire le test de `parseContentRange` et `buildSearchParams`**

Create `supabase/functions/collect-france-travail/__tests__/client_test.ts` :

```ts
import { assertEquals } from '@std/assert';
import {
  buildSearchParams,
  fetchAllPages,
  FT_MAX_RESULTS,
  parseContentRange,
} from '../client.ts';
import type { SearchQueryRow } from '../../_shared/types.ts';

const localQuery: SearchQueryRow = {
  id: 1,
  source: 'france_travail',
  label: 'ft:local:react',
  keywords: 'React',
  commune_insee: '13055',
  radius_km: 40,
  extra_params: {},
  published_since_days: 3,
  priority: 10,
  enabled: true,
};

const remoteQuery: SearchQueryRow = {
  ...localQuery,
  id: 2,
  label: 'ft:remote:react',
  commune_insee: null,
  radius_km: null,
};

Deno.test('parseContentRange extrait début, fin et total', () => {
  assertEquals(parseContentRange('offres 0-49/287543'), { start: 0, end: 49, total: 287543 });
  assertEquals(parseContentRange('offres 150-299/1200'), { start: 150, end: 299, total: 1200 });
});

Deno.test('parseContentRange renvoie null sur en-tête absent ou illisible', () => {
  assertEquals(parseContentRange(null), null);
  assertEquals(parseContentRange(''), null);
  assertEquals(parseContentRange('nawak'), null);
});

Deno.test('buildSearchParams construit la passe locale avec commune et distance', () => {
  const params = buildSearchParams(localQuery, 'delta', '0-149');

  assertEquals(params.get('motsCles'), 'React');
  assertEquals(params.get('commune'), '13055');
  assertEquals(params.get('distance'), '40');
  assertEquals(params.get('publieeDepuis'), '3');
  assertEquals(params.get('range'), '0-149');
});

Deno.test('buildSearchParams omet commune et distance sur la passe nationale', () => {
  const params = buildSearchParams(remoteQuery, 'delta', '0-149');

  assertEquals(params.get('motsCles'), 'React');
  assertEquals(params.has('commune'), false);
  assertEquals(params.has('distance'), false);
});

Deno.test('buildSearchParams force la fenêtre à 31 jours en backfill', () => {
  // publieeDepuis de l'API n'accepte que 1, 3, 7, 14 ou 31.
  assertEquals(buildSearchParams(localQuery, 'backfill', '0-149').get('publieeDepuis'), '31');
});

Deno.test('buildSearchParams fusionne extra_params', () => {
  const withExtra: SearchQueryRow = { ...localQuery, extra_params: { typeContrat: 'CDI' } };
  assertEquals(buildSearchParams(withExtra, 'delta', '0-149').get('typeContrat'), 'CDI');
});
```

- [ ] **Step 2: Ajouter au même fichier les tests de `fetchAllPages`**

Append to `supabase/functions/collect-france-travail/__tests__/client_test.ts` :

```ts
/** Construit un faux fetch renvoyant `total` offres, paginées comme l'API réelle. */
function pagedFetch(total: number, calls: { count: number; ranges: string[] }): typeof fetch {
  return ((url: string | URL) => {
    calls.count += 1;
    const range = new URL(String(url)).searchParams.get('range') ?? '';
    calls.ranges.push(range);

    const [startStr, endStr] = range.split('-');
    const start = Number(startStr);
    const end = Number(endStr);
    const count = Math.max(0, Math.min(end, total - 1) - start + 1);
    const offers = Array.from({ length: count }, (_, i) => ({ id: `OFFER-${start + i}` }));

    if (count === 0) return Promise.resolve(new Response(null, { status: 204 }));

    return Promise.resolve(
      new Response(JSON.stringify({ resultats: offers }), {
        status: 206,
        headers: {
          'content-type': 'application/json',
          'content-range': `offres ${start}-${start + count - 1}/${total}`,
        },
      }),
    );
  }) as unknown as typeof fetch;
}

const noSleep = () => Promise.resolve();

Deno.test('fetchAllPages ramène une page unique quand le total tient dedans', async () => {
  const calls = { count: 0, ranges: [] as string[] };
  const result = await fetchAllPages({
    query: localQuery,
    mode: 'delta',
    token: 'tok',
    fetchImpl: pagedFetch(42, calls),
    sleepImpl: noSleep,
  });

  assertEquals(result.offers.length, 42);
  assertEquals(result.totalAvailable, 42);
  assertEquals(result.truncated, false);
  assertEquals(calls.count, 1);
});

Deno.test('fetchAllPages pagine jusqu\'à épuisement du total', async () => {
  const calls = { count: 0, ranges: [] as string[] };
  const result = await fetchAllPages({
    query: localQuery,
    mode: 'delta',
    token: 'tok',
    fetchImpl: pagedFetch(370, calls),
    sleepImpl: noSleep,
  });

  assertEquals(result.offers.length, 370);
  assertEquals(calls.ranges, ['0-149', '150-299', '300-449']);
  assertEquals(result.truncated, false);
});

Deno.test('fetchAllPages s\'arrête au plafond et signale la troncature', async () => {
  const calls = { count: 0, ranges: [] as string[] };
  const result = await fetchAllPages({
    query: localQuery,
    mode: 'delta',
    token: 'tok',
    fetchImpl: pagedFetch(50_000, calls),
    sleepImpl: noSleep,
  });

  // Le plafond dur de l'API est 1150 : on ne demande jamais au-delà.
  assertEquals(result.offers.length, FT_MAX_RESULTS);
  assertEquals(result.totalAvailable, 50_000);
  assertEquals(result.truncated, true);
  assertEquals(calls.ranges.at(-1), '1000-1149');
});

Deno.test('fetchAllPages traite un 204 comme un résultat vide, sans erreur', async () => {
  const calls = { count: 0, ranges: [] as string[] };
  const result = await fetchAllPages({
    query: localQuery,
    mode: 'delta',
    token: 'tok',
    fetchImpl: pagedFetch(0, calls),
    sleepImpl: noSleep,
  });

  assertEquals(result.offers.length, 0);
  assertEquals(result.totalAvailable, 0);
  assertEquals(result.httpStatus, 204);
});

Deno.test('fetchAllPages réessaie après un 429 puis réussit', async () => {
  let seen = 0;
  const flaky = ((url: string | URL) => {
    seen += 1;
    if (seen === 1) {
      return Promise.resolve(new Response('trop de requêtes', { status: 429 }));
    }
    const range = new URL(String(url)).searchParams.get('range') ?? '';
    const [s] = range.split('-').map(Number);
    return Promise.resolve(
      new Response(JSON.stringify({ resultats: [{ id: 'OFFER-1' }] }), {
        status: 206,
        headers: { 'content-range': `offres ${s}-${s}/1` },
      }),
    );
  }) as unknown as typeof fetch;

  const result = await fetchAllPages({
    query: localQuery,
    mode: 'delta',
    token: 'tok',
    fetchImpl: flaky,
    sleepImpl: noSleep,
  });

  assertEquals(result.offers.length, 1);
  assertEquals(seen, 2);
});

Deno.test('fetchAllPages abandonne sur 403 sans réessayer', async () => {
  let seen = 0;
  const forbidden = (() => {
    seen += 1;
    return Promise.resolve(new Response('interdit', { status: 403 }));
  }) as unknown as typeof fetch;

  let message = '';
  try {
    await fetchAllPages({
      query: localQuery,
      mode: 'delta',
      token: 'tok',
      fetchImpl: forbidden,
      sleepImpl: noSleep,
    });
  } catch (e) {
    message = (e as Error).message;
  }

  // Un 403 est un refus, pas une erreur transitoire : aucun retry.
  assertEquals(seen, 1);
  assertEquals(message.includes('403'), true);
});
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read supabase/functions/collect-france-travail/__tests__/client_test.ts
```

Expected : FAIL — `Module not found "../client.ts"`.

- [ ] **Step 4: Écrire `client.ts`**

Attention à la boucle de pagination : `FT_MAX_RESULTS` (1150) n'est pas un multiple de `FT_PAGE_SIZE` (150). Une boucle naïve demanderait `1050-1199` en dernière page, au-delà du plafond dur de l'API, et ramènerait 1200 offres au lieu de 1150 — ce que les tests de l'étape 2 détectent. La dernière page est donc recadrée sur `1000-1149`, et le chevauchement qui en résulte est retiré avant concaténation.

Create `supabase/functions/collect-france-travail/client.ts` :

```ts
import { type CollectionMode, type SearchQueryRow, WINDOW_DAYS } from '../_shared/types.ts';

const SEARCH_URL = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';

/** Plafond dur de l'API : range ne dépasse pas 1000-1149. */
export const FT_MAX_RESULTS = 1150;
export const FT_PAGE_SIZE = 150;

/** Valeurs acceptées par publieeDepuis. La fenêtre demandée est arrondie à la borne supérieure. */
const ALLOWED_WINDOWS = [1, 3, 7, 14, 31];

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1_000;

export interface ContentRange {
  start: number;
  end: number;
  total: number;
}

export function parseContentRange(header: string | null): ContentRange | null {
  if (!header) return null;
  const match = header.match(/(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)/);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) };
}

function windowFor(mode: CollectionMode): number {
  const wanted = WINDOW_DAYS[mode];
  return ALLOWED_WINDOWS.find((v) => v >= wanted) ?? 31;
}

export function buildSearchParams(
  query: SearchQueryRow,
  mode: CollectionMode,
  range: string,
): URLSearchParams {
  const params = new URLSearchParams();
  if (query.keywords) params.set('motsCles', query.keywords);
  if (query.commune_insee) params.set('commune', query.commune_insee);
  if (query.radius_km !== null) params.set('distance', String(query.radius_km));
  params.set('publieeDepuis', String(windowFor(mode)));
  params.set('range', range);

  for (const [key, value] of Object.entries(query.extra_params ?? {})) {
    if (value !== null && value !== undefined) params.set(key, String(value));
  }
  return params;
}

export interface FtPage {
  offers: unknown[];
  contentRange: ContentRange | null;
  httpStatus: number;
}

async function fetchPageOnce(
  query: SearchQueryRow,
  mode: CollectionMode,
  token: string,
  rangeStart: number,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const rangeEnd = rangeStart + FT_PAGE_SIZE - 1;
  const params = buildSearchParams(query, mode, `${rangeStart}-${rangeEnd}`);
  return await fetchImpl(`${SEARCH_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
}

export async function fetchPage(args: {
  query: SearchQueryRow;
  mode: CollectionMode;
  token: string;
  rangeStart: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}): Promise<FtPage> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const sleep = args.sleepImpl ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetchPageOnce(
      args.query,
      args.mode,
      args.token,
      args.rangeStart,
      fetchImpl,
    );

    // 403 : refus, pas une erreur transitoire. Aucun retry.
    if (response.status === 403) {
      throw new Error(`France Travail a refusé la requête (403) — ${args.query.label}`);
    }

    if (response.status === 429) {
      if (attempt === MAX_RETRIES) {
        throw new Error(`France Travail : quota dépassé (429) après ${MAX_RETRIES} essais`);
      }
      await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt));
      continue;
    }

    // 204 : aucune offre pour ces critères. Cas normal, pas une erreur.
    if (response.status === 204) {
      return { offers: [], contentRange: null, httpStatus: 204 };
    }

    if (!response.ok) {
      throw new Error(`France Travail a répondu ${response.status} — ${args.query.label}`);
    }

    const payload = await response.json() as { resultats?: unknown[] };
    return {
      offers: payload.resultats ?? [],
      contentRange: parseContentRange(response.headers.get('content-range')),
      httpStatus: response.status,
    };
  }

  throw new Error('France Travail : boucle de retry épuisée');
}

export async function fetchAllPages(args: {
  query: SearchQueryRow;
  mode: CollectionMode;
  token: string;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}): Promise<{
  offers: unknown[];
  totalAvailable: number | null;
  truncated: boolean;
  httpStatus: number;
}> {
  const collected: unknown[] = [];
  let totalAvailable: number | null = null;
  let httpStatus = 200;

  for (let start = 0; start < FT_MAX_RESULTS; start += FT_PAGE_SIZE) {
    // FT_MAX_RESULTS n'est pas un multiple de FT_PAGE_SIZE (1150 / 150) : la
    // dernière page est ramenée à 1000-1149 pour ne jamais demander au-delà
    // du plafond dur de l'API (range max 1000-1149).
    const rangeStart = Math.min(start, FT_MAX_RESULTS - FT_PAGE_SIZE);
    const page = await fetchPage({ ...args, rangeStart });
    httpStatus = page.httpStatus;

    if (page.contentRange) totalAvailable = page.contentRange.total;
    else if (page.httpStatus === 204 && totalAvailable === null) totalAvailable = 0;

    // Ce recadrage peut faire chevaucher la dernière page avec la précédente
    // (ex. 900-1049 puis 1000-1149) : on ne réinjecte que les offres neuves.
    const overlap = Math.max(0, collected.length - rangeStart);
    collected.push(...page.offers.slice(overlap));

    if (page.offers.length === 0) break;
    if (totalAvailable !== null && collected.length >= totalAvailable) break;
    if (rangeStart !== start) break;
  }

  return {
    offers: collected,
    totalAvailable,
    // Le vrai total dépasse ce que l'API veut bien paginer : la requête
    // doit être découpée ou sa fenêtre réduite.
    truncated: totalAvailable !== null && totalAvailable > FT_MAX_RESULTS,
    httpStatus,
  };
}
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read supabase/functions/collect-france-travail/__tests__/client_test.ts
```

Expected : `ok | 12 passed`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/collect-france-travail
git commit -m "feat(ft): client de recherche avec Content-Range, pagination et backoff 429"
```

---

### Task 7: Mapper France Travail

**Files:**
- Create: `supabase/functions/collect-france-travail/mapper.ts`
- Create: `supabase/functions/collect-france-travail/__tests__/fixtures/ft-search-response.json`
- Test: `supabase/functions/collect-france-travail/__tests__/mapper_test.ts`

**Interfaces:**
- Consumes: `NormalizedOffer`, `emptyOffer` (Task 3), `SearchQueryRow` (Task 3).
- Produces:
  - `interface FtProvenance { searchOriginInsee: string | null; searchRadiusKm: number | null }`
  - `mapFtOffer(raw: unknown, provenance: FtProvenance): NormalizedOffer | null` — `null` si le payload n'a ni `id` ni `intitule`
  - `provenanceOf(query: SearchQueryRow): FtProvenance`

- [ ] **Step 1: Capturer une vraie réponse de l'API dans une fixture**

**Cette étape conditionne la justesse du mapper : la fixture est la source de vérité, pas le code ci-dessous.**

```bash
# Récupérer un token
curl -s -X POST \
  'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "grant_type=client_credentials" \
  --data-urlencode "client_id=$FT_CLIENT_ID" \
  --data-urlencode "client_secret=$FT_CLIENT_SECRET" \
  --data-urlencode "scope=api_offresdemploiv2 o2dsoffre"
```

Copie la valeur de `access_token`, puis :

```bash
mkdir -p supabase/functions/collect-france-travail/__tests__/fixtures
curl -s -D - \
  'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?motsCles=React&commune=13055&distance=40&publieeDepuis=31&range=0-9' \
  -H "Authorization: Bearer <TOKEN>" \
  -H 'Accept: application/json' \
  -o supabase/functions/collect-france-travail/__tests__/fixtures/ft-search-response.json
```

Expected : un statut `200` ou `206`, et un header `Content-Range: offres 0-9/<total>`. **Note ce total quelque part** — c'est ta première mesure réelle de volume sur ta zone.

- [ ] **Step 2: Inspecter les noms de champs réels**

```bash
deno eval "const d = JSON.parse(await Deno.readTextFile('supabase/functions/collect-france-travail/__tests__/fixtures/ft-search-response.json')); console.log(Object.keys(d.resultats[0]).join('\n'));"
```

Compare la sortie aux champs utilisés à l'étape 4 (`id`, `intitule`, `description`, `dateCreation`, `lieuTravail`, `entreprise`, `typeContrat`, `typeContratLibelle`, `experienceLibelle`, `salaire`, `origineOffre`, `dureeTravailLibelle`, `alternance`). **Si un nom diffère, corrige le mapper ET le test ensemble** — la fixture a raison.

- [ ] **Step 3: Écrire le test du mapper**

Create `supabase/functions/collect-france-travail/__tests__/mapper_test.ts` :

```ts
import { assertEquals, assertNotEquals } from '@std/assert';
import { mapFtOffer, provenanceOf } from '../mapper.ts';
import type { SearchQueryRow } from '../../_shared/types.ts';

const provenance = { searchOriginInsee: '13055', searchRadiusKm: 40 };

const sample = {
  id: '190QRPX',
  intitule: 'Développeur Front-End React / TypeScript (H/F)',
  description: 'Vous rejoignez une équipe produit pour développer en React et TypeScript.',
  dateCreation: '2026-09-01T09:12:33.000Z',
  dateActualisation: '2026-09-03T11:00:00.000Z',
  lieuTravail: {
    libelle: '13 - MARSEILLE 02',
    latitude: 43.3049,
    longitude: 5.3661,
    codePostal: '13002',
    commune: '13202',
  },
  entreprise: { nom: 'ACME TECH' },
  typeContrat: 'CDI',
  typeContratLibelle: 'Contrat à durée indéterminée',
  experienceLibelle: '5 ans',
  salaire: { libelle: 'Annuel de 45000,00 Euros à 55000,00 Euros' },
  origineOffre: { urlOrigine: 'https://candidat.francetravail.fr/offres/recherche/detail/190QRPX' },
  dureeTravailLibelle: '35H Travail en journée',
};

Deno.test('mapFtOffer projette les champs de base', () => {
  const offer = mapFtOffer(sample, provenance)!;

  assertEquals(offer.source, 'france_travail');
  assertEquals(offer.external_id, '190QRPX');
  assertEquals(offer.title, 'Développeur Front-End React / TypeScript (H/F)');
  assertEquals(offer.company_name, 'ACME TECH');
  assertEquals(offer.contract_type, 'CDI');
  assertEquals(offer.contract_label, 'Contrat à durée indéterminée');
  assertEquals(offer.experience_raw, '5 ans');
  assertEquals(offer.salary_raw, 'Annuel de 45000,00 Euros à 55000,00 Euros');
  assertEquals(
    offer.url,
    'https://candidat.francetravail.fr/offres/recherche/detail/190QRPX',
  );
});

Deno.test('mapFtOffer extrait la géographie et le département depuis le code postal', () => {
  const offer = mapFtOffer(sample, provenance)!;

  assertEquals(offer.city, '13 - MARSEILLE 02');
  assertEquals(offer.postal_code, '13002');
  assertEquals(offer.commune_insee, '13202');
  assertEquals(offer.department, '13');
  assertEquals(offer.latitude, 43.3049);
  assertEquals(offer.longitude, 5.3661);
});

Deno.test('mapFtOffer conserve la provenance de la requête', () => {
  const offer = mapFtOffer(sample, provenance)!;
  assertEquals(offer.search_origin_insee, '13055');
  assertEquals(offer.search_radius_km, 40);
});

Deno.test('mapFtOffer normalise la date de publication en ISO', () => {
  const offer = mapFtOffer(sample, provenance)!;
  assertEquals(offer.published_at, '2026-09-01T09:12:33.000Z');
});

Deno.test('mapFtOffer conserve le payload brut', () => {
  const offer = mapFtOffer(sample, provenance)!;
  assertEquals((offer.raw as { id: string }).id, '190QRPX');
});

Deno.test('mapFtOffer détecte le télétravail dans la description', () => {
  const remote = { ...sample, description: 'Poste ouvert au télétravail complet.' };
  assertEquals(mapFtOffer(remote, provenance)!.is_remote, true);

  assertEquals(mapFtOffer(sample, provenance)!.is_remote, false);
});

Deno.test('mapFtOffer survit à une offre minimale sans champs optionnels', () => {
  const minimal = { id: 'X1', intitule: 'Dev' };
  const offer = mapFtOffer(minimal, provenance)!;

  assertEquals(offer.external_id, 'X1');
  assertEquals(offer.title, 'Dev');
  assertEquals(offer.description, null);
  assertEquals(offer.city, null);
  assertEquals(offer.latitude, null);
  assertEquals(offer.department, null);
});

Deno.test('mapFtOffer renvoie null sur un payload inutilisable', () => {
  assertEquals(mapFtOffer({}, provenance), null);
  assertEquals(mapFtOffer({ id: 'X' }, provenance), null);
  assertEquals(mapFtOffer(null, provenance), null);
});

Deno.test('provenanceOf lit la commune et le rayon de la requête', () => {
  const query: SearchQueryRow = {
    id: 1,
    source: 'france_travail',
    label: 'ft:local:react',
    keywords: 'React',
    commune_insee: '13055',
    radius_km: 40,
    extra_params: {},
    published_since_days: 3,
    priority: 10,
    enabled: true,
  };
  assertEquals(provenanceOf(query), { searchOriginInsee: '13055', searchRadiusKm: 40 });

  const national: SearchQueryRow = { ...query, commune_insee: null, radius_km: null };
  assertEquals(provenanceOf(national), { searchOriginInsee: null, searchRadiusKm: null });
});

Deno.test('la fixture réelle se mappe sans exception', async () => {
  const text = await Deno.readTextFile(
    new URL('./fixtures/ft-search-response.json', import.meta.url),
  );
  const payload = JSON.parse(text) as { resultats: unknown[] };

  const mapped = payload.resultats.map((r) => mapFtOffer(r, provenance));

  assertNotEquals(mapped.length, 0);
  for (const offer of mapped) {
    assertNotEquals(offer, null);
    assertNotEquals(offer!.external_id, '');
    assertNotEquals(offer!.title, '');
  }
});
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils échouent**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read supabase/functions/collect-france-travail/__tests__/mapper_test.ts
```

Expected : FAIL — `Module not found "../mapper.ts"`.

- [ ] **Step 5: Écrire `mapper.ts`**

Create `supabase/functions/collect-france-travail/mapper.ts` :

```ts
import { emptyOffer, type NormalizedOffer, type SearchQueryRow } from '../_shared/types.ts';

export interface FtProvenance {
  searchOriginInsee: string | null;
  searchRadiusKm: number | null;
}

const REMOTE_HINTS = ['télétravail', 'teletravail', 'remote', 'à distance', 'full remote'];

interface FtRawOffer {
  id?: string;
  intitule?: string;
  description?: string;
  dateCreation?: string;
  dateActualisation?: string;
  lieuTravail?: {
    libelle?: string;
    latitude?: number;
    longitude?: number;
    codePostal?: string;
    commune?: string;
  };
  entreprise?: { nom?: string };
  typeContrat?: string;
  typeContratLibelle?: string;
  experienceLibelle?: string;
  salaire?: { libelle?: string };
  origineOffre?: { urlOrigine?: string };
  dureeTravailLibelle?: string;
}

export function provenanceOf(query: SearchQueryRow): FtProvenance {
  return {
    searchOriginInsee: query.commune_insee,
    searchRadiusKm: query.radius_km,
  };
}

function toIso(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Renvoie null quand le payload n'a pas le minimum exploitable : id et intitulé. */
export function mapFtOffer(raw: unknown, provenance: FtProvenance): NormalizedOffer | null {
  if (!raw || typeof raw !== 'object') return null;
  const ft = raw as FtRawOffer;
  if (!ft.id || !ft.intitule) return null;

  const offer = emptyOffer('france_travail', ft.id, ft.intitule);

  offer.description = ft.description ?? null;
  offer.company_name = ft.entreprise?.nom ?? null;
  offer.contract_type = ft.typeContrat ?? null;
  offer.contract_label = ft.typeContratLibelle ?? null;
  offer.experience_raw = ft.experienceLibelle ?? null;
  offer.salary_raw = ft.salaire?.libelle ?? null;
  offer.duration_raw = ft.dureeTravailLibelle ?? null;
  offer.url = ft.origineOffre?.urlOrigine ?? null;
  offer.published_at = toIso(ft.dateCreation);

  offer.city = ft.lieuTravail?.libelle ?? null;
  offer.postal_code = ft.lieuTravail?.codePostal ?? null;
  offer.commune_insee = ft.lieuTravail?.commune ?? null;
  offer.latitude = ft.lieuTravail?.latitude ?? null;
  offer.longitude = ft.lieuTravail?.longitude ?? null;
  // Le département se déduit du code postal : l'API ne l'expose pas en clair.
  offer.department = ft.lieuTravail?.codePostal?.slice(0, 2) ?? null;

  // L'API n'a pas de filtre télétravail fiable : on le déduit du texte.
  const haystack = `${ft.intitule} ${ft.description ?? ''}`.toLowerCase();
  offer.is_remote = REMOTE_HINTS.some((hint) => haystack.includes(hint));

  offer.search_origin_insee = provenance.searchOriginInsee;
  offer.search_radius_km = provenance.searchRadiusKm;
  offer.raw = raw;

  return offer;
}
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read supabase/functions/collect-france-travail/__tests__/mapper_test.ts
```

Expected : `ok | 10 passed`. Si le dernier test échoue, un nom de champ diffère dans la fixture réelle : corrige `FtRawOffer` et le mapper.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/collect-france-travail
git commit -m "feat(ft): mapper payload France Travail vers NormalizedOffer, testé sur fixture réelle"
```

---

### Task 8: Orchestration mutualisée — `_shared/run-collection.ts`

Les deux sources API, puis les quatre scrapers du plan B, partagent exactement la même boucle : parcourir les unités de collecte, isoler les erreurs, écrire la télémétrie, agréger le statut. Cette tâche l'écrit une fois.

**Files:**
- Create: `supabase/functions/_shared/run-collection.ts`
- Test: `supabase/functions/_shared/__tests__/run-collection_test.ts`

**Interfaces:**
- Consumes: `upsertOffers` (Task 4), `startRun` / `finishRun` / `recordQueryResult` (Task 4), `NormalizedOffer` / `SearchQueryRow` / `SourceKey` / `CollectionMode` / `RunTrigger` / `RunStatus` (Task 3), `log` (Task 3).
- Produces:
  - `interface FetchResult { offers: unknown[]; totalAvailable: number | null; truncated?: boolean; httpStatus: number }`
  - `QueryReportLine` est importé de `types.ts` et ré-exporté ici pour les consommateurs de ce module — il n'est pas redéfini
  - `interface CollectionSummary { runId: string | null; mode: CollectionMode; dryRun: boolean; status: RunStatus; offersNew: number; offersUpdated: number; queries: QueryReportLine[]; preview?: NormalizedOffer[] }`
  - `runCollection(opts: RunCollectionOptions): Promise<CollectionSummary>` où `RunCollectionOptions = { db, source, mode, trigger, dryRun, queries, fetchAll, map }`, `fetchAll: (query: SearchQueryRow) => Promise<FetchResult>` et `map: (raw: unknown, query: SearchQueryRow) => NormalizedOffer | null`

Ce fichier reste **runtime-neutre** : il ne lit aucune variable d'environnement. `fetchAll` et `map` sont injectés par l'appelant.

- [ ] **Step 1: Écrire le test de `runCollection`**

Create `supabase/functions/_shared/__tests__/run-collection_test.ts` :

```ts
import { assertEquals } from '@std/assert';
import { runCollection } from '../run-collection.ts';
import { emptyOffer, type NormalizedOffer, type SearchQueryRow } from '../types.ts';
import type { DbClient } from '../db.ts';

function query(id: number, label: string): SearchQueryRow {
  return {
    id,
    source: 'france_travail',
    label,
    keywords: label,
    commune_insee: '13055',
    radius_km: 40,
    extra_params: {},
    published_since_days: 3,
    priority: 10,
    enabled: true,
  };
}

interface Recorded {
  runsOpened: number;
  runsFinished: Record<string, unknown>[];
  telemetry: Record<string, unknown>[];
  upserts: unknown[][];
}

/** Faux client couvrant les seules chaînes d'appels que runCollection déclenche. */
function fakeDb(
  knownExternalIds: string[] = [],
  opts: { failFinishRun?: boolean } = {},
): { db: DbClient; rec: Recorded } {
  const rec: Recorded = { runsOpened: 0, runsFinished: [], telemetry: [], upserts: [] };

  const db = {
    from(table: string) {
      if (table === 'collection_runs') {
        return {
          insert(_row: unknown) {
            rec.runsOpened += 1;
            return {
              select(_c: string) {
                return { single: () => Promise.resolve({ data: { id: 'run-1' }, error: null }) };
              },
            };
          },
          update(row: Record<string, unknown>) {
            rec.runsFinished.push(row);
            return {
              eq: () =>
                opts.failFinishRun
                  ? Promise.reject(new Error('base indisponible'))
                  : Promise.resolve({ error: null }),
            };
          },
        };
      }
      if (table === 'collection_query_results') {
        return {
          insert(row: Record<string, unknown>) {
            rec.telemetry.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      // table 'offers'
      return {
        select(_c: string) {
          return {
            eq(_col: string, _v: string) {
              return {
                in(_col2: string, ids: string[]) {
                  const data = ids
                    .filter((id) => knownExternalIds.includes(id))
                    .map((id) => ({ external_id: id }));
                  return Promise.resolve({ data, error: null });
                },
              };
            },
          };
        },
        upsert(rows: unknown[], _o: unknown) {
          rec.upserts.push(rows);
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as DbClient;

  return { db, rec };
}

const okFetch = (n: number) => () =>
  Promise.resolve({
    offers: Array.from({ length: n }, (_, i) => ({ id: `O${i}` })),
    totalAvailable: n,
    truncated: false,
    httpStatus: 200,
  });

const mapAll = (raw: unknown): NormalizedOffer =>
  emptyOffer('france_travail', (raw as { id: string }).id, 'Titre');

Deno.test('runCollection agrège les compteurs sur toutes les requêtes', async () => {
  const { db, rec } = fakeDb();

  const summary = await runCollection({
    db,
    source: 'france_travail',
    mode: 'delta',
    trigger: 'manual',
    dryRun: false,
    queries: [query(1, 'a'), query(2, 'b')],
    fetchAll: okFetch(3),
    map: mapAll,
  });

  assertEquals(summary.status, 'success');
  assertEquals(summary.offersNew, 6);
  assertEquals(summary.offersUpdated, 0);
  assertEquals(summary.queries.length, 2);
  assertEquals(rec.runsOpened, 1);
  assertEquals(rec.telemetry.length, 2);
  assertEquals(rec.runsFinished.length, 1);
  assertEquals(rec.runsFinished[0].status, 'success');
});

Deno.test("runCollection en dryRun n'ouvre aucun run et n'écrit rien", async () => {
  const { db, rec } = fakeDb();

  const summary = await runCollection({
    db,
    source: 'france_travail',
    mode: 'delta',
    trigger: 'manual',
    dryRun: true,
    queries: [query(1, 'a')],
    fetchAll: okFetch(5),
    map: mapAll,
  });

  assertEquals(summary.runId, null);
  assertEquals(summary.dryRun, true);
  assertEquals(summary.offersNew, 0);
  assertEquals(rec.runsOpened, 0);
  assertEquals(rec.upserts.length, 0);
  assertEquals(rec.telemetry.length, 0);
  // Le preview est plafonné pour ne pas renvoyer des centaines d'offres.
  assertEquals(summary.preview?.length, 3);
});

Deno.test('runCollection isole une requête en échec et termine en partial', async () => {
  const { db, rec } = fakeDb();
  let call = 0;
  const flaky = () => {
    call += 1;
    if (call === 1) return Promise.reject(new Error('boom'));
    return okFetch(2)();
  };

  const summary = await runCollection({
    db,
    source: 'france_travail',
    mode: 'delta',
    trigger: 'manual',
    dryRun: false,
    queries: [query(1, 'qui-echoue'), query(2, 'qui-marche')],
    fetchAll: flaky,
    map: mapAll,
  });

  // La requête suivante doit avoir tourné malgré l'échec de la première.
  assertEquals(summary.status, 'partial');
  assertEquals(summary.offersNew, 2);
  assertEquals(rec.telemetry.length, 2);
  assertEquals(rec.telemetry[0].error, 'boom');
  assertEquals(rec.telemetry[0].unit_label, 'qui-echoue');
  assertEquals(rec.telemetry[1].error, null);
});

Deno.test('runCollection termine en failed quand toutes les requêtes échouent', async () => {
  const { db } = fakeDb();

  const summary = await runCollection({
    db,
    source: 'france_travail',
    mode: 'delta',
    trigger: 'manual',
    dryRun: false,
    queries: [query(1, 'a'), query(2, 'b')],
    fetchAll: () => Promise.reject(new Error('api morte')),
    map: mapAll,
  });

  assertEquals(summary.status, 'failed');
  assertEquals(summary.offersNew, 0);
});

Deno.test('runCollection remonte la troncature dans la télémétrie', async () => {
  const { db, rec } = fakeDb();

  await runCollection({
    db,
    source: 'france_travail',
    mode: 'delta',
    trigger: 'manual',
    dryRun: false,
    queries: [query(1, 'a')],
    fetchAll: () =>
      Promise.resolve({
        offers: [{ id: 'O0' }],
        totalAvailable: 50_000,
        truncated: true,
        httpStatus: 206,
      }),
    map: mapAll,
  });

  assertEquals(rec.telemetry[0].truncated, true);
  assertEquals(rec.telemetry[0].total_available, 50_000);
});

Deno.test('runCollection écarte les payloads que le mapper refuse', async () => {
  const { db, rec } = fakeDb();

  const summary = await runCollection({
    db,
    source: 'france_travail',
    mode: 'delta',
    trigger: 'manual',
    dryRun: false,
    queries: [query(1, 'a')],
    fetchAll: okFetch(4),
    // Un payload sur deux est inexploitable.
    map: (raw) => {
      const id = (raw as { id: string }).id;
      return id === 'O0' || id === 'O2' ? emptyOffer('france_travail', id, 'T') : null;
    },
  });

  assertEquals(summary.offersNew, 2);
  assertEquals(rec.telemetry[0].fetched, 2);
});

Deno.test('runCollection distingue les offres déjà connues', async () => {
  const { db } = fakeDb(['O0', 'O1']);

  const summary = await runCollection({
    db,
    source: 'france_travail',
    mode: 'delta',
    trigger: 'manual',
    dryRun: false,
    queries: [query(1, 'a')],
    fetchAll: okFetch(3),
    map: mapAll,
  });

  assertEquals(summary.offersNew, 1);
  assertEquals(summary.offersUpdated, 2);
});

Deno.test(
  'runCollection renvoie le résumé complet même si la clôture du run échoue',
  async () => {
    const { db } = fakeDb([], { failFinishRun: true });

    const summary = await runCollection({
      db,
      source: 'france_travail',
      mode: 'delta',
      trigger: 'manual',
      dryRun: false,
      queries: [query(1, 'a'), query(2, 'b')],
      fetchAll: okFetch(3),
      map: mapAll,
    });

    assertEquals(summary.status, 'success');
    assertEquals(summary.offersNew, 6);
    assertEquals(summary.offersUpdated, 0);
    assertEquals(summary.queries.length, 2);
  },
);
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read supabase/functions/_shared/__tests__/run-collection_test.ts
```

Expected : FAIL — `Module not found "../run-collection.ts"`.

- [ ] **Step 3: Écrire `run-collection.ts`**

Create `supabase/functions/_shared/run-collection.ts` :

```ts
import type { DbClient } from './db.ts';
import { log } from './logger.ts';
import { finishRun, recordQueryResult, startRun } from './run-tracker.ts';
import { upsertOffers } from './upsert.ts';
import type {
  CollectionMode,
  NormalizedOffer,
  QueryReportLine,
  RunStatus,
  RunTrigger,
  SearchQueryRow,
  SourceKey,
} from './types.ts';

// Ré-exporté pour ne pas casser un importateur qui prenait ce type d'ici.
// La forme canonique vit maintenant dans types.ts.
export type { QueryReportLine } from './types.ts';

/** Nombre d'offres renvoyées en exemple dans une réponse dryRun. */
const PREVIEW_PER_QUERY = 3;

/** Ce que chaque source doit renvoyer, quelle que soit son API ou son HTML. */
export interface FetchResult {
  offers: unknown[];
  totalAvailable: number | null;
  truncated?: boolean;
  httpStatus: number;
}

export interface CollectionSummary {
  runId: string | null;
  mode: CollectionMode;
  dryRun: boolean;
  status: RunStatus;
  offersNew: number;
  offersUpdated: number;
  queries: QueryReportLine[];
  preview?: NormalizedOffer[];
}

export interface RunCollectionOptions {
  db: DbClient;
  source: SourceKey;
  mode: CollectionMode;
  trigger: RunTrigger;
  dryRun: boolean;
  queries: SearchQueryRow[];
  fetchAll: (query: SearchQueryRow) => Promise<FetchResult>;
  map: (raw: unknown, query: SearchQueryRow) => NormalizedOffer | null;
}

/**
 * Boucle de collecte commune à toutes les sources.
 *
 * Garanties :
 *  - une unité de collecte en échec n'interrompt jamais les suivantes ;
 *  - tout échec est écrit dans collection_query_results, jamais avalé ;
 *  - en dryRun, aucune écriture : ni run, ni offre, ni télémétrie.
 */
export async function runCollection(opts: RunCollectionOptions): Promise<CollectionSummary> {
  const { db, source, mode, trigger, dryRun, queries } = opts;

  const runId = dryRun ? null : await startRun(db, { source, trigger, mode });

  let offersNew = 0;
  let offersUpdated = 0;
  let failures = 0;
  const report: QueryReportLine[] = [];
  const preview: NormalizedOffer[] = [];

  for (const query of queries) {
    const startedAt = Date.now();
    try {
      const page = await opts.fetchAll(query);
      const mapped = page.offers
        .map((raw) => opts.map(raw, query))
        .filter((offer): offer is NormalizedOffer => offer !== null);

      let counts = { new: 0, updated: 0 };
      if (dryRun) preview.push(...mapped.slice(0, PREVIEW_PER_QUERY));
      else counts = await upsertOffers(db, mapped);

      offersNew += counts.new;
      offersUpdated += counts.updated;

      const line: QueryReportLine = {
        query_id: query.id,
        unit_label: query.label,
        http_status: page.httpStatus,
        total_available: page.totalAvailable,
        fetched: mapped.length,
        new_offers: counts.new,
        updated_offers: counts.updated,
        truncated: page.truncated === true,
        duration_ms: Date.now() - startedAt,
        error: null,
      };
      report.push(line);
      if (runId) await recordQueryResult(db, runId, line);

      if (line.truncated) {
        log('warn', 'unité de collecte tronquée par le plafond de la source', {
          source,
          label: query.label,
          total: page.totalAvailable,
        });
      }
    } catch (e) {
      failures += 1;
      const message = e instanceof Error ? e.message : String(e);
      const line: QueryReportLine = {
        query_id: query.id,
        unit_label: query.label,
        http_status: null,
        total_available: null,
        fetched: 0,
        new_offers: 0,
        updated_offers: 0,
        truncated: false,
        duration_ms: Date.now() - startedAt,
        error: message,
      };
      report.push(line);
      if (runId) await recordQueryResult(db, runId, line);
      log('error', 'unité de collecte en échec', { source, label: query.label, message });
    }
  }

  const status: RunStatus = failures === 0
    ? 'success'
    : failures === queries.length
    ? 'failed'
    : 'partial';

  if (runId) {
    try {
      await finishRun(db, runId, { status, offersNew, offersUpdated });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log('error', 'clôture du run en échec', { source, runId, message });
    }
  }

  return {
    runId,
    mode,
    dryRun,
    status,
    offersNew,
    offersUpdated,
    queries: report,
    ...(dryRun ? { preview } : {}),
  };
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read supabase/functions/_shared/__tests__/run-collection_test.ts
```

Expected : `ok | 7 passed`.

> **Correctif après revue** — l'appel final à `finishRun` est encapsulé dans un `try/catch` qui
> journalise l'échec sans le relancer. Sans cette protection, une base momentanément indisponible
> faisait perdre à l'appelant un `CollectionSummary` déjà entièrement calculé, et laissait la ligne
> `collection_runs` bloquée sur `running` sans `finished_at` — un run pourtant terminé apparaissait
> indéfiniment comme en cours. C'est le même parti que `recordQueryResult`.

- [ ] **Step 5: Vérifier la neutralité runtime de `_shared/`**

```bash
grep -rn "Deno\.\|node:" supabase/functions/_shared/ --include=*.ts | grep -v "__tests__" || echo "NEUTRE : aucun accès runtime dans _shared/"
```

Expected : `NEUTRE : aucun accès runtime dans _shared/`.

C'est la condition qui permettra aux scrapers Node du plan B d'importer ces fichiers sans les réécrire. Si la commande renvoie une ligne, corrige-la avant de continuer.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared
git commit -m "feat(shared): boucle de collecte mutualisée avec isolation des erreurs par unité"
```

---

### Task 9: Point d'entrée `collect-france-travail` et validation en `dryRun`

**Files:**
- Create: `supabase/functions/collect-france-travail/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `runCollection` (Task 8), `createDbClient` (Task 3), `getAccessToken` (Task 5), `fetchAllPages` (Task 6), `mapFtOffer` / `provenanceOf` (Task 7).
- Produces: l'endpoint `POST /functions/v1/collect-france-travail` acceptant `{ mode, dryRun?, queryIds?, trigger? }` et renvoyant un `CollectionSummary`.

- [ ] **Step 1: Écrire `index.ts`**

Le point d'entrée ne contient **aucune** logique d'orchestration : il lit l'environnement, charge les requêtes, obtient le token, puis délègue à `runCollection`.

Create `supabase/functions/collect-france-travail/index.ts` :

```ts
import { createDbClient } from '../_shared/db.ts';
import { runCollection } from '../_shared/run-collection.ts';
import type { CollectionMode, RunTrigger, SearchQueryRow } from '../_shared/types.ts';
import { getAccessToken } from './auth.ts';
import { fetchAllPages } from './client.ts';
import { mapFtOffer, provenanceOf } from './mapper.ts';

interface RequestBody {
  mode?: CollectionMode;
  trigger?: RunTrigger;
  dryRun?: boolean;
  queryIds?: number[];
}

/** Lecture de l'environnement : propre à Deno, donc hors de _shared/. */
function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`variable d'environnement manquante : ${name}`);
  return value;
}

Deno.serve(async (req) => {
  const body: RequestBody = await req.json().catch(() => ({}));
  const mode: CollectionMode = body.mode === 'backfill' ? 'backfill' : 'delta';
  const trigger: RunTrigger = body.trigger === 'cron' ? 'cron' : 'manual';
  const dryRun = body.dryRun === true;

  const db = createDbClient({
    url: requireEnv('SUPABASE_URL'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  });

  let queryBuilder = db
    .from('search_queries')
    .select('*')
    .eq('source', 'france_travail')
    .eq('enabled', true)
    .order('priority', { ascending: true });

  if (body.queryIds?.length) queryBuilder = queryBuilder.in('id', body.queryIds);

  const { data, error } = await queryBuilder;
  if (error) {
    return Response.json({ error: `lecture des requêtes : ${error.message}` }, { status: 500 });
  }

  const queries = (data ?? []) as SearchQueryRow[];
  if (queries.length === 0) {
    return Response.json({ error: 'aucune requête active pour france_travail' }, { status: 400 });
  }

  const token = await getAccessToken({
    clientId: requireEnv('FT_CLIENT_ID'),
    clientSecret: requireEnv('FT_CLIENT_SECRET'),
  });

  const summary = await runCollection({
    db,
    source: 'france_travail',
    mode,
    trigger,
    dryRun,
    queries,
    fetchAll: (query) => fetchAllPages({ query, mode, token }),
    map: (raw, query) => mapFtOffer(raw, provenanceOf(query)),
  });

  return Response.json(summary);
});
```
- [ ] **Step 2: Déclarer la fonction dans `config.toml`**

Append to `supabase/config.toml` :

```toml
[functions.collect-france-travail]
verify_jwt = true
```

`verify_jwt = true` est le défaut, mais l'expliciter empêche de le désactiver par inadvertance : la fonction déployée est une URL publique sur Internet.

- [ ] **Step 3: Typecheck l'ensemble**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno check --config supabase/functions/deno.json supabase/functions/collect-france-travail/index.ts
```

Expected : aucune erreur.

- [ ] **Step 4: Lancer toute la suite de tests**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm test
```

Expected : tous les tests passent (types, upsert, auth, client, mapper).

- [ ] **Step 5: Servir la fonction en local**

Dans un premier terminal :

```bash
npm run fn:serve
```

Expected : `Serving functions on http://127.0.0.1:54321/functions/v1/<function-name>`. Laisse tourner.

- [ ] **Step 6: Appeler la fonction en `dryRun` sur une seule requête**

Dans un second terminal — récupère d'abord ta clé anon dans Settings → API :

```bash
curl -s -X POST 'http://127.0.0.1:54321/functions/v1/collect-france-travail' \
  -H "Authorization: Bearer <TA_CLE_ANON>" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"backfill","dryRun":true,"queryIds":[1]}' | head -c 3000
```

Expected : un JSON avec `"dryRun": true`, `"runId": null`, une entrée dans `queries` portant `unit_label: "ft:local:react"` et un `total_available` non nul, et jusqu'à 3 offres dans `preview`.

**Inspecte le `preview`** : les titres, la ville et la description doivent être cohérents. C'est ici qu'on ajuste le mapper si un champ ressort vide.

- [ ] **Step 7: Vérifier qu'aucune ligne n'a été écrite**

Dans le SQL Editor :

```sql
select count(*) as offers, (select count(*) from collection_runs) as runs from offers;
```

Expected : `offers = 0`, `runs = 0`. Si ce n'est pas le cas, `dryRun` ne court-circuite pas l'écriture — corrige avant de continuer.

- [ ] **Step 8: Lancer la collecte réelle en backfill**

```bash
curl -s -X POST 'http://127.0.0.1:54321/functions/v1/collect-france-travail' \
  -H "Authorization: Bearer <TA_CLE_ANON>" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"backfill","dryRun":false}' | head -c 4000
```

Expected : `"status": "success"`, un `offersNew` de plusieurs centaines, et 19 entrées dans `queries`.

- [ ] **Step 9: Vérifier le résultat en base, et lire la télémétrie**

```sql
-- Volume et répartition
select count(*) as total, count(*) filter (where is_remote) as remote from offers;

-- Quelles requêtes rapportent, lesquelles sont tronquées
select unit_label, total_available, fetched, new_offers, truncated, error
from collection_query_results
order by new_offers desc nulls last;

-- Le score lexical à l'œuvre
select title, company_name, city, score, core_hits, red_flags, matched_terms
from offers_ranked
where red_flags = 0 and core_hits >= 1
order by score desc
limit 20;
```

C'est le premier vrai résultat utile du projet. Note les requêtes à `new_offers = 0` : ce sont les mots-clés à désactiver. Note celles à `truncated = true` : ce sont celles à découper.

- [ ] **Step 10: Vérifier l'idempotence du dédoublonnage**

Relance exactement la même commande qu'à l'étape 8, puis :

```sql
select status, offers_new, offers_updated from collection_runs order by started_at desc limit 2;
```

Expected : le run le plus récent a un `offers_new` proche de 0 et un `offers_updated` élevé. Si `offers_new` est à nouveau élevé, la contrainte unique ou l'`onConflict` ne fonctionne pas.

- [ ] **Step 11: Commit**

```bash
git add supabase/functions/collect-france-travail/index.ts supabase/config.toml
git add supabase/functions/collect-france-travail/__tests__/fixtures
git commit -m "feat(ft): orchestration de la collecte avec dryRun et isolation des erreurs par requête"
```

---

### Task 10: Déploiement de `collect-france-travail` et planification cron

**Files:**
- Modify: aucun fichier de code. Secrets et SQL exécutés sur le projet distant.

**Interfaces:**
- Consumes: la fonction validée en local (Task 9).
- Produces: la fonction déployée et un job `pg_cron` nommé `ft-daily` qui l'appelle chaque jour à 6 h en `mode: 'delta'`.

- [ ] **Step 1: Pousser les secrets vers le projet distant**

```bash
npx supabase secrets set FT_CLIENT_ID="<ton_client_id>" FT_CLIENT_SECRET="<ton_client_secret>"
npx supabase secrets list
```

Expected : les deux noms apparaissent (les valeurs sont masquées). `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectés automatiquement, ne les déclare pas.

- [ ] **Step 2: Déployer la fonction**

```bash
npm run fn:deploy:ft
```

Expected : `Deployed Functions on project <ref>: collect-france-travail`.

- [ ] **Step 3: Tester la fonction déployée en `dryRun`**

```bash
curl -s -X POST 'https://<TA_REFERENCE>.supabase.co/functions/v1/collect-france-travail' \
  -H "Authorization: Bearer <TA_CLE_ANON>" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"delta","dryRun":true,"queryIds":[1]}' | head -c 2000
```

Expected : le même JSON qu'en local. Si tu obtiens un 401, la clé anon est incorrecte ; un 500 avec « variable d'environnement manquante » signifie que les secrets n'ont pas été poussés.

- [ ] **Step 4: Stocker la clé de service dans Vault**

Dans le SQL Editor :

```sql
select vault.create_secret('<TA_CLE_SERVICE_ROLE>', 'service_key', 'Clé service_role pour les appels cron');
```

Expected : un uuid. La clé est chiffrée au repos et n'apparaîtra pas en clair dans la définition du job cron.

- [ ] **Step 5: Vérifier que les extensions cron sont bien actives**

```sql
select extname from pg_extension where extname in ('pg_cron', 'pg_net');
```

Expected : deux lignes. Si l'une manque, active-la dans Database → Extensions avant de continuer.

- [ ] **Step 6: Planifier le job quotidien**

```sql
select cron.schedule(
  'ft-daily',
  '0 6 * * *',
  $job$
  select net.http_post(
    url     := 'https://<TA_REFERENCE>.supabase.co/functions/v1/collect-france-travail',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret
                                                from vault.decrypted_secrets
                                                where name = 'service_key')),
    body    := '{"mode":"delta","trigger":"cron"}'::jsonb
  );
  $job$
);
```

Expected : un identifiant de job (entier).

- [ ] **Step 7: Vérifier le job et le déclencher une fois à la main**

```sql
select jobid, jobname, schedule, active from cron.job where jobname = 'ft-daily';
```

Expected : une ligne `active = true`.

Déclenche manuellement le corps du job pour valider la chaîne complète (remplace `<TA_REFERENCE>` comme ci-dessus) :

```sql
select net.http_post(
  url     := 'https://<TA_REFERENCE>.supabase.co/functions/v1/collect-france-travail',
  headers := jsonb_build_object(
               'Content-Type', 'application/json',
               'Authorization', 'Bearer ' || (select decrypted_secret
                                              from vault.decrypted_secrets
                                              where name = 'service_key')),
  body    := '{"mode":"delta","trigger":"cron"}'::jsonb
);
```

Puis, après une trentaine de secondes :

```sql
select trigger, mode, status, offers_new, offers_updated, started_at
from collection_runs
order by started_at desc limit 1;
```

Expected : une ligne avec `trigger = 'cron'` et `status = 'success'`. C'est la preuve que Vault, `pg_net` et la fonction déployée fonctionnent ensemble.

- [ ] **Step 8: Consigner les commandes cron dans le dépôt**

Create `supabase/cron/ft-daily.sql` avec le contenu de l'étape 6, en gardant `<TA_REFERENCE>` en placeholder explicite :

```sql
-- Job cron de la collecte France Travail. Exécuté à la main dans le SQL Editor.
-- Remplacer <TA_REFERENCE> par la référence du projet Supabase.
-- Prérequis : select vault.create_secret('<CLE_SERVICE_ROLE>', 'service_key', '...');
select cron.schedule(
  'ft-daily',
  '0 6 * * *',
  $job$
  select net.http_post(
    url     := 'https://<TA_REFERENCE>.supabase.co/functions/v1/collect-france-travail',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret
                                                from vault.decrypted_secrets
                                                where name = 'service_key')),
    body    := '{"mode":"delta","trigger":"cron"}'::jsonb
  );
  $job$
);
```

Ce fichier n'est pas une migration : il contient une référence de projet et ne doit pas s'exécuter automatiquement. Il sert de mémoire de la commande.

- [ ] **Step 9: Commit**

```bash
git add supabase/cron/ft-daily.sql
git commit -m "chore(ft): consigne le job cron quotidien de la collecte France Travail"
```

---

### Task 11: Collecte Adzuna — client, mapper et orchestration

**Files:**
- Create: `supabase/functions/collect-adzuna/client.ts`
- Create: `supabase/functions/collect-adzuna/mapper.ts`
- Create: `supabase/functions/collect-adzuna/index.ts`
- Create: `supabase/functions/collect-adzuna/__tests__/client_test.ts`
- Create: `supabase/functions/collect-adzuna/__tests__/mapper_test.ts`
- Create: `supabase/functions/collect-adzuna/__tests__/fixtures/adzuna-search-response.json`
- Create: `supabase/migrations/<ts>_seed_adzuna_queries.sql`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `NormalizedOffer`, `emptyOffer`, `SearchQueryRow`, `WINDOW_DAYS` (Task 3) ; `runCollection` (Task 8).
- Produces:
  - `const ADZUNA_PAGE_SIZE = 50`
  - `interface AdzunaConfig { appId: string; appKey: string }`
  - `buildAdzunaUrl(cfg, query, mode, page): string`
  - `fetchAllAdzunaPages(args): Promise<{ offers: unknown[]; totalAvailable: number | null; httpStatus: number }>`
  - `interface AdzunaProvenance { searchOriginInsee: string | null; searchRadiusKm: number | null }`
  - `provenanceOf(query: SearchQueryRow): AdzunaProvenance`
  - `mapAdzunaOffer(raw: unknown, provenance: AdzunaProvenance): NormalizedOffer | null`

- [ ] **Step 1: Ajouter les requêtes Adzuna en base**

```bash
npx supabase migration new seed_adzuna_queries
```

```sql
-- Adzuna : passe locale (where + distance) et passe nationale remote.
-- Le rayon est porté par radius_km comme pour France Travail ; le mapper
-- Adzuna le traduit en paramètre `distance`.
insert into search_queries (source, label, keywords, commune_insee, radius_km, published_since_days, priority) values
  ('adzuna', 'adzuna:local:react',      'React',                  '13055', 40, 3, 10),
  ('adzuna', 'adzuna:local:typescript', 'TypeScript',             '13055', 40, 3, 10),
  ('adzuna', 'adzuna:local:frontend',   'développeur front-end',  '13055', 40, 3, 20),
  ('adzuna', 'adzuna:local:fullstack',  'full stack javascript',  '13055', 40, 3, 20),
  ('adzuna', 'adzuna:remote:react',     'React télétravail',      null,  null, 3, 50),
  ('adzuna', 'adzuna:remote:nextjs',    'Next.js',                null,  null, 3, 50)
on conflict (label) do nothing;
```

Le champ `commune_insee` sert de clé de zone : le client Adzuna le traduit en `where=Marseille`, l'API Adzuna ne connaissant pas les codes INSEE. La correspondance est portée par le code, dans une table de constantes.

```bash
npm run db:push
```

Expected : `Finished supabase db push.`

- [ ] **Step 2: Écrire le test du client Adzuna**

Create `supabase/functions/collect-adzuna/__tests__/client_test.ts` :

```ts
import { assertEquals } from '@std/assert';
import { ADZUNA_PAGE_SIZE, buildAdzunaUrl, fetchAllAdzunaPages } from '../client.ts';
import type { SearchQueryRow } from '../../_shared/types.ts';

const cfg = { appId: 'app-1', appKey: 'key-1' };

const localQuery: SearchQueryRow = {
  id: 100,
  source: 'adzuna',
  label: 'adzuna:local:react',
  keywords: 'React',
  commune_insee: '13055',
  radius_km: 40,
  extra_params: {},
  published_since_days: 3,
  priority: 10,
  enabled: true,
};

const remoteQuery: SearchQueryRow = {
  ...localQuery,
  id: 101,
  label: 'adzuna:remote:react',
  commune_insee: null,
  radius_km: null,
};

Deno.test('buildAdzunaUrl cible la France et met la page dans le chemin', () => {
  const url = new URL(buildAdzunaUrl(cfg, localQuery, 'delta', 1));

  assertEquals(url.pathname, '/v1/api/jobs/fr/search/1');
  assertEquals(url.searchParams.get('app_id'), 'app-1');
  assertEquals(url.searchParams.get('app_key'), 'key-1');
  assertEquals(url.searchParams.get('what'), 'React');
  assertEquals(url.searchParams.get('results_per_page'), String(ADZUNA_PAGE_SIZE));
  assertEquals(url.searchParams.get('max_days_old'), '3');
});

Deno.test('buildAdzunaUrl traduit le code INSEE en localité connue d\'Adzuna', () => {
  const url = new URL(buildAdzunaUrl(cfg, localQuery, 'delta', 1));
  assertEquals(url.searchParams.get('where'), 'Marseille');
  assertEquals(url.searchParams.get('distance'), '40');
});

Deno.test('buildAdzunaUrl omet where et distance sur la passe nationale', () => {
  const url = new URL(buildAdzunaUrl(cfg, remoteQuery, 'delta', 1));
  assertEquals(url.searchParams.has('where'), false);
  assertEquals(url.searchParams.has('distance'), false);
});

Deno.test('buildAdzunaUrl passe à 31 jours en backfill', () => {
  const url = new URL(buildAdzunaUrl(cfg, localQuery, 'backfill', 1));
  assertEquals(url.searchParams.get('max_days_old'), '31');
});

function pagedFetch(total: number, calls: { pages: number[] }): typeof fetch {
  return ((url: string | URL) => {
    const page = Number(new URL(String(url)).pathname.split('/').pop());
    calls.pages.push(page);
    const start = (page - 1) * ADZUNA_PAGE_SIZE;
    const count = Math.max(0, Math.min(ADZUNA_PAGE_SIZE, total - start));
    const results = Array.from({ length: count }, (_, i) => ({ id: `AD-${start + i}` }));
    return Promise.resolve(
      new Response(JSON.stringify({ count: total, results }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }) as unknown as typeof fetch;
}

const noSleep = () => Promise.resolve();

Deno.test('fetchAllAdzunaPages pagine jusqu\'à épuisement de count', async () => {
  const calls = { pages: [] as number[] };
  const result = await fetchAllAdzunaPages({
    cfg,
    query: localQuery,
    mode: 'delta',
    fetchImpl: pagedFetch(120, calls),
    sleepImpl: noSleep,
  });

  assertEquals(result.offers.length, 120);
  assertEquals(result.totalAvailable, 120);
  assertEquals(calls.pages, [1, 2, 3]);
});

Deno.test('fetchAllAdzunaPages gère un résultat vide', async () => {
  const calls = { pages: [] as number[] };
  const result = await fetchAllAdzunaPages({
    cfg,
    query: localQuery,
    mode: 'delta',
    fetchImpl: pagedFetch(0, calls),
    sleepImpl: noSleep,
  });

  assertEquals(result.offers.length, 0);
  assertEquals(result.totalAvailable, 0);
});

Deno.test('fetchAllAdzunaPages réessaie après un 429', async () => {
  let seen = 0;
  const flaky = ((url: string | URL) => {
    seen += 1;
    if (seen === 1) return Promise.resolve(new Response('slow down', { status: 429 }));
    void url;
    return Promise.resolve(
      new Response(JSON.stringify({ count: 1, results: [{ id: 'AD-0' }] }), { status: 200 }),
    );
  }) as unknown as typeof fetch;

  const result = await fetchAllAdzunaPages({
    cfg,
    query: localQuery,
    mode: 'delta',
    fetchImpl: flaky,
    sleepImpl: noSleep,
  });

  assertEquals(result.offers.length, 1);
  assertEquals(seen, 2);
});
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read supabase/functions/collect-adzuna/__tests__/client_test.ts
```

Expected : FAIL — `Module not found "../client.ts"`.

- [ ] **Step 4: Écrire `client.ts`**

Create `supabase/functions/collect-adzuna/client.ts` :

```ts
import { type CollectionMode, type SearchQueryRow, WINDOW_DAYS } from '../_shared/types.ts';

const BASE = 'https://api.adzuna.com/v1/api/jobs/fr/search';

/** Maximum accepté par l'API Adzuna. */
export const ADZUNA_PAGE_SIZE = 50;
/** Garde-fou : Adzuna ne documente pas de plafond, on ne descend pas plus loin. */
const MAX_PAGES = 10;

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1_000;

/**
 * Adzuna ne connaît pas les codes INSEE : on traduit vers un nom de localité.
 * Les codes utilisés dans search_queries doivent figurer ici.
 */
const INSEE_TO_PLACE: Record<string, string> = {
  '13055': 'Marseille',
  '13001': 'Aix-en-Provence',
};

export interface AdzunaConfig {
  appId: string;
  appKey: string;
}

export function buildAdzunaUrl(
  cfg: AdzunaConfig,
  query: SearchQueryRow,
  mode: CollectionMode,
  page: number,
): string {
  const params = new URLSearchParams({
    app_id: cfg.appId,
    app_key: cfg.appKey,
    results_per_page: String(ADZUNA_PAGE_SIZE),
    max_days_old: String(WINDOW_DAYS[mode]),
    'content-type': 'application/json',
  });

  if (query.keywords) params.set('what', query.keywords);

  if (query.commune_insee) {
    const place = INSEE_TO_PLACE[query.commune_insee];
    if (!place) {
      throw new Error(
        `code INSEE ${query.commune_insee} absent de INSEE_TO_PLACE — ajoute-le dans client.ts`,
      );
    }
    params.set('where', place);
    if (query.radius_km !== null) params.set('distance', String(query.radius_km));
  }

  for (const [key, value] of Object.entries(query.extra_params ?? {})) {
    if (value !== null && value !== undefined) params.set(key, String(value));
  }

  return `${BASE}/${page}?${params.toString()}`;
}

export async function fetchAllAdzunaPages(args: {
  cfg: AdzunaConfig;
  query: SearchQueryRow;
  mode: CollectionMode;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}): Promise<{ offers: unknown[]; totalAvailable: number | null; httpStatus: number }> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const sleep = args.sleepImpl ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const collected: unknown[] = [];
  let totalAvailable: number | null = null;
  let httpStatus = 200;

  for (let page = 1; page <= MAX_PAGES; page++) {
    let payload: { count?: number; results?: unknown[] } | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetchImpl(buildAdzunaUrl(args.cfg, args.query, args.mode, page));
      httpStatus = response.status;

      if (response.status === 429) {
        if (attempt === MAX_RETRIES) {
          throw new Error(`Adzuna : quota dépassé (429) après ${MAX_RETRIES} essais`);
        }
        await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt));
        continue;
      }
      if (!response.ok) {
        throw new Error(`Adzuna a répondu ${response.status} — ${args.query.label}`);
      }

      payload = await response.json() as { count?: number; results?: unknown[] };
      break;
    }

    if (!payload) throw new Error('Adzuna : boucle de retry épuisée');

    if (typeof payload.count === 'number') totalAvailable = payload.count;
    const results = payload.results ?? [];
    collected.push(...results);

    if (results.length === 0) break;
    if (totalAvailable !== null && collected.length >= totalAvailable) break;
  }

  return { offers: collected, totalAvailable, httpStatus };
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read supabase/functions/collect-adzuna/__tests__/client_test.ts
```

Expected : `ok | 7 passed`.

- [ ] **Step 6: Capturer une vraie réponse Adzuna dans une fixture**

```bash
mkdir -p supabase/functions/collect-adzuna/__tests__/fixtures
curl -s "https://api.adzuna.com/v1/api/jobs/fr/search/1?app_id=$ADZUNA_APP_ID&app_key=$ADZUNA_APP_KEY&what=React&where=Marseille&distance=40&results_per_page=10&max_days_old=31&content-type=application/json" \
  -o supabase/functions/collect-adzuna/__tests__/fixtures/adzuna-search-response.json

deno eval "const d = JSON.parse(await Deno.readTextFile('supabase/functions/collect-adzuna/__tests__/fixtures/adzuna-search-response.json')); console.log('count:', d.count); console.log(Object.keys(d.results[0]).join('\n'));"
```

Expected : un `count` numérique et la liste des champs. Compare-la aux champs utilisés à l'étape 8 (`id`, `title`, `description`, `redirect_url`, `created`, `company.display_name`, `location.display_name`, `location.area`, `latitude`, `longitude`, `contract_type`, `contract_time`, `salary_min`, `salary_max`). **Si un nom diffère, corrige mapper et test ensemble.**

- [ ] **Step 7: Écrire le test du mapper Adzuna**

Create `supabase/functions/collect-adzuna/__tests__/mapper_test.ts` :

```ts
import { assertEquals, assertNotEquals } from '@std/assert';
import { mapAdzunaOffer } from '../mapper.ts';

const provenance = { searchOriginInsee: '13055', searchRadiusKm: 40 };

const sample = {
  id: '4812345678',
  title: 'Développeur React / TypeScript',
  description: 'Rejoignez notre équipe pour développer en React et TypeScript à Marseille.',
  redirect_url: 'https://www.adzuna.fr/details/4812345678',
  created: '2026-09-02T08:00:00Z',
  company: { display_name: 'ACME SAS' },
  location: {
    display_name: 'Marseille, Bouches-du-Rhône',
    area: ['France', "Provence-Alpes-Côte d'Azur", 'Bouches-du-Rhône', 'Marseille'],
  },
  latitude: 43.2965,
  longitude: 5.3698,
  contract_type: 'permanent',
  contract_time: 'full_time',
  salary_min: 45000,
  salary_max: 55000,
};

Deno.test('mapAdzunaOffer projette les champs de base', () => {
  const offer = mapAdzunaOffer(sample, provenance)!;

  assertEquals(offer.source, 'adzuna');
  assertEquals(offer.external_id, '4812345678');
  assertEquals(offer.title, 'Développeur React / TypeScript');
  assertEquals(offer.company_name, 'ACME SAS');
  assertEquals(offer.url, 'https://www.adzuna.fr/details/4812345678');
  assertEquals(offer.city, 'Marseille, Bouches-du-Rhône');
  assertEquals(offer.latitude, 43.2965);
  assertEquals(offer.published_at, '2026-09-02T08:00:00.000Z');
});

Deno.test('mapAdzunaOffer traduit contract_type en vocabulaire France Travail', () => {
  assertEquals(mapAdzunaOffer(sample, provenance)!.contract_type, 'CDI');

  const cdd = { ...sample, contract_type: 'contract' };
  assertEquals(mapAdzunaOffer(cdd, provenance)!.contract_type, 'CDD');

  const unknown = { ...sample, contract_type: undefined };
  assertEquals(mapAdzunaOffer(unknown, provenance)!.contract_type, null);
});

Deno.test('mapAdzunaOffer compose une fourchette de salaire lisible', () => {
  assertEquals(mapAdzunaOffer(sample, provenance)!.salary_raw, '45000 - 55000 EUR/an');

  const single = { ...sample, salary_max: undefined };
  assertEquals(mapAdzunaOffer(single, provenance)!.salary_raw, '45000 EUR/an');

  const none = { ...sample, salary_min: undefined, salary_max: undefined };
  assertEquals(mapAdzunaOffer(none, provenance)!.salary_raw, null);
});

Deno.test('mapAdzunaOffer déduit le département de la hiérarchie de zones', () => {
  // area = [pays, région, département, ville] : le département est en position 2.
  assertEquals(mapAdzunaOffer(sample, provenance)!.department, 'Bouches-du-Rhône');

  const shallow = { ...sample, location: { display_name: 'France', area: ['France'] } };
  assertEquals(mapAdzunaOffer(shallow, provenance)!.department, null);
});

Deno.test('mapAdzunaOffer détecte le télétravail dans le texte', () => {
  const remote = { ...sample, description: 'Poste 100% en télétravail.' };
  assertEquals(mapAdzunaOffer(remote, provenance)!.is_remote, true);
  assertEquals(mapAdzunaOffer(sample, provenance)!.is_remote, false);
});

Deno.test('mapAdzunaOffer renvoie null sur un payload inutilisable', () => {
  assertEquals(mapAdzunaOffer({}, provenance), null);
  assertEquals(mapAdzunaOffer({ id: '1' }, provenance), null);
  assertEquals(mapAdzunaOffer(null, provenance), null);
});

Deno.test('la fixture Adzuna réelle se mappe sans exception', async () => {
  const text = await Deno.readTextFile(
    new URL('./fixtures/adzuna-search-response.json', import.meta.url),
  );
  const payload = JSON.parse(text) as { results: unknown[] };

  const mapped = payload.results.map((r) => mapAdzunaOffer(r, provenance));

  assertNotEquals(mapped.length, 0);
  for (const offer of mapped) {
    assertNotEquals(offer, null);
    assertNotEquals(offer!.external_id, '');
  }
});
```

- [ ] **Step 8: Écrire `mapper.ts`**

Create `supabase/functions/collect-adzuna/mapper.ts` :

```ts
import { emptyOffer, type NormalizedOffer, type SearchQueryRow } from '../_shared/types.ts';

export interface AdzunaProvenance {
  searchOriginInsee: string | null;
  searchRadiusKm: number | null;
}

const REMOTE_HINTS = ['télétravail', 'teletravail', 'remote', 'à distance', 'full remote'];

/** Adzuna a son propre vocabulaire de contrat : on le ramène à celui de France Travail. */
const CONTRACT_MAP: Record<string, string> = {
  permanent: 'CDI',
  contract: 'CDD',
};

interface AdzunaRawOffer {
  id?: string | number;
  title?: string;
  description?: string;
  redirect_url?: string;
  created?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  latitude?: number;
  longitude?: number;
  contract_type?: string;
  contract_time?: string;
  salary_min?: number;
  salary_max?: number;
}

export function provenanceOf(query: SearchQueryRow): AdzunaProvenance {
  return { searchOriginInsee: query.commune_insee, searchRadiusKm: query.radius_km };
}

function salaryLabel(min: number | undefined, max: number | undefined): string | null {
  if (min && max) return `${min} - ${max} EUR/an`;
  if (min) return `${min} EUR/an`;
  if (max) return `jusqu'à ${max} EUR/an`;
  return null;
}

export function mapAdzunaOffer(
  raw: unknown,
  provenance: AdzunaProvenance,
): NormalizedOffer | null {
  if (!raw || typeof raw !== 'object') return null;
  const ad = raw as AdzunaRawOffer;
  if (ad.id === undefined || ad.id === null || !ad.title) return null;

  const offer = emptyOffer('adzuna', String(ad.id), ad.title);

  offer.description = ad.description ?? null;
  offer.company_name = ad.company?.display_name ?? null;
  offer.url = ad.redirect_url ?? null;
  offer.contract_type = ad.contract_type ? CONTRACT_MAP[ad.contract_type] ?? null : null;
  offer.contract_label = ad.contract_time ?? null;
  offer.salary_raw = salaryLabel(ad.salary_min, ad.salary_max);

  offer.city = ad.location?.display_name ?? null;
  offer.latitude = ad.latitude ?? null;
  offer.longitude = ad.longitude ?? null;
  // area est hiérarchique : [pays, région, département, ville].
  const area = ad.location?.area ?? [];
  offer.department = area.length >= 3 ? area[2] : null;

  if (ad.created) {
    const date = new Date(ad.created);
    offer.published_at = Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const haystack = `${ad.title} ${ad.description ?? ''}`.toLowerCase();
  offer.is_remote = REMOTE_HINTS.some((hint) => haystack.includes(hint));

  offer.search_origin_insee = provenance.searchOriginInsee;
  offer.search_radius_km = provenance.searchRadiusKm;
  offer.raw = raw;

  return offer;
}
```

- [ ] **Step 9: Lancer les tests du mapper**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read supabase/functions/collect-adzuna/__tests__/mapper_test.ts
```

Expected : `ok | 7 passed`.

- [ ] **Step 10: Écrire `index.ts`**

Comme pour France Travail, le point d'entrée ne contient aucune orchestration : il délègue à `runCollection` (Task 8). C'est la raison pour laquelle ce fichier fait 60 lignes et non 130 — et pourquoi corriger la télémétrie ou l'isolation des erreurs se fera désormais en un seul endroit.

Create `supabase/functions/collect-adzuna/index.ts` :

```ts
import { createDbClient } from '../_shared/db.ts';
import { runCollection } from '../_shared/run-collection.ts';
import type { CollectionMode, RunTrigger, SearchQueryRow } from '../_shared/types.ts';
import { fetchAllAdzunaPages } from './client.ts';
import { mapAdzunaOffer, provenanceOf } from './mapper.ts';

interface RequestBody {
  mode?: CollectionMode;
  trigger?: RunTrigger;
  dryRun?: boolean;
  queryIds?: number[];
}

/** Lecture de l'environnement : propre à Deno, donc hors de _shared/. */
function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`variable d'environnement manquante : ${name}`);
  return value;
}

Deno.serve(async (req) => {
  const body: RequestBody = await req.json().catch(() => ({}));
  const mode: CollectionMode = body.mode === 'backfill' ? 'backfill' : 'delta';
  const trigger: RunTrigger = body.trigger === 'cron' ? 'cron' : 'manual';
  const dryRun = body.dryRun === true;

  const db = createDbClient({
    url: requireEnv('SUPABASE_URL'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  });

  const cfg = {
    appId: requireEnv('ADZUNA_APP_ID'),
    appKey: requireEnv('ADZUNA_APP_KEY'),
  };

  let queryBuilder = db
    .from('search_queries')
    .select('*')
    .eq('source', 'adzuna')
    .eq('enabled', true)
    .order('priority', { ascending: true });

  if (body.queryIds?.length) queryBuilder = queryBuilder.in('id', body.queryIds);

  const { data, error } = await queryBuilder;
  if (error) {
    return Response.json({ error: `lecture des requêtes : ${error.message}` }, { status: 500 });
  }

  const queries = (data ?? []) as SearchQueryRow[];
  if (queries.length === 0) {
    return Response.json({ error: 'aucune requête active pour adzuna' }, { status: 400 });
  }

  const summary = await runCollection({
    db,
    source: 'adzuna',
    mode,
    trigger,
    dryRun,
    queries,
    fetchAll: (query) => fetchAllAdzunaPages({ cfg, query, mode }),
    map: (raw, query) => mapAdzunaOffer(raw, provenanceOf(query)),
  });

  return Response.json(summary);
});
```

- [ ] **Step 11: Déclarer la fonction dans `config.toml`**

Append to `supabase/config.toml` :

```toml
[functions.collect-adzuna]
verify_jwt = true
```

- [ ] **Step 12: Lancer toute la suite et typechecker**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm test
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno check --config supabase/functions/deno.json supabase/functions/collect-adzuna/index.ts
```

Expected : tous les tests passent, aucune erreur de type.

- [ ] **Step 13: Valider en local en `dryRun` puis en réel**

Avec `npm run fn:serve` actif dans un autre terminal :

```bash
curl -s -X POST 'http://127.0.0.1:54321/functions/v1/collect-adzuna' \
  -H "Authorization: Bearer <TA_CLE_ANON>" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"backfill","dryRun":true}' | head -c 3000
```

Expected : `"dryRun": true`, 6 entrées dans `queries`, des offres dans `preview`. Inspecte les titres et villes.

Puis en réel :

```bash
curl -s -X POST 'http://127.0.0.1:54321/functions/v1/collect-adzuna' \
  -H "Authorization: Bearer <TA_CLE_ANON>" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"backfill","dryRun":false}' | head -c 3000
```

Expected : `"status": "success"` et un `offersNew` non nul.

- [ ] **Step 14: Vérifier la cohabitation des deux sources**

```sql
select source, count(*) as offres, min(published_at) as plus_ancienne
from offers group by source order by source;

-- Le score lexical doit fonctionner à l'identique sur les deux sources
select source, title, city, score, core_hits, red_flags
from offers_ranked
where red_flags = 0 and core_hits >= 1
order by score desc limit 20;
```

Expected : deux lignes dans le premier résultat (`adzuna` et `france_travail`), et un classement mixant les deux sources dans le second. Si Adzuna n'apparaît pas dans `offers_ranked`, c'est que les descriptions Adzuna sont vides — vérifie le mapping de `description`.

- [ ] **Step 15: Commit**

```bash
git add supabase/functions/collect-adzuna supabase/config.toml supabase/migrations
git commit -m "feat(adzuna): client, mapper et orchestration de la collecte Adzuna"
```

---

### Task 12: Déploiement Adzuna et planification cron

**Files:**
- Create: `supabase/cron/adzuna-daily.sql`

**Interfaces:**
- Consumes: la fonction Adzuna validée en local (Task 11), le secret Vault `service_key` (Task 10).
- Produces: la fonction déployée et un job `adzuna-daily` à 6 h 30.

- [ ] **Step 1: Pousser les secrets Adzuna**

```bash
npx supabase secrets set ADZUNA_APP_ID="<ton_app_id>" ADZUNA_APP_KEY="<ta_app_key>"
npx supabase secrets list
```

Expected : les quatre secrets (2 France Travail + 2 Adzuna) apparaissent.

- [ ] **Step 2: Déployer la fonction**

```bash
npm run fn:deploy:adzuna
```

Expected : `Deployed Functions on project <ref>: collect-adzuna`.

- [ ] **Step 3: Tester la fonction déployée**

```bash
curl -s -X POST 'https://<TA_REFERENCE>.supabase.co/functions/v1/collect-adzuna' \
  -H "Authorization: Bearer <TA_CLE_ANON>" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"delta","dryRun":true}' | head -c 2000
```

Expected : un JSON équivalent à celui obtenu en local.

- [ ] **Step 4: Planifier le job, décalé d'une demi-heure**

Dans le SQL Editor :

```sql
select cron.schedule(
  'adzuna-daily',
  '30 6 * * *',
  $job$
  select net.http_post(
    url     := 'https://<TA_REFERENCE>.supabase.co/functions/v1/collect-adzuna',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret
                                                from vault.decrypted_secrets
                                                where name = 'service_key')),
    body    := '{"mode":"delta","trigger":"cron"}'::jsonb
  );
  $job$
);
```

Les deux jobs sont décalés pour ne pas se disputer les connexions à la base.

- [ ] **Step 5: Vérifier les deux jobs**

```sql
select jobname, schedule, active from cron.job order by jobname;
```

Expected : `adzuna-daily` à `30 6 * * *` et `ft-daily` à `0 6 * * *`, tous deux `active = true`.

- [ ] **Step 6: Consigner le job dans le dépôt**

Create `supabase/cron/adzuna-daily.sql` avec le contenu de l'étape 4, en gardant `<TA_REFERENCE>` en placeholder explicite et en ajoutant en tête :

```sql
-- Job cron de la collecte Adzuna. Exécuté à la main dans le SQL Editor.
-- Décalé de 30 min après ft-daily pour ne pas concurrencer les connexions.
-- Remplacer <TA_REFERENCE> par la référence du projet Supabase.
```

- [ ] **Step 7: Vérifier l'état final du système**

```sql
-- Les deux sources collectent
select source, count(*) as offres, max(last_seen_at) as vu_le
from offers group by source;

-- Les runs récents, toutes sources
select source, trigger, mode, status, offers_new, offers_updated, started_at
from collection_runs order by started_at desc limit 10;

-- Requêtes improductives : candidates à la désactivation
select sq.label, sum(cqr.new_offers) as total_new, count(*) as runs
from search_queries sq
join collection_query_results cqr on cqr.query_id = sq.id
group by sq.label
having coalesce(sum(cqr.new_offers), 0) = 0
order by sq.label;

-- Requêtes tronquées : candidates au découpage
select distinct unit_label, total_available
from collection_query_results where truncated
order by total_available desc;
```

- [ ] **Step 8: Commit final**

```bash
git add supabase/cron
git commit -m "chore(adzuna): déploiement et job cron quotidien décalé"
```

---

## Après ce plan

Le système collecte quotidiennement depuis deux API, sans intervention, PC éteint. Les offres sont scorées contre le lexique dérivé du CV, consultables en une requête SQL.

**Deux actions de réglage à mener après quelques jours de collecte**, à partir des requêtes de la Task 12 Step 7 :

1. **Désactiver les requêtes improductives** — `update search_queries set enabled = false where label = '…'`
2. **Traiter les requêtes tronquées** — réduire `published_since_days`, ou découper la requête en ajoutant un `typeContrat` dans `extra_params`

**Le plan B** (scrapers Free-Work, Codeur.com, Collective.work, Kicklox) s'appuiera sur `_shared/` tel qu'écrit ici : `NormalizedOffer`, `upsertOffers`, `startRun` / `finishRun` / `recordQueryResult` sont conçus pour être appelés depuis Node sans modification.

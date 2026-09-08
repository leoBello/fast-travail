# Plan B — Scrapers Free-Work et Collective.work

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter deux sources scrapées — Free-Work et Collective.work — à la
collecte quotidienne, en réutilisant sans les dupliquer la boucle
`runCollection`, l'upsert, la télémétrie et le classifieur de télétravail déjà
livrés par le plan A.

**Architecture :** Deux scripts Deno locaux, hors Edge Functions, sous
`supabase/functions/_scrapers/`. Chacun lit ses réglages de politesse dans la
table `sources`, vérifie `robots.txt` à l'exécution, parcourt une surface de
**listing paginé** (jamais un sitemap, jamais une page de présentation), et
n'extrait **aucun champ du HTML de présentation** : Free-Work fournit un
`JobPosting` en JSON-LD sur chaque page d'offre, Collective.work un payload
`__NEXT_DATA__` complet sur chaque page de listing. Les deux produisent le
`NormalizedOffer` du plan A et passent par `upsertOffers`, donc par la
provenance et la confiance par requête.

**Tech Stack :** Deno 2.9.6 · TypeScript · `@supabase/supabase-js` v2 via
l'import map existante · `jsr:@std/assert` · aucune dépendance nouvelle, aucun
navigateur sans tête, aucun parseur DOM.

**Reconnaissance de référence :** ce plan a été écrit **après** capture des
pages réelles, comme le ROADMAP l'exigeait. Les fixtures sont dans la branche,
commitées avant la première tâche :

| Fixture | Ce qu'elle prouve |
|---|---|
| `free-work/__tests__/fixtures/listing-react-sort-date-page1.html` | Le listing trié par date rend 16 liens d'offre et 16 `<time>` décroissants |
| `free-work/__tests__/fixtures/listing-react-page1.html` | Le même listing en tri par pertinence : dates **non** décroissantes (08/27 à 09/07) |
| `free-work/__tests__/fixtures/job-contractor-tjm.html` | Offre freelance : `CONTRACTOR`, `jobLocationType: TELECOMMUTE`, TJM 450 EUR/DAY, ville « France », pas de code postal |
| `free-work/__tests__/fixtures/job-permanent-salary.html` | Offre CDI : `FULL_TIME`, pas de `jobLocationType`, 40 000 EUR/YEAR, ville « Antibes », région PACA, pas de code postal |
| `collective/__tests__/fixtures/jobs-fr-page1.html` | 30 missions en JSON complet, `pagination.total = 6544` |
| `_shared/__tests__/fixtures/robots-free-work.txt` | Le vrai `robots.txt`, avec ses interdictions nominatives |
| `_shared/__tests__/fixtures/robots-collective.txt` | Le vrai `robots.txt` de Collective |

Toutes sont sous `supabase/functions/_scrapers/`.

---

## Ce que la reconnaissance a mesuré, et ce qu'elle a démenti

Tout ce qui suit a été mesuré le 2026-09-08 contre les sites réels. Ces nombres
gouvernent la conception ; aucun n'est supposé.

### Trois affirmations du dépôt sont fausses

**1. « Les quatre publient un sitemap XML, retenu comme surface de collecte. »**
Faux pour trois des quatre. `codeur.com/sitemap.xml` répond **404**. Le sitemap
de Kicklox (Yoast) contient des pages de présentation, **zéro mission**. Celui
de Collective.work contient 85 URL — blog, solutions, mentions légales — et
**pas une seule offre** ; son board `/jobs` n'y figure même pas. Seul Free-Work
publie un sitemap d'offres, `sitemap-job-postings-fr--tech.xml`, 7 276 URL — et
**sans aucun `lastmod`** : il ne peut donc pas servir de delta, et l'utiliser
coûterait 7 276 requêtes pour découvrir ce qu'un listing trié par date donne en
deux. **Le sitemap est écarté comme surface de collecte pour toutes les
sources.**

**2. « Kicklox : le robots.txt autorise la collecte. »** Exact, et sans objet :
il n'y a **rien à collecter**. Le site WordPress ne publie aucune mission, et
`app.kicklox.com/missions` rend une coquille SPA de 3 955 octets derrière un
login. Kicklox est **hors d'atteinte**, pas seulement hors périmètre.

**3. « Free-Work banne Wget et HTTrack. »** Exact, et sans conséquence :
mesuré, l'agent utilisateur honnête `fast-travail/0.1 (veille personnelle)`
obtient **HTTP 200** sur les deux sources, listing comme détail. Aucune
usurpation de navigateur n'est nécessaire, et aucune n'est autorisée par ce
plan.

### Ce que valent les sources, en offres réellement exploitables

| Source | Volume mesuré | Description reçue | Verdict |
|---|---|---|---|
| **Free-Work** | React **196**, TypeScript **180**, JavaScript **330**, Next.js 19, Marseille **66**, Aix-en-Provence **140** | **Entière** : 577 à 7 752 caractères, médiane 1 176 | **Retenue.** Meilleure source du projet pour ce profil |
| **Collective.work** | **6 544** missions, 30 par page ; sur 300 mesurées : 12 TypeScript, 3 React, 4 REMOTE, 11 en PACA dont 8 à Aix | **Entière**, en JSON | **Retenue.** Signal mince mais propre |
| Codeur.com | 4 slugs front-end sur 103 projets | — | **Écartée** : flux WordPress / Webflow / SEO / marketing, hors profil |
| Kicklox | aucune mission publique | — | **Écartée** : impossible |

**Free-Work vaut à elle seule les deux API réunies sur ce profil.** 196 offres
React contre **5** chez Adzuna et **0** chez France Travail — et là où Adzuna
tronque à 500 caractères, Free-Work rend la description entière. **Le lexique
de compétences y redevient le filtre principal**, comme sur France Travail, et
non un aveugle comme sur Adzuna.

Free-Work est aussi la **première source à porter un TJM structuré** : 8 offres
sur 12 échantillonnées ont un `baseSalary`, en `DAY` (450, 565, 250 EUR) ou en
`YEAR`. La colonne `rate_raw`, jusqu'ici toujours nulle, cesse d'être morte.

### Les surfaces, et pourquoi ce sont celles-là

**Free-Work : `/fr/tech-it/jobs/<facette>?sort=date&page=N`.** Les facettes sont
des **segments de chemin**, pas des paramètres : `/jobs/react`,
`/jobs/typescript`, `/jobs/next-js`, `/jobs/javascript`, `/jobs/marseille`,
`/jobs/aix-en-provence` — les six existent et ont été mesurées. Le tri par date
est un vrai paramètre serveur : `<option value="date" selected>` revient dans la
réponse, et les 16 `<time>` de la page sont alors décroissants (09/07 ×14 puis
09/06 ×2), alors qu'en tri par pertinence ils vont de 08/27 à 09/07. **C'est ce
tri qui rend le delta possible.**

Chaque page d'offre porte deux blocs `application/ld+json`, dont un `JobPosting`
complet : `title`, `description` (HTML entier), `datePosted`, `employmentType`,
`hiringOrganization`, `jobLocation`, `baseSalary`, `validThrough`, parfois
`jobLocationType`.

**Collective.work : `/jobs/fr?page=N`.** Le `__NEXT_DATA__` de chaque page
contient `props.pageProps.dehydratedState.queries[0].state.data.results`, soit
30 projets entiers plus `pagination.total`. **Les filtres d'URL sont ignorés par
le serveur** — mesuré : `?query=react`, `?skills=REACT` et
`?workPreferences=REMOTE` renvoient tous les trois exactement la page 1 non
filtrée, `total = 6544` inchangé. Le filtrage est purement client. Seul `?page=N`
est honoré (`from` passe à 30, 1 470, 3 570…).

L'ordre est **décroissant par date malgré `sort: "Relevance"`** : page 1 au
2026-09-07, page 50 au 2026-09-01, page 120 au 2026-07-07, page 219 en 2024. Une
fenêtre de 31 jours coûte donc une cinquantaine de pages, pas 219.

### Ce que le HTML ne donnera jamais

Le listing Free-Work est du Vue SSR à classes `data-v-*` volatiles, avec des
titres découpés par des `<span class="fw-text-highlight-part">` autour des termes
recherchés. **En extraire un champ serait construire une dette.** Le listing ne
sert donc qu'à deux choses, toutes deux robustes : récolter les
`href="/fr/tech-it/job-mission/…"`, et lire les `<time>` comme **signal
d'arrêt**. Si le `<time>` disparaissait un jour, la collecte irait au plafond de
pages : dégradée, jamais fausse.

---

## Décisions de conception, déjà tranchées

**1. Les scrapers tournent en Deno, pas en Node.** Le ROADMAP écrit « scripts
Node locaux ». La contrainte réelle, elle, était « hors Edge Functions » — 2 s de
CPU, pas de Chromium —, et elle est satisfaite par un script Deno local. Node
coûterait un second outillage : `verify` ne couvre que Deno, l'import map
`@supabase/supabase-js` n'existe que côté Deno (le paquet n'est pas dans
`node_modules`), et les imports de `_shared/` portent l'extension `.ts` que Node
refuse hors mode expérimental. **Un seul outillage, une seule porte `verify`.**
Corriger le ROADMAP fait partie de la dernière tâche.

**2. Le code vit sous `supabase/functions/_scrapers/`, et c'est mesuré, pas
esthétique.** Ce placement a été essayé avant d'être retenu :

- `deno fmt` **formate le HTML**. Vérifié : quatre fixtures placées sous
  `scrapers/` à la racine font échouer `fmt:check` avec « Found 4 not formatted
  files ».
- L'exclusion `**/__tests__/fixtures/**` de `supabase/functions/deno.json` est
  résolue **relativement au dossier du fichier de configuration** : elle ne
  couvre donc rien hors de `supabase/functions/`.
- Sous `supabase/functions/_scrapers/`, les mêmes fixtures passent : `fmt:check`
  rend « Checked 28 files », inchangé. `deno lint`, `deno check` et
  `deno test supabase/functions/` ramassent le nouveau code **sans qu'aucun
  script npm ne change**.
- Le préfixe `_` est la convention que le CLI Supabase applique déjà à
  `_shared/` : ces dossiers ne sont pas des fonctions. Et `config.toml` déclare
  ses fonctions nommément (`[functions.collect-france-travail]`,
  `[functions.collect-adzuna]`) : rien sous `_scrapers/` ne peut être déployé par
  accident.

**3. Aucun champ stocké ne vient du HTML de présentation.** Free-Work : JSON-LD
`JobPosting`. Collective : `__NEXT_DATA__`. Le HTML n'est lu que pour les URL et
pour le signal d'arrêt. C'est ce qui rend ces scrapers durables là où un scraper
de sélecteurs CSS casse au premier redesign.

**4. La politesse est une ligne en base, pas une constante.** La table `sources`
porte déjà `min_delay_ms`, `max_pages_per_run`, `user_agent`, `enabled`,
`robots_allows`, `robots_checked_at`, `last_run_at`, `last_status` — huit
colonnes créées au plan A et **jamais utilisées**. Ce plan les fait vivre.
Ralentir une source ou la suspendre devient un `UPDATE`, jamais un
redéploiement. C'est le cinquième axe réglable, dans l'esprit des quatre autres.

**5. `robots.txt` est vérifié à chaque exécution, pas une fois pour toutes.** Une
autorisation constatée en septembre ne vaut rien en décembre. Le scraper lit
`robots.txt`, vérifie que le chemin visé est permis pour **son** agent
utilisateur, écrit `robots_allows` et `robots_checked_at`, et **s'arrête** si la
réponse est non.

**6. L'agent utilisateur est honnête et ne porte aucune adresse.** Mesuré :
`fast-travail/0.1 (veille personnelle)` — la valeur déjà semée dans `sources` —
obtient HTTP 200 partout. Aucune usurpation de navigateur, et **aucune donnée
personnelle dans un en-tête** : l'adresse du propriétaire n'a rien à faire dans
une requête sortante.

**7. Le delta ne refetche pas ce qu'il connaît déjà.** Une passe Free-Work
complète sur la facette `react` coûterait 196 pages de détail par jour, soit dix
minutes de requêtes polies pour ne rien apprendre. Le point d'entrée précharge
donc les `external_id` déjà en base pour la source, et le client ne récupère le
détail que des URL inconnues. **Conséquence à assumer et à écrire** : sur les
sources scrapées, `seen_count` compte des **passes de découverte**, pas des
observations, et `last_seen_at` d'une offre déjà connue ne bouge plus. Le mode
`backfill` refetche tout et sert à corriger un mapper.

**8. Une source scrapée = une ligne `sources`, une ou plusieurs lignes
`search_queries`.** Free-Work reçoit six requêtes, une par facette, portant
`extra_params.facet`. Collective n'ayant **aucun filtre serveur** n'en reçoit
qu'une, `collective:all`, dont l'unité de collecte est le balayage entier. La
télémétrie par requête reste donc lisible dans `collection_query_results`, comme
pour les deux API.

**9. La confiance par requête s'applique telle quelle.** Les facettes Free-Work
`react`, `typescript`, `next-js` et `javascript` sont **ancrées à une
technologie** au sens de `search_queries.trust = 'anchored'` : Free-Work indexe
des compétences déclarées, pas du texte libre, et il n'y a pas de collision
« réacteur » — le site expose `/jobs/react` et `/jobs/reactor` comme deux
facettes distinctes. Les facettes de ville et `collective:all` restent `net`.

---

## Global Constraints

Non négociables, elles lient chaque tâche.

- **`verify` doit passer** :
  `export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify`
  Zéro erreur de lint, zéro erreur de formatage, zéro test rouge.
- **Aucun contournement du linter.** Interdits : `deno-lint-ignore`,
  `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `as any`,
  `as unknown as X` hors fichiers de test, `--no-check`, `--force`. Si le linter
  signale quelque chose, **le code change, pas la règle**.
- **`supabase/functions/_shared/` reste runtime-neutre** : aucun `Deno.*`, aucun
  import `node:`. Contrôle, qui doit ne rien renvoyer :
  `grep -rn "Deno\.\|node:" supabase/functions/_shared/ --include=*.ts | grep -v "__tests__"`
- **`supabase/functions/_scrapers/` est soumis à la même règle, `main.ts`
  excepté.** Seuls les points d'entrée lisent l'environnement. Contrôle :
  `grep -rn "Deno\." supabase/functions/_scrapers/ --include=*.ts | grep -v "__tests__" | grep -v "main.ts"`
  doit ne rien renvoyer.
- **Toute évolution de schéma passe par une migration**, données de référence
  comprises, avec des inserts idempotents (`on conflict do nothing`).
- **Interroger la base** : `npx supabase db query --linked "<SQL>"`. `--linked`
  est obligatoire. SQL sur **une seule ligne** — une requête multi-ligne se fait
  manger par le shell et revient en « query: Too small ».
- **Une migration vide s'applique « avec succès » en ne faisant rien.** Vérifier
  la taille du fichier avant `db push`, et l'effet en base après.
- **`git status` avant tout `db push`** : une copie de travail peut mentir.
- **Deno est hors du PATH** : toute commande `deno` ou `npm run` doit être
  précédée, **dans le même appel shell**, de
  `export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links"`.
  L'état du shell ne persiste pas d'un appel à l'autre.
- **Aucun secret dans le dépôt.** La référence de projet `zbpbuzoukldbzfbbikhw`
  n'en est pas un ; les clés, si.
- **Politesse, non négociable** : délai minimal entre deux requêtes lu dans
  `sources.min_delay_ms` (3 000 ms par défaut), plafond de pages lu dans
  `sources.max_pages_per_run`, `robots.txt` vérifié à chaque exécution, agent
  utilisateur honnête, **aucun parallélisme** vers une même source.
- **Ne jamais réécrire une fixture pour faire passer un test.** Une fixture est
  la capture verbatim d'une page réelle. Si le code ne la satisfait pas, c'est le
  code qui a tort. Recapturer une fixture est un acte délibéré, annoncé dans le
  rapport, avec la commande `curl` employée.

---

## Protocole d'exécution

Ce plan s'exécute **en sous-agents pilotés** : un sous-agent frais par tâche,
suivi d'une revue, avant de passer à la suivante. Un sous-agent démarre sans
contexte — ce protocole est ce qui lui dit comment travailler.

### Skills que chaque sous-agent d'implémentation DOIT charger

| Skill | Quand | Pourquoi ici |
|---|---|---|
| `test-driven-development` | Tâches 2 à 8 — tout code TypeScript | Le plan donne le test avant l'implémentation. Le skill impose de le voir échouer d'abord, ce qui prouve qu'il teste quelque chose |
| `verification-before-completion` | **Toutes les tâches** | Interdit d'annoncer « fait » sans la sortie de commande à l'appui. Les `Expected:` de ce plan sont cette preuve |
| `systematic-debugging` | Dès qu'un test échoue autrement qu'attendu, ou qu'une page réelle surprend | Les tâches 6 et 8 confrontent le code aux vrais sites : c'est là que les surprises arrivent |
| `receiving-code-review` | À la réception du retour de revue | Vérifier techniquement chaque remarque avant de l'appliquer |

### Revue après chaque tâche

1. **Conformité au plan** — les fichiers annoncés existent-ils, les tests
   annoncés passent-ils, les `Expected:` sont-ils tenus ? Une tâche dont un
   `Expected:` n'est pas vérifié est rejetée.
2. **Revue de code** via `/code-review` sur le diff de la tâche.

**Critères de rejet propres à ce plan :**

- Un champ stocké extrait du HTML de présentation plutôt que du JSON-LD ou du
  `__NEXT_DATA__` → **rejet**.
- Un agent utilisateur usurpant un navigateur, ou portant une adresse
  personnelle → **rejet**.
- Un délai de politesse en dur dans le code plutôt que lu dans `sources` →
  **rejet**.
- Une requête réseau émise dans un test → **rejet**. Les tests lisent des
  fixtures et injectent `fetch`.
- Une fixture modifiée pour faire passer un test → **rejet**.
- Un `Deno.*` hors d'un `main.ts` → **rejet**.
- Un `catch` qui avale une erreur sans l'écrire dans `collection_query_results`
  → **rejet**.
- Un contournement du linter, ou un `npm run verify` non lancé → **rejet**.

### Ordre non négociable

La **tâche 1** (migration) précède tout : chacune des suivantes lit ces lignes
en base. Les **tâches 2 à 4** forment le socle que 6 à 11 consomment, et la
**tâche 5** (géographie) n'en dépend pas — elle peut se faire à tout moment
avant la tâche 7.

**Free-Work (6, 7, 9) avant Collective (10, 11)** : Free-Work porte la plus
grande valeur mesurée, et son chemin — listing puis pages de détail — est le
plus exigeant. Collective réutilise ensuite un socle éprouvé.

La **tâche 8** (lanceur commun) se place entre les deux mappers Free-Work et le
premier point d'entrée, et non après les deux sources : l'écrire une fois les
deux `main.ts` livrés reviendrait à dupliquer d'abord pour factoriser ensuite.
Elle est donc écrite avant d'avoir un second client à servir, ce qui est
assumé — sa forme est dictée par une contrainte connue, pas devinée.

---

## Structure de fichiers

```
supabase/functions/_scrapers/
├── _shared/
│   ├── http.ts                     # PoliteFetcher : délai, timeout, backoff, UA
│   ├── robots.ts                   # parseRobots + allows
│   ├── html.ts                     # extractJsonLd, extractNextData, htmlToText
│   ├── sources.ts                  # réglages, robots, marquage de run
│   ├── main-runner.ts              # déroulé de lancement commun aux deux
│   └── __tests__/
│       ├── http_test.ts
│       ├── robots_test.ts
│       ├── html_test.ts
│       ├── sources_test.ts
│       ├── main-runner_test.ts
│       └── fixtures/               # robots.txt réels (déjà capturés)
├── free-work/
│   ├── client.ts                   # listing paginé + pages de détail
│   ├── mapper.ts                   # JSON-LD JobPosting -> NormalizedOffer
│   ├── main.ts                     # définition Free-Work (seul à lire l'env)
│   └── __tests__/
│       ├── client_test.ts
│       ├── mapper_test.ts
│       └── fixtures/               # 4 pages réelles (déjà capturées)
└── collective/
    ├── client.ts                   # pages de listing, payload __NEXT_DATA__
    ├── mapper.ts                   # projet -> NormalizedOffer
    ├── main.ts                     # définition Collective (seul à lire l'env)
    └── __tests__/
        ├── client_test.ts
        ├── mapper_test.ts
        └── fixtures/               # 1 page réelle (déjà capturée)
```

Fichiers existants modifiés : `supabase/functions/_shared/departments.ts`
(tâche 5), `package.json` (tâche 9), `docs/ETAT.md`, `docs/ROADMAP.md`,
`CLAUDE.md` (tâche 12).

---

### Task 1: Migration — les deux sources scrapées et leurs requêtes

**Files:**
- Create: `supabase/migrations/20260908060000_seed_scraper_sources_and_queries.sql`

**Interfaces:**
- Consumes: les tables `sources` et `search_queries` du plan A, plus la colonne
  `search_queries.trust` créée par `20260908033042_query_provenance_and_trust.sql`.
- Produces: deux lignes `sources` (`free_work`, `collective`) et sept lignes
  `search_queries` que les tâches 6 à 10 lisent. La clé de facette est
  `extra_params->>'facet'` — **seule** source de vérité du segment d'URL.

- [ ] **Step 1: Écrire la migration**

```sql
-- Plan B : Free-Work et Collective.work, les deux seules sources scrapées dont
-- la reconnaissance du 2026-09-08 a montré une surface exploitable.
--
-- Écartées, et pourquoi : Codeur.com rend 4 slugs front-end sur 103 projets,
-- dans un flux WordPress / Webflow / SEO / marketing que le ROADMAP exclut du
-- profil. Kicklox n'a AUCUNE mission publique — son sitemap Yoast ne contient
-- que des pages de présentation et app.kicklox.com/missions est une coquille
-- SPA de 3 955 octets derrière un login.
--
-- Volumes mesurés le 2026-09-08 sur Free-Work : React 196, TypeScript 180,
-- JavaScript 330, Next.js 19, Marseille 66, Aix-en-Provence 140 — contre
-- 5 offres React chez Adzuna et 0 chez France Travail. Collective : 6 544
-- missions, 30 par page, ordre décroissant par date.

insert into sources (key, kind, base_url, enabled, min_delay_ms, max_pages_per_run, user_agent)
values
  ('free_work',  'scrape', 'https://www.free-work.com',   true, 3000, 15,
   'fast-travail/0.1 (veille personnelle)'),
  ('collective', 'scrape', 'https://www.collective.work', true, 3000, 60,
   'fast-travail/0.1 (veille personnelle)')
on conflict (key) do nothing;

comment on column sources.max_pages_per_run is
  'Plafond de pages de LISTING par requête. Free-Work : 15 pages de 16 offres couvrent la facette react entière (196 offres). Collective : 60 pages de 30 couvrent 31 jours (page 55 mesurée au 2026-08-08).';

-- Free-Work : une requête par facette. La facette est un SEGMENT DE CHEMIN
-- (/fr/tech-it/jobs/react), pas un paramètre : elle vit dans extra_params.facet
-- et nulle part ailleurs. `keywords` reste null pour qu'il n'y ait pas deux
-- vérités sur le même fait.
--
-- trust : react, typescript et next-js sont des tags de compétence DÉCLARÉS par
-- l'annonceur, pas une correspondance de texte — d'où 'anchored'. Contrairement
-- à Adzuna, il n'y a pas de collision « réacteur » : le site expose /jobs/react
-- et /jobs/reactor comme deux facettes distinctes. javascript reste 'net' : 330
-- offres, c'est un filet. Les facettes de ville aussi.
--
-- À noter, et c'est ce qui rend ce classement peu risqué : sur Free-Work la
-- description est reçue ENTIÈRE (médiane 1 176 caractères), donc le lexique de
-- compétences voit tout et core_hits fonctionne. `trust` y est un complément,
-- pas un sauvetage comme chez Adzuna.
--
-- priority croissante = ordre d'exécution. L'upsert écrase, donc la dernière
-- requête à voir une offre fixe ses colonnes — sans effet ici, le mapper
-- Free-Work ne dépendant d'aucun champ de la requête, mais la convention du
-- dépôt est respectée : les plus informatives en dernier.
insert into search_queries (source, label, keywords, extra_params, priority, trust) values
  ('free_work', 'fw:local:marseille',  null, '{"facet":"marseille"}'::jsonb,       10, 'net'),
  ('free_work', 'fw:local:aix',        null, '{"facet":"aix-en-provence"}'::jsonb, 20, 'net'),
  ('free_work', 'fw:skill:javascript', null, '{"facet":"javascript"}'::jsonb,      30, 'net'),
  ('free_work', 'fw:skill:next-js',    null, '{"facet":"next-js"}'::jsonb,         40, 'anchored'),
  ('free_work', 'fw:skill:typescript', null, '{"facet":"typescript"}'::jsonb,      50, 'anchored'),
  ('free_work', 'fw:skill:react',      null, '{"facet":"react"}'::jsonb,           60, 'anchored')
on conflict (label) do nothing;

-- Collective : AUCUN filtre serveur. Mesuré le 2026-09-08 : ?query=react,
-- ?skills=REACT et ?workPreferences=REMOTE rendent tous les trois la page 1 non
-- filtrée, total = 6544 inchangé. Le filtrage est purement client. L'unité de
-- collecte est donc le balayage entier, et il n'y a qu'une requête.
insert into search_queries (source, label, keywords, extra_params, priority, trust) values
  ('collective', 'collective:all', null, '{}'::jsonb, 10, 'net')
on conflict (label) do nothing;
```

- [ ] **Step 2: Vérifier le fichier avant de l'appliquer**

```bash
git status --short && wc -c supabase/migrations/20260908060000_seed_scraper_sources_and_queries.sql
```

Expected : la copie de travail est celle qu'on croit, et la taille est
franchement non nulle. **Une migration vide s'applique « avec succès » en ne
faisant rien.**

- [ ] **Step 3: Appliquer**

```bash
npx supabase db push
```

Expected : la migration `20260908060000` est listée comme appliquée.

- [ ] **Step 4: Vérifier l'effet en base**

Une commande par ligne, SQL sur une seule ligne :

```bash
npx supabase db query --linked "select key, kind, base_url, min_delay_ms, max_pages_per_run, enabled from sources where kind = 'scrape' order by key;"
npx supabase db query --linked "select source, label, extra_params->>'facet' as facet, trust, priority from search_queries where source in ('free_work','collective') order by source, priority;"
npx supabase db query --linked "select count(*) as sans_facette from search_queries where source = 'free_work' and extra_params->>'facet' is null;"
npx supabase db query --linked "select count(*) as offres_scrapees from offers where source in ('free_work','collective');"
```

Expected :
- 2 lignes `sources`, `kind = 'scrape'`, `min_delay_ms = 3000`,
  `max_pages_per_run` 15 et 60.
- 7 lignes `search_queries` : 6 `free_work` avec une facette non nulle chacune,
  1 `collective`. `trust` = `anchored` pour `next-js`, `typescript`, `react` ;
  `net` pour les quatre autres.
- `sans_facette` = **0**.
- `offres_scrapees` = **0** — rien n'est encore collecté, c'est normal.

Le rapport cite ces nombres. **Un nombre non cité est un nombre non mesuré.**

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260908060000_seed_scraper_sources_and_queries.sql
git commit -m "feat(db): deux sources scrapees et leurs sept requetes"
```

**Ce qu'il ne faut PAS faire :** ne pas toucher aux vues, ni au lexique, ni aux
requêtes des deux API. Ne pas créer de colonne : les huit colonnes de politesse
existent déjà, elles étaient simplement mortes.

---

### Task 2: Socle réseau — politesse et robots.txt

**Files:**
- Create: `supabase/functions/_scrapers/_shared/http.ts`
- Create: `supabase/functions/_scrapers/_shared/robots.ts`
- Test: `supabase/functions/_scrapers/_shared/__tests__/http_test.ts`
- Test: `supabase/functions/_scrapers/_shared/__tests__/robots_test.ts`
- Fixtures (déjà présentes, ne pas modifier) :
  `_scrapers/_shared/__tests__/fixtures/robots-free-work.txt`,
  `_scrapers/_shared/__tests__/fixtures/robots-collective.txt`

**Interfaces:**
- Consumes: rien du projet.
- Produces:
  - `class PoliteFetcher { constructor(opts: PoliteFetchOptions); get(url: string): Promise<FetchedPage>; get requestCount(): number }`
  - `interface FetchedPage { url: string; status: number; body: string }`
  - `function parseRobots(text: string, userAgent: string): RobotsRules`
  - `interface RobotsRules { allows(path: string): boolean }`

**Contrainte de runtime :** aucun `Deno.*` dans ces deux fichiers. `fetch`,
`AbortSignal` et `setTimeout` sont des API web, disponibles partout.

- [ ] **Step 1: Écrire les tests de `http.ts` (rouge d'abord)**

`supabase/functions/_scrapers/_shared/__tests__/http_test.ts` :

```ts
import { assertEquals, assertRejects } from '@std/assert';
import { PoliteFetcher } from '../http.ts';

/** Fabrique un fetch factice qui rend les réponses données, dans l'ordre. */
function fakeFetch(responses: Array<{ status: number; body: string }>) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const impl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    calls.push({ url: String(input), headers });
    const next = responses.shift();
    if (!next) throw new Error('fetch appelé plus de fois que prévu');
    return Promise.resolve(new Response(next.body, { status: next.status }));
  };
  return { impl, calls };
}

Deno.test('envoie l’agent utilisateur configuré', async () => {
  const { impl, calls } = fakeFetch([{ status: 200, body: 'ok' }]);
  const fetcher = new PoliteFetcher({
    userAgent: 'fast-travail/0.1 (veille personnelle)',
    minDelayMs: 3000,
    fetchImpl: impl,
    sleep: () => Promise.resolve(),
  });

  const page = await fetcher.get('https://example.test/a');

  assertEquals(page.status, 200);
  assertEquals(page.body, 'ok');
  assertEquals(calls[0].headers['user-agent'], 'fast-travail/0.1 (veille personnelle)');
});

Deno.test('n’attend pas avant la première requête, attend avant la seconde', async () => {
  const { impl } = fakeFetch([
    { status: 200, body: 'a' },
    { status: 200, body: 'b' },
  ]);
  const slept: number[] = [];
  let clock = 1_000;
  const fetcher = new PoliteFetcher({
    userAgent: 'ua',
    minDelayMs: 3000,
    fetchImpl: impl,
    sleep: (ms) => {
      slept.push(ms);
      clock += ms;
      return Promise.resolve();
    },
    now: () => clock,
  });

  await fetcher.get('https://example.test/a');
  clock += 500; // 500 ms se sont écoulées entre les deux appels
  await fetcher.get('https://example.test/b');

  assertEquals(slept, [2500]);
  assertEquals(fetcher.requestCount, 2);
});

Deno.test('réessaie sur 429 puis rend la réponse suivante', async () => {
  const { impl, calls } = fakeFetch([
    { status: 429, body: '' },
    { status: 200, body: 'enfin' },
  ]);
  const fetcher = new PoliteFetcher({
    userAgent: 'ua',
    minDelayMs: 0,
    fetchImpl: impl,
    sleep: () => Promise.resolve(),
  });

  const page = await fetcher.get('https://example.test/a');

  assertEquals(page.body, 'enfin');
  assertEquals(calls.length, 2);
});

Deno.test('ne réessaie pas sur 404 et remonte l’erreur', async () => {
  const { impl, calls } = fakeFetch([{ status: 404, body: '' }]);
  const fetcher = new PoliteFetcher({
    userAgent: 'ua',
    minDelayMs: 0,
    fetchImpl: impl,
    sleep: () => Promise.resolve(),
  });

  await assertRejects(
    () => fetcher.get('https://example.test/absente'),
    Error,
    '404',
  );
  assertEquals(calls.length, 1);
});

Deno.test('abandonne après le nombre de tentatives configuré', async () => {
  const { impl, calls } = fakeFetch([
    { status: 503, body: '' },
    { status: 503, body: '' },
  ]);
  const fetcher = new PoliteFetcher({
    userAgent: 'ua',
    minDelayMs: 0,
    maxRetries: 1,
    fetchImpl: impl,
    sleep: () => Promise.resolve(),
  });

  await assertRejects(() => fetcher.get('https://example.test/a'), Error, '503');
  assertEquals(calls.length, 2);
});
```

- [ ] **Step 2: Lancer les tests et les voir échouer**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read --allow-env supabase/functions/_scrapers/
```

Expected : FAIL — `Module not found "…/http.ts"`.

- [ ] **Step 3: Écrire `http.ts`**

```ts
// Runtime-neutre : aucun Deno.* ici. fetch, AbortSignal et setTimeout sont des
// API web. La configuration — agent utilisateur, délai, plafonds — arrive en
// paramètre, jamais de l'environnement : elle vient de la table `sources`.

export interface PoliteFetchOptions {
  /** Agent utilisateur honnête. Jamais un navigateur usurpé, jamais d'adresse personnelle. */
  userAgent: string;
  /** Délai minimal entre deux requêtes vers la même source, en millisecondes. */
  minDelayMs: number;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface FetchedPage {
  url: string;
  status: number;
  body: string;
}

/**
 * Ce dont un client de source a besoin, et rien de plus. C'est CE type que les
 * clients acceptent en paramètre, jamais la classe : un test peut alors injecter
 * un double de trois lignes, sans réseau et sans horloge.
 */
export interface PageFetcher {
  get(url: string): Promise<FetchedPage>;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;

/** Codes qui méritent une seconde chance : surcharge passagère, pas erreur de requête. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Client HTTP poli : un seul en vol à la fois, délai minimal respecté entre deux
 * requêtes, agent utilisateur annoncé, temporisation et reprise sur surcharge.
 *
 * Le délai n'est PAS appliqué avant la première requête : il sépare deux
 * requêtes, il ne retarde pas le démarrage.
 */
export class PoliteFetcher implements PageFetcher {
  readonly #userAgent: string;
  readonly #minDelayMs: number;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #now: () => number;
  #lastRequestAt: number | null = null;
  #requestCount = 0;

  constructor(opts: PoliteFetchOptions) {
    this.#userAgent = opts.userAgent;
    this.#minDelayMs = opts.minDelayMs;
    this.#timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.#fetch = opts.fetchImpl ?? fetch;
    this.#sleep = opts.sleep ?? defaultSleep;
    this.#now = opts.now ?? Date.now;
  }

  /** Nombre de requêtes réellement émises, tentatives comprises. Sert à la télémétrie. */
  get requestCount(): number {
    return this.#requestCount;
  }

  async get(url: string): Promise<FetchedPage> {
    let lastStatus = 0;

    for (let attempt = 0; attempt <= this.#maxRetries; attempt++) {
      await this.#waitTurn();

      const response = await this.#fetch(url, {
        headers: {
          'user-agent': this.#userAgent,
          'accept-language': 'fr',
        },
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
      this.#requestCount++;
      lastStatus = response.status;

      if (response.ok) {
        return { url, status: response.status, body: await response.text() };
      }

      // Le corps est lu même sur erreur : sans cela le flux reste ouvert.
      await response.text();

      if (!RETRYABLE_STATUS.has(response.status)) break;
      if (attempt < this.#maxRetries) {
        await this.#sleep(this.#minDelayMs * (attempt + 1));
      }
    }

    throw new Error(`HTTP ${lastStatus} sur ${url}`);
  }

  async #waitTurn(): Promise<void> {
    if (this.#lastRequestAt !== null) {
      const remaining = this.#minDelayMs - (this.#now() - this.#lastRequestAt);
      if (remaining > 0) await this.#sleep(remaining);
    }
    this.#lastRequestAt = this.#now();
  }
}
```

- [ ] **Step 4: Lancer les tests de `http.ts`**

Même commande qu'au step 2. Expected : 5 tests verts.

- [ ] **Step 5: Écrire les tests de `robots.ts` (rouge d'abord)**

`supabase/functions/_scrapers/_shared/__tests__/robots_test.ts` :

```ts
import { assert, assertEquals } from '@std/assert';
import { parseRobots } from '../robots.ts';

const UA = 'fast-travail/0.1 (veille personnelle)';

const freeWork = await Deno.readTextFile(
  new URL('./fixtures/robots-free-work.txt', import.meta.url),
);
const collective = await Deno.readTextFile(
  new URL('./fixtures/robots-collective.txt', import.meta.url),
);

Deno.test('Free-Work : les surfaces de collecte sont autorisées', () => {
  const rules = parseRobots(freeWork, UA);
  assert(rules.allows('/fr/tech-it/jobs/react'));
  assert(rules.allows('/fr/tech-it/jobs/react?sort=date&page=2'));
  assert(rules.allows('/fr/tech-it/job-mission/developpeur-python/x'));
});

Deno.test('Free-Work : les chemins interdits le restent', () => {
  const rules = parseRobots(freeWork, UA);
  assertEquals(rules.allows('/login'), false);
  assertEquals(rules.allows('/logout'), false);
  assertEquals(rules.allows('/fw-deals'), false);
});

Deno.test('Free-Work : le groupe nominatif l’emporte sur le groupe étoile', () => {
  // Le fichier réel interdit tout à Wget nommément. C'est la preuve que la
  // sélection de groupe fonctionne, et pas seulement la lecture des règles.
  const rules = parseRobots(freeWork, 'Wget/1.21');
  assertEquals(rules.allows('/fr/tech-it/jobs/react'), false);
});

Deno.test('Collective : /jobs autorisé, /style-guide interdit', () => {
  const rules = parseRobots(collective, UA);
  assert(rules.allows('/jobs/fr'));
  assert(rules.allows('/jobs/fr?page=2'));
  assertEquals(rules.allows('/style-guide'), false);
});

Deno.test('les jokers et la règle du motif le plus long sont respectés', () => {
  // Forme réelle rencontrée sur codeur.com : tout ce qui porte une query string
  // est interdit, SAUF la pagination.
  const rules = parseRobots(
    ['User-agent: *', 'Disallow: /*?*', 'Allow: /*?page=*'].join('\n'),
    UA,
  );
  assert(rules.allows('/projects'));
  assert(rules.allows('/projects?page=2'));
  assertEquals(rules.allows('/projects?q=react'), false);
});

Deno.test('une ancre $ n’autorise que la correspondance exacte', () => {
  // Motif réel courant (`Disallow: /*.pdf$`). Sans traitement du `$` sur le
  // motif BRUT, l'échappement en fait un dollar littéral et la règle devient
  // inapplicable : le site serait ignoré au lieu d'être respecté.
  const rules = parseRobots(['User-agent: *', 'Disallow: /prive$'].join('\n'), UA);
  assertEquals(rules.allows('/prive'), false);
  assert(rules.allows('/prive/sous-page'));
});

Deno.test('à longueur de motif égale, Allow l’emporte', () => {
  const rules = parseRobots(['User-agent: *', 'Disallow: /abc', 'Allow: /a*c'].join('\n'), UA);
  assert(rules.allows('/abc'));
});

Deno.test('plusieurs User-agent empilés forment un seul groupe', () => {
  const rules = parseRobots(
    ['User-agent: AutreBot', 'User-agent: fast-travail', 'Disallow: /prive'].join('\n'),
    UA,
  );
  assertEquals(rules.allows('/prive'), false);
});

Deno.test('une directive étrangère ferme la liste d’agents', () => {
  // Sans cette règle, le groupe d'AutreBot fusionnerait avec le nôtre.
  const rules = parseRobots(
    ['User-agent: fast-travail', 'Crawl-delay: 5', 'User-agent: AutreBot', 'Disallow: /prive']
      .join('\n'),
    UA,
  );
  assert(rules.allows('/prive'));
});

Deno.test('un fichier vide autorise tout', () => {
  assert(parseRobots('', UA).allows('/quoi-que-ce-soit'));
});
```

- [ ] **Step 6: Voir échouer, puis écrire `robots.ts`**

```ts
// Runtime-neutre. Lecture de robots.txt selon la convention usuelle :
// groupe d'agent le plus spécifique, puis motif le plus long, Allow gagnant à
// égalité de longueur.

export interface RobotsRules {
  /** `path` inclut la query string éventuelle, ex. `/jobs/fr?page=2`. */
  allows(path: string): boolean;
}

interface Rule {
  allow: boolean;
  pattern: RegExp;
  /** Longueur du motif brut : c'est elle qui arbitre, pas l'ordre des lignes. */
  length: number;
}

function toRegExp(pattern: string): RegExp {
  // Le `$` de fin d'ancrage doit être détecté sur le motif BRUT, avant tout
  // échappement : une fois échappé il vaut les deux caractères `\$` et n'est
  // plus reconnaissable comme ancre. Le `?` est échappé comme les autres
  // métacaractères — dans un robots.txt c'est un caractère littéral de query
  // string, jamais un quantificateur.
  const endAnchored = pattern.endsWith('$');
  const body = endAnchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
  const withWildcards = escaped.replace(/\*/g, '.*');
  const anchored = endAnchored ? `^${withWildcards}$` : `^${withWildcards}`;
  return new RegExp(anchored);
}

/**
 * `userAgent` est notre agent complet ; un groupe s'applique si son jeton
 * apparaît dedans (insensible à la casse), conformément à l'usage. Le groupe
 * `*` ne sert que si aucun groupe nominatif ne correspond.
 */
export function parseRobots(text: string, userAgent: string): RobotsRules {
  const ua = userAgent.toLowerCase();
  const named: Rule[] = [];
  const wildcard: Rule[] = [];

  let currentTargets: 'named' | 'wildcard' | null = null;
  let expectingAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;

    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      if (!expectingAgents) currentTargets = null;
      expectingAgents = true;
      if (value === '*') currentTargets = currentTargets === 'named' ? 'named' : 'wildcard';
      else if (ua.includes(value.toLowerCase())) currentTargets = 'named';
      continue;
    }

    // Toute directive autre qu'un user-agent ferme la liste d'agents : un
    // `Sitemap:` ou un `Crawl-delay:` glissé entre deux `User-agent:` ne doit
    // pas faire fusionner deux groupes.
    expectingAgents = false;
    if (field !== 'allow' && field !== 'disallow') continue;
    if (currentTargets === null) continue;
    // « Disallow: » vide veut dire « rien n'est interdit » : on ignore la ligne.
    if (field === 'disallow' && value === '') continue;

    const rule: Rule = { allow: field === 'allow', pattern: toRegExp(value), length: value.length };
    if (currentTargets === 'named') named.push(rule);
    else wildcard.push(rule);
  }

  const rules = named.length > 0 ? named : wildcard;

  return {
    allows(path: string): boolean {
      let best: Rule | null = null;
      for (const rule of rules) {
        if (!rule.pattern.test(path)) continue;
        if (best === null || rule.length > best.length) best = rule;
        else if (rule.length === best.length && rule.allow) best = rule;
      }
      return best === null ? true : best.allow;
    },
  };
}
```

- [ ] **Step 7: Lancer tous les tests du socle**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read --allow-env supabase/functions/_scrapers/
```

Expected : 15 tests verts (5 pour `http.ts`, 10 pour `robots.ts`).

- [ ] **Step 8: Porte complète et commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
git add supabase/functions/_scrapers/_shared/
git commit -m "feat(scrapers): socle reseau, politesse et lecture de robots.txt"
```

Expected : `verify` vert de bout en bout.

**Ce qu'il ne faut PAS faire :** aucune requête réseau dans un test. Aucun
`Deno.*` dans `http.ts` ni `robots.ts` — `Deno.readTextFile` dans le **test** est
normal, c'est du code de test. Ne pas ajouter de dépendance : pas de parseur
robots tiers.

---

### Task 3: Socle d'extraction — JSON-LD, `__NEXT_DATA__` et texte

**Files:**
- Create: `supabase/functions/_scrapers/_shared/html.ts`
- Test: `supabase/functions/_scrapers/_shared/__tests__/html_test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `function extractJsonLd(html: string): unknown[]`
  - `function extractNextData(html: string): unknown`  (rend `null` si absent)
  - `function htmlToText(html: string): string`

Ces trois fonctions sont **le seul endroit** où l'on touche à du HTML. Tout le
reste du code travaille sur des objets.

- [ ] **Step 1: Écrire les tests (rouge d'abord)**

`supabase/functions/_scrapers/_shared/__tests__/html_test.ts` :

```ts
import { assert, assertEquals } from '@std/assert';
import { extractJsonLd, extractNextData, htmlToText } from '../html.ts';

const jobPage = await Deno.readTextFile(
  new URL('../../free-work/__tests__/fixtures/job-contractor-tjm.html', import.meta.url),
);
const listPage = await Deno.readTextFile(
  new URL('../../collective/__tests__/fixtures/jobs-fr-page1.html', import.meta.url),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

Deno.test('extractJsonLd trouve le JobPosting de la page réelle', () => {
  const blocks = extractJsonLd(jobPage);
  assertEquals(blocks.length, 2);

  const posting = blocks.filter(isRecord).find((b) => b['@type'] === 'JobPosting');
  assert(posting, 'aucun bloc JobPosting');
  assertEquals(posting['title'], 'Developpeur React/Node/NestJS - Anglais courant obligatoire');
});

Deno.test('extractJsonLd ignore un bloc illisible sans perdre les autres', () => {
  const html = [
    '<script type="application/ld+json">{ ceci n’est pas du JSON }</script>',
    '<script type="application/ld+json">{"@type":"JobPosting"}</script>',
  ].join('');
  const blocks = extractJsonLd(html);
  assertEquals(blocks.length, 1);
});

Deno.test('extractNextData rend le payload de la page réelle', () => {
  const data = extractNextData(listPage);
  assert(isRecord(data));
  assert(isRecord(data['props']));
});

Deno.test('extractNextData rend null quand la balise est absente', () => {
  assertEquals(extractNextData('<html><body>rien</body></html>'), null);
});

Deno.test('htmlToText retire les balises et rétablit les coupures', () => {
  const html = '<h3>Contexte</h3><p>Une phrase.</p><ul><li>un</li><li>deux</li></ul>';
  assertEquals(htmlToText(html), 'Contexte\nUne phrase.\nun\ndeux');
});

Deno.test('htmlToText traite <br> comme une coupure', () => {
  assertEquals(htmlToText('a<br />b<br>c'), 'a\nb\nc');
});

Deno.test('htmlToText décode les entités en une seule passe', () => {
  assertEquals(htmlToText('R&amp;D &lt;tag&gt; l&#39;équipe &nbsp;fin'), "R&D <tag> l'équipe fin");
  // Une passe unique : &amp;lt; rend le TEXTE &lt;, jamais le caractère <.
  assertEquals(htmlToText('&amp;lt;'), '&lt;');
});
```

- [ ] **Step 2: Voir échouer, puis écrire `html.ts`**

```ts
// Runtime-neutre. Le SEUL fichier du projet qui manipule du HTML.
//
// Aucun parseur DOM : les deux sources exposent leurs données dans un bloc
// JSON (JSON-LD pour Free-Work, __NEXT_DATA__ pour Collective), et le HTML
// n'est jamais lu pour en extraire un champ. Charger un parseur pour découper
// deux balises <script> coûterait une dépendance sans rien apporter.

const JSON_LD = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const NEXT_DATA = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;

/** Blocs `application/ld+json` de la page, dans l'ordre. Un bloc illisible est ignoré. */
export function extractJsonLd(html: string): unknown[] {
  const blocks: unknown[] = [];
  for (const match of html.matchAll(JSON_LD)) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      // Un bloc mal formé ne doit pas faire perdre les autres : une page peut
      // en porter plusieurs, et un seul nous intéresse.
      continue;
    }
  }
  return blocks;
}

/** Payload `__NEXT_DATA__` de la page, ou null s'il est absent ou illisible. */
export function extractNextData(html: string): unknown {
  const match = html.match(NEXT_DATA);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

const BLOCK_END = /<\/(?:p|div|li|ul|ol|h[1-6]|tr|table|section)>|<br\s*\/?>/gi;
const TAG = /<[^>]*>/g;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;

/**
 * Point de code -> caractère, ou `undefined` hors de la plage Unicode.
 *
 * `String.fromCodePoint` lève une `RangeError` au-delà de `0x10FFFF`, et la
 * regex ci-dessus accepte n'importe quelle suite de chiffres : une description
 * contenant `&#1114112;` ferait donc échouer la collecte ENTIÈRE, alors qu'un
 * bloc JSON-LD mal formé, lui, dégrade proprement. Une entité hors plage est
 * laissée telle quelle, comme une entité nommée inconnue.
 */
function codePointToChar(codePoint: number): string | undefined {
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return undefined;
  return String.fromCodePoint(codePoint);
}

/**
 * HTML -> texte brut, pour une description destinée à `offers.description`.
 *
 * La colonne alimente `description_tsv` et le lexique de compétences : y
 * laisser des balises polluerait la recherche plein texte et ferait matcher un
 * terme sur un nom d'attribut. Les coupures de bloc deviennent des retours à la
 * ligne pour que le texte reste lisible dans la sélection quotidienne.
 *
 * Le décodage se fait en UNE passe : décoder deux fois transformerait le texte
 * littéral `&amp;lt;` en `<`, ce qui est faux.
 */
export function htmlToText(html: string): string {
  return html
    .replace(BLOCK_END, '\n')
    .replace(TAG, ' ')
    .replace(ENTITY, (whole, name: string) => {
      if (name.startsWith('#x') || name.startsWith('#X')) {
        return codePointToChar(parseInt(name.slice(2), 16)) ?? whole;
      }
      if (name.startsWith('#')) return codePointToChar(parseInt(name.slice(1), 10)) ?? whole;
      return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replace(/[ 	 ]+/g, ' ')
    .replace(/ *\n *(?:\n *)*/g, '\n')
    .trim();
}
```

- [ ] **Step 3: Tests verts, porte complète, commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
git add supabase/functions/_scrapers/_shared/html.ts supabase/functions/_scrapers/_shared/__tests__/html_test.ts
git commit -m "feat(scrapers): extraction JSON-LD, __NEXT_DATA__ et texte"
```

Expected : `verify` vert, 7 tests de plus.

**Ce qu'il ne faut PAS faire :** ne pas ajouter de parseur DOM. Ne pas écrire de
sélecteur CSS. Ne pas « améliorer » `htmlToText` avec une passe supplémentaire de
décodage.

---

### Task 4: Réglages de source — lire `sources`, écrire l'état

**Files:**
- Create: `supabase/functions/_scrapers/_shared/sources.ts`
- Test: `supabase/functions/_scrapers/_shared/__tests__/sources_test.ts`

**Interfaces:**
- Consumes: `DbClient` de `_shared/db.ts`, `SourceKey` et `RunStatus` de
  `_shared/types.ts`, la table `sources` peuplée à la tâche 1.
- Produces:
  - `interface SourceSettings { key: SourceKey; baseUrl: string; minDelayMs: number; maxPagesPerRun: number; userAgent: string; enabled: boolean }`
  - `function loadSourceSettings(db: DbClient, key: SourceKey): Promise<SourceSettings>`
  - `function recordRobotsCheck(db: DbClient, key: SourceKey, allows: boolean): Promise<void>`
  - `function markSourceRun(db: DbClient, key: SourceKey, status: RunStatus): Promise<void>`
  - `function loadKnownExternalIds(db: DbClient, source: SourceKey): Promise<Set<string>>`

- [ ] **Step 1: Écrire les tests (rouge d'abord)**

`supabase/functions/_scrapers/_shared/__tests__/sources_test.ts` :

```ts
import { assertEquals, assertRejects } from '@std/assert';
import type { DbClient } from '../../../_shared/db.ts';
import {
  loadKnownExternalIds,
  loadSourceSettings,
  markSourceRun,
  recordRobotsCheck,
} from '../sources.ts';

interface FakeRow {
  base_url: string | null;
  min_delay_ms: number;
  max_pages_per_run: number;
  user_agent: string | null;
  enabled: boolean;
}

/** Double de test : `as unknown as DbClient` est le moyen normal ici (voir CLAUDE.md). */
function fakeDb(row: FakeRow | null, updates: Array<Record<string, unknown>> = []) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: () => Promise.resolve({ data: row, error: null }),
              };
            },
          };
        },
        update(values: Record<string, unknown>) {
          updates.push(values);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    },
  } as unknown as DbClient;
}

Deno.test('loadSourceSettings rend les réglages de politesse', async () => {
  const db = fakeDb({
    base_url: 'https://www.free-work.com',
    min_delay_ms: 3000,
    max_pages_per_run: 15,
    user_agent: 'fast-travail/0.1 (veille personnelle)',
    enabled: true,
  });

  const settings = await loadSourceSettings(db, 'free_work');

  assertEquals(settings.baseUrl, 'https://www.free-work.com');
  assertEquals(settings.minDelayMs, 3000);
  assertEquals(settings.maxPagesPerRun, 15);
  assertEquals(settings.userAgent, 'fast-travail/0.1 (veille personnelle)');
  assertEquals(settings.enabled, true);
});

Deno.test('loadSourceSettings refuse une source absente', async () => {
  await assertRejects(() => loadSourceSettings(fakeDb(null), 'free_work'), Error, 'free_work');
});

Deno.test('loadSourceSettings refuse une source sans base_url', async () => {
  const db = fakeDb({
    base_url: null,
    min_delay_ms: 3000,
    max_pages_per_run: 15,
    user_agent: 'ua',
    enabled: true,
  });
  await assertRejects(() => loadSourceSettings(db, 'free_work'), Error, 'base_url');
});

Deno.test('recordRobotsCheck écrit le verdict et sa date', async () => {
  const updates: Array<Record<string, unknown>> = [];
  await recordRobotsCheck(fakeDb(null, updates), 'free_work', true);

  assertEquals(updates.length, 1);
  assertEquals(updates[0].robots_allows, true);
  assertEquals(typeof updates[0].robots_checked_at, 'string');
});

Deno.test('markSourceRun écrit le statut et la date', async () => {
  const updates: Array<Record<string, unknown>> = [];
  await markSourceRun(fakeDb(null, updates), 'collective', 'success');

  assertEquals(updates[0].last_status, 'success');
  assertEquals(typeof updates[0].last_run_at, 'string');
});

/** Double paginé : rend les lots donnés, un par appel à `range`. */
function fakePagedDb(batches: string[][], ranges: Array<[number, number]> = []) {
  let call = 0;
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                range(from: number, to: number) {
                  ranges.push([from, to]);
                  const rows = (batches[call++] ?? []).map((id) => ({ external_id: id }));
                  return Promise.resolve({ data: rows, error: null });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as DbClient;
}

Deno.test('loadKnownExternalIds rend l’ensemble des identifiants connus', async () => {
  const ranges: Array<[number, number]> = [];
  const known = await loadKnownExternalIds(fakePagedDb([['a', 'b', 'c']], ranges), 'free_work');

  assertEquals([...known].sort(), ['a', 'b', 'c']);
  assertEquals(ranges, [[0, 999]], 'un lot incomplet arrête la pagination');
});

Deno.test('loadKnownExternalIds pagine au-delà du plafond de supabase-js', async () => {
  // supabase-js plafonne une réponse à 1 000 lignes : sans pagination, une source
  // dépassant ce volume verrait ses offres au-delà considérées comme inconnues,
  // et le scraper repaierait chaque jour leur page de détail.
  const first = Array.from({ length: 1000 }, (_, i) => `id-${i}`);
  const ranges: Array<[number, number]> = [];
  const known = await loadKnownExternalIds(fakePagedDb([first, ['dernier']], ranges), 'free_work');

  assertEquals(known.size, 1001);
  assertEquals(ranges, [[0, 999], [1000, 1999]]);
});
```

- [ ] **Step 2: Voir échouer, puis écrire `sources.ts`**

```ts
// Runtime-neutre : la configuration vient de la BASE, pas de l'environnement.
// Les huit colonnes de politesse de `sources` ont été créées au plan A et n'ont
// jamais servi. Elles servent ici : ralentir une source ou la suspendre est un
// UPDATE, jamais un redéploiement.

import type { DbClient } from '../../_shared/db.ts';
import type { RunStatus, SourceKey } from '../../_shared/types.ts';

export interface SourceSettings {
  key: SourceKey;
  baseUrl: string;
  minDelayMs: number;
  maxPagesPerRun: number;
  userAgent: string;
  enabled: boolean;
}

export async function loadSourceSettings(db: DbClient, key: SourceKey): Promise<SourceSettings> {
  const { data, error } = await db
    .from('sources')
    .select('base_url, min_delay_ms, max_pages_per_run, user_agent, enabled')
    .eq('key', key)
    .maybeSingle();

  if (error) throw new Error(`lecture de la source ${key} : ${error.message}`);
  if (!data) throw new Error(`source inconnue en base : ${key}`);
  if (!data.base_url) throw new Error(`source ${key} : base_url manquant`);
  if (!data.user_agent) throw new Error(`source ${key} : user_agent manquant`);

  return {
    key,
    baseUrl: data.base_url,
    minDelayMs: data.min_delay_ms,
    maxPagesPerRun: data.max_pages_per_run,
    userAgent: data.user_agent,
    enabled: data.enabled,
  };
}

/** Consigne le verdict de robots.txt du jour. Une autorisation ancienne ne vaut rien. */
export async function recordRobotsCheck(
  db: DbClient,
  key: SourceKey,
  allows: boolean,
): Promise<void> {
  const { error } = await db
    .from('sources')
    .update({ robots_allows: allows, robots_checked_at: new Date().toISOString() })
    .eq('key', key);
  if (error) throw new Error(`écriture du verdict robots pour ${key} : ${error.message}`);
}

export async function markSourceRun(
  db: DbClient,
  key: SourceKey,
  status: RunStatus,
): Promise<void> {
  const { error } = await db
    .from('sources')
    .update({ last_run_at: new Date().toISOString(), last_status: status })
    .eq('key', key);
  if (error) throw new Error(`marquage du run de ${key} : ${error.message}`);
}

/** Taille de lot : c'est aussi le plafond par défaut d'une réponse supabase-js. */
const PAGE_SIZE = 1000;

/**
 * Tous les `external_id` déjà en base pour une source.
 *
 * Sert au delta des sources scrapées : une offre déjà connue ne vaut pas qu'on
 * repaie sa page de détail. La pagination n'est pas facultative — supabase-js
 * plafonne une réponse à 1 000 lignes, et une source plus grosse verrait le
 * reste de ses offres traité comme inconnu à chaque passe.
 */
export async function loadKnownExternalIds(
  db: DbClient,
  source: SourceKey,
): Promise<Set<string>> {
  const known = new Set<string>();

  for (let from = 0;; from += PAGE_SIZE) {
    const { data, error } = await db
      .from('offers')
      .select('external_id')
      .eq('source', source)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`lecture des offres connues de ${source} : ${error.message}`);

    const rows = (data ?? []) as { external_id: string }[];
    for (const row of rows) known.add(row.external_id);
    if (rows.length < PAGE_SIZE) return known;
  }
}
```

- [ ] **Step 3: Tests verts, porte complète, commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
git add supabase/functions/_scrapers/_shared/sources.ts supabase/functions/_scrapers/_shared/__tests__/sources_test.ts
git commit -m "feat(scrapers): reglages de politesse lus en base, etat de source ecrit"
```

**Ce qu'il ne faut PAS faire :** ne pas mettre de valeur par défaut dans le code
pour un réglage qui existe en base — une source mal configurée doit échouer
bruyamment, pas tourner sur une constante invisible.

---

### Task 5: Département depuis un nom de commune (zone PACA)

**Files:**
- Modify: `supabase/functions/_shared/departments.ts`
- Test: `supabase/functions/_shared/__tests__/departments_test.ts`

**Interfaces:**
- Consumes: la fonction privée `normalize` déjà présente dans le fichier.
- Produces: `function departmentCodeFromCityName(name: string | null | undefined): string | null`

**Pourquoi cette tâche existe.** Mesuré sur les deux sources : le code postal est
**souvent absent**. Les deux fixtures Free-Work n'en portent aucun
(`postalCode: null`), et `addressRegion` vaut « Provence-Alpes-Côte d'Azur »,
c'est-à-dire une **région**, que `departmentCodeFromName` ne sait pas traduire.
Collective, lui, ne donne qu'un libellé « Aix-en-Provence, France ». Sans ce
repli, `department` resterait null et **`offers_shortlist` perdrait toutes les
offres locales des deux nouvelles sources** — or Aix-en-Provence est la commune
la plus représentée de la zone dans l'échantillon Collective (8 sur 300).

La table est **volontairement limitée aux départements 13, 83 et 84**, les trois
que `offers_shortlist` retient. Hors zone, `department` reste null, et c'est sans
conséquence : la branche non locale de la vue passe par `remote_label = 'full'`.

- [ ] **Step 1: Écrire les tests (rouge d'abord)**

À ajouter à `supabase/functions/_shared/__tests__/departments_test.ts` :

```ts
import { departmentCodeFromCityName } from '../departments.ts';

Deno.test('departmentCodeFromCityName traduit les communes de la zone', () => {
  assertEquals(departmentCodeFromCityName('Marseille'), '13');
  assertEquals(departmentCodeFromCityName('Aix-en-Provence'), '13');
  assertEquals(departmentCodeFromCityName('Toulon'), '83');
  assertEquals(departmentCodeFromCityName('Avignon'), '84');
});

Deno.test('departmentCodeFromCityName ignore casse, accents et séparateurs', () => {
  assertEquals(departmentCodeFromCityName('AIX EN PROVENCE'), '13');
  assertEquals(departmentCodeFromCityName('aix-en-provence'), '13');
  assertEquals(departmentCodeFromCityName("L'Isle-sur-la-Sorgue"), '84');
});

Deno.test('departmentCodeFromCityName rend null hors zone ou sur une entrée vide', () => {
  assertEquals(departmentCodeFromCityName('Paris'), null);
  assertEquals(departmentCodeFromCityName('Antibes'), null);
  assertEquals(departmentCodeFromCityName('France'), null);
  assertEquals(departmentCodeFromCityName(null), null);
  assertEquals(departmentCodeFromCityName(''), null);
});
```

- [ ] **Step 2: Voir échouer, puis ajouter la table et la fonction**

À ajouter à la fin de `supabase/functions/_shared/departments.ts` :

```ts
/**
 * Communes de la zone visée -> code de département. Volontairement limitée aux
 * départements 13, 83 et 84, les trois que retient `offers_shortlist`.
 *
 * Raison d'être : mesuré le 2026-09-08, les sources scrapées ne donnent
 * généralement PAS de code postal — les deux pages Free-Work capturées ont
 * `postalCode: null` et un `addressRegion` qui est une région
 * (« Provence-Alpes-Côte d'Azur »), et Collective ne donne qu'un libellé
 * « Aix-en-Provence, France ». Sans ce repli, toutes leurs offres locales
 * sortiraient de la sélection.
 *
 * Hors de cette table, on rend null : c'est exact, et sans conséquence, la
 * branche non locale de la vue passant par `remote_label = 'full'`. Ce n'est
 * donc PAS un référentiel de communes à compléter — c'est un filtre de zone.
 * Le vrai géocodage par code INSEE reste le problème ouvert P1.
 */
const ZONE_CITY_TO_DEPARTMENT: Readonly<Record<string, string>> = {
  // 13 — Bouches-du-Rhône
  'Marseille': '13',
  'Aix-en-Provence': '13',
  'Aubagne': '13',
  'La Ciotat': '13',
  'Vitrolles': '13',
  'Marignane': '13',
  'Martigues': '13',
  'Istres': '13',
  'Miramas': '13',
  'Salon-de-Provence': '13',
  'Arles': '13',
  'Gardanne': '13',
  'Fos-sur-Mer': '13',
  'Berre-l’Étang': '13',
  'Rognac': '13',
  'Les Pennes-Mirabeau': '13',
  'Allauch': '13',
  'Plan-de-Cuques': '13',
  'Châteauneuf-les-Martigues': '13',
  'Bouc-Bel-Air': '13',
  'Cabriès': '13',
  'Venelles': '13',
  'Meyreuil': '13',
  'Trets': '13',
  'Cassis': '13',
  'Carry-le-Rouet': '13',
  'Sausset-les-Pins': '13',
  'Port-de-Bouc': '13',
  'Saint-Victoret': '13',
  'Septèmes-les-Vallons': '13',
  // 83 — Var
  'Toulon': '83',
  'La Seyne-sur-Mer': '83',
  'Hyères': '83',
  'Fréjus': '83',
  'Saint-Raphaël': '83',
  'Draguignan': '83',
  'Six-Fours-les-Plages': '83',
  'La Garde': '83',
  'La Valette-du-Var': '83',
  'Brignoles': '83',
  'Sanary-sur-Mer': '83',
  'Ollioules': '83',
  'Le Pradet': '83',
  'Saint-Maximin-la-Sainte-Baume': '83',
  'Cuers': '83',
  'Solliès-Pont': '83',
  'Bandol': '83',
  'Roquebrune-sur-Argens': '83',
  // 84 — Vaucluse
  'Avignon': '84',
  'Carpentras': '84',
  'Orange': '84',
  'Cavaillon': '84',
  'Le Pontet': '84',
  'Sorgues': '84',
  'L’Isle-sur-la-Sorgue': '84',
  'Pertuis': '84',
  'Apt': '84',
  'Monteux': '84',
  'Vedène': '84',
  'Bollène': '84',
  'Valréas': '84',
  'Morières-lès-Avignon': '84',
};

const CITY_TO_DEPARTMENT: Map<string, string> = new Map(
  Object.entries(ZONE_CITY_TO_DEPARTMENT).map(([city, code]) => [normalize(city), code]),
);

/**
 * Traduit un NOM DE COMMUNE de la zone visée en code de département, ou null.
 * Repli des sources qui ne fournissent pas de code postal ; ne remplace jamais
 * un code postal reçu, qui reste prioritaire.
 */
export function departmentCodeFromCityName(name: string | null | undefined): string | null {
  if (!name) return null;
  return CITY_TO_DEPARTMENT.get(normalize(name)) ?? null;
}
```

- [ ] **Step 3: Tests verts, porte complète, commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
git add supabase/functions/_shared/departments.ts supabase/functions/_shared/__tests__/departments_test.ts
git commit -m "feat(geo): repli commune -> departement sur la zone visee"
```

**Ce qu'il ne faut PAS faire :** ne pas étendre la table hors des départements
13, 83 et 84 — ce n'est pas un référentiel de communes, et le compléter
donnerait l'illusion d'un géocodage qui n'existe pas (P1). Ne pas toucher à
`DEPARTMENTS` ni à `departmentCodeFromName`, utilisés par Adzuna.

---

### Task 6: Client Free-Work — listing paginé puis pages de détail

**Files:**
- Create: `supabase/functions/_scrapers/free-work/client.ts`
- Test: `supabase/functions/_scrapers/free-work/__tests__/client_test.ts`
- Fixtures (déjà présentes, ne pas modifier) :
  `listing-react-sort-date-page1.html`, `job-permanent-salary.html`

**La paire de fixtures n'est pas interchangeable.** `job-contractor-tjm.html` a
été capturée depuis le listing trié par **pertinence** et ne figure pas parmi
les seize offres du listing trié par **date** : un test qui les apparie ne peut
pas passer, puisque aucun `harvestPaths` ne peut produire une URL absente du
texte source. La paire cohérente est
`listing-react-sort-date-page1.html` + `job-permanent-salary.html`, dont le
chemin `developpeur-front-end-javascript-node-react-angular-vue/developpeur-net-react-h-f-59`
est bien présent dans le listing. `job-contractor-tjm.html` sert en tâche 7,
où le listing n'intervient pas.

**Interfaces:**
- Consumes: `PageFetcher` de `_scrapers/_shared/http.ts`, `extractJsonLd` de
  `_scrapers/_shared/html.ts`, `FetchResult` de `_shared/run-collection.ts`,
  `SearchQueryRow` de `_shared/types.ts`, `log` de `_shared/logger.ts`.
- Produces:
  - `interface FreeWorkRawOffer { path: string; url: string; jobPosting: Record<string, unknown> }`
  - `function facetOf(query: SearchQueryRow): string`
  - `function externalIdFromPath(path: string): string`
  - `function fetchFreeWorkOffers(cfg: FreeWorkClientConfig, query: SearchQueryRow): Promise<FetchResult>`

**Ce que le client fait, et pourquoi dans cet ordre.** Il parcourt le listing
trié par date, y récolte **seulement** des URL et des `<time>`, s'arrête dès que
la page entière est hors fenêtre, puis va chercher le JSON-LD de chaque offre
**inconnue**. La fenêtre borne le **parcours** ; elle ne filtre pas les offres —
une offre un peu plus ancienne ramenée par la dernière page est une vraie offre,
la rejeter coûterait une requête déjà payée.

- [ ] **Step 1: Écrire les tests (rouge d'abord)**

`supabase/functions/_scrapers/free-work/__tests__/client_test.ts` :

```ts
import { assert, assertEquals, assertRejects } from '@std/assert';
import type { FetchedPage, PageFetcher } from '../../_shared/http.ts';
import type { SearchQueryRow } from '../../../_shared/types.ts';
import { externalIdFromPath, facetOf, fetchFreeWorkOffers } from '../client.ts';

const listing = await Deno.readTextFile(
  new URL('./fixtures/listing-react-sort-date-page1.html', import.meta.url),
);
const detail = await Deno.readTextFile(
  new URL('./fixtures/job-permanent-salary.html', import.meta.url),
);

function queryRow(extra: Record<string, unknown>): SearchQueryRow {
  return {
    id: 1,
    source: 'free_work',
    label: 'fw:skill:react',
    keywords: null,
    commune_insee: null,
    radius_km: null,
    extra_params: extra,
    published_since_days: 3,
    priority: 60,
    enabled: true,
  };
}

/** Double de PageFetcher : rend le listing pour toute URL de listing, le détail sinon. */
function fetcherFor(pages: Map<string, string>, seen: string[] = []): PageFetcher {
  return {
    get(url: string): Promise<FetchedPage> {
      seen.push(url);
      const body = pages.get(url);
      if (body === undefined) return Promise.reject(new Error(`HTTP 404 sur ${url}`));
      return Promise.resolve({ url, status: 200, body });
    },
  };
}

const BASE = 'https://www.free-work.com';
const LISTING_1 = `${BASE}/fr/tech-it/jobs/react?sort=date&page=1`;
const DETAIL_PATH =
  '/fr/tech-it/job-mission/developpeur-front-end-javascript-node-react-angular-vue/developpeur-net-react-h-f-59';

Deno.test('facetOf lit la facette dans extra_params', () => {
  assertEquals(facetOf(queryRow({ facet: 'react' })), 'react');
});

Deno.test('facetOf refuse bruyamment une requête sans facette', () => {
  // Le silence serait pire : la requête collecterait la mauvaise page sans le dire.
  let thrown: Error | null = null;
  try {
    facetOf(queryRow({}));
  } catch (e) {
    thrown = e instanceof Error ? e : new Error(String(e));
  }
  assert(thrown, 'aucune erreur levée');
  assert(thrown.message.includes('facet'));
});

Deno.test('externalIdFromPath garde le chemin sous /job-mission/', () => {
  assertEquals(
    externalIdFromPath('/fr/tech-it/job-mission/developpeur-python/x-1'),
    'developpeur-python/x-1',
  );
});

Deno.test('le listing réel donne 16 offres et une seule page suffit', async () => {
  const seen: string[] = [];
  const pages = new Map([[LISTING_1, listing], [`${BASE}${DETAIL_PATH}`, detail]]);
  // Toutes les offres sont connues sauf une : une seule page de détail doit être lue.
  const known = new Set(
    [...listing.matchAll(/href="\/fr\/tech-it\/job-mission\/([^"]+)"/g)].map((m) => m[1]),
  );
  known.delete(externalIdFromPath(DETAIL_PATH));

  const result = await fetchFreeWorkOffers({
    fetcher: fetcherFor(pages, seen),
    baseUrl: BASE,
    maxListingPages: 1,
    windowDays: 3,
    knownExternalIds: known,
    refetchKnown: false,
    now: () => new Date('2026-09-08T12:00:00Z'),
  }, queryRow({ facet: 'react' }));

  assertEquals(result.offers.length, 1);
  assertEquals(result.httpStatus, 200);
  assertEquals(result.totalAvailable, 196);
  assertEquals(seen.length, 2, 'une page de listing et une page de détail');
});

Deno.test('l’offre récoltée porte son chemin, son URL et son JobPosting', async () => {
  const pages = new Map([[LISTING_1, listing], [`${BASE}${DETAIL_PATH}`, detail]]);
  const known = new Set(
    [...listing.matchAll(/href="\/fr\/tech-it\/job-mission\/([^"]+)"/g)].map((m) => m[1]),
  );
  known.delete(externalIdFromPath(DETAIL_PATH));

  const result = await fetchFreeWorkOffers({
    fetcher: fetcherFor(pages),
    baseUrl: BASE,
    maxListingPages: 1,
    windowDays: 3,
    knownExternalIds: known,
    refetchKnown: false,
    now: () => new Date('2026-09-08T12:00:00Z'),
  }, queryRow({ facet: 'react' }));

  const raw = result.offers[0] as { path: string; url: string; jobPosting: Record<string, unknown> };
  assertEquals(raw.path, externalIdFromPath(DETAIL_PATH));
  assertEquals(raw.url, `${BASE}${DETAIL_PATH}`);
  assertEquals(raw.jobPosting['@type'], 'JobPosting');
});

Deno.test('une fenêtre dépassée arrête le parcours, sans rien tronquer', async () => {
  // Les dates de la fixture vont du 06/09 au 07/09 ; au 2026-10-01, tout est hors
  // fenêtre : la page est lue, aucune offre n'est récupérée, et truncated reste faux.
  const seen: string[] = [];
  const result = await fetchFreeWorkOffers({
    fetcher: fetcherFor(new Map([[LISTING_1, listing]]), seen),
    baseUrl: BASE,
    maxListingPages: 5,
    windowDays: 3,
    knownExternalIds: new Set(),
    refetchKnown: false,
    now: () => new Date('2026-10-01T12:00:00Z'),
  }, queryRow({ facet: 'react' }));

  assertEquals(result.offers.length, 0);
  assertEquals(result.truncated, false);
  assertEquals(seen.length, 1, 'le parcours s’arrête après la première page');
});

Deno.test('le plafond de pages marque le résultat comme tronqué', async () => {
  // La fixture est servie pour toutes les pages : la fenêtre n'est jamais atteinte,
  // donc c'est le plafond qui arrête — et cela doit se voir dans la télémétrie.
  const pages = new Map([
    [LISTING_1, listing],
    [`${BASE}/fr/tech-it/jobs/react?sort=date&page=2`, listing],
    [`${BASE}${DETAIL_PATH}`, detail],
  ]);
  const known = new Set(
    [...listing.matchAll(/href="\/fr\/tech-it\/job-mission\/([^"]+)"/g)].map((m) => m[1]),
  );

  const result = await fetchFreeWorkOffers({
    fetcher: fetcherFor(pages),
    baseUrl: BASE,
    maxListingPages: 2,
    windowDays: 3,
    knownExternalIds: known,
    refetchKnown: false,
    now: () => new Date('2026-09-08T12:00:00Z'),
  }, queryRow({ facet: 'react' }));

  assertEquals(result.truncated, true);
});

Deno.test('une page de listing absente remonte l’erreur', async () => {
  await assertRejects(
    () =>
      fetchFreeWorkOffers({
        fetcher: fetcherFor(new Map()),
        baseUrl: BASE,
        maxListingPages: 1,
        windowDays: 3,
        knownExternalIds: new Set(),
        refetchKnown: false,
      }, queryRow({ facet: 'react' })),
    Error,
    '404',
  );
});
```

- [ ] **Step 2: Voir échouer, puis écrire `client.ts`**

```ts
// Client Free-Work. Deux surfaces, deux usages strictement séparés :
//
//  - le LISTING (/fr/tech-it/jobs/<facette>?sort=date&page=N) ne sert qu'à
//    récolter des URL et à savoir quand s'arrêter. C'est du Vue SSR à classes
//    data-v-* volatiles : en extraire un champ serait construire une dette.
//  - la page de DÉTAIL porte un JobPosting en JSON-LD, et c'est de là que vient
//    absolument tout ce qui sera stocké.
//
// Le tri par date est un vrai paramètre serveur, mesuré le 2026-09-08 :
// <option value="date" selected> revient dans la réponse et les 16 <time> de la
// page sont alors décroissants. Sans lui, ils vont du 27/08 au 07/09 et aucun
// arrêt anticipé n'est possible.

import type { PageFetcher } from '../_shared/http.ts';
import { extractJsonLd } from '../_shared/html.ts';
import { log } from '../../_shared/logger.ts';
import type { FetchResult } from '../../_shared/run-collection.ts';
import type { SearchQueryRow } from '../../_shared/types.ts';

const JOB_PATH = /href="(\/fr\/tech-it\/job-mission\/[^"]+)"/g;
/** Date de publication affichée sur une carte, au format MM/JJ/AAAA. */
const CARD_DATE = /<time>(\d{2})\/(\d{2})\/(\d{4})<\/time>/g;
/** Nombre total d'offres de la facette, affiché par le site. Télémétrie seulement. */
const TOTAL = /(\d[\d\s ]*)(?:<[^>]*>|\s)*résultats?/i;
const PATH_PREFIX = '/fr/tech-it/job-mission/';
const MS_PER_DAY = 86_400_000;

export interface FreeWorkRawOffer {
  /** Chemin sous /job-mission/ : c'est l'external_id. */
  path: string;
  url: string;
  jobPosting: Record<string, unknown>;
}

export interface FreeWorkClientConfig {
  fetcher: PageFetcher;
  baseUrl: string;
  maxListingPages: number;
  windowDays: number;
  /** external_id déjà en base pour free_work : on ne repaie pas leur page de détail. */
  knownExternalIds: ReadonlySet<string>;
  /** backfill : on relit le détail de TOUTES les offres, pour corriger un mapper. */
  refetchKnown: boolean;
  now?: () => Date;
}

/** La facette est un segment de chemin, et `extra_params.facet` en est la seule source. */
export function facetOf(query: SearchQueryRow): string {
  const facet = query.extra_params?.facet;
  if (typeof facet !== 'string' || facet.length === 0) {
    throw new Error(`requête ${query.label} : extra_params.facet manquant ou invalide`);
  }
  return facet;
}

export function externalIdFromPath(path: string): string {
  if (!path.startsWith(PATH_PREFIX)) {
    throw new Error(`chemin d'offre inattendu : ${path}`);
  }
  return path.slice(PATH_PREFIX.length);
}

function parseCardDates(html: string): Date[] {
  const dates: Date[] = [];
  for (const [, month, day, year] of html.matchAll(CARD_DATE)) {
    dates.push(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
  }
  return dates;
}

function harvestPaths(html: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const [, path] of html.matchAll(JOB_PATH)) {
    if (seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }
  return paths;
}

function parseTotal(html: string): number | null {
  const match = html.match(TOTAL);
  if (!match) return null;
  const digits = match[1].replace(/\D/g, '');
  return digits.length > 0 ? Number(digits) : null;
}

function jobPostingOf(html: string): Record<string, unknown> | null {
  for (const block of extractJsonLd(html)) {
    if (typeof block !== 'object' || block === null) continue;
    const record = block as Record<string, unknown>;
    if (record['@type'] === 'JobPosting') return record;
  }
  return null;
}

export async function fetchFreeWorkOffers(
  cfg: FreeWorkClientConfig,
  query: SearchQueryRow,
): Promise<FetchResult> {
  const facet = facetOf(query);
  const now = (cfg.now ?? (() => new Date()))();
  const windowStart = new Date(now.getTime() - cfg.windowDays * MS_PER_DAY);

  const paths: string[] = [];
  let totalAvailable: number | null = null;
  let truncated = false;

  for (let page = 1; page <= cfg.maxListingPages; page++) {
    const url = `${cfg.baseUrl}/fr/tech-it/jobs/${facet}?sort=date&page=${page}`;
    const listing = await cfg.fetcher.get(url);

    if (page === 1) totalAvailable = parseTotal(listing.body);

    const pagePaths = harvestPaths(listing.body);
    if (pagePaths.length === 0) break;

    // Règle unique, et elle vaut pour les deux scrapers : on ne paie jamais une
    // requête pour une offre qu'on sait déjà hors fenêtre, et on ne jette jamais
    // une offre déjà reçue. Ici chaque offre coûte une page de détail, donc une
    // page entièrement hors fenêtre est abandonnée AVANT d'être récoltée — et le
    // tri étant décroissant, les suivantes le sont aussi. Chez Collective, où la
    // page porte déjà les missions entières, la même règle conduit à l'inverse :
    // on garde ce qui est arrivé.
    //
    // Sans <time> exploitable on ne conclut pas : le parcours ira au plafond,
    // dégradé mais jamais faux.
    const dates = parseCardDates(listing.body);
    const newest = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null;
    if (newest !== null && newest < windowStart) break;

    paths.push(...pagePaths);

    if (page === cfg.maxListingPages) truncated = true;
  }

  const offers: FreeWorkRawOffer[] = [];
  for (const path of paths) {
    const externalId = externalIdFromPath(path);
    if (!cfg.refetchKnown && cfg.knownExternalIds.has(externalId)) continue;

    const url = `${cfg.baseUrl}${path}`;
    const detail = await cfg.fetcher.get(url);
    const jobPosting = jobPostingOf(detail.body);
    if (!jobPosting) {
      // Ni silence ni interruption : la page est signalée et le parcours continue.
      log('warn', 'page d’offre sans JobPosting', { source: 'free_work', url });
      continue;
    }
    offers.push({ path: externalId, url, jobPosting });
  }

  return { offers, totalAvailable, truncated, httpStatus: 200 };
}
```

- [ ] **Step 3: Tests verts, porte complète, commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
git add supabase/functions/_scrapers/free-work/
git commit -m "feat(free-work): listing trie par date, details par JSON-LD"
```

Expected : 8 tests de plus, `verify` vert.

**Ce qu'il ne faut PAS faire :** ne pas extraire de titre, d'entreprise ou de
salaire du listing. Ne pas paralléliser les requêtes de détail. Ne pas filtrer
les offres sur la date — la fenêtre borne le parcours, pas le résultat.

---

### Task 7: Mapper Free-Work — JSON-LD vers `NormalizedOffer`

**Files:**
- Create: `supabase/functions/_scrapers/free-work/mapper.ts`
- Test: `supabase/functions/_scrapers/free-work/__tests__/mapper_test.ts`

**Interfaces:**
- Consumes: `FreeWorkRawOffer` de `./client.ts`, `emptyOffer` et
  `NormalizedOffer` de `_shared/types.ts`, `classifyRemote` et
  `hasRemoteNegation` de `_shared/remote.ts`, `departmentCodeFromCityName` de
  `_shared/departments.ts` (tâche 5), `htmlToText` de `_scrapers/_shared/html.ts`.
- Produces: `function mapFreeWorkOffer(raw: unknown): NormalizedOffer | null`

Le mapper ne prend **pas** de provenance : contrairement à Adzuna, aucune
colonne de l'offre ne dépend de la requête qui l'a trouvée. La provenance de
requête voyage déjà par `upsertOffers`, elle n'a rien à faire ici.

- [ ] **Step 1: Écrire les tests (rouge d'abord)**

Les valeurs attendues ci-dessous ont été **calculées sur les fixtures réelles**,
pas devinées.

`supabase/functions/_scrapers/free-work/__tests__/mapper_test.ts` :

```ts
import { assert, assertEquals } from '@std/assert';
import { extractJsonLd } from '../../_shared/html.ts';
import { mapFreeWorkOffer } from '../mapper.ts';

function rawFromFixture(name: string, path: string) {
  const html = Deno.readTextFileSync(new URL(`./fixtures/${name}`, import.meta.url));
  const jobPosting = extractJsonLd(html)
    .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null)
    .find((b) => b['@type'] === 'JobPosting');
  assert(jobPosting, `pas de JobPosting dans ${name}`);
  return { path, url: `https://www.free-work.com/fr/tech-it/job-mission/${path}`, jobPosting };
}

const CONTRACTOR_PATH =
  'developpeur-front-end-javascript-node-react-angular-vue/developpeur-react-node-nestjs-anglais-courant-obligatoire';
const PERMANENT_PATH =
  'developpeur-front-end-javascript-node-react-angular-vue/developpeur-net-react-h-f-59';

Deno.test('mission freelance : contrat, TJM et télétravail', () => {
  const offer = mapFreeWorkOffer(rawFromFixture('job-contractor-tjm.html', CONTRACTOR_PATH));
  assert(offer);

  assertEquals(offer.source, 'free_work');
  assertEquals(offer.external_id, CONTRACTOR_PATH);
  assertEquals(offer.title, 'Developpeur React/Node/NestJS - Anglais courant obligatoire');
  assertEquals(offer.company_name, 'ALLEGIS GROUP');
  assertEquals(offer.contract_type, 'Freelance');
  assertEquals(offer.contract_label, 'CONTRACTOR');
  assertEquals(offer.rate_raw, '450 EUR/jour');
  assertEquals(offer.salary_raw, null);
  assertEquals(offer.published_at, '2026-09-04T08:39:21.000Z');
  // « France » est ce que le site écrit quand il n'y a pas de lieu : ce n'est pas une ville.
  assertEquals(offer.city, null);
  assertEquals(offer.postal_code, null);
  assertEquals(offer.department, null);
  assertEquals(offer.remote_label, 'full');
  assertEquals(offer.is_remote, true);
});

Deno.test('la description est du texte, pas du HTML', () => {
  const offer = mapFreeWorkOffer(rawFromFixture('job-contractor-tjm.html', CONTRACTOR_PATH));
  assert(offer?.description);
  // Mesuré sur la fixture : 1 267 caractères une fois les balises retirées.
  assertEquals(offer.description.length, 1267);
  assertEquals(offer.description.includes('<'), false);
  assertEquals(offer.description.includes('&nbsp;'), false);
});

Deno.test('offre en CDI : contrat, salaire annuel et ville', () => {
  const offer = mapFreeWorkOffer(rawFromFixture('job-permanent-salary.html', PERMANENT_PATH));
  assert(offer);

  assertEquals(offer.title, 'Développeur .NET React H/F');
  assertEquals(offer.company_name, 'ADSearch');
  assertEquals(offer.contract_type, 'CDI');
  assertEquals(offer.contract_label, 'FULL_TIME');
  assertEquals(offer.salary_raw, '40000 EUR/an');
  assertEquals(offer.rate_raw, null);
  assertEquals(offer.city, 'Antibes');
  // Antibes est dans le 06 : hors des trois départements de la zone, donc null.
  assertEquals(offer.department, null);
  assertEquals(offer.published_at, '2026-09-07T22:45:08.000Z');
  assertEquals(offer.remote_label, null);
  assertEquals(offer.is_remote, false);
});

Deno.test('une commune de la zone donne son département', () => {
  // Charge utile construite à la main : aucune fixture ne porte de commune de la zone.
  const offer = mapFreeWorkOffer({
    path: 'x/y',
    url: 'https://www.free-work.com/fr/tech-it/job-mission/x/y',
    jobPosting: {
      '@type': 'JobPosting',
      title: 'Développeur React',
      description: '<p>Mission à Aix.</p>',
      jobLocation: { address: { addressLocality: 'Aix-en-Provence', addressCountry: 'FR' } },
    },
  });

  assertEquals(offer?.city, 'Aix-en-Provence');
  assertEquals(offer?.department, '13');
});

Deno.test('le code postal prime sur le nom de commune', () => {
  const offer = mapFreeWorkOffer({
    path: 'x/y',
    url: 'u',
    jobPosting: {
      '@type': 'JobPosting',
      title: 'T',
      jobLocation: { address: { addressLocality: 'Marseille', postalCode: '13008' } },
    },
  });

  assertEquals(offer?.postal_code, '13008');
  assertEquals(offer?.department, '13');
});

Deno.test('TELECOMMUTE comble le silence du texte', () => {
  const offer = mapFreeWorkOffer({
    path: 'x/y',
    url: 'u',
    jobPosting: {
      '@type': 'JobPosting',
      title: 'Développeur React',
      description: '<p>Une équipe, une stack, aucun mot sur le lieu de travail.</p>',
      jobLocationType: 'TELECOMMUTE',
    },
  });

  assertEquals(offer?.remote_label, 'full');
});

Deno.test('un refus explicite l’emporte sur TELECOMMUTE', () => {
  const offer = mapFreeWorkOffer({
    path: 'x/y',
    url: 'u',
    jobPosting: {
      '@type': 'JobPosting',
      title: 'Développeur React',
      description: '<p>Poste sur site, pas de télétravail.</p>',
      jobLocationType: 'TELECOMMUTE',
    },
  });

  assertEquals(offer?.remote_label, null);
  assertEquals(offer?.is_remote, false);
});

Deno.test('une charge utile inexploitable rend null plutôt qu’une offre creuse', () => {
  assertEquals(mapFreeWorkOffer(null), null);
  assertEquals(mapFreeWorkOffer({ path: 'x/y', url: 'u' }), null);
  assertEquals(mapFreeWorkOffer({ path: '', url: 'u', jobPosting: { title: 'T' } }), null);
  assertEquals(mapFreeWorkOffer({ path: 'x/y', url: 'u', jobPosting: {} }), null);
});
```

- [ ] **Step 2: Voir échouer, puis écrire `mapper.ts`**

```ts
// JSON-LD JobPosting -> NormalizedOffer.
//
// Free-Work est la première source du projet à rendre la description ENTIÈRE
// (mesuré : 577 à 7 752 caractères, médiane 1 176, contre 500 tronqués chez
// Adzuna). Le lexique de compétences y voit donc tout, comme sur France Travail.
// C'est aussi la première à porter un TJM structuré : `rate_raw`, restée nulle
// depuis le début du projet, se remplit enfin.

import { departmentCodeFromCityName } from '../../_shared/departments.ts';
import { classifyRemote, hasRemoteNegation } from '../../_shared/remote.ts';
import { emptyOffer, type NormalizedOffer } from '../../_shared/types.ts';
import { htmlToText } from '../_shared/html.ts';

interface PostalAddress {
  addressLocality?: unknown;
  postalCode?: unknown;
}

interface QuantitativeValue {
  value?: unknown;
  minValue?: unknown;
  maxValue?: unknown;
  unitText?: unknown;
}

interface JobPosting {
  title?: unknown;
  description?: unknown;
  datePosted?: unknown;
  employmentType?: unknown;
  jobLocationType?: unknown;
  hiringOrganization?: { name?: unknown };
  jobLocation?: { address?: PostalAddress };
  baseSalary?: { currency?: unknown; value?: QuantitativeValue };
}

interface RawOffer {
  path?: unknown;
  url?: unknown;
  jobPosting?: unknown;
}

/**
 * `addressLocality` vaut « France » quand l'annonce n'a pas de lieu — c'est le
 * cas typique d'une mission full remote. Ce n'est pas une ville : la stocker
 * comme telle salirait la colonne et ne servirait à personne.
 */
const NOT_A_CITY = new Set(['france']);

/**
 * Vocabulaire schema.org -> vocabulaire du dépôt. CONTRACTOR est testé EN
 * PREMIER parce qu'il cohabite avec FULL_TIME sur les missions freelance :
 * mesuré, 7 des 12 offres échantillonnées portent les deux, et c'est bien de
 * freelance qu'il s'agit.
 */
function contractTypeOf(types: string[]): string | null {
  if (types.includes('CONTRACTOR')) return 'Freelance';
  if (types.includes('TEMPORARY')) return 'CDD';
  if (types.includes('INTERN')) return 'Stage';
  if (types.includes('FULL_TIME') || types.includes('PART_TIME')) return 'CDI';
  return null;
}

function asStringArray(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Libellé lisible d'un montant, ou null. Gère la valeur unique et la fourchette. */
function amountLabel(salary: JobPosting['baseSalary']): { text: string; unit: string } | null {
  const value = salary?.value;
  if (!value) return null;
  const currency = asText(salary?.currency) ?? 'EUR';
  const unit = typeof value.unitText === 'string' ? value.unitText.toUpperCase() : '';

  if (typeof value.value === 'number') return { text: `${value.value} ${currency}`, unit };
  if (typeof value.minValue === 'number' && typeof value.maxValue === 'number') {
    return { text: `${value.minValue} - ${value.maxValue} ${currency}`, unit };
  }
  if (typeof value.minValue === 'number') return { text: `${value.minValue} ${currency}`, unit };
  return null;
}

export function mapFreeWorkOffer(raw: unknown): NormalizedOffer | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as RawOffer;
  if (!candidate.jobPosting || typeof candidate.jobPosting !== 'object') return null;

  const posting = candidate.jobPosting as JobPosting;
  const path = asText(candidate.path);
  const title = asText(posting.title);
  if (!path || !title) return null;

  const offer = emptyOffer('free_work', path, title);

  const description = typeof posting.description === 'string'
    ? htmlToText(posting.description)
    : null;
  offer.description = description;
  offer.url = asText(candidate.url);
  offer.company_name = asText(posting.hiringOrganization?.name);

  const types = asStringArray(posting.employmentType);
  offer.contract_type = contractTypeOf(types);
  offer.contract_label = types.length > 0 ? types.join(', ') : null;

  const amount = amountLabel(posting.baseSalary);
  if (amount) {
    if (amount.unit === 'DAY') offer.rate_raw = `${amount.text}/jour`;
    else if (amount.unit === 'HOUR') offer.rate_raw = `${amount.text}/heure`;
    else if (amount.unit === 'MONTH') offer.salary_raw = `${amount.text}/mois`;
    else if (amount.unit === 'YEAR') offer.salary_raw = `${amount.text}/an`;
    else offer.salary_raw = amount.text;
  }

  const address = posting.jobLocation?.address;
  const locality = asText(address?.addressLocality);
  offer.city = locality && !NOT_A_CITY.has(locality.toLowerCase()) ? locality : null;
  offer.postal_code = asText(address?.postalCode);
  // Le code postal prime ; le nom de commune n'est qu'un repli, et il est
  // souvent le seul disponible (les deux fixtures n'ont aucun code postal).
  offer.department = offer.postal_code?.slice(0, 2) ??
    departmentCodeFromCityName(offer.city);

  if (typeof posting.datePosted === 'string') {
    const date = new Date(posting.datePosted);
    offer.published_at = Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  // Même règle que pour Adzuna : le texte a toujours le dernier mot, et le champ
  // déclaré ne comble qu'un SILENCE, jamais une négation — sans quoi une offre
  // qui refuse le télétravail ressusciterait en 'full'.
  const text = `${title} ${description ?? ''}`;
  const declared = posting.jobLocationType === 'TELECOMMUTE' ? 'full' : null;
  const mode = classifyRemote(text) ?? (hasRemoteNegation(text) ? null : declared);
  offer.remote_label = mode;
  offer.is_remote = mode === 'full' || mode === 'hybride';

  offer.raw = raw;
  return offer;
}
```

- [ ] **Step 3: Tests verts, porte complète, commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
git add supabase/functions/_scrapers/free-work/
git commit -m "feat(free-work): mapper JSON-LD, premier TJM structure du projet"
```

Expected : 8 tests de plus, `verify` vert.

**Ce qu'il ne faut PAS faire :** ne pas stocker la description en HTML. Ne pas
inventer un `department` hors de la table de zone. Ne pas faire primer
`jobLocationType` sur le texte.

---

### Task 8: Lanceur commun aux deux scrapers

**Files:**
- Create: `supabase/functions/_scrapers/_shared/main-runner.ts`
- Test: `supabase/functions/_scrapers/_shared/__tests__/main-runner_test.ts`

**Interfaces:**
- Consumes: `createDbClient`, `runCollection`, `WINDOW_DAYS`, `PoliteFetcher`,
  `parseRobots`, `loadSourceSettings`, `recordRobotsCheck`, `markSourceRun`,
  `loadKnownExternalIds`.
- Produces:
  - `interface ScraperRunContext { fetcher: PageFetcher; settings: SourceSettings; mode: CollectionMode; windowDays: number; knownExternalIds: ReadonlySet<string> }`
  - `interface ScraperDefinition { source: SourceKey; pathsUsed: string[]; needsKnownExternalIds: boolean; fetchAll(ctx, query): Promise<FetchResult>; map(raw: unknown): NormalizedOffer | null }`
  - `interface ScraperEnvironment { args: string[]; env(name: string): string | undefined }`
  - `function runScraperMain(scraper: ScraperDefinition, host: ScraperEnvironment): Promise<number>`

**Pourquoi cette tâche existe.** Sans elle, les deux `main.ts` seraient
identiques à quatre valeurs près — lecture de l'environnement, réglages,
`robots.txt`, chargement des requêtes, appel à `runCollection`, marquage du
run : environ quatre-vingts lignes en double. Le dépôt a déjà tranché ce
débat une fois, et l'a écrit dans `CLAUDE.md` : « l'orchestration de collecte
est mutualisée dans `_shared/run-collection.ts` […] **ne jamais dupliquer la
boucle** ». Le lancement obéit à la même règle que la boucle.

**Le gain n'est pas seulement l'économie de lignes.** `Deno.args` et
`Deno.env` arrivent **en paramètre** (`ScraperEnvironment`), donc le lanceur
reste runtime-neutre **et** devient testable : les chemins qui comptent — source
désactivée, `robots.txt` qui refuse, répétition à blanc — sont vérifiés par des
tests, alors qu'ils ne le seraient dans aucun `main.ts`.

- [ ] **Step 1: Écrire les tests (rouge d'abord)**

`supabase/functions/_scrapers/_shared/__tests__/main-runner_test.ts` :

```ts
import { assert, assertEquals, assertRejects } from '@std/assert';
import type { DbClient } from '../../../_shared/db.ts';
import type { FetchResult } from '../../../_shared/run-collection.ts';
import type { NormalizedOffer, SearchQueryRow } from '../../../_shared/types.ts';
import { emptyOffer } from '../../../_shared/types.ts';
import type { PageFetcher } from '../http.ts';
import { runScraperMain, type ScraperDefinition } from '../main-runner.ts';

const ROBOTS_OK = 'User-agent: *\nDisallow: /login\n';
const ROBOTS_KO = 'User-agent: *\nDisallow: /\n';

const QUERY: SearchQueryRow = {
  id: 1,
  source: 'free_work',
  label: 'fw:skill:react',
  keywords: null,
  commune_insee: null,
  radius_km: null,
  extra_params: { facet: 'react' },
  published_since_days: 3,
  priority: 60,
  enabled: true,
};

interface FakeState {
  enabled: boolean;
  updates: Array<Record<string, unknown>>;
  queries: SearchQueryRow[];
  knownIds: string[];
}

/**
 * Double de base de données. `as unknown as DbClient` est le moyen normal ici
 * (voir CLAUDE.md) : `DbClient` n'est pas typé sur le schéma.
 */
function fakeDb(state: FakeState): DbClient {
  const sourceRow = {
    base_url: 'https://example.test',
    min_delay_ms: 0,
    max_pages_per_run: 5,
    user_agent: 'fast-travail/0.1 (veille personnelle)',
    enabled: state.enabled,
  };

  return {
    from(table: string) {
      if (table === 'sources') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: sourceRow, error: null }) }),
          }),
          update: (values: Record<string, unknown>) => {
            state.updates.push(values);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      if (table === 'offers') {
        return {
          select: () => ({
            eq: () => ({
              range: (from: number) =>
                Promise.resolve({
                  data: from === 0 ? state.knownIds.map((id) => ({ external_id: id })) : [],
                  error: null,
                }),
            }),
          }),
        };
      }
      // search_queries : select().eq().eq().order() et, avec --query, un eq() de plus.
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => Promise.resolve({ data: state.queries, error: null }),
        then: undefined,
      };
      return builder;
    },
  } as unknown as DbClient;
}

function fakeFetcherFactory(robots: string, seen: string[]) {
  return (): PageFetcher => ({
    get(url: string) {
      seen.push(url);
      return Promise.resolve({ url, status: 200, body: robots });
    },
  });
}

function scraper(overrides: Partial<ScraperDefinition> = {}): ScraperDefinition {
  return {
    source: 'free_work',
    pathsUsed: ['/fr/tech-it/jobs/react'],
    needsKnownExternalIds: true,
    fetchAll: (): Promise<FetchResult> =>
      Promise.resolve({ offers: [{ id: 'a' }], totalAvailable: 1, truncated: false, httpStatus: 200 }),
    map: (): NormalizedOffer => emptyOffer('free_work', 'a', 'Une offre'),
    ...overrides,
  };
}

function host(args: string[]) {
  return {
    args,
    env: (name: string) =>
      ({ SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'clef' })[name],
  };
}

Deno.test('une variable d’environnement manquante arrête tout', async () => {
  await assertRejects(
    () => runScraperMain(scraper(), { args: ['--dry-run'], env: () => undefined }),
    Error,
    'SUPABASE_URL',
  );
});

Deno.test('une source désactivée en base ne collecte rien', async () => {
  const state: FakeState = { enabled: false, updates: [], queries: [QUERY], knownIds: [] };
  let called = false;

  const code = await runScraperMain(
    scraper({ fetchAll: () => {
      called = true;
      return Promise.resolve({ offers: [], totalAvailable: null, truncated: false, httpStatus: 200 });
    } }),
    host(['--dry-run']),
    { createDb: () => fakeDb(state), createFetcher: fakeFetcherFactory(ROBOTS_OK, []) },
  );

  assertEquals(code, 0);
  assertEquals(called, false, 'aucune collecte ne doit être tentée');
});

Deno.test('un robots.txt qui refuse arrête la collecte et consigne le verdict', async () => {
  const state: FakeState = { enabled: true, updates: [], queries: [QUERY], knownIds: [] };
  let called = false;

  const code = await runScraperMain(
    scraper({ fetchAll: () => {
      called = true;
      return Promise.resolve({ offers: [], totalAvailable: null, truncated: false, httpStatus: 200 });
    } }),
    host([]),
    { createDb: () => fakeDb(state), createFetcher: fakeFetcherFactory(ROBOTS_KO, []) },
  );

  assertEquals(code, 1);
  assertEquals(called, false, 'rien ne doit être collecté après un refus');
  assertEquals(state.updates[0].robots_allows, false);
  assert(state.updates.some((u) => u.last_status === 'failed'));
});

Deno.test('robots.txt est lu à chaque exécution, et son verdict écrit même à blanc', async () => {
  const state: FakeState = { enabled: true, updates: [], queries: [QUERY], knownIds: [] };
  const seen: string[] = [];

  await runScraperMain(scraper(), host(['--dry-run']), {
    createDb: () => fakeDb(state),
    createFetcher: fakeFetcherFactory(ROBOTS_OK, seen),
  });

  assertEquals(seen[0], 'https://example.test/robots.txt');
  assertEquals(state.updates[0].robots_allows, true);
  // Le verdict est un fait sur le monde extérieur : une répétition à blanc doit
  // justement servir à apprendre que robots.txt a changé.
});

Deno.test('une répétition à blanc ne marque aucun run', async () => {
  const state: FakeState = { enabled: true, updates: [], queries: [QUERY], knownIds: [] };

  const code = await runScraperMain(scraper(), host(['--dry-run']), {
    createDb: () => fakeDb(state),
    createFetcher: fakeFetcherFactory(ROBOTS_OK, []),
  });

  assertEquals(code, 0);
  assertEquals(state.updates.filter((u) => 'last_status' in u).length, 0);
});

Deno.test('le delta précharge les identifiants connus, le backfill les ignore', async () => {
  const state: FakeState = { enabled: true, updates: [], queries: [QUERY], knownIds: ['deja-vu'] };
  const seenSizes: number[] = [];
  const spy = scraper({
    fetchAll: (ctx) => {
      seenSizes.push(ctx.knownExternalIds.size);
      return Promise.resolve({ offers: [], totalAvailable: null, truncated: false, httpStatus: 200 });
    },
  });
  const deps = { createDb: () => fakeDb(state), createFetcher: fakeFetcherFactory(ROBOTS_OK, []) };

  await runScraperMain(spy, host(['--dry-run', '--mode', 'delta']), deps);
  await runScraperMain(spy, host(['--dry-run', '--mode', 'backfill']), deps);

  assertEquals(seenSizes, [1, 0]);
});

Deno.test('une source qui n’en a pas besoin ne paie pas le préchargement', async () => {
  const state: FakeState = { enabled: true, updates: [], queries: [QUERY], knownIds: ['deja-vu'] };
  let size = -1;

  await runScraperMain(
    scraper({
      needsKnownExternalIds: false,
      fetchAll: (ctx) => {
        size = ctx.knownExternalIds.size;
        return Promise.resolve({ offers: [], totalAvailable: null, truncated: false, httpStatus: 200 });
      },
    }),
    host(['--dry-run', '--mode', 'delta']),
    { createDb: () => fakeDb(state), createFetcher: fakeFetcherFactory(ROBOTS_OK, []) },
  );

  assertEquals(size, 0);
});

Deno.test('la fenêtre suit le mode', async () => {
  const state: FakeState = { enabled: true, updates: [], queries: [QUERY], knownIds: [] };
  const windows: number[] = [];
  const spy = scraper({
    fetchAll: (ctx) => {
      windows.push(ctx.windowDays);
      return Promise.resolve({ offers: [], totalAvailable: null, truncated: false, httpStatus: 200 });
    },
  });
  const deps = { createDb: () => fakeDb(state), createFetcher: fakeFetcherFactory(ROBOTS_OK, []) };

  await runScraperMain(spy, host(['--dry-run', '--mode', 'delta']), deps);
  await runScraperMain(spy, host(['--dry-run', '--mode', 'backfill']), deps);

  assertEquals(windows, [3, 31]);
});

Deno.test('aucune requête active est une erreur, pas un succès silencieux', async () => {
  const state: FakeState = { enabled: true, updates: [], queries: [], knownIds: [] };

  await assertRejects(
    () =>
      runScraperMain(scraper(), host(['--dry-run']), {
        createDb: () => fakeDb(state),
        createFetcher: fakeFetcherFactory(ROBOTS_OK, []),
      }),
    Error,
    'free_work',
  );
});
```

- [ ] **Step 2: Lancer les tests et les voir échouer**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read --allow-env supabase/functions/_scrapers/
```

Expected : FAIL — `Module not found "…/main-runner.ts"`.

- [ ] **Step 3: Écrire `main-runner.ts`**

```ts
// Lancement commun aux deux scrapers.
//
// `CLAUDE.md` tranche déjà ce débat pour la boucle de collecte : « ne jamais
// dupliquer la boucle ». Le lancement obéit à la même règle — sans ce fichier,
// les deux main.ts seraient identiques à quatre valeurs près.
//
// Runtime-neutre : Deno.args et Deno.env arrivent en paramètre. C'est la
// condition pour que ce fichier reste testable, et les chemins qui comptent —
// source désactivée, robots.txt qui refuse, répétition à blanc — ne sont
// vérifiables nulle part ailleurs.

import { createDbClient, type DbClient } from '../../_shared/db.ts';
import { log } from '../../_shared/logger.ts';
import { type FetchResult, runCollection } from '../../_shared/run-collection.ts';
import {
  type CollectionMode,
  type NormalizedOffer,
  type RunTrigger,
  type SearchQueryRow,
  type SourceKey,
  WINDOW_DAYS,
} from '../../_shared/types.ts';
import { type PageFetcher, PoliteFetcher } from './http.ts';
import { parseRobots } from './robots.ts';
import {
  loadKnownExternalIds,
  loadSourceSettings,
  markSourceRun,
  recordRobotsCheck,
  type SourceSettings,
} from './sources.ts';

/** Ce que le lanceur a décidé, et dont la source a besoin pour collecter. */
export interface ScraperRunContext {
  fetcher: PageFetcher;
  settings: SourceSettings;
  mode: CollectionMode;
  windowDays: number;
  /** Vide si la source n'a pas demandé le préchargement. */
  knownExternalIds: ReadonlySet<string>;
}

/** Tout ce qui distingue un scraper d'un autre. Le reste est commun. */
export interface ScraperDefinition {
  source: SourceKey;
  /** Chemins réellement visités : ce sont EUX qu'on soumet à robots.txt. */
  pathsUsed: string[];
  /**
   * Vrai si la source paie une requête par offre — on précharge alors les
   * external_id connus pour ne pas repayer un détail déjà collecté. Faux quand
   * la page de listing porte déjà les offres entières : il n'y a rien à
   * économiser, et chaque passe rafraîchit last_seen_at.
   */
  needsKnownExternalIds: boolean;
  fetchAll(ctx: ScraperRunContext, query: SearchQueryRow): Promise<FetchResult>;
  map(raw: unknown): NormalizedOffer | null;
}

/** L'hôte d'exécution : c'est par là, et uniquement par là, qu'arrive Deno. */
export interface ScraperEnvironment {
  args: string[];
  env(name: string): string | undefined;
}

/** Points d'injection réservés aux tests ; la production prend les valeurs par défaut. */
export interface ScraperDependencies {
  createDb?: (url: string, serviceRoleKey: string) => DbClient;
  createFetcher?: (settings: SourceSettings) => PageFetcher;
}

function flag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function option(args: string[], name: string): string | null {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}

function requireEnv(host: ScraperEnvironment, name: string): string {
  const value = host.env(name);
  if (!value) throw new Error(`variable d'environnement manquante : ${name}`);
  return value;
}

export async function runScraperMain(
  scraper: ScraperDefinition,
  host: ScraperEnvironment,
  deps: ScraperDependencies = {},
): Promise<number> {
  const mode: CollectionMode = option(host.args, 'mode') === 'backfill' ? 'backfill' : 'delta';
  const trigger: RunTrigger = option(host.args, 'trigger') === 'cron' ? 'cron' : 'manual';
  const dryRun = flag(host.args, 'dry-run');
  const onlyLabel = option(host.args, 'query');

  const url = requireEnv(host, 'SUPABASE_URL');
  const serviceRoleKey = requireEnv(host, 'SUPABASE_SERVICE_ROLE_KEY');
  const db = deps.createDb
    ? deps.createDb(url, serviceRoleKey)
    : createDbClient({ url, serviceRoleKey });

  const settings = await loadSourceSettings(db, scraper.source);
  if (!settings.enabled) {
    log('warn', 'source désactivée en base, rien à faire', { source: scraper.source });
    return 0;
  }

  const fetcher = deps.createFetcher
    ? deps.createFetcher(settings)
    : new PoliteFetcher({ userAgent: settings.userAgent, minDelayMs: settings.minDelayMs });

  // robots.txt à CHAQUE exécution : une autorisation constatée en septembre ne
  // vaut rien en décembre. Le verdict est écrit même à blanc — c'est un fait sur
  // le monde extérieur, et une répétition à blanc sert justement à l'apprendre.
  const robots = await fetcher.get(`${settings.baseUrl}/robots.txt`);
  const rules = parseRobots(robots.body, settings.userAgent);
  const allowed = scraper.pathsUsed.every((path) => rules.allows(path));
  await recordRobotsCheck(db, scraper.source, allowed);
  if (!allowed) {
    log('error', 'robots.txt refuse désormais la collecte : arrêt', { source: scraper.source });
    if (!dryRun) await markSourceRun(db, scraper.source, 'failed');
    return 1;
  }

  let builder = db
    .from('search_queries')
    .select('*')
    .eq('source', scraper.source)
    .eq('enabled', true);
  if (onlyLabel) builder = builder.eq('label', onlyLabel);

  const { data, error } = await builder.order('priority', { ascending: true });
  if (error) throw new Error(`lecture des requêtes : ${error.message}`);
  const queries = (data ?? []) as SearchQueryRow[];
  if (queries.length === 0) throw new Error(`aucune requête active pour ${scraper.source}`);

  const knownExternalIds = scraper.needsKnownExternalIds && mode === 'delta'
    ? await loadKnownExternalIds(db, scraper.source)
    : new Set<string>();

  const ctx: ScraperRunContext = {
    fetcher,
    settings,
    mode,
    windowDays: WINDOW_DAYS[mode],
    knownExternalIds,
  };

  const summary = await runCollection({
    db,
    source: scraper.source,
    mode,
    trigger,
    dryRun,
    queries,
    fetchAll: (query) => scraper.fetchAll(ctx, query),
    map: (raw) => scraper.map(raw),
  });

  if (!dryRun) await markSourceRun(db, scraper.source, summary.status);
  console.log(JSON.stringify(summary, null, 2));

  return summary.status === 'failed' ? 1 : 0;
}
```

**Note pour l'implémenteur** : l'ordre `.eq().eq().order()` importe pour le
double de test ci-dessus, et `builder.order(...)` doit être **la dernière**
étape, celle qui est attendue. Si le typage de supabase-js impose une autre
forme, adapter le test **et le dire dans le rapport** — mais ne jamais
supprimer l'assertion sur le filtre `--query`.

- [ ] **Step 4: Tests verts, porte complète, commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
git add supabase/functions/_scrapers/_shared/main-runner.ts supabase/functions/_scrapers/_shared/__tests__/main-runner_test.ts
git commit -m "feat(scrapers): lanceur commun, robots verifie a chaque execution"
```

Expected : 9 tests de plus, `verify` vert.

**Ce qu'il ne faut PAS faire :** aucun `Deno.*` dans ce fichier — c'est
précisément ce que `ScraperEnvironment` évite. Ne pas ajouter d'option de ligne
de commande que le plan ne demande pas.

---

### Task 9: Point d'entrée Free-Work et première collecte réelle

**Files:**
- Create: `supabase/functions/_scrapers/free-work/main.ts`
- Modify: `package.json` (deux scripts de lancement)

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: la commande `npm run scrape:free-work`, et des offres en base.

**C'est la tâche la plus importante du plan.** La leçon payée deux fois au plan
A vaut ici mot pour mot : **un test unitaire ne prouve rien sur un client
d'API** — ni sur un scraper. Les tests injectent un `fetch` factice ; seule une
exécution réelle prouve que l'URL construite par le code répond.

- [ ] **Step 1: Écrire `main.ts`**

```ts
// Point d'entrée du scraper Free-Work. SEUL fichier de _scrapers/free-work/ qui
// lise l'environnement : la frontière runtime du dépôt s'applique ici comme
// pour les index.ts des Edge Functions.
//
// Tout le déroulé — réglages de politesse, robots.txt, chargement des requêtes,
// collecte, marquage du run — vit dans _shared/main-runner.ts et est partagé
// avec Collective. Ce fichier ne dit que ce qui distingue Free-Work.
//
// Usage :
//   npm run scrape:free-work -- --mode delta
//   npm run scrape:free-work -- --mode backfill --query fw:skill:react
//   npm run scrape:free-work -- --mode delta --dry-run

import { runScraperMain, type ScraperDefinition } from '../_shared/main-runner.ts';
import { fetchFreeWorkOffers } from './client.ts';
import { mapFreeWorkOffer } from './mapper.ts';

const FREE_WORK: ScraperDefinition = {
  source: 'free_work',
  /** Les deux surfaces réellement visitées : un listing et une page d'offre. */
  pathsUsed: ['/fr/tech-it/jobs/react', '/fr/tech-it/job-mission/x/y'],
  /** Chaque offre coûte une page de détail : on ne repaie pas ce qu'on connaît. */
  needsKnownExternalIds: true,
  fetchAll: (ctx, query) =>
    fetchFreeWorkOffers({
      fetcher: ctx.fetcher,
      baseUrl: ctx.settings.baseUrl,
      maxListingPages: ctx.settings.maxPagesPerRun,
      windowDays: ctx.windowDays,
      knownExternalIds: ctx.knownExternalIds,
      refetchKnown: ctx.mode === 'backfill',
    }, query),
  map: mapFreeWorkOffer,
};

Deno.exit(await runScraperMain(FREE_WORK, { args: Deno.args, env: (name) => Deno.env.get(name) }));
```

- [ ] **Step 2: Ajouter les scripts npm**

Dans `package.json`, à côté de `fn:local:ft` :

```json
"scrape:free-work": "deno run --config supabase/functions/deno.json --env-file=.env.local --allow-read --allow-net --allow-env supabase/functions/_scrapers/free-work/main.ts",
"scrape:collective": "deno run --config supabase/functions/deno.json --env-file=.env.local --allow-read --allow-net --allow-env supabase/functions/_scrapers/collective/main.ts"
```

- [ ] **Step 3: Répétition à blanc, qui n'écrit rien**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run scrape:free-work -- --mode delta --query fw:skill:react --dry-run
```

Expected : un JSON avec `"dryRun": true`, `"runId": null`, un `preview` de trois
offres dont les champs `title`, `rate_raw` ou `salary_raw`, `city` et
`remote_label` sont manifestement corrects, et un `requests` de l'ordre de la
dizaine. **Puis vérifier que rien n'a été écrit :**

```bash
npx supabase db query --linked "select count(*) as offres from offers where source = 'free_work';"
```

Expected : **0**.

- [ ] **Step 4: Première collecte réelle, une seule facette**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run scrape:free-work -- --mode delta --query fw:skill:react
```

Expected : `"status": "success"`, `offersNew` franchement non nul.

- [ ] **Step 5: Mesurer en base**

Une commande par ligne, SQL sur une seule ligne :

```bash
npx supabase db query --linked "select count(*) as total, count(*) filter (where rate_raw is not null) as avec_tjm, count(*) filter (where remote_label = 'full') as full_remote, count(*) filter (where department in ('13','83','84')) as zone from offers where source = 'free_work';"
npx supabase db query --linked "select min(length(description)) as mini, percentile_disc(0.5) within group (order by length(description)) as mediane, max(length(description)) as maxi from offers where source = 'free_work';"
npx supabase db query --linked "select count(*) as avec_core from offers_ranked where source = 'free_work' and core_hits >= 1;"
npx supabase db query --linked "select source, count(*) from offers_shortlist group by source order by source;"
npx supabase db query --linked "select status, offers_new, offers_updated, started_at from collection_runs where source = 'free_work' order by started_at desc limit 1;"
npx supabase db query --linked "select key, robots_allows, robots_checked_at, last_status, last_run_at from sources where key = 'free_work';"
```

Expected et à citer dans le rapport :
- `total` non nul, `avec_tjm` **non nul** — c'est la première fois du projet
  qu'une offre porte un TJM.
- La médiane de description **très supérieure à 500** : c'est ce qui distingue
  cette source d'Adzuna, et il faut le vérifier plutôt que le croire.
- `avec_core` : la part d'offres que le lexique reconnaît. Comparer aux **7 sur
  493** d'Adzuna et le dire.
- `offers_shortlist` gagne une source.
- Le run est en `success`, `sources.robots_allows` est vrai et
  `sources.last_status` vaut `success`.

- [ ] **Step 6: Collecte complète des six facettes**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run scrape:free-work -- --mode delta
```

Expected : six lignes dans `collection_query_results`, une par facette.
Vérifier :

```bash
npx supabase db query --linked "select unit_label, fetched, new_offers, updated_offers, total_available, truncated, duration_ms, error from collection_query_results where run_id = (select id from collection_runs where source = 'free_work' order by started_at desc limit 1) order by unit_label;"
```

Expected : aucune ligne avec `error` non nul. Une ligne `truncated` est un
signal à consigner, pas un échec.

- [ ] **Step 7: Commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
git add supabase/functions/_scrapers/free-work/main.ts package.json
git commit -m "feat(free-work): point d'entree et premiere collecte reelle"
```

**Ce qu'il ne faut PAS faire :** ne pas lancer `--mode backfill` sur les six
facettes en première intention — mesuré, cela représente environ 900 requêtes,
soit trois quarts d'heure à 3 secondes de délai. Le backfill se fait facette par
facette, et seulement si la mesure le justifie.

---

### Task 10: Collective.work — client et mapper

**Files:**
- Create: `supabase/functions/_scrapers/collective/client.ts`
- Create: `supabase/functions/_scrapers/collective/mapper.ts`
- Test: `supabase/functions/_scrapers/collective/__tests__/client_test.ts`
- Test: `supabase/functions/_scrapers/collective/__tests__/mapper_test.ts`
- Fixture (déjà présente) : `collective/__tests__/fixtures/jobs-fr-page1.html`

**Interfaces:**
- Consumes: `PageFetcher`, `extractNextData`, `htmlToText`, `FetchResult`,
  `emptyOffer`, `classifyRemote`, `hasRemoteNegation`,
  `departmentCodeFromCityName`.
- Produces:
  - `function fetchCollectiveOffers(cfg: CollectiveClientConfig, query: SearchQueryRow): Promise<FetchResult>`
  - `function mapCollectiveOffer(raw: unknown): NormalizedOffer | null`

**Collective est plus simple que Free-Work :** une page de listing porte déjà 30
missions **entières**, description comprise. Il n'y a **aucune page de détail à
visiter**. En contrepartie, aucun filtre serveur n'existe : l'unité de collecte
est le balayage, et c'est la date qui l'arrête.

- [ ] **Step 1: Écrire les tests du client**

```ts
import { assert, assertEquals } from '@std/assert';
import type { FetchedPage, PageFetcher } from '../../_shared/http.ts';
import type { SearchQueryRow } from '../../../_shared/types.ts';
import { fetchCollectiveOffers } from '../client.ts';

const page1 = await Deno.readTextFile(
  new URL('./fixtures/jobs-fr-page1.html', import.meta.url),
);

const QUERY: SearchQueryRow = {
  id: 7,
  source: 'collective',
  label: 'collective:all',
  keywords: null,
  commune_insee: null,
  radius_km: null,
  extra_params: {},
  published_since_days: 3,
  priority: 10,
  enabled: true,
};

const BASE = 'https://www.collective.work';

function fetcherFor(pages: Map<string, string>, seen: string[] = []): PageFetcher {
  return {
    get(url: string): Promise<FetchedPage> {
      seen.push(url);
      const body = pages.get(url);
      if (body === undefined) return Promise.reject(new Error(`HTTP 404 sur ${url}`));
      return Promise.resolve({ url, status: 200, body });
    },
  };
}

Deno.test('la page réelle rend 30 missions et le total du site', async () => {
  const result = await fetchCollectiveOffers({
    fetcher: fetcherFor(new Map([[`${BASE}/jobs/fr`, page1]])),
    baseUrl: BASE,
    maxPages: 1,
    windowDays: 3,
    now: () => new Date('2026-09-08T12:00:00Z'),
  }, QUERY);

  assertEquals(result.offers.length, 30);
  assertEquals(result.totalAvailable, 6544);
  assertEquals(result.httpStatus, 200);
});

Deno.test('la première page n’emporte pas de paramètre page', async () => {
  const seen: string[] = [];
  await fetchCollectiveOffers({
    fetcher: fetcherFor(new Map([[`${BASE}/jobs/fr`, page1]]), seen),
    baseUrl: BASE,
    maxPages: 1,
    windowDays: 3,
    now: () => new Date('2026-09-08T12:00:00Z'),
  }, QUERY);

  assertEquals(seen, [`${BASE}/jobs/fr`]);
});

Deno.test('le parcours s’arrête quand la page entière est hors fenêtre', async () => {
  const seen: string[] = [];
  const result = await fetchCollectiveOffers({
    fetcher: fetcherFor(new Map([[`${BASE}/jobs/fr`, page1]]), seen),
    baseUrl: BASE,
    maxPages: 10,
    windowDays: 3,
    now: () => new Date('2026-11-01T12:00:00Z'),
  }, QUERY);

  // La page est lue — c'est ce qui permet de conclure — mais rien ne suit.
  assertEquals(seen.length, 1);
  assertEquals(result.offers.length, 30);
  assertEquals(result.truncated, false);
});

Deno.test('le plafond de pages marque le résultat comme tronqué', async () => {
  const pages = new Map([
    [`${BASE}/jobs/fr`, page1],
    [`${BASE}/jobs/fr?page=2`, page1],
  ]);
  const result = await fetchCollectiveOffers({
    fetcher: fetcherFor(pages),
    baseUrl: BASE,
    maxPages: 2,
    windowDays: 3,
    now: () => new Date('2026-09-08T12:00:00Z'),
  }, QUERY);

  assertEquals(result.truncated, true);
});

Deno.test('une page sans payload exploitable remonte une erreur explicite', async () => {
  const pages = new Map([[`${BASE}/jobs/fr`, '<html><body>rien</body></html>']]);
  let message = '';
  try {
    await fetchCollectiveOffers({
      fetcher: fetcherFor(pages),
      baseUrl: BASE,
      maxPages: 1,
      windowDays: 3,
    }, QUERY);
  } catch (e) {
    message = e instanceof Error ? e.message : String(e);
  }
  assert(message.includes('__NEXT_DATA__'), `message inattendu : ${message}`);
});
```

- [ ] **Step 2: Voir échouer, puis écrire `client.ts`**

```ts
// Client Collective.work.
//
// Le site est un Next.js dont chaque page de listing embarque son propre
// payload : props.pageProps.dehydratedState.queries[0].state.data.results porte
// 30 projets ENTIERS, description comprise. Il n'y a donc aucune page de détail
// à visiter — 30 missions pour une requête.
//
// Mesuré le 2026-09-08, et c'est ce qui dicte la stratégie : les filtres d'URL
// sont IGNORÉS par le serveur (?query=react, ?skills=REACT et
// ?workPreferences=REMOTE rendent tous les trois la page 1 non filtrée, total
// 6544 inchangé) — le filtrage est purement client. Seul ?page=N est honoré.
// L'ordre est décroissant par date malgré sort: "Relevance" : page 1 au
// 2026-09-07, page 50 au 2026-09-01, page 120 au 2026-07-07, page 219 en 2024.

import { extractNextData } from '../_shared/html.ts';
import type { PageFetcher } from '../_shared/http.ts';
import type { FetchResult } from '../../_shared/run-collection.ts';
import type { SearchQueryRow } from '../../_shared/types.ts';

const MS_PER_DAY = 86_400_000;

export interface CollectiveClientConfig {
  fetcher: PageFetcher;
  baseUrl: string;
  maxPages: number;
  windowDays: number;
  now?: () => Date;
}

interface SearchResults {
  projects: unknown[];
  total: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Descend jusqu'aux résultats. Chaque étape est vérifiée : un changement de
 * structure doit produire une erreur nette, écrite dans la télémétrie, et non
 * une collecte silencieusement vide.
 */
function readResults(html: string, url: string): SearchResults {
  const data = extractNextData(html);
  if (!isRecord(data)) throw new Error(`__NEXT_DATA__ absent ou illisible sur ${url}`);

  const props = isRecord(data.props) ? data.props : null;
  const pageProps = props && isRecord(props.pageProps) ? props.pageProps : null;
  const dehydrated = pageProps && isRecord(pageProps.dehydratedState)
    ? pageProps.dehydratedState
    : null;
  const queries = dehydrated && Array.isArray(dehydrated.queries) ? dehydrated.queries : null;
  const first = queries && queries.length > 0 && isRecord(queries[0]) ? queries[0] : null;
  const state = first && isRecord(first.state) ? first.state : null;
  const payload = state && isRecord(state.data) ? state.data : null;
  const results = payload && isRecord(payload.results) ? payload.results : null;

  if (!results || !Array.isArray(results.projects)) {
    throw new Error(`__NEXT_DATA__ sans liste de projets sur ${url}`);
  }

  const pagination = isRecord(results.pagination) ? results.pagination : null;
  const total = pagination && typeof pagination.total === 'number' ? pagination.total : null;

  return { projects: results.projects, total };
}

function newestPublication(projects: unknown[]): Date | null {
  let newest: Date | null = null;
  for (const project of projects) {
    if (!isRecord(project) || typeof project.publishedAt !== 'string') continue;
    const date = new Date(project.publishedAt);
    if (Number.isNaN(date.getTime())) continue;
    if (newest === null || date > newest) newest = date;
  }
  return newest;
}

export async function fetchCollectiveOffers(
  cfg: CollectiveClientConfig,
  _query: SearchQueryRow,
): Promise<FetchResult> {
  const now = (cfg.now ?? (() => new Date()))();
  const windowStart = new Date(now.getTime() - cfg.windowDays * MS_PER_DAY);

  const offers: unknown[] = [];
  let totalAvailable: number | null = null;
  let truncated = false;

  for (let page = 1; page <= cfg.maxPages; page++) {
    const url = page === 1 ? `${cfg.baseUrl}/jobs/fr` : `${cfg.baseUrl}/jobs/fr?page=${page}`;
    const listing = await cfg.fetcher.get(url);
    const { projects, total } = readResults(listing.body, url);

    if (page === 1) totalAvailable = total;
    if (projects.length === 0) break;
    offers.push(...projects);

    // Même règle que chez Free-Work, appliquée à un coût différent : on ne paie
    // jamais une requête pour une offre déjà connue hors fenêtre, et on ne jette
    // jamais une offre déjà reçue. Ici la page PORTE les missions entières : les
    // garder ne coûte rien, alors que chez Free-Work chacune vaudrait une page
    // de détail. L'ordre étant décroissant, aucune page suivante n'est utile.
    const newest = newestPublication(projects);
    if (newest !== null && newest < windowStart) break;

    if (page === cfg.maxPages) truncated = true;
  }

  return { offers, totalAvailable, truncated, httpStatus: 200 };
}
```

- [ ] **Step 3: Écrire les tests du mapper**

Valeurs calculées sur la fixture réelle.

```ts
import { assert, assertEquals } from '@std/assert';
import { extractNextData } from '../../_shared/html.ts';
import { mapCollectiveOffer } from '../mapper.ts';

const html = await Deno.readTextFile(new URL('./fixtures/jobs-fr-page1.html', import.meta.url));

/** Descend dans le payload de la fixture, en vérifiant chaque étape. */
function dig(value: unknown, ...keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    assert(typeof current === 'object' && current !== null, `chemin interrompu à ${key}`);
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function projects(): Record<string, unknown>[] {
  const queries = dig(extractNextData(html), 'props', 'pageProps', 'dehydratedState', 'queries');
  assert(Array.isArray(queries) && queries.length > 0);
  const list = dig(queries[0], 'state', 'data', 'results', 'projects');
  assert(Array.isArray(list));
  return list as Record<string, unknown>[];
}

Deno.test('première mission de la page réelle', () => {
  const offer = mapCollectiveOffer(projects()[0]);
  assert(offer);

  assertEquals(offer.source, 'collective');
  assertEquals(offer.external_id, 'cmtruvqzr58974jdcgiwp482i');
  assertEquals(offer.title, 'Consultant Senior DORA / IT Risk - Banque');
  assertEquals(offer.company_name, 'Anderson RH');
  assertEquals(
    offer.url,
    'https://www.collective.work/jobs/consultant-senior-dora-it-risk-banque-gt48',
  );
  assertEquals(offer.published_at, '2026-09-07T23:12:34.420Z');
  assertEquals(offer.city, 'Paris');
  assertEquals(offer.department, null);
  assertEquals(offer.contract_type, 'Freelance');
  assertEquals(offer.start_date_raw, 'IN_2_TO_4_WEEKS');
  // Le texte dit « 2 jours de télétravail » : il l'emporte, et il dit la même
  // chose que workPreferences ['HYBRID'].
  assertEquals(offer.remote_label, 'hybride');
  assertEquals(offer.is_remote, true);
});

Deno.test('la description est du texte, pas du HTML', () => {
  const offer = mapCollectiveOffer(projects()[0]);
  assert(offer?.description);
  assertEquals(offer.description.includes('<h3>'), false);
  assertEquals(offer.description.includes('<li>'), false);
  assert(offer.description.length > 500, 'description tronquée');
});

Deno.test('budgetBrief alimente rate_raw tel quel', () => {
  // Mesuré : une seule mission de la page en porte un, à l'indice 22.
  const offer = mapCollectiveOffer(projects()[22]);
  assertEquals(offer?.rate_raw, '450 à 550€');
});

Deno.test('REMOTE comble le silence, la négation l’emporte', () => {
  const base = {
    id: 'x',
    slug: 'y',
    name: 'Développeur React',
    publishedAt: '2026-09-07T00:00:00.000Z',
    workPreferences: ['REMOTE'],
  };

  assertEquals(
    mapCollectiveOffer({ ...base, description: '<p>Une mission, aucune mention du lieu.</p>' })
      ?.remote_label,
    'full',
  );
  assertEquals(
    mapCollectiveOffer({ ...base, description: '<p>Sur site, pas de télétravail.</p>' })
      ?.remote_label,
    null,
  );
});

Deno.test('une commune de la zone donne son département', () => {
  const offer = mapCollectiveOffer({
    id: 'x',
    slug: 'y',
    name: 'Développeur React',
    location: { fullNameFrench: 'Aix-en-Provence, France' },
  });

  assertEquals(offer?.city, 'Aix-en-Provence');
  assertEquals(offer?.department, '13');
});

Deno.test('CDI reconnu par isPermanentContract', () => {
  const offer = mapCollectiveOffer({ id: 'x', slug: 'y', name: 'T', isPermanentContract: true });
  assertEquals(offer?.contract_type, 'CDI');
});

Deno.test('une charge utile inexploitable rend null', () => {
  assertEquals(mapCollectiveOffer(null), null);
  assertEquals(mapCollectiveOffer({ slug: 'y', name: 'T' }), null);
  assertEquals(mapCollectiveOffer({ id: 'x', slug: 'y' }), null);
});
```

- [ ] **Step 4: Voir échouer, puis écrire `mapper.ts`**

```ts
// Projet Collective.work -> NormalizedOffer.
//
// Le payload est déjà structuré : rien à extraire d'un HTML de présentation,
// seulement la description à convertir en texte. Collective est la seule source
// du projet à porter un champ de télétravail EXPLICITE (workPreferences), mais
// la règle du dépôt ne change pas pour autant : le texte a le dernier mot, le
// champ déclaré ne comble qu'un silence.

import { departmentCodeFromCityName } from '../../_shared/departments.ts';
import { classifyRemote, hasRemoteNegation } from '../../_shared/remote.ts';
import { emptyOffer, type NormalizedOffer } from '../../_shared/types.ts';
import type { RemoteMode } from '../../_shared/remote.ts';
import { htmlToText } from '../_shared/html.ts';

interface CollectiveProject {
  id?: unknown;
  slug?: unknown;
  name?: unknown;
  description?: unknown;
  publishedAt?: unknown;
  budgetBrief?: unknown;
  idealStartDate?: unknown;
  isPermanentContract?: unknown;
  workPreferences?: unknown;
  company?: { name?: unknown };
  location?: { fullNameFrench?: unknown };
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * `workPreferences` est une liste : une mission peut accepter plusieurs modes.
 * On retient le plus favorable au profil, le full remote étant la seule
 * modalité exploitable hors de la zone (voir ROADMAP).
 */
function declaredRemote(value: unknown): RemoteMode {
  if (!Array.isArray(value)) return null;
  if (value.includes('REMOTE')) return 'full';
  if (value.includes('HYBRID')) return 'hybride';
  return null;
}

/** « Aix-en-Provence, France » -> « Aix-en-Provence ». Le pays n'est pas une ville. */
function cityOf(location: CollectiveProject['location']): string | null {
  const full = asText(location?.fullNameFrench);
  if (!full) return null;
  return asText(full.split(',')[0]);
}

export function mapCollectiveOffer(raw: unknown): NormalizedOffer | null {
  if (!raw || typeof raw !== 'object') return null;
  const project = raw as CollectiveProject;

  const id = asText(project.id);
  const title = asText(project.name);
  if (!id || !title) return null;

  const offer = emptyOffer('collective', id, title);

  const description = typeof project.description === 'string'
    ? htmlToText(project.description)
    : null;
  offer.description = description;

  const slug = asText(project.slug);
  offer.url = slug ? `https://www.collective.work/jobs/${slug}` : null;
  offer.company_name = asText(project.company?.name);
  offer.contract_type = project.isPermanentContract === true ? 'CDI' : 'Freelance';
  // Libellé libre côté source, ex. « 450 à 550€ » : rate_raw est fait pour ça.
  offer.rate_raw = asText(project.budgetBrief);
  offer.start_date_raw = asText(project.idealStartDate);

  offer.city = cityOf(project.location);
  offer.department = departmentCodeFromCityName(offer.city);

  if (typeof project.publishedAt === 'string') {
    const date = new Date(project.publishedAt);
    offer.published_at = Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const text = `${title} ${description ?? ''}`;
  const declared = declaredRemote(project.workPreferences);
  const mode = classifyRemote(text) ?? (hasRemoteNegation(text) ? null : declared);
  offer.remote_label = mode;
  offer.is_remote = mode === 'full' || mode === 'hybride';

  offer.raw = raw;
  return offer;
}
```

- [ ] **Step 5: Tests verts, porte complète, commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
git add supabase/functions/_scrapers/collective/
git commit -m "feat(collective): client de listing et mapper du payload Next"
```

Expected : 12 tests de plus, `verify` vert.

**Ce qu'il ne faut PAS faire :** ne pas tenter de filtrer côté serveur — c'est
mesuré, les paramètres sont ignorés. Ne pas appeler l'API interne du site : la
page de listing est la surface publique, celle que `robots.txt` autorise.

---

### Task 11: Point d'entrée Collective et collecte réelle

**Files:**
- Create: `supabase/functions/_scrapers/collective/main.ts`

**Interfaces:**
- Consumes: tout ce qui précède. Le script npm existe déjà (tâche 9).
- Produces: des missions Collective en base.

- [ ] **Step 1: Écrire `main.ts`**

Le déroulé vit dans le lanceur commun de la tâche 8 : ce fichier ne déclare que
ce qui distingue Collective. Une seule de ces valeurs mérite un mot —
`needsKnownExternalIds: false`. Collective ne visite aucune page de détail, donc
il n'y a **rien à économiser** : chaque passe revoit les 30 missions de chaque
page et rafraîchit `last_seen_at` et `seen_count`, exactement comme les deux
API. C'est l'inverse de Free-Work, et pour une raison mesurée, pas par symétrie.

```ts
// Point d'entrée du scraper Collective.work. SEUL fichier de
// _scrapers/collective/ qui lise l'environnement.
//
// Le déroulé est celui de _shared/main-runner.ts, partagé avec Free-Work : ce
// fichier ne dit que ce qui distingue Collective.
//
// Usage :
//   npm run scrape:collective -- --mode delta
//   npm run scrape:collective -- --mode backfill
//   npm run scrape:collective -- --mode delta --dry-run

import { runScraperMain, type ScraperDefinition } from '../_shared/main-runner.ts';
import { fetchCollectiveOffers } from './client.ts';
import { mapCollectiveOffer } from './mapper.ts';

const COLLECTIVE: ScraperDefinition = {
  source: 'collective',
  pathsUsed: ['/jobs/fr'],
  /**
   * La page de listing porte déjà les missions ENTIÈRES : il n'y a aucune
   * requête à économiser, et chaque passe rafraîchit last_seen_at et seen_count
   * comme le font les deux API. C'est la différence de fond avec Free-Work.
   */
  needsKnownExternalIds: false,
  fetchAll: (ctx, query) =>
    fetchCollectiveOffers({
      fetcher: ctx.fetcher,
      baseUrl: ctx.settings.baseUrl,
      maxPages: ctx.settings.maxPagesPerRun,
      windowDays: ctx.windowDays,
    }, query),
  map: mapCollectiveOffer,
};

Deno.exit(await runScraperMain(COLLECTIVE, { args: Deno.args, env: (name) => Deno.env.get(name) }));
```

- [ ] **Step 2: Répétition à blanc**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run scrape:collective -- --mode delta --dry-run
npx supabase db query --linked "select count(*) as offres from offers where source = 'collective';"
```

Expected : un `preview` correct, `"runId": null`, et **0** offre en base.

- [ ] **Step 3: Collecte réelle en delta**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run scrape:collective -- --mode delta
```

Expected : `"status": "success"`. Le delta de 3 jours coûte quelques pages ;
`requests` doit rester à un chiffre ou deux.

- [ ] **Step 4: Mesurer, et décider du backfill sur la mesure**

```bash
npx supabase db query --linked "select count(*) as total, count(*) filter (where remote_label = 'full') as full_remote, count(*) filter (where department in ('13','83','84')) as zone, count(*) filter (where rate_raw is not null) as avec_tjm from offers where source = 'collective';"
npx supabase db query --linked "select count(*) as avec_core from offers_ranked where source = 'collective' and core_hits >= 1;"
npx supabase db query --linked "select source, count(*) from offers_shortlist group by source order by source;"
```

Le backfill de 31 jours coûte une cinquantaine de requêtes, soit moins de trois
minutes : il est raisonnable, et il donne la matière de la tâche 11.

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run scrape:collective -- --mode backfill
```

Puis refaire les trois mesures ci-dessus et **citer les deux jeux de nombres**.

- [ ] **Step 5: Commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
git add supabase/functions/_scrapers/collective/main.ts
git commit -m "feat(collective): point d'entree et collecte reelle"
```

**Ce qu'il ne faut PAS faire :** ne pas monter `max_pages_per_run` au-delà de 60
sans mesure — au-delà, on paie des pages de 2024.

---

### Task 12: Planification quotidienne, mesure d'ensemble et documentation

**Files:**
- Create: `scripts/scrape-daily.cmd`
- Modify: `docs/ETAT.md`
- Modify: `docs/ROADMAP.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: les collectes réelles des tâches 9 et 11.
- Produces: une veille quotidienne qui tourne seule quand le PC est allumé, et
  une documentation qui dit la vérité mesurée.

- [ ] **Step 1: Écrire le lanceur**

`scripts/scrape-daily.cmd` :

```bat
@echo off
REM Lance les deux scrapers l'un apres l'autre. Contrairement aux deux API, qui
REM tournent en Edge Functions declenchees par pg_cron et donc PC eteint, les
REM scrapers ne collectent que si cette machine est allumee. C'est le compromis
REM assume du ROADMAP : ils demandent un delai de politesse et du temps de
REM parcours, qui ne tiennent pas dans les 2 secondes de CPU d'une Edge Function.
setlocal
set PATH=%PATH%;C:\Users\Leo\AppData\Local\Microsoft\WinGet\Links
cd /d "%~dp0.."
call npm run scrape:free-work -- --mode delta --trigger cron
call npm run scrape:collective -- --mode delta --trigger cron
endlocal
```

**Attention** : vérifier le chemin réel du dossier WinGet avant de committer —
le nom d'utilisateur porte un accent, et l'écrire de travers ferait échouer la
tâche planifiée en silence. Le contrôle est `where deno` depuis un `cmd.exe`.

- [ ] **Step 2: Déclarer la tâche planifiée**

```bat
schtasks /Create /TN "fast-travail scrapers" /TR "\"c:\Users\Léo\Workspace\fast-travail\scripts\scrape-daily.cmd\"" /SC DAILY /ST 07:15
```

07 h 15 : après `ft-daily` (6 h UTC) et `adzuna-daily` (6 h 30 UTC), pour que la
sélection du matin soit complète en une fois.

Vérifier :

```bat
schtasks /Query /TN "fast-travail scrapers" /V /FO LIST
```

Expected : `Statut : Prêt`, prochaine exécution le lendemain à 07:15.

- [ ] **Step 3: Prouver que le lanceur fonctionne**

```bat
schtasks /Run /TN "fast-travail scrapers"
```

Puis, quelques minutes plus tard :

```bash
npx supabase db query --linked "select source, trigger, status, offers_new, offers_updated, started_at from collection_runs where source in ('free_work','collective') order by started_at desc limit 4;"
```

Expected : **deux lignes portant `trigger = 'cron'`**. C'est la seule preuve
acceptable qu'une planification fonctionne — exactement le critère retenu au
plan A pour `pg_cron`.

- [ ] **Step 4: Mesure d'ensemble, source par source**

```bash
npx supabase db query --linked "select source, count(*) as offres, count(*) filter (where remote_label = 'full') as full_remote, count(*) filter (where department in ('13','83','84')) as zone, count(*) filter (where rate_raw is not null) as avec_tjm, round(avg(length(description))) as desc_moy from offers group by source order by source;"
npx supabase db query --linked "select source, count(*) from offers_shortlist group by source order by source;"
npx supabase db query --linked "select count(*) as total_shortlist from offers_shortlist;"
npx supabase db query --linked "select count(*) as doublons_inter_sources from (select lower(title), company_name from offers group by 1, 2 having count(distinct source) > 1) t;"
```

La dernière requête n'est pas décorative : elle **chiffre P6**, le dédoublonnage
inter-sources, qui passe de deux à quatre sources et devient la première dette
de la phase 2. Beaucoup d'annonces d'ESN paraissent simultanément sur Free-Work
et sur France Travail.

- [ ] **Step 5: Mettre `docs/ETAT.md` à jour**

C'est une exigence, pas une finition. Y consigner :

- Le tableau d'indicateurs rafraîchi — **compté en base, jamais recopié**.
- Une section « Plan B » listant les douze tâches et leur état.
- **Les trois affirmations démenties** par la reconnaissance : les sitemaps,
  Kicklox, et le sitemap comme surface. Corriger explicitement, à la manière de
  la ligne « Corrigé le 2026-09-08 » déjà présente. Ne pas laisser deux versions
  d'un fait cohabiter.
- L'écart Free-Work / Adzuna sur la description reçue et sur `core_hits`, avec
  les deux nombres.
- La sémantique de `seen_count` **sur les sources scrapées** : sur Free-Work, en
  delta, il compte des passes de découverte et non des observations, parce que
  le détail d'une offre connue n'est pas repayé. C'est une différence avec les
  deux API, et elle doit être écrite là où quelqu'un la lira avant de s'y fier.
- Le chiffre des doublons inter-sources, en mettant P6 à jour.
- Tout problème découvert en route, priorisé comme les P1-P7 existants.

- [ ] **Step 6: Corriger `docs/ROADMAP.md`**

Trois corrections, chacune fondée sur une mesure :

1. Le tableau du split de runtime dit « Scrapers | Free-Work, Codeur.com,
   Collective.work, Kicklox | Scripts Node locaux ». Il devient : **Free-Work,
   Collective.work | Scripts Deno locaux**, avec la raison du choix de Deno
   (une seule porte `verify`) et celle de l'abandon des deux autres (Codeur hors
   profil, Kicklox sans board public).
2. La phase 1 annonce « Plan B — les 4 scrapers ». Il y en a deux, et le dire
   avec la mesure qui l'a décidé.
3. Ajouter à « Ce que la mesure a démenti » ce que Free-Work change : la
   description entière y rend au lexique son rôle de filtre principal, et le
   TJM structuré ouvre un champ que ni France Travail ni Adzuna ne donnaient.

- [ ] **Step 7: Compléter `CLAUDE.md`**

Ajouter à « Frontières d'architecture » :

- `supabase/functions/_scrapers/` : scripts Deno locaux, hors Edge Functions.
  Seuls les `main.ts` lisent l'environnement ; le reste suit la même règle de
  neutralité que `_shared/`.
- **Le fait qui coûterait une demi-heure à quelqu'un d'autre** : `deno fmt`
  formate le HTML, et l'exclusion `**/__tests__/fixtures/**` de
  `supabase/functions/deno.json` est résolue relativement au dossier de ce
  fichier. Une fixture HTML placée hors de `supabase/functions/` fait donc
  échouer `fmt:check`. C'est la raison du placement sous `_scrapers/`, et elle
  n'est pas devinable.
- La règle de politesse : réglages en base, `robots.txt` vérifié à chaque
  exécution, agent utilisateur honnête et sans adresse personnelle, aucun
  parallélisme vers une même source.

- [ ] **Step 8: Commit**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
git add scripts/scrape-daily.cmd docs/ETAT.md docs/ROADMAP.md CLAUDE.md
git commit -m "docs(plan-b): deux scrapers livres, trois affirmations corrigees"
```

**Ce qu'il ne faut PAS faire :** ne pas inventer de chiffre — chaque nombre
écrit dans `ETAT.md` doit venir d'un `db query --linked` exécuté dans cette
tâche. Ne pas laisser dans le ROADMAP une phrase que la mesure a démentie.

---

## Ce qui n'est PAS dans ce plan, et pourquoi

- **Codeur.com et Kicklox.** Mesurés, écartés : 4 slugs front-end sur 103 pour
  le premier, aucun board public pour le second. Les rouvrir demanderait une
  mesure nouvelle, pas une décision.
- **Le dédoublonnage inter-sources (P6).** Il passe de deux à quatre sources et
  devient franchement urgent, mais c'est un travail de schéma et de vue, pas de
  collecte. La tâche 11 le **chiffre** pour que la phase 2 démarre sur un
  nombre.
- **Le géocodage par code INSEE (P1).** La table de zone de la tâche 5 est un
  filtre, pas un référentiel : elle ne prétend pas résoudre P1.
- **Toute exécution PC éteint pour les scrapers.** Les délais de politesse et le
  temps de parcours ne tiennent pas dans les 2 secondes de CPU d'une Edge
  Function. C'est le compromis que le ROADMAP a déjà tranché.
- **Le scoring IA (phase 2).** Free-Work multiplie la matière ; c'est justement
  ce qui rendra le pré-filtre lexical rentable.

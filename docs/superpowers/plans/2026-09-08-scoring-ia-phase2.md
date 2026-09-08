# Phase 2 — Scoring IA : plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE : utiliser
> `superpowers:subagent-driven-development` pour exécuter ce plan tâche par
> tâche. Les étapes sont des cases à cocher (`- [ ]`).

**Objectif** : faire lire par Claude chaque offre géographiquement atteignable,
en tirer une note de correspondance au CV, une extraction structurée et un
verdict court, puis classer par un score final dont les préférences restent
réglables en base sans repayer un appel.

**Architecture** : l'IA produit un jugement **figé** (`offer_ai_scores`) ; les
préférences — freelance, télétravail, TJM, durée, agentique, technos non
désirées, fraîcheur — vivent dans `scoring_weights` et sont appliquées par la
vue `offers_scored`, donc rétroactives et gratuites. Le client Claude reçoit
`fetch` en paramètre, comme tous les clients du dépôt.

**Pile** : Deno, `fetch` brut vers `api.anthropic.com`, PostgreSQL / Supabase,
Edge Function + `pg_cron` pour le quotidien, script Deno local pour l'amorçage.

Design : [`../specs/2026-09-08-scoring-ia-phase2-design.md`](../specs/2026-09-08-scoring-ia-phase2-design.md)

## Contraintes globales

Elles s'appliquent à **toutes** les tâches, sans être répétées à chaque fois.

- **Porte unique avant tout commit** :
  `export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify`
  Zéro erreur de format, de lint, de typage, zéro test rouge.
- **Deno est hors du PATH** : l'`export` ci-dessus doit précéder toute commande
  `deno` ou `npm run` **dans le même appel shell**. L'état ne persiste pas.
- **Aucun contournement du linter.** Pas de `deno-lint-ignore`, `@ts-ignore`,
  `@ts-expect-error`, `as any`. Le seul `as unknown as DbClient` admis est dans
  les faux clients de base des fichiers `__tests__/`.
- **`supabase/functions/_shared/` est runtime-neutre** : aucun `Deno.env`,
  aucun `Deno.*`, aucun import `node:`. La configuration arrive **en
  paramètre**. Contrôle :
  `grep -rn "Deno\.\|node:" supabase/functions/_shared/ --include=*.ts | grep -v "__tests__"`
  doit ne rien rendre. La lecture de l'environnement appartient aux `index.ts`.
- **Base distante** : `npx supabase db query --linked "<SQL sur UNE ligne>"`.
  Le drapeau `--linked` est obligatoire. `db diff` ne fonctionne pas ici
  (Docker absent).
- **Toute évolution de schéma passe par une migration**, données de référence
  comprises, en écritures idempotentes (`on conflict do nothing`). `git status`
  avant tout `db push`, et vérifier la taille du fichier : une migration vide
  s'applique « avec succès » sans rien faire.
- **RLS activé sur toute table nouvelle, sans aucune policy.**
- **Modèle** : `claude-sonnet-5`. **L'en-tête `anthropic-workspace-id` est
  obligatoire** — sans lui l'API répond 400. Mesuré le 2026-09-08.
- **Secrets** : `ANTHROPIC_API_KEY` et `ANTHROPIC_WORKSPACE_ID` sont dans
  `.env.local` (gitignoré) et devront passer par `npx supabase secrets set`
  pour l'Edge Function. Ne jamais recopier leur valeur nulle part.
- **Un test unitaire ne prouve rien sur un client d'API.** La tâche 3 se
  termine par un appel réel.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `supabase/migrations/20260908230000_candidate_profile.sql` | `candidate_profile`, `profile_skills`, seed du CV expurgé |
| `supabase/migrations/20260909000000_offer_ai_scores.sql` | `offer_ai_scores`, `scoring_weights`, vue `offers_ai_candidates` |
| `supabase/migrations/20260909010000_offers_scored.sql` | Vue `offers_scored` — combinaison des poids et fraîcheur |
| `supabase/functions/_shared/scoring-types.ts` | Types partagés du scoring, sans logique |
| `supabase/functions/_shared/claude.ts` | Client Claude, `fetch` injecté, sortie structurée |
| `supabase/functions/_shared/scoring-prompt.ts` | Construction du prompt, schéma JSON, `PROMPT_VERSION` |
| `supabase/functions/_shared/run-scoring.ts` | Orchestration : sélection, concurrence, écriture, télémétrie |
| `supabase/functions/score-offers/index.ts` | Point d'entrée Edge Function — lit l'environnement, délègue |
| `scripts/score-backfill.ts` | Amorçage local — même orchestration, boucle jusqu'à épuisement |

Tests miroir sous `supabase/functions/_shared/__tests__/`.

---

### Tâche 1 : Le profil — CV expurgé et compétences réglables

**Fichiers :**
- Créer : `supabase/migrations/20260908230000_candidate_profile.sql`

**Interfaces :**
- Produit : les tables `candidate_profile` (colonnes `id`, `label`,
  `is_active`, `cv_text`, `seniority_years`, `profile_version`, `created_at`)
  et `profile_skills` (`term`, `occurrences`, `last_used_year`, `stance`,
  `weight`). La tâche 5 lit la ligne `is_active = true`.

- [ ] **Étape 1 : écrire la migration**

```sql
-- Le profil candidat : le CV expurgé de ses coordonnees, et les competences
-- ponderees qui en derivent. Le CV part vers un tiers a chaque appel de
-- scoring : telephone, e-mail et LinkedIn n'y servent a rien et n'y figurent
-- donc pas.
create table if not exists candidate_profile (
  id               bigserial primary key,
  label            text        not null,
  is_active        boolean     not null default false,
  cv_text          text        not null,
  seniority_years  numeric     not null,
  profile_version  text        not null,
  created_at       timestamptz not null default now()
);

alter table candidate_profile enable row level security;

-- Une seule ligne active a la fois : l'orchestration en depend.
create unique index if not exists candidate_profile_one_active
  on candidate_profile (is_active) where is_active;

-- stance : 'core' (le noyau du profil), 'adjacent' (credible mais secondaire),
-- 'unwanted' (present au CV mais non desire — WordPress, Java EE, Python).
-- C'est ici que « je ne veux plus de X » s'exprime, par UPDATE, sans toucher
-- au code ni repayer un appel.
create table if not exists profile_skills (
  term            text    primary key,
  occurrences     integer not null default 0,
  last_used_year  integer,
  stance          text    not null check (stance in ('core', 'adjacent', 'unwanted')),
  weight          numeric not null default 1
);

alter table profile_skills enable row level security;

-- Comptes releves dans le CV le 2026-09-08 : React 7 experiences sur 8,
-- TypeScript 6, Node.js 3, Next.js 2, Angular 1, Java EE 2. La recence
-- compte autant que la frequence : Angular et Java EE sont les experiences
-- les plus anciennes (2019-2021), React et TypeScript sont continus.
insert into profile_skills (term, occurrences, last_used_year, stance, weight) values
  ('react',       7, 2026, 'core',     3.0),
  ('typescript',  6, 2026, 'core',     3.0),
  ('next.js',     2, 2026, 'core',     2.5),
  ('javascript',  7, 2026, 'core',     2.0),
  ('node.js',     3, 2023, 'adjacent', 1.5),
  ('supabase',    1, 2026, 'core',     2.0),
  ('postgresql',  2, 2026, 'adjacent', 1.5),
  ('tdd',         3, 2026, 'core',     2.0),
  ('jest',        2, 2025, 'adjacent', 1.5),
  ('llm',         1, 2026, 'core',     3.0),
  ('mcp',         1, 2026, 'core',     3.0),
  ('agentique',   1, 2026, 'core',     3.0),
  ('angular',     1, 2020, 'adjacent', 0.5),
  ('java',        2, 2021, 'unwanted', 0.5),
  ('wordpress',   1, 2023, 'unwanted', 0.5),
  ('python',      0, null, 'unwanted', 0.5)
on conflict (term) do nothing;
```

- [ ] **Étape 2 : ajouter le CV expurgé à la même migration**

Reprendre le texte de `docs/profil/CV_Leo_Bello_Front-End_Senior.pdf` en
**retirant** la ligne de coordonnées (téléphone, e-mail, LinkedIn) et la ville
de contact. Conserver le titre, le profil, les compétences, toutes les
expériences avec leurs dates et employeurs, et la formation.

```sql
insert into candidate_profile (label, is_active, cv_text, seniority_years, profile_version)
values (
  'CV Leo Bello — front-end senior',
  true,
  $cv$LEO BELLO — DEVELOPPEUR FRONT-END SENIOR
React, TypeScript, Next.js, PostgreSQL. Architecture UI, performance et qualite logicielle.
Base a Marseille. Teletravail ou hybride.

PROFIL
Developpeur front-end senior, pres de 7 ans d'experience sur des applications metier a
grande echelle comme sur des produits developpes from scratch, specialise en React,
TypeScript et Next.js. Architecture front-end et de composants, gestion d'etat, formulaires
avances, integration d'API REST, performance et maintenabilite. Pratique du TDD, des tests
unitaires (Jest, React Testing Library) et des revues de code, en Agile / Scrum et SAFe.

COMPETENCES
Front-end : React, Next.js, TypeScript, JavaScript ES6+, HTML5, CSS3, Angular, architecture
de composants, gestion d'etat, formulaires avances, responsive, maquettage UX/UI.
API et donnees : API REST, PostgreSQL, Supabase, Firebase, modelisation, OAuth 2.0, SSO,
integrations tierces (SharePoint, Yousign).
IA et agents : developpement assiste par IA (Claude Code, Cursor, GitHub Copilot), conception
de prompts, integration d'API de modeles de langage (LLM), developpement agentique (appels
d'outils, protocole MCP).
Back-end : Node.js, Next.js API routes, Java EE, Google Cloud Functions, Google Apps Script,
Python (PyTorch).
Tests et qualite : TDD, tests unitaires, Jest, React Testing Library, couverture > 80 %,
revues de code, documentation, refactoring.
Architecture : microservices, event-driven, optimisation des performances, scalabilite.
DevOps : Git, GitLab/GitHub, CI/CD, deploiement continu, suivi des KPI, WordPress.
Domaines : e-commerce, billetterie et evenementiel, dematerialisation et workflows de
validation, pilotage commercial et retail, gestion locative.
Methodes : Agile/Scrum, SAFe, PI Planning, recueil des besoins, chiffrage.
Langues : francais natif, anglais professionnel.

EXPERIENCE
Fevrier 2026 - aujourd'hui — Saisoneo, freelance, a distance.
Developpeur full stack React / Next.js / TypeScript. Application de gestion locative
saisonniere from scratch : architecture technique et modele de donnees, developpement complet
en TDD, front React/TypeScript et back Next.js avec Supabase et PostgreSQL, architecture
microservices et event-driven, integrations SharePoint et Yousign, OAuth 2.0 / SSO,
maquettage UX/UI, CI/CD.

Mai 2025 - aujourd'hui — Bleu Tomate, freelance, a distance.
Developpeur front-end React / TypeScript. Gestion de projet de bout en bout sur des campagnes
de communication, developpement React/TypeScript, integration d'API, Google Apps Script et
Cloud Functions sur Firebase, CI/CD, suivi des KPI, tests unitaires.

Novembre 2023 - avril 2025 — Sopra Steria, CDI, client La Francaise des Jeux,
Aix-en-Provence, hybride. Developpeur front-end React / TypeScript. Application de pilotage
commercial suivant pres de 29 000 points de vente. Equipe agile de 5, methodologie SAFe et PI
Plannings. Fonctionnalites complexes React/TypeScript sous forte exigence de qualite. Tests
Jest et React Testing Library, projet maintenu a plus de 80 % de couverture. Revues de code,
chiffrage, optimisation de l'existant.

Mai 2023 - octobre 2023 — freelance, a distance. Developpeur web React / TypeScript. Sites et
modules e-commerce, billetterie evenementielle, modules WordPress sur mesure, scripts Apps
Script. Cadrage, chiffrage, developpement et livraison en autonomie.

Mai 2022 - mai 2023 — Yooz, freelance, a distance. Developpeur full stack React / Node.js.
Plateforme SaaS de dematerialisation de factures utilisee dans plus de 50 pays. Workflows de
validation a logique metier complexe, circuits d'approbation multi-criteres. React,
TypeScript, Node.js, API REST sur PostgreSQL. Tests unitaires et documentation.

Octobre 2021 - mai 2022 — freelance, a distance. Developpeur full stack React / Node.js.
Missions clients React, TypeScript, Node.js, modules e-commerce et billetterie.

Septembre 2020 - septembre 2021 — Amiltone, alternance, Villeurbanne. Developpeur web full
stack. Maintenance et evolutions sur une application React et Java EE.

Juin 2019 - juillet 2020 — Sully Group, stage puis CDD, Grenoble. Developpeur full stack
Java EE / Angular. Chiffrage, developpement front Angular et back Java EE, revues de code.

FORMATION
Master Informatique MIAGE, Universite Grenoble Alpes, 2020-2021.
Licence Informatique option MIAGE, Universite Grenoble Alpes, 2015-2018.$cv$,
  7,
  'cv-2026-09-08'
)
on conflict do nothing;
```

- [ ] **Étape 3 : vérifier la taille du fichier avant de pousser**

```bash
git status && wc -c supabase/migrations/20260908230000_candidate_profile.sql
```
Attendu : plusieurs milliers d'octets, jamais 0.

- [ ] **Étape 4 : appliquer et vérifier l'effet en base**

```bash
npx supabase db push
npx supabase db query --linked "select label, seniority_years, profile_version, length(cv_text) as taille from candidate_profile where is_active;"
npx supabase db query --linked "select stance, count(*) from profile_skills group by stance order by stance;"
```
Attendu : une ligne active, `taille` de l'ordre de 3 000 caractères ;
`adjacent` 4, `core` 8, `unwanted` 3.

- [ ] **Étape 5 : vérifier qu'aucune coordonnée n'a fuité dans le CV**

```bash
npx supabase db query --linked "select count(*) as fuites from candidate_profile where cv_text ~* '(@|linkedin|06 ?[0-9]{2})';"
```
Attendu : `fuites = 0`. Si ce n'est pas 0, corriger le texte et rejouer par une
migration corrective — ne pas éditer la ligne à la main.

- [ ] **Étape 6 : commit**

```bash
git add supabase/migrations/20260908230000_candidate_profile.sql
git commit -m "feat(phase2): le profil candidat, CV expurge et competences ponderees

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 2 : Le jugement figé et les préférences réglables

**Fichiers :**
- Créer : `supabase/migrations/20260909000000_offer_ai_scores.sql`

**Interfaces :**
- Consomme : `candidate_profile` (tâche 1), `offers`, `offers_ranked`.
- Produit : la table `offer_ai_scores`, la table `scoring_weights`, et la vue
  `offers_ai_candidates` que la tâche 5 interroge pour choisir quoi scorer.

- [ ] **Étape 1 : écrire la migration**

```sql
-- Le jugement de l'IA, fige au moment de l'appel. prompt_version et
-- profile_version sont ce qui rend un re-scoring CIBLE : quand le prompt ou le
-- CV change, on ne repaie que les offres dont la version differe.
create table if not exists offer_ai_scores (
  offer_id         uuid primary key references offers (id) on delete cascade,
  fit_score        integer     check (fit_score between 0 and 100),
  verdict          text,
  extraction       jsonb,
  truncated_input  boolean     not null default false,
  model            text        not null,
  prompt_version   text        not null,
  profile_version  text        not null,
  input_tokens     integer     not null default 0,
  output_tokens    integer     not null default 0,
  cache_read_tokens integer    not null default 0,
  error            text,
  scored_at        timestamptz not null default now()
);

alter table offer_ai_scores enable row level security;

create index if not exists offer_ai_scores_versions
  on offer_ai_scores (prompt_version, profile_version);

-- Les preferences. Elles ne partent JAMAIS dans l'appel payant : ce que Leo
-- veut n'est pas un fait sur l'offre. Un UPDATE ici reclasse tout le passe
-- sans depenser un centime.
create table if not exists scoring_weights (
  key         text primary key,
  value       numeric not null,
  description text    not null
);

alter table scoring_weights enable row level security;

insert into scoring_weights (key, value, description) values
  ('freelance_bonus',        12, 'Freelance prioritaire sur le CDI'),
  ('cdi_bonus',               2, 'Le CDI reste acceptable, sans priorite'),
  ('remote_full_bonus',      15, 'Full teletravail : le critere le plus valorise'),
  ('remote_hybrid_bonus',     4, 'Hybride : acceptable, nettement moins bien'),
  ('tjm_floor',             400, 'TJM en dessous duquel aucun bonus n est accorde'),
  ('tjm_bonus_per_100',       3, 'Points par tranche de 100 EUR de TJM au-dessus du plancher'),
  ('tjm_bonus_cap',          12, 'Plafond du bonus de remuneration'),
  ('duration_long_months',    6, 'Duree a partir de laquelle une mission est dite longue'),
  ('duration_long_bonus',      8, 'Bonus de mission longue'),
  ('agentic_bonus',          10, 'IA, LLM, agents : differenciateur assume du profil'),
  ('unwanted_tech_malus',    15, 'Malus par techno non desiree. Descend, n elimine jamais'),
  ('freshness_grace_days',    7, 'Jours de score plein avant toute decote'),
  ('freshness_decay_per_day', 1, 'Points retires par jour au-dela de la periode de grace'),
  ('freshness_malus_cap',    25, 'Plafond de la decote de fraicheur')
on conflict (key) do nothing;

-- Les offres a scorer. Le perimetre est GEOGRAPHIQUE, pas lexical : le
-- pre-filtre du lexique ecartait 1 182 offres a portee que personne n'avait
-- lues, et les faire lire coute environ 6 EUR par mois (mesure 2026-09-08).
-- Le lexique reste expose comme signal de tri, il n'est plus une porte.
create or replace view offers_ai_candidates as
select
  o.id,
  o.source,
  o.title,
  o.description,
  o.company_name,
  o.city,
  o.department,
  o.remote_label,
  o.contract_type,
  o.contract_label,
  o.salary_raw,
  o.rate_raw,
  o.duration_raw,
  o.experience_raw,
  o.published_at,
  o.first_seen_at,
  -- Adzuna tronque TOUTE description a 500 caracteres, sans exception
  -- (mesure : min 500, mediane 500, max 500 sur 50 offres). Le drapeau part
  -- dans le prompt, qui interdit alors de conclure au rejet.
  (o.source = 'adzuna' and length(coalesce(o.description, '')) >= 500) as truncated_input,
  (select array_agg(sq.label order by sq.label)
     from search_queries sq
    where sq.id = any (o.found_by_query_ids)) as found_by_labels,
  s.prompt_version  as scored_prompt_version,
  s.profile_version as scored_profile_version
from offers o
left join offer_ai_scores s on s.offer_id = o.id
where o.department in ('13', '83', '84') or o.remote_label = 'full';
```

- [ ] **Étape 2 : vérifier la taille puis appliquer**

```bash
git status && wc -c supabase/migrations/20260909000000_offer_ai_scores.sql
npx supabase db push
```

- [ ] **Étape 3 : vérifier l'effet en base**

```bash
npx supabase db query --linked "select count(*) as candidats, count(*) filter (where truncated_input) as tronquees from offers_ai_candidates;"
npx supabase db query --linked "select count(*) as poids from scoring_weights;"
```
Attendu : `candidats` de l'ordre de 1 270 (le chiffre monte chaque matin),
`tronquees` de l'ordre de 500, `poids` = 14.

- [ ] **Étape 4 : commit**

```bash
git add supabase/migrations/20260909000000_offer_ai_scores.sql
git commit -m "feat(phase2): jugement fige, preferences reglables, vue des candidats

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 3 : Le client Claude

**Fichiers :**
- Créer : `supabase/functions/_shared/claude.ts`
- Créer : `supabase/functions/_shared/__tests__/claude_test.ts`

**Interfaces :**
- Produit : `callClaudeStructured<T>(cfg, call)`, les interfaces
  `ClaudeConfig`, `ClaudeUsage`, `StructuredCall`, `SystemBlock`,
  `ClaudeResult<T>`, et la classe `ClaudeApiError`. La tâche 5 les consomme.

**Fait vérifié le 2026-09-08, à ne pas redécouvrir** : `output_config.format`
prend `{ type: 'json_schema', schema: {...} }` en HTTP brut, et la réponse
arrive dans `content[0].text` sous forme de **chaîne JSON à parser** — il n'y
a pas de `parsed_output` hors SDK. L'en-tête `anthropic-workspace-id` est
obligatoire, faute de quoi l'API répond 400.

- [ ] **Étape 1 : écrire le test qui échoue**

```typescript
import { assertEquals, assertRejects } from '@std/assert';
import { callClaudeStructured, ClaudeApiError } from '../claude.ts';

const cfg = {
  apiKey: 'cle-de-test',
  workspaceId: 'ws-de-test',
  model: 'claude-sonnet-5',
};

const call = {
  systemBlocks: [{ type: 'text' as const, text: 'Tu notes des offres.' }],
  userText: 'Une offre React.',
  schema: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'] },
  maxTokens: 512,
};

function okResponse(payload: unknown, usage: Record<string, number> = {}): Response {
  return new Response(
    JSON.stringify({
      content: [{ type: 'text', text: JSON.stringify(payload) }],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        ...usage,
      },
    }),
    { status: 200 },
  );
}

Deno.test('parse la sortie structuree et remonte l usage', async () => {
  let seen: Request | undefined;
  const fetchImpl = (input: string | URL | Request, init?: RequestInit) => {
    seen = new Request(input, init);
    return Promise.resolve(okResponse({ n: 42 }, { cache_read_input_tokens: 7 }));
  };

  const result = await callClaudeStructured<{ n: number }>(
    { ...cfg, fetchImpl },
    call,
  );

  assertEquals(result.value.n, 42);
  assertEquals(result.usage.inputTokens, 10);
  assertEquals(result.usage.cacheReadInputTokens, 7);
  assertEquals(seen?.headers.get('anthropic-workspace-id'), 'ws-de-test');
  assertEquals(seen?.headers.get('x-api-key'), 'cle-de-test');
  assertEquals(seen?.headers.get('anthropic-version'), '2023-06-01');
});

Deno.test('envoie le schema dans output_config.format', async () => {
  let body: Record<string, unknown> = {};
  const fetchImpl = async (_i: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return okResponse({ n: 1 });
  };

  await callClaudeStructured<{ n: number }>({ ...cfg, fetchImpl }, call);

  const outputConfig = body.output_config as { format: { type: string; schema: unknown } };
  assertEquals(outputConfig.format.type, 'json_schema');
  assertEquals(outputConfig.format.schema, call.schema);
  assertEquals(body.model, 'claude-sonnet-5');
});

Deno.test('leve ClaudeApiError avec le statut sur une erreur HTTP', async () => {
  const fetchImpl = () =>
    Promise.resolve(new Response('{"error":{"message":"pas de workspace"}}', { status: 400 }));

  const error = await assertRejects(
    () => callClaudeStructured({ ...cfg, fetchImpl }, call),
    ClaudeApiError,
  );
  assertEquals(error.status, 400);
});

Deno.test('leve si la reponse ne porte aucun bloc de texte', async () => {
  const fetchImpl = () =>
    Promise.resolve(new Response(JSON.stringify({ content: [], usage: {} }), { status: 200 }));

  await assertRejects(() => callClaudeStructured({ ...cfg, fetchImpl }, call), ClaudeApiError);
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read --allow-env supabase/functions/_shared/__tests__/claude_test.ts
```
Attendu : ÉCHEC, `Module not found .../claude.ts`.

- [ ] **Étape 3 : écrire le client**

```typescript
/**
 * Client Claude minimal, en fetch injecte comme tous les clients du depot.
 * Ce fichier est runtime-neutre : il ne lit jamais l'environnement.
 *
 * Deux faits mesures le 2026-09-08, contre l'API reelle :
 * - l'en-tete `anthropic-workspace-id` est OBLIGATOIRE avec la cle du projet,
 *   qui n'est rattachee a aucun workspace. Sans lui : HTTP 400.
 * - la sortie structuree se demande par `output_config.format` de type
 *   `json_schema`, et revient dans `content[0].text` comme chaine JSON.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ClaudeConfig {
  apiKey: string;
  workspaceId: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export interface SystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface StructuredCall {
  systemBlocks: SystemBlock[];
  userText: string;
  schema: Record<string, unknown>;
  maxTokens: number;
}

export interface ClaudeUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface ClaudeResult<T> {
  value: T;
  usage: ClaudeUsage;
}

export class ClaudeApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ClaudeApiError';
    this.status = status;
  }
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

export async function callClaudeStructured<T>(
  cfg: ClaudeConfig,
  call: StructuredCall,
): Promise<ClaudeResult<T>> {
  if (!cfg.apiKey) throw new ClaudeApiError('ClaudeConfig.apiKey manquant', 0);
  if (!cfg.workspaceId) throw new ClaudeApiError('ClaudeConfig.workspaceId manquant', 0);

  const doFetch = cfg.fetchImpl ?? fetch;
  const response = await doFetch(cfg.baseUrl ?? ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-workspace-id': cfg.workspaceId,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: call.maxTokens,
      system: call.systemBlocks,
      messages: [{ role: 'user', content: call.userText }],
      output_config: { format: { type: 'json_schema', schema: call.schema } },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new ClaudeApiError(`Claude a repondu ${response.status} : ${detail}`, response.status);
  }

  const payload = (await response.json()) as AnthropicResponse;
  const text = payload.content?.find((block) => block.type === 'text')?.text;
  if (!text) {
    throw new ClaudeApiError('reponse Claude sans bloc de texte', response.status);
  }

  let value: T;
  try {
    value = JSON.parse(text) as T;
  } catch (cause) {
    throw new ClaudeApiError(`sortie structuree illisible : ${String(cause)}`, response.status);
  }

  const usage = payload.usage ?? {};
  return {
    value,
    usage: {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
    },
  };
}
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
```
Attendu : tout vert.

- [ ] **Étape 5 : l'appel RÉEL — un test unitaire ne prouve rien sur un client d'API**

C'est la leçon payée deux fois par ce dépôt : les tests ci-dessus injectent un
`fetch` factice et resteraient verts avec une URL fausse ou un en-tête manquant.

Créer `scripts/claude-smoke.ts` :

```typescript
import { callClaudeStructured } from '../supabase/functions/_shared/claude.ts';

const result = await callClaudeStructured<{ ok: boolean; note: number }>(
  {
    apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '',
    workspaceId: Deno.env.get('ANTHROPIC_WORKSPACE_ID') ?? '',
    model: 'claude-sonnet-5',
  },
  {
    systemBlocks: [{ type: 'text', text: 'Tu reponds en JSON strict.' }],
    userText: 'Reponds ok=true et note=7.',
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' }, note: { type: 'integer' } },
      required: ['ok', 'note'],
      additionalProperties: false,
    },
    maxTokens: 256,
  },
);

console.log(JSON.stringify(result));
```

Ajouter le script npm dans `package.json` :

```json
"claude:smoke": "deno run --config supabase/functions/deno.json --env-file=.env.local --allow-read --allow-net --allow-env scripts/claude-smoke.ts"
```

Lancer :

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run claude:smoke
```
Attendu : une ligne JSON portant `"ok":true`, `"note":7` et un `usage` non nul.
Si l'appel rend 400, lire le message : il nommera l'en-tête ou le champ fautif.

- [ ] **Étape 6 : commit**

```bash
git add supabase/functions/_shared/claude.ts supabase/functions/_shared/__tests__/claude_test.ts scripts/claude-smoke.ts package.json
git commit -m "feat(phase2): client Claude en fetch injecte, verifie par appel reel

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 4 : Le prompt et le schéma de jugement

**Fichiers :**
- Créer : `supabase/functions/_shared/scoring-types.ts`
- Créer : `supabase/functions/_shared/scoring-prompt.ts`
- Créer : `supabase/functions/_shared/__tests__/scoring-prompt_test.ts`

**Interfaces :**
- Consomme : rien des tâches précédentes en code ; reflète le schéma des
  tâches 1 et 2.
- Produit : `PROMPT_VERSION`, `JUDGEMENT_SCHEMA`, `buildSystemBlocks(profile,
  skills)`, `buildOfferText(offer)`, et les types `OfferToScore`,
  `OfferJudgement`, `OfferExtraction`, `CandidateProfileRow`,
  `ProfileSkillRow`. La tâche 5 les consomme tous.

- [ ] **Étape 1 : écrire les types**

Dans `supabase/functions/_shared/scoring-types.ts` :

```typescript
export type SkillStance = 'core' | 'adjacent' | 'unwanted';
export type Confidence = 'haute' | 'moyenne' | 'basse';
export type WorkMode = 'full_remote' | 'hybride' | 'sur_site' | null;
export type Engagement = 'freelance' | 'cdi' | 'cdd' | 'autre' | null;
export type Seniority = 'junior' | 'confirme' | 'senior' | 'lead' | null;

export interface CandidateProfileRow {
  label: string;
  cv_text: string;
  seniority_years: number;
  profile_version: string;
}

export interface ProfileSkillRow {
  term: string;
  occurrences: number;
  last_used_year: number | null;
  stance: SkillStance;
  weight: number;
}

export interface OfferToScore {
  id: string;
  source: string;
  title: string | null;
  description: string | null;
  company_name: string | null;
  city: string | null;
  department: string | null;
  remote_label: string | null;
  contract_type: string | null;
  contract_label: string | null;
  salary_raw: string | null;
  rate_raw: string | null;
  duration_raw: string | null;
  experience_raw: string | null;
  published_at: string | null;
  truncated_input: boolean;
  found_by_labels: string[] | null;
  scored_prompt_version: string | null;
  scored_profile_version: string | null;
}

export interface OfferExtraction {
  stack: string[];
  seniority: Seniority;
  work_mode: WorkMode;
  engagement: Engagement;
  duration_months: number | null;
  compensation_kind: 'tjm' | 'salaire' | null;
  compensation_min: number | null;
  compensation_max: number | null;
  agentic_ai: boolean;
  unwanted_tech: string[];
  domain: string | null;
  confidence: Confidence;
}

export interface OfferJudgement {
  fit_score: number;
  verdict: string;
  extraction: OfferExtraction;
}
```

- [ ] **Étape 2 : écrire le test qui échoue**

Dans `supabase/functions/_shared/__tests__/scoring-prompt_test.ts` :

```typescript
import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { buildOfferText, buildSystemBlocks, PROMPT_VERSION } from '../scoring-prompt.ts';
import type { CandidateProfileRow, OfferToScore, ProfileSkillRow } from '../scoring-types.ts';

const profile: CandidateProfileRow = {
  label: 'CV test',
  cv_text: 'LEO BELLO, developpeur front-end senior React TypeScript.',
  seniority_years: 7,
  profile_version: 'cv-2026-09-08',
};

const skills: ProfileSkillRow[] = [
  { term: 'react', occurrences: 7, last_used_year: 2026, stance: 'core', weight: 3 },
  { term: 'angular', occurrences: 1, last_used_year: 2020, stance: 'adjacent', weight: 0.5 },
  { term: 'wordpress', occurrences: 1, last_used_year: 2023, stance: 'unwanted', weight: 0.5 },
];

function offer(overrides: Partial<OfferToScore> = {}): OfferToScore {
  return {
    id: 'abc',
    source: 'adzuna',
    title: 'Developpeur React',
    description: 'Une mission React TypeScript.',
    company_name: 'ACME',
    city: 'Marseille',
    department: '13',
    remote_label: 'full',
    contract_type: 'freelance',
    contract_label: null,
    salary_raw: null,
    rate_raw: '500 EUR/jour',
    duration_raw: '12 mois',
    experience_raw: null,
    published_at: '2026-09-01T00:00:00Z',
    truncated_input: false,
    found_by_labels: ['adzuna:local:react-ts'],
    scored_prompt_version: null,
    scored_profile_version: null,
    ...overrides,
  };
}

Deno.test('le CV est cachable : le bloc systeme porte cache_control', () => {
  const blocks = buildSystemBlocks(profile, skills);
  const cached = blocks.filter((b) => b.cache_control?.type === 'ephemeral');
  assertEquals(cached.length, 1, 'un seul point de cache, sur le bloc stable');
  assertStringIncludes(cached[0].text, 'LEO BELLO');
});

Deno.test('les competences partent avec leur posture et leur recence', () => {
  const text = buildSystemBlocks(profile, skills).map((b) => b.text).join('\n');
  assertStringIncludes(text, 'react');
  assertStringIncludes(text, '2020');
  assertStringIncludes(text, 'wordpress');
});

Deno.test('le prompt interdit de rejeter sur un texte tronque', () => {
  const text = buildSystemBlocks(profile, skills).map((b) => b.text).join('\n');
  assertStringIncludes(text, 'tronqu');
  assert(/jamais|interdit|ne (pas|jamais)/i.test(text));
});

Deno.test('le texte de l offre porte la troncature et la provenance', () => {
  const tronquee = buildOfferText(offer({ truncated_input: true }));
  assertStringIncludes(tronquee, 'TRONQUEE');
  assertStringIncludes(tronquee, 'adzuna:local:react-ts');
  assertStringIncludes(tronquee, '500 EUR/jour');
});

Deno.test('une offre non tronquee ne porte pas l avertissement', () => {
  const complete = buildOfferText(offer({ truncated_input: false }));
  assert(!complete.includes('TRONQUEE'));
});

Deno.test('PROMPT_VERSION est une chaine non vide et stable', () => {
  assert(PROMPT_VERSION.length > 0);
});
```

- [ ] **Étape 3 : lancer le test et vérifier qu'il échoue**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read --allow-env supabase/functions/_shared/__tests__/scoring-prompt_test.ts
```
Attendu : ÉCHEC, `Module not found .../scoring-prompt.ts`.

- [ ] **Étape 4 : écrire le prompt**

Dans `supabase/functions/_shared/scoring-prompt.ts` :

```typescript
import type { SystemBlock } from './claude.ts';
import type {
  CandidateProfileRow,
  OfferToScore,
  ProfileSkillRow,
} from './scoring-types.ts';

/**
 * Toute modification du texte ci-dessous DOIT changer cette version : c'est
 * elle qui decide quelles offres seront rejouees, et donc repayees. La laisser
 * inchangee apres avoir modifie le prompt melangerait deux jugements
 * differents dans une meme colonne, sans aucun signal.
 */
export const PROMPT_VERSION = 'scoring-v1-2026-09-08';

/** Schema de sortie. `additionalProperties: false` est ce qui rend la sortie sure. */
export const JUDGEMENT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    fit_score: { type: 'integer', minimum: 0, maximum: 100 },
    verdict: { type: 'string', maxLength: 300 },
    extraction: {
      type: 'object',
      properties: {
        stack: { type: 'array', items: { type: 'string' } },
        seniority: { type: ['string', 'null'], enum: ['junior', 'confirme', 'senior', 'lead', null] },
        work_mode: { type: ['string', 'null'], enum: ['full_remote', 'hybride', 'sur_site', null] },
        engagement: { type: ['string', 'null'], enum: ['freelance', 'cdi', 'cdd', 'autre', null] },
        duration_months: { type: ['integer', 'null'] },
        compensation_kind: { type: ['string', 'null'], enum: ['tjm', 'salaire', null] },
        compensation_min: { type: ['number', 'null'] },
        compensation_max: { type: ['number', 'null'] },
        agentic_ai: { type: 'boolean' },
        unwanted_tech: { type: 'array', items: { type: 'string' } },
        domain: { type: ['string', 'null'] },
        confidence: { type: 'string', enum: ['haute', 'moyenne', 'basse'] },
      },
      required: [
        'stack',
        'seniority',
        'work_mode',
        'engagement',
        'duration_months',
        'compensation_kind',
        'compensation_min',
        'compensation_max',
        'agentic_ai',
        'unwanted_tech',
        'domain',
        'confidence',
      ],
      additionalProperties: false,
    },
  },
  required: ['fit_score', 'verdict', 'extraction'],
  additionalProperties: false,
};

const CONSIGNES = `Tu evalues l'adequation entre un CV et une offre d'emploi.

Tu produis TROIS choses, et rien d'autre :
1. fit_score : de 0 a 100, la correspondance des COMPETENCES entre le CV et
   l'offre. C'est un fait objectif sur l'offre.
2. verdict : une seule phrase, en francais, disant pourquoi ce score.
3. extraction : les faits de l'offre, tels qu'ils y figurent.

REGLE CAPITALE — tu ne juges PAS ce que le candidat prefere.
Ne tiens aucun compte, dans fit_score, du fait que le poste soit en freelance
ou en CDI, du niveau de teletravail, de la remuneration, de la duree, ni du
caractere desirable de la technologie. Ces preferences sont appliquees
ailleurs, apres toi. Tu notes uniquement : « ce candidat sait-il faire ce
travail ». Une mission WordPress parfaitement adaptee au CV recoit un
fit_score eleve — c'est correct, un autre etage la fera descendre.

Comment ponderer les technologies : une technologie souvent presente ET
recente dans le CV vaut beaucoup ; presente mais ancienne, elle vaut peu. Une
techno voisine que le candidat peut manifestement apprendre (Vue.js pour un
profil React, par exemple) merite un score MOYEN, pas un score bas.

REGLE SUR LES TEXTES TRONQUES — elle prime sur tout le reste.
Certaines offres arrivent avec une description coupee a 500 caracteres. Elles
sont signalees par « DESCRIPTION TRONQUEE ». Dans ce cas il t'est INTERDIT de
conclure au rejet : tu ne sais pas ce que contient la partie manquante, et la
pile technique figure presque toujours plus loin dans le texte. Note alors sur
ce que tu as — l'intitule, l'entreprise, la requete qui a trouve l'offre, la
remuneration — sans jamais descendre sous 40 au seul motif que le texte se
tait, et mets confidence a "basse".

extraction.unwanted_tech : liste les technologies de l'offre marquees
« non desiree » dans la grille de competences ci-dessous. Liste-les meme quand
le fit_score est eleve : c'est un fait, pas un jugement.

extraction.agentic_ai : true si la mission touche aux modeles de langage, aux
agents, au protocole MCP ou a l'ingenierie de prompts.

Reponds uniquement par le JSON demande.`;

export function buildSystemBlocks(
  profile: CandidateProfileRow,
  skills: ProfileSkillRow[],
): SystemBlock[] {
  const grille = skills
    .map((s) =>
      `- ${s.term} : ${s.stance === 'core' ? 'noyau' : s.stance === 'adjacent' ? 'adjacent' : 'non desiree'}` +
      `, ${s.occurrences} experience(s)` +
      `, derniere utilisation ${s.last_used_year ?? 'jamais'}`
    )
    .join('\n');

  // Un seul point de cache, sur le bloc stable : le CV et la grille ne
  // changent pas d'un appel a l'autre, l'offre si. Le minimum cachable est
  // d'environ 1 024 tokens ; verifier cache_read_input_tokens en tache 8.
  return [
    {
      type: 'text',
      text:
        `${CONSIGNES}\n\n--- CV DU CANDIDAT (${profile.seniority_years} ans d'experience) ---\n` +
        `${profile.cv_text}\n\n--- GRILLE DE COMPETENCES ---\n${grille}`,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

export function buildOfferText(offer: OfferToScore): string {
  const lignes: string[] = [];
  if (offer.truncated_input) {
    lignes.push('DESCRIPTION TRONQUEE a 500 caracteres par la source. Ne conclus pas au rejet.');
  }
  lignes.push(`Intitule : ${offer.title ?? 'inconnu'}`);
  lignes.push(`Entreprise : ${offer.company_name ?? 'inconnue'}`);
  lignes.push(`Lieu : ${offer.city ?? 'inconnu'} (departement ${offer.department ?? '?'})`);
  lignes.push(`Teletravail declare : ${offer.remote_label ?? 'non precise'}`);
  lignes.push(`Contrat : ${offer.contract_type ?? offer.contract_label ?? 'non precise'}`);
  if (offer.rate_raw) lignes.push(`TJM : ${offer.rate_raw}`);
  if (offer.salary_raw) lignes.push(`Salaire : ${offer.salary_raw}`);
  if (offer.duration_raw) lignes.push(`Duree : ${offer.duration_raw}`);
  if (offer.experience_raw) lignes.push(`Experience demandee : ${offer.experience_raw}`);
  if (offer.published_at) lignes.push(`Publiee le : ${offer.published_at}`);
  if (offer.found_by_labels?.length) {
    lignes.push(`Trouvee par la ou les requetes : ${offer.found_by_labels.join(', ')}`);
  }
  lignes.push('', '--- DESCRIPTION ---', offer.description ?? '(aucune description)');
  return lignes.join('\n');
}
```

- [ ] **Étape 5 : lancer la porte complète**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
```
Attendu : tout vert.

- [ ] **Étape 6 : commit**

```bash
git add supabase/functions/_shared/scoring-types.ts supabase/functions/_shared/scoring-prompt.ts supabase/functions/_shared/__tests__/scoring-prompt_test.ts
git commit -m "feat(phase2): prompt de jugement, schema contraint, competences ponderees

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 5 : L'orchestration

**Fichiers :**
- Créer : `supabase/functions/_shared/run-scoring.ts`
- Créer : `supabase/functions/_shared/__tests__/run-scoring_test.ts`

**Interfaces :**
- Consomme : `callClaudeStructured`, `ClaudeConfig`, `ClaudeApiError`
  (tâche 3) ; `PROMPT_VERSION`, `JUDGEMENT_SCHEMA`, `buildSystemBlocks`,
  `buildOfferText`, et les types (tâche 4) ; `DbClient` (`_shared/db.ts`) ; les
  tables et la vue des tâches 1 et 2.
- Produit : `runScoring(deps: ScoringDeps): Promise<ScoringSummary>`, avec
  `ScoringDeps { db, claude, limit, concurrency, dryRun }` et
  `ScoringSummary { candidates, scored, failed, inputTokens, outputTokens,
  cacheReadTokens }`. La tâche 6 l'appelle.

- [ ] **Étape 1 : écrire le test qui échoue**

Le faux client de base couvre exactement les chaînes d'appels que
`runScoring` déclenche, dans le style de `run-collection_test.ts`.

```typescript
import { assertEquals } from '@std/assert';
import { runScoring } from '../run-scoring.ts';
import type { DbClient } from '../db.ts';
import type { ClaudeResult } from '../claude.ts';
import type { OfferJudgement, OfferToScore } from '../scoring-types.ts';

function candidate(id: string, over: Partial<OfferToScore> = {}): OfferToScore {
  return {
    id,
    source: 'adzuna',
    title: 'Developpeur React',
    description: 'Mission React TypeScript.',
    company_name: 'ACME',
    city: 'Marseille',
    department: '13',
    remote_label: 'full',
    contract_type: 'freelance',
    contract_label: null,
    salary_raw: null,
    rate_raw: '500',
    duration_raw: '12 mois',
    experience_raw: null,
    published_at: '2026-09-01T00:00:00Z',
    truncated_input: false,
    found_by_labels: ['adzuna:local:react-ts'],
    scored_prompt_version: null,
    scored_profile_version: null,
    ...over,
  };
}

interface Recorded {
  upserts: Record<string, unknown>[][];
}

function fakeDb(candidates: OfferToScore[]): { db: DbClient; rec: Recorded } {
  const rec: Recorded = { upserts: [] };
  const db = {
    from(table: string) {
      if (table === 'candidate_profile') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    label: 'CV',
                    cv_text: 'CV de test',
                    seniority_years: 7,
                    profile_version: 'cv-1',
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === 'profile_skills') {
        return {
          select: () =>
            Promise.resolve({
              data: [
                { term: 'react', occurrences: 7, last_used_year: 2026, stance: 'core', weight: 3 },
              ],
              error: null,
            }),
        };
      }
      if (table === 'offers_ai_candidates') {
        return {
          select: () => ({
            or: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: candidates, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'offer_ai_scores') {
        return {
          upsert(rows: Record<string, unknown>[]) {
            rec.upserts.push(rows);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`table inattendue : ${table}`);
    },
  } as unknown as DbClient;
  return { db, rec };
}

const claude = { apiKey: 'k', workspaceId: 'w', model: 'claude-sonnet-5' };

// Le type de retour est explicite : sans lui, TypeScript elargit 'senior' et
// 'freelance' en `string` et le double n'est plus assignable a OfferJudgement.
function judgement(score: number): ClaudeResult<OfferJudgement> {
  return {
    value: {
      fit_score: score,
      verdict: 'Bonne correspondance React.',
      extraction: {
        stack: ['react'],
        seniority: 'senior',
        work_mode: 'full_remote',
        engagement: 'freelance',
        duration_months: 12,
        compensation_kind: 'tjm',
        compensation_min: 500,
        compensation_max: 500,
        agentic_ai: false,
        unwanted_tech: [],
        domain: 'saas',
        confidence: 'haute',
      },
    },
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 90,
      cacheCreationInputTokens: 0,
    },
  };
}

Deno.test('score chaque candidat et cumule l usage', async () => {
  const { db, rec } = fakeDb([candidate('a'), candidate('b')]);
  const summary = await runScoring({
    db,
    claude,
    limit: 10,
    concurrency: 2,
    dryRun: false,
    callClaude: () => Promise.resolve(judgement(80)),
  });

  assertEquals(summary.candidates, 2);
  assertEquals(summary.scored, 2);
  assertEquals(summary.failed, 0);
  assertEquals(summary.inputTokens, 200);
  assertEquals(summary.cacheReadTokens, 180);
  assertEquals(rec.upserts.length, 1);
  assertEquals(rec.upserts[0].length, 2);
  assertEquals(rec.upserts[0][0].fit_score, 80);
});

Deno.test('une offre en echec est comptee et porte son erreur, sans arreter le lot', async () => {
  const { db, rec } = fakeDb([candidate('a'), candidate('b')]);
  let appels = 0;
  const summary = await runScoring({
    db,
    claude,
    limit: 10,
    concurrency: 1,
    dryRun: false,
    callClaude: () => {
      appels += 1;
      return appels === 1 ? Promise.reject(new Error('529 surcharge')) : Promise.resolve(judgement(70));
    },
  });

  assertEquals(summary.scored, 1);
  assertEquals(summary.failed, 1);
  const enEchec = rec.upserts[0].find((r) => r.error !== null);
  assertEquals(typeof enEchec?.error, 'string');
  assertEquals(enEchec?.fit_score, null);
});

Deno.test('dryRun n ecrit rien', async () => {
  const { db, rec } = fakeDb([candidate('a')]);
  const summary = await runScoring({
    db,
    claude,
    limit: 10,
    concurrency: 1,
    dryRun: true,
    callClaude: () => Promise.resolve(judgement(90)),
  });

  assertEquals(summary.scored, 1);
  assertEquals(rec.upserts.length, 0);
});

Deno.test('aucun candidat : succes silencieux, aucun appel paye', async () => {
  const { db, rec } = fakeDb([]);
  let appels = 0;
  const summary = await runScoring({
    db,
    claude,
    limit: 10,
    concurrency: 2,
    dryRun: false,
    callClaude: () => {
      appels += 1;
      return Promise.resolve(judgement(50));
    },
  });

  assertEquals(summary.candidates, 0);
  assertEquals(summary.scored, 0);
  assertEquals(appels, 0);
  assertEquals(rec.upserts.length, 0);
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && deno test --config supabase/functions/deno.json --allow-read --allow-env supabase/functions/_shared/__tests__/run-scoring_test.ts
```
Attendu : ÉCHEC, `Module not found .../run-scoring.ts`.

- [ ] **Étape 3 : écrire l'orchestration**

```typescript
import type { DbClient } from './db.ts';
import { log } from './logger.ts';
import { callClaudeStructured, type ClaudeConfig, type ClaudeResult } from './claude.ts';
import {
  buildOfferText,
  buildSystemBlocks,
  JUDGEMENT_SCHEMA,
  PROMPT_VERSION,
} from './scoring-prompt.ts';
import type {
  CandidateProfileRow,
  OfferJudgement,
  OfferToScore,
  ProfileSkillRow,
} from './scoring-types.ts';

/** Injectable pour les tests : la vraie implementation appelle l'API. */
export type CallClaude = (
  cfg: ClaudeConfig,
  systemBlocks: ReturnType<typeof buildSystemBlocks>,
  userText: string,
) => Promise<ClaudeResult<OfferJudgement>>;

export interface ScoringDeps {
  db: DbClient;
  claude: ClaudeConfig;
  limit: number;
  concurrency: number;
  dryRun: boolean;
  callClaude?: CallClaude;
}

export interface ScoringSummary {
  candidates: number;
  scored: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

const MAX_TOKENS = 1024;

const defaultCallClaude: CallClaude = (cfg, systemBlocks, userText) =>
  callClaudeStructured<OfferJudgement>(cfg, {
    systemBlocks,
    userText,
    schema: JUDGEMENT_SCHEMA,
    maxTokens: MAX_TOKENS,
  });

/**
 * Scoring idempotent et reprenable. Il n'y a pas de « mode backfill » : la
 * selection est « les offres eligibles pas encore jugees DANS LA VERSION
 * COURANTE du prompt et du profil ». Relancer jusqu'a ce que `candidates`
 * rende 0 amorce tout le corpus, et une coupure ne coute que le lot en cours.
 */
export async function runScoring(deps: ScoringDeps): Promise<ScoringSummary> {
  const call = deps.callClaude ?? defaultCallClaude;

  const { data: profileRow, error: profileError } = await deps.db
    .from('candidate_profile')
    .select('label, cv_text, seniority_years, profile_version')
    .eq('is_active', true)
    .single();
  if (profileError || !profileRow) {
    throw new Error(`profil actif introuvable : ${profileError?.message ?? 'aucune ligne'}`);
  }
  const profile = profileRow as CandidateProfileRow;

  const { data: skillRows, error: skillsError } = await deps.db
    .from('profile_skills')
    .select('term, occurrences, last_used_year, stance, weight');
  if (skillsError) throw new Error(`lecture des competences : ${skillsError.message}`);
  const skills = (skillRows ?? []) as ProfileSkillRow[];

  const { data: candidateRows, error: candidatesError } = await deps.db
    .from('offers_ai_candidates')
    .select('*')
    .or(
      `scored_prompt_version.is.null,scored_prompt_version.neq.${PROMPT_VERSION},` +
        `scored_profile_version.neq.${profile.profile_version}`,
    )
    .order('published_at', { ascending: false })
    .limit(deps.limit);
  if (candidatesError) throw new Error(`lecture des candidats : ${candidatesError.message}`);

  const candidates = (candidateRows ?? []) as OfferToScore[];
  const summary: ScoringSummary = {
    candidates: candidates.length,
    scored: 0,
    failed: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
  };
  if (candidates.length === 0) return summary;

  const systemBlocks = buildSystemBlocks(profile, skills);
  const rows: Record<string, unknown>[] = [];

  // Un appel par offre : un lot partagerait un contexte, et une offre
  // contaminerait le jugement de la suivante. La concurrence remplace le lot.
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < candidates.length) {
      const offer = candidates[next++];
      const base = {
        offer_id: offer.id,
        truncated_input: offer.truncated_input,
        model: deps.claude.model,
        prompt_version: PROMPT_VERSION,
        profile_version: profile.profile_version,
        scored_at: new Date().toISOString(),
      };
      try {
        const result = await call(deps.claude, systemBlocks, buildOfferText(offer));
        summary.scored += 1;
        summary.inputTokens += result.usage.inputTokens;
        summary.outputTokens += result.usage.outputTokens;
        summary.cacheReadTokens += result.usage.cacheReadInputTokens;
        rows.push({
          ...base,
          fit_score: result.value.fit_score,
          verdict: result.value.verdict,
          extraction: result.value.extraction,
          input_tokens: result.usage.inputTokens,
          output_tokens: result.usage.outputTokens,
          cache_read_tokens: result.usage.cacheReadInputTokens,
          error: null,
        });
      } catch (cause) {
        summary.failed += 1;
        log('warn', 'offre non jugee', { offerId: offer.id, cause: String(cause) });
        // La ligne est ecrite quand meme : sans elle, l'offre reviendrait a
        // chaque passage et un echec permanent bloquerait la file. Avec elle,
        // l'offre sort de la selection jusqu'au prochain changement de version.
        rows.push({
          ...base,
          fit_score: null,
          verdict: null,
          extraction: null,
          input_tokens: 0,
          output_tokens: 0,
          cache_read_tokens: 0,
          error: String(cause),
        });
      }
    }
  };

  const workers = Math.max(1, Math.min(deps.concurrency, candidates.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));

  if (!deps.dryRun && rows.length > 0) {
    const { error } = await deps.db.from('offer_ai_scores').upsert(rows, { onConflict: 'offer_id' });
    if (error) throw new Error(`ecriture des scores : ${error.message}`);
  }

  return summary;
}
```

- [ ] **Étape 4 : lancer la porte complète**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
```
Attendu : tout vert. Vérifier aussi la neutralité runtime :

```bash
grep -rn "Deno\.\|node:" supabase/functions/_shared/ --include=*.ts | grep -v "__tests__"
```
Attendu : aucune ligne.

- [ ] **Étape 5 : commit**

```bash
git add supabase/functions/_shared/run-scoring.ts supabase/functions/_shared/__tests__/run-scoring_test.ts
git commit -m "feat(phase2): orchestration du scoring, idempotente et reprenable

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 6 : Les deux points d'entrée

**Fichiers :**
- Créer : `supabase/functions/score-offers/index.ts`
- Créer : `scripts/score-backfill.ts`
- Modifier : `package.json` (scripts `fn:local:score`, `fn:deploy:score`,
  `score:backfill`)

**Interfaces :**
- Consomme : `runScoring`, `ScoringSummary` (tâche 5), `createDbClient`.
- Produit : l'URL de fonction `score-offers` et la commande
  `npm run score:backfill`.

- [ ] **Étape 1 : écrire le point d'entrée Edge Function**

```typescript
import { createDbClient } from '../_shared/db.ts';
import { runScoring } from '../_shared/run-scoring.ts';

interface RequestBody {
  limit?: number;
  concurrency?: number;
  dryRun?: boolean;
}

/** Lecture de l'environnement : propre a Deno, donc hors de _shared/. */
function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`variable d'environnement manquante : ${name}`);
  return value;
}

Deno.serve(async (req) => {
  const body: RequestBody = await req.json().catch(() => ({}));

  const db = createDbClient({
    url: requireEnv('SUPABASE_URL'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  });

  try {
    const summary = await runScoring({
      db,
      claude: {
        apiKey: requireEnv('ANTHROPIC_API_KEY'),
        workspaceId: requireEnv('ANTHROPIC_WORKSPACE_ID'),
        model: 'claude-sonnet-5',
      },
      // Le flux quotidien mesure ~41 offres. 120 laisse de la marge tout en
      // tenant dans les 150 s de plafond avec une concurrence de 4.
      limit: body.limit ?? 120,
      concurrency: body.concurrency ?? 4,
      dryRun: body.dryRun === true,
    });
    return Response.json(summary);
  } catch (cause) {
    return Response.json({ error: String(cause) }, { status: 500 });
  }
});
```

- [ ] **Étape 2 : écrire le script d'amorçage local**

```typescript
import { createDbClient } from '../supabase/functions/_shared/db.ts';
import { runScoring } from '../supabase/functions/_shared/run-scoring.ts';
import { log } from '../supabase/functions/_shared/logger.ts';

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`variable d'environnement manquante : ${name}`);
  return value;
}

const db = createDbClient({
  url: requireEnv('SUPABASE_URL'),
  serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
});

const claude = {
  apiKey: requireEnv('ANTHROPIC_API_KEY'),
  workspaceId: requireEnv('ANTHROPIC_WORKSPACE_ID'),
  model: 'claude-sonnet-5',
};

// L'amorçage n'est pas un mode : c'est le meme appel relance jusqu'a
// epuisement de la file. Une coupure ne coute que le lot en cours.
const totals = { scored: 0, failed: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
let lot = 0;

while (true) {
  const summary = await runScoring({ db, claude, limit: 50, concurrency: 4, dryRun: false });
  if (summary.candidates === 0) break;

  lot += 1;
  totals.scored += summary.scored;
  totals.failed += summary.failed;
  totals.inputTokens += summary.inputTokens;
  totals.outputTokens += summary.outputTokens;
  totals.cacheReadTokens += summary.cacheReadTokens;
  log('info', `lot ${lot} termine`, summary);
}

log('info', 'amorcage termine', totals);
```

- [ ] **Étape 3 : ajouter les scripts npm**

Dans `package.json`, à côté des scripts existants :

```json
"fn:local:score": "deno run --config supabase/functions/deno.json --env-file=.env.local --allow-read --allow-net --allow-env supabase/functions/score-offers/index.ts",
"fn:deploy:score": "supabase functions deploy score-offers --import-map supabase/functions/deno.json",
"score:backfill": "deno run --config supabase/functions/deno.json --env-file=.env.local --allow-read --allow-net --allow-env scripts/score-backfill.ts"
```

- [ ] **Étape 4 : vérifier le typage des points d'entrée**

Le `check` n'est pas redondant avec `test` : aucun test n'importe ces
`index.ts`, donc `deno test` ne les typecheck pas.

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
```
Attendu : tout vert.

- [ ] **Étape 5 : essai local en `dryRun`, sans rien écrire ni payer beaucoup**

Dans un terminal : `npm run fn:local:score` (avec l'`export PATH`).
Dans un autre :

```bash
curl -s -X POST http://localhost:8000 -H 'content-type: application/json' -d '{"limit":3,"dryRun":true}'
```
Attendu : un JSON `{"candidates":3,"scored":3,"failed":0,...}` avec des tokens
non nuls. **Ne jamais envoyer un corps vide** : `dryRun` vaut `false` par
défaut et déclencherait un vrai lot de 120.

- [ ] **Étape 6 : commit**

```bash
git add supabase/functions/score-offers/index.ts scripts/score-backfill.ts package.json
git commit -m "feat(phase2): points d entree Edge Function et amorcage local

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 7 : La vue de classement

**Fichiers :**
- Créer : `supabase/migrations/20260909010000_offers_scored.sql`

**Interfaces :**
- Consomme : `offer_ai_scores`, `scoring_weights` (tâche 2), `offers`,
  `offers_ranked`.
- Produit : la vue `offers_scored` avec `final_score`, l'extraction à plat, et
  le détail des bonus pour que le classement soit explicable.

- [ ] **Étape 1 : écrire la migration**

```sql
-- Le classement final. L'IA a produit fit_score (fige) ; ici on applique les
-- PREFERENCES, qui sont des lignes de scoring_weights. Un UPDATE sur cette
-- table reclasse tout le corpus sans un seul appel paye : c'est la propriete
-- que la phase 2 devait absolument preserver.
create or replace view offers_scored as
with w as materialized (
  select
    max(value) filter (where key = 'freelance_bonus')        as freelance_bonus,
    max(value) filter (where key = 'cdi_bonus')              as cdi_bonus,
    max(value) filter (where key = 'remote_full_bonus')      as remote_full_bonus,
    max(value) filter (where key = 'remote_hybrid_bonus')    as remote_hybrid_bonus,
    max(value) filter (where key = 'tjm_floor')              as tjm_floor,
    max(value) filter (where key = 'tjm_bonus_per_100')      as tjm_bonus_per_100,
    max(value) filter (where key = 'tjm_bonus_cap')          as tjm_bonus_cap,
    max(value) filter (where key = 'duration_long_months')   as duration_long_months,
    max(value) filter (where key = 'duration_long_bonus')    as duration_long_bonus,
    max(value) filter (where key = 'agentic_bonus')          as agentic_bonus,
    max(value) filter (where key = 'unwanted_tech_malus')    as unwanted_tech_malus,
    max(value) filter (where key = 'freshness_grace_days')   as freshness_grace_days,
    max(value) filter (where key = 'freshness_decay_per_day') as freshness_decay_per_day,
    max(value) filter (where key = 'freshness_malus_cap')    as freshness_malus_cap
  from scoring_weights
),
base as materialized (
  select
    s.offer_id,
    s.fit_score,
    s.verdict,
    s.extraction,
    s.truncated_input,
    s.scored_at,
    (s.extraction ->> 'engagement')                   as engagement,
    (s.extraction ->> 'work_mode')                    as work_mode,
    (s.extraction ->> 'seniority')                    as seniority,
    (s.extraction ->> 'domain')                       as domain,
    (s.extraction ->> 'confidence')                   as confidence,
    ((s.extraction ->> 'agentic_ai')::boolean)        as agentic_ai,
    ((s.extraction ->> 'duration_months')::numeric)   as duration_months,
    (s.extraction ->> 'compensation_kind')            as compensation_kind,
    ((s.extraction ->> 'compensation_min')::numeric)  as compensation_min,
    ((s.extraction ->> 'compensation_max')::numeric)  as compensation_max,
    coalesce(jsonb_array_length(s.extraction -> 'unwanted_tech'), 0) as unwanted_count,
    -- L'age se mesure sur la publication, et a defaut sur la premiere vue.
    extract(day from now() - coalesce(o.published_at, o.first_seen_at))::numeric as age_days
  from offer_ai_scores s
  join offers o on o.id = s.offer_id
  where s.fit_score is not null
)
select
  b.offer_id                       as id,
  o.source,
  o.title,
  o.company_name,
  o.city,
  o.department,
  o.url,
  o.published_at,
  b.fit_score,
  b.verdict,
  b.engagement,
  b.work_mode,
  b.seniority,
  b.domain,
  b.confidence,
  b.agentic_ai,
  b.duration_months,
  b.compensation_kind,
  b.compensation_min,
  b.compensation_max,
  b.unwanted_count,
  b.truncated_input,
  b.age_days,
  b.extraction,
  -- Le detail, pour que le classement soit explicable et non un nombre opaque.
  (case b.engagement
     when 'freelance' then w.freelance_bonus
     when 'cdi'       then w.cdi_bonus
     else 0 end)                                                        as bonus_engagement,
  (case b.work_mode
     when 'full_remote' then w.remote_full_bonus
     when 'hybride'     then w.remote_hybrid_bonus
     else 0 end)                                                        as bonus_remote,
  least(
    w.tjm_bonus_cap,
    greatest(0, coalesce(b.compensation_max, b.compensation_min, 0) - w.tjm_floor)
      / 100 * w.tjm_bonus_per_100
  )                                                                     as bonus_remuneration,
  (case when coalesce(b.duration_months, 0) >= w.duration_long_months
        then w.duration_long_bonus else 0 end)                          as bonus_duree,
  (case when b.agentic_ai then w.agentic_bonus else 0 end)              as bonus_agentique,
  (b.unwanted_count * w.unwanted_tech_malus)                            as malus_technos,
  least(
    w.freshness_malus_cap,
    greatest(0, b.age_days - w.freshness_grace_days) * w.freshness_decay_per_day
  )                                                                     as malus_fraicheur,
  greatest(0, least(100,
    b.fit_score
    + (case b.engagement when 'freelance' then w.freelance_bonus when 'cdi' then w.cdi_bonus else 0 end)
    + (case b.work_mode when 'full_remote' then w.remote_full_bonus when 'hybride' then w.remote_hybrid_bonus else 0 end)
    + least(w.tjm_bonus_cap,
        greatest(0, coalesce(b.compensation_max, b.compensation_min, 0) - w.tjm_floor)
          / 100 * w.tjm_bonus_per_100)
    + (case when coalesce(b.duration_months, 0) >= w.duration_long_months then w.duration_long_bonus else 0 end)
    + (case when b.agentic_ai then w.agentic_bonus else 0 end)
    - (b.unwanted_count * w.unwanted_tech_malus)
    - least(w.freshness_malus_cap,
        greatest(0, b.age_days - w.freshness_grace_days) * w.freshness_decay_per_day)
  ))::numeric(5,1)                                                      as final_score
from base b
join offers o on o.id = b.offer_id
cross join w;
```

Note sur la redondance apparente : les bonus sont calculés deux fois, une fois
pour être exposés colonne par colonne et une fois dans `final_score`. C'est
délibéré — un score opaque n'est pas corrigeable, et une vue ne peut pas
réutiliser ses propres alias de sortie dans la même projection.

- [ ] **Étape 2 : vérifier la taille puis appliquer**

```bash
git status && wc -c supabase/migrations/20260909010000_offers_scored.sql
npx supabase db push
```
Attendu : succès. En cas d'erreur de syntaxe, corriger la migration — jamais la
base à la main.

- [ ] **Étape 3 : vérifier que le classement se tient**

```bash
npx supabase db query --linked "select count(*) as lignes, round(avg(final_score),1) as moy, max(final_score) as max, min(final_score) as min from offers_scored;"
```
Attendu : `min >= 0`, `max <= 100`, autant de lignes que d'offres jugées sans
erreur.

- [ ] **Étape 4 : vérifier qu'un réglage est bien gratuit et rétroactif**

C'est la promesse centrale du design, donc elle se prouve.

```bash
npx supabase db query --linked "select round(avg(final_score),2) as avant from offers_scored;"
npx supabase db query --linked "update scoring_weights set value = 30 where key = 'remote_full_bonus';"
npx supabase db query --linked "select round(avg(final_score),2) as apres from offers_scored;"
npx supabase db query --linked "update scoring_weights set value = 15 where key = 'remote_full_bonus';"
```
Attendu : `apres` strictement supérieur à `avant`, puis retour à la valeur
initiale. Aucun appel payant n'a eu lieu.

- [ ] **Étape 5 : commit**

```bash
git add supabase/migrations/20260909010000_offers_scored.sql
git commit -m "feat(phase2): vue de classement, preferences et decote de fraicheur

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 8 : Amorçage réel, mesure, déploiement et cron

**Fichiers :**
- Modifier : aucun fichier de code. Cette tâche produit des **mesures**.

**Interfaces :**
- Consomme : tout ce qui précède.

- [ ] **Étape 1 : premier lot réel restreint, et vérification du cache**

Le cache de prompt est le seul poste qui peut tripler la facture en silence.

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run fn:local:score
# dans un autre terminal :
curl -s -X POST http://localhost:8000 -H 'content-type: application/json' -d '{"limit":5,"concurrency":1}'
```
Attendu : `scored: 5`, et surtout **`cacheReadTokens` non nul**. S'il est à
zéro sur les cinq appels, le cache ne prend pas : vérifier que le bloc système
porte bien `cache_control` et qu'il dépasse ~1 024 tokens. Ne pas poursuivre
l'amorçage avant d'avoir tranché ce point — il décide du coût réel.

- [ ] **Étape 2 : lire quelques jugements à la main**

```bash
npx supabase db query --linked "select o.title, o.company_name, s.fit_score, s.verdict from offer_ai_scores s join offers o on o.id = s.offer_id where s.error is null order by s.scored_at desc limit 5;"
```
Attendu : des verdicts en français, cohérents avec l'intitulé. Si un verdict
mentionne le télétravail ou le TJM comme motif du score, le prompt fuit sur les
préférences : le corriger et incrémenter `PROMPT_VERSION`.

- [ ] **Étape 3 : lancer l'amorçage complet**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run score:backfill
```
Attendu : des lots successifs jusqu'à épuisement, puis un total. Durée de
l'ordre de 15 à 25 minutes pour ~1 270 offres à concurrence 4. Coût attendu :
**de l'ordre de 6 €**.

- [ ] **Étape 4 : mesurer le coût réel, plutôt que de l'estimer**

```bash
npx supabase db query --linked "select count(*) as jugees, sum(input_tokens) as in_tok, sum(output_tokens) as out_tok, sum(cache_read_tokens) as cache_tok, count(*) filter (where error is not null) as echecs from offer_ai_scores;"
```
Reporter ces nombres dans `ETAT.md` (tâche 9). Le coût se calcule à
3 $/M tokens en entrée et 15 $/M en sortie pour `claude-sonnet-5`, les tokens
lus en cache étant facturés à un dixième du tarif d'entrée.

- [ ] **Étape 5 : déployer la fonction et poser ses secrets**

```bash
npx supabase secrets set ANTHROPIC_API_KEY="<valeur de .env.local>" ANTHROPIC_WORKSPACE_ID="<valeur de .env.local>"
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run fn:deploy:score
```
Ne jamais écrire ces valeurs dans un fichier du dépôt, un commit ou un rapport.

- [ ] **Étape 6 : poser le cron à 7 h 00 UTC**

Le jeton est la clé **anon**, lue depuis Vault, comme les deux crons existants :
le job n'a besoin que de franchir `verify_jwt`, la fonction recevant sa propre
clé `service_role` de Supabase. Moindre privilège.

```sql
select cron.schedule(
  'score-daily',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://zbpbuzoukldbzfbbikhw.supabase.co/functions/v1/score-offers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_auth_key')
    ),
    body := '{"limit":120,"concurrency":4}'::jsonb
  );
  $$
);
```

- [ ] **Étape 7 : prouver le cron par un déclenchement réel**

La preuve retenue par ce dépôt est une exécution observée, pas une définition
de job.

```bash
npx supabase db query --linked "select jobname, schedule, active from cron.job order by jobname;"
```
Attendu : trois jobs actifs, dont `score-daily`. Puis, le lendemain :

```bash
npx supabase db query --linked "select count(*) as juges_hier from offer_ai_scores where scored_at::date = current_date;"
```
Attendu : un nombre non nul, de l'ordre du flux quotidien.

---

### Tâche 9 : Documentation

**Fichiers :**
- Modifier : `docs/ETAT.md`
- Modifier : `CLAUDE.md`
- Modifier : `docs/ROADMAP.md`

- [ ] **Étape 1 : `ETAT.md` — une section « Phase 2 — Scoring IA »**

Y consigner : le tableau des 9 tâches et leur état ; les mesures réelles de la
tâche 8 (offres jugées, tokens, coût constaté, taux de cache) ; les décisions
tranchées (périmètre géographique et non lexical, Sonnet 5 et non Haiku,
séparation figé / réglable, abandon mesuré du scraping `redirect_url`) ; et
tout problème découvert en chemin, numéroté à la suite de P14.

- [ ] **Étape 2 : `CLAUDE.md` — la recette de consultation**

Ajouter, à côté de la recette `offers_shortlist` existante :

```sql
select title, company_name, city, final_score, fit_score, engagement, work_mode,
       compensation_min, compensation_max, duration_months, agentic_ai,
       confidence, truncated_input, verdict
from offers_scored
order by final_score desc, published_at desc
limit 40;
```

Y documenter les pièges : `final_score` combine un jugement **figé** et des
préférences **réglables** ; `confidence = 'basse'` signale une offre jugée sur
un texte tronqué ; régler un poids se fait par `UPDATE` sur `scoring_weights`
et reclasse tout gratuitement, tandis que changer le prompt ou le CV impose de
faire évoluer `PROMPT_VERSION` ou `profile_version` et **repaie** les offres
concernées.

Ajouter `scoring_weights` et `profile_skills` au tableau des axes réglables.

- [ ] **Étape 3 : `ROADMAP.md` — corriger la phase 2**

Le ROADMAP décrit encore la phase 2 comme « Claude Haiku sur les offres
retenues, le score lexical décidant quelles offres méritent un appel payant ».
Remplacer par ce qui a été construit, et consigner la mesure qui l'a démenti :
le coût de l'appel (~6 €/mois sur le périmètre géographique) rendait le
pré-filtre inutile comme porte, et il écartait 1 182 offres à portée que
personne n'avait lues.

- [ ] **Étape 4 : vérifier et committer**

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
git add docs/ETAT.md docs/ROADMAP.md CLAUDE.md
git commit -m "docs(phase2): etat, recette de consultation, correction du ROADMAP

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Revue finale de branche

Après la tâche 9, une revue large de toute la branche par un agent distinct,
sur conformité **et** sur qualité. Points à examiner en priorité, parce que ce
sont ceux où ce dépôt a déjà été surpris :

1. **Le prompt fuit-il sur les préférences ?** Si un `verdict` motive le score
   par le télétravail ou le TJM, la séparation figé / réglable est percée et le
   classement n'est plus corrigeable sans repayer.
2. **Le cache de prompt fonctionne-t-il réellement ?** `cache_read_tokens`
   agrégé sur `offer_ai_scores`, pas une déduction.
3. **Une offre en échec permanent bloque-t-elle la file, ou en sort-elle ?**
   Vérifier sur une ligne portant `error is not null`.
4. **La vue `offers_scored` coûte-t-elle un temps raisonnable ?** La mesurer par
   `explain analyze`, jamais la déduire — ce dépôt a déjà écrit « linéaire »
   à tort sur un plan qui restait quadratique.
5. **Une offre tronquée peut-elle recevoir un score bas au seul motif du
   silence du texte ?** C'est la violation la plus grave possible du critère
   asymétrique.

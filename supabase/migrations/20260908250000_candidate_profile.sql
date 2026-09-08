-- Le profil candidat : le CV expurge de ses coordonnees, et les competences
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

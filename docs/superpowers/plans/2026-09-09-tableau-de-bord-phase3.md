# Phase 3 — Tableau de bord : plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE : utiliser
> `superpowers:subagent-driven-development` pour exécuter ce plan tâche par
> tâche. Les étapes sont des cases à cocher (`- [ ]`). **Une revue par un agent
> distinct après chaque tâche**, sur conformité *et* sur qualité.

**Objectif** : donner une interface à ce que les phases 1 et 2 ont produit,
pour décider vite à qui postuler — et avoir envie de postuler.

**Architecture** : une SPA React servie en local par Vite, qui parle à une Edge
Function Deno `api-dashboard`. La clé `service_role` est injectée par la
plateforme dans la fonction et **ne quitte jamais Supabase** ; le navigateur ne
porte que la clé `anon` (pour franchir `verify_jwt`) et un secret partagé.

**Pile** : React 18, TypeScript, Vite, Base UI, CSS Modules, Vitest, Framer
Motion. Côté serveur : Deno, la même Edge Function + `_shared/` runtime-neutre
que le reste du dépôt.

Maquettes validées : [`../../design/maquettes/`](../../design/maquettes/) ·
Règles contraignantes : [`../../design/GUIDELINES.md`](../../design/GUIDELINES.md) ·
État et arbitrages : [`../../ETAT.md`](../../ETAT.md), section « Phase 3 ».

**Vite, pas Next.js.** Le `ROADMAP` annonçait Next.js et
`.vscode/settings.json` le mentionne encore. Il n'y a aucun besoin de rendu
serveur — c'est une application mono-utilisateur servie en local — et le kit à
reprendre est celui de prospeo, qui est Vite. Next.js aurait ajouté un routeur,
un runtime serveur et une build à un projet qui n'en a besoin d'aucun. À
corriger dans le `ROADMAP` en tâche 10.

---

## Contraintes globales

Elles s'appliquent à **toutes** les tâches, sans être répétées à chaque fois.

- **Porte unique avant tout commit** :
  `export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify`
  Zéro erreur de format, de lint, de typage, zéro test rouge. **La tâche 2
  étend `verify` au dashboard** : à partir de là, la porte couvre les deux
  côtés.
- **Deno est hors du PATH** : l'`export` ci-dessus doit précéder toute commande
  `deno` ou `npm run` **dans le même appel shell**. L'état ne persiste pas.
- **Aucun contournement du linter.** Pas de `deno-lint-ignore`, `eslint-disable`,
  `@ts-ignore`, `@ts-expect-error`, `as any`, `as unknown as X` hors tests.
- **`supabase/functions/_shared/` est runtime-neutre** : aucun `Deno.env`,
  aucun `Deno.*`, aucun import `node:`. Contrôle :
  `grep -rn "Deno\.\|node:" supabase/functions/_shared/ --include=*.ts | grep -v "__tests__"`
  doit ne rien rendre. La lecture de l'environnement appartient aux `index.ts`.
- **Base distante** : `npx supabase db query --linked "<SQL sur UNE ligne>"`.
  Le drapeau `--linked` est obligatoire. `db diff` ne fonctionne pas ici
  (Docker absent) : vérifier le schéma par `db query --linked`.
- **Toute évolution de schéma passe par une migration**, données de référence
  comprises, en écritures idempotentes. `git status` avant tout `db push`, et
  **vérifier la taille du fichier** : une migration vide s'applique « avec
  succès » sans rien faire.
- **RLS activé sur toute table nouvelle, sans aucune policy.**
- **Aucune couleur en dur, aucune chaîne en dur, aucun emoji.** Voir
  `GUIDELINES.md` §3.8. Les icônes sont des SVG dessinés.
- **Une affirmation de performance se mesure**, jamais ne se déduit. Lire les
  plans (`explain analyze`), ne pas les supposer.

### Le piège d'outillage propre à cette phase

**`deno fmt` formate le HTML, et il ne doit jamais voir `dashboard/`.** Les
scripts `fmt`, `fmt:check`, `lint` et `check` ciblent explicitement
`supabase/functions/ scripts/`. **Ne jamais y ajouter `dashboard/`** : Deno
reformaterait du JSX et du CSS avec ses conventions, en conflit direct avec
Prettier, et `fmt:check` échouerait à chaque passage de l'un après l'autre.

Symétriquement, `.prettierignore` et `.eslintignore` excluent déjà
`supabase/functions/`. Ces deux fichiers existent depuis la phase 1 mais **les
outils ne sont pas installés** : c'est la tâche 2 qui les installe.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `supabase/migrations/20260910000000_offer_applications.sql` | Table `offer_applications`, vues `offer_display_groups` et `offer_application_state` |
| `supabase/migrations/20260910010000_offers_dashboard.sql` | Vue `offers_dashboard` — repli des doublons, élection par confiance, état de candidature |
| `supabase/functions/_shared/dashboard-query.ts` | Construction des requêtes de lecture, runtime-neutre |
| `supabase/functions/_shared/dashboard-api.ts` | Routage et validation des entrées, `fetch` et client injectés |
| `supabase/functions/api-dashboard/index.ts` | Point d'entrée — lit l'environnement, vérifie le secret, délègue |
| `dashboard/` | La SPA. Détail ci-dessous |
| `dashboard/src/ui/theme.css` | Tokens repris de prospeo |
| `dashboard/src/ui/kit/` | `Badge`, `Card`, `Tooltip`, `StatusBadge`, `EmptyState`, `Score`, `Absence` |
| `dashboard/src/i18n/` | `fr.ts`, `index.ts`, `i18n.test.ts` |
| `dashboard/src/data/` | Client d'API, types, hooks de lecture |
| `dashboard/src/ecrans/` | `Matin`, `Detail`, `Suivi` |

Tests miroir : `__tests__/` côté Deno, `*.test.ts(x)` à côté du fichier côté
dashboard, comme prospeo.

**Créneaux de migration vérifiés libres** sur toutes les branches locales le
2026-09-09 : le dernier occupé est `20260909050000`.

---

## Tâche 1 : Le suivi de candidature en base

**Objectif** : la table qui manque, et les deux vues qui règlent le problème que
les maquettes ont fait sortir — une même mission vue par deux sources ne doit
pas se suivre deux fois.

### Le problème à résoudre, et pourquoi il n'est pas évident

`offer_applications` est naturellement clé sur `offer_id`. Mais **P23** dit que
la même mission existe sous deux `offer_id` (64 paires mesurées). Marquer
« postulée » la ligne Free-Work laisserait donc la ligne Adzuna en « à
traiter », et le brief du jour la reproposerait le lendemain.

La solution retenue **ne duplique aucune donnée** : la table garde un
`offer_id` réel et vérifié par clé étrangère ; une vue propage l'état à toutes
les offres du même groupe d'affichage.

### Étapes

- [ ] Écrire `20260910000000_offer_applications.sql` :

```sql
create table if not exists offer_applications (
  offer_id          uuid primary key references offers(id) on delete cascade,
  status            text not null default 'a_traiter',
  outcome           text,
  opened_at         timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  applied_at        timestamptz,
  last_followup_at  timestamptz,
  interview_at      timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),
  -- PAS de colonne `updated_at`. Le depot n'a aucun declencheur et aucune
  -- convention de ce nom : la colonne serait figee a sa valeur par defaut, et
  -- afficherait une date de derniere modification FAUSSE que rien ne
  -- signalerait. `status_changed_at` porte deja la seule date de modification
  -- qui compte. Ne pas la rajouter « pour faire propre ».

  constraint offer_applications_status_connu check (
    status in ('a_traiter','retenue','postulee','relancee','entretien','terminee','ecartee')
  ),
  constraint offer_applications_outcome_connu check (
    outcome is null or outcome in ('offre_recue','refus','sans_reponse','desistement')
  ),
  -- Une issue ne qualifie qu'une candidature terminee. Sans cette garde, une
  -- offre « retenue » pourrait porter « refus » et le tableau de suivi
  -- afficherait une contradiction que rien ne signalerait.
  constraint offer_applications_issue_seulement_si_terminee check (
    outcome is null or status = 'terminee'
  ),
  -- On ne peut pas etre relance ni en entretien sans avoir postule. `ecartee`
  -- est volontairement HORS de cette liste : c'est une sortie possible a tout
  -- moment, y compris avant d'avoir postule.
  constraint offer_applications_date_envoi_coherente check (
    status not in ('postulee','relancee','entretien','terminee') or applied_at is not null
  )
);

alter table offer_applications enable row level security;

create index if not exists offer_applications_status_idx
  on offer_applications (status);
create index if not exists offer_applications_applied_at_idx
  on offer_applications (applied_at) where applied_at is not null;
```

- [ ] Dans la même migration, la clé de regroupement d'affichage :

```sql
create or replace view offer_display_groups as
select
  o.id as offer_id,
  coalesce(
    nullif(regexp_replace(lower(coalesce(o.company_name, '')), '[^a-z0-9]', '', 'g'), '')
      || '|' || regexp_replace(lower(o.title), '[^a-z0-9]', '', 'g'),
    o.id::text
  ) as display_key
from offers o;
```

  **Le `coalesce` extérieur n'est pas décoratif.** Quand `company_name` est
  nul — et il l'est sur une part réelle du corpus — `nullif` rend `NULL`, la
  concaténation rend `NULL`, et on retombe sur l'`id` : **l'offre ne se groupe
  avec personne**. C'est le comportement voulu. Deux offres sans employeur
  portant le même intitulé générique (« Développeur Full Stack (H/F) ») ne sont
  pas la même mission, et les fusionner serait exactement la faute que P14
  décrit.

- [ ] Puis la propagation de l'état au groupe :

```sql
create or replace view offer_application_state as
select distinct on (g.offer_id)
  g.offer_id,
  a.offer_id as application_offer_id,
  a.status, a.outcome, a.opened_at, a.status_changed_at,
  a.applied_at, a.last_followup_at, a.interview_at, a.notes,
  (a.offer_id <> g.offer_id) as heritee
from offer_display_groups g
join offer_display_groups pair on pair.display_key = g.display_key
join offer_applications a on a.offer_id = pair.offer_id
order by g.offer_id, a.status_changed_at desc, a.offer_id;
```

  `heritee` dit que l'état vient d'une **autre** annonce du même groupe. La
  colonne existe pour que l'interface puisse le montrer plutôt que de faire
  croire à une action directe.

- [ ] **Mesurer** le coût des deux vues (`explain analyze`, trois fois) et
      écrire les chiffres dans `ETAT.md`. `offer_display_groups` fait deux
      `regexp_replace` sur 4 146 lignes et sera rejouée à chaque lecture : si
      elle dépasse ~200 ms, poser un index d'expression et le mesurer à
      nouveau. **Ne rien affirmer sans le plan sous les yeux.**
- [ ] Appliquer : `git status`, vérifier la taille du fichier, `npx supabase db push`.
- [ ] **Vérifier l'effet en base**, pas seulement le succès de la commande :
      insérer une ligne de sonde sur une offre d'une des 64 paires connues,
      relire `offer_application_state`, confirmer que **les deux** offres du
      groupe portent l'état et que l'une a `heritee = true`, puis supprimer la
      sonde.
- [ ] Contrôler que les quatre contraintes refusent bien ce qu'elles doivent :
      `outcome` sur un `retenue`, `status = 'postulee'` sans `applied_at`, un
      `status` inconnu, un `outcome` inconnu. **Quatre `insert` qui doivent
      échouer** — une contrainte non éprouvée ne prouve rien.

---

## Tâche 2 : L'échafaudage du dashboard, et la porte de qualité étendue

**Objectif** : `dashboard/` existe, se lance, et `npm run verify` à la racine
couvre désormais les deux côtés du dépôt.

### Étapes

- [ ] Créer `dashboard/` avec React 18, TypeScript, Vite, Vitest, jsdom,
      Testing Library, Base UI, Framer Motion. Versions **pinnées**, alignées
      sur celles de prospeo là où elles existent.
- [ ] Installer et configurer Prettier et ESLint **à la racine** — les fichiers
      `.prettierignore` et `.eslintignore` les attendent depuis la phase 1 et
      excluent déjà `supabase/functions/`.
- [ ] `dashboard/package.json` porte son propre `verify` :
      `prettier --check`, `eslint`, `tsc --noEmit`, `vitest run`.
- [ ] Étendre le `package.json` racine :

```json
"verify": "npm run verify:deno && npm run verify:dashboard",
"verify:deno": "npm run fmt:check && npm run lint && npm run check && npm test",
"verify:dashboard": "npm --prefix dashboard run verify",
"dash:dev": "npm --prefix dashboard run dev"
```

  **Ne pas toucher aux cibles de `fmt`, `lint` et `check`** : elles restent
  `supabase/functions/ scripts/`. Voir « Le piège d'outillage » plus haut.

- [ ] Vérifier que `npm run verify` échoue **pour la bonne raison** si on
      introduit volontairement une faute de format côté dashboard, puis retirer
      la faute. Une porte qu'on n'a pas vue refuser quelque chose ne prouve
      rien.
- [ ] `npm run verify` complet au vert.

---

## Tâche 3 : Le thème et le vocabulaire d'interface

**Objectif** : le kit exécutable de `Composants.dc.html`, et les tests qui font
respecter mécaniquement ce qui peut l'être.

### Étapes

- [ ] `src/ui/theme.css` : les tokens **repris tels quels** de
      `prospeo/apps/dashboard/src/ui/theme.css` — couleurs, espacements,
      rayons, les trois familles, l'échelle de texte, l'anneau de focus
      `:focus-visible`. Mode sombre par défaut, et le bloc `[data-theme='light']`
      conservé pour que le thème clair reste livrable.
- [ ] `src/ui/kit/` : `Badge` (avec `ton`, `taille`, `point`, `discontinu`,
      exactement l'anatomie de prospeo), `Card`, `Tooltip`, `EmptyState`,
      `StatusBadge` (les sept statuts), et **deux composants propres à ce
      projet** :
  - `Score` — le **couple** `final` + `fit`, jamais l'un sans l'autre
    (`GUIDELINES.md` §3.4), avec la décomposition en jetons signés ;
  - `Absence` — les sept natures mesurées, une variante chacune
    (`GUIDELINES.md` §3.1). **C'est le composant à ne pas rater** : c'est là
    que ce genre de projet se trompe le plus souvent.
- [ ] Les trois tests de garde-fous, calqués sur prospeo :
  - `ui/guidelines.test.ts` — aucune couleur littérale hors du thème, aucune
    famille typographique hors des tokens, **aucun emoji nulle part**, et le
    piège `text-overflow: ellipsis` posé sur un conteneur `flex`/`grid` ;
  - `ui/theme.test.ts` — contraste mesuré sur les deux thèmes, présence des
    trois familles, aucun token sans consommateur ;
  - `i18n/i18n.test.ts` — en tâche 4.
- [ ] **Vérifier chaque test par mutation** : casser volontairement ce qu'il
      surveille et confirmer qu'il échoue *pour la bonne raison*. Un test de
      garde-fou qui ne refuse rien est pire qu'absent — il rassure.
- [ ] Confronter le rendu à `Composants.dc.html`. **Quand la maquette et le
      code divergent, la maquette gouverne** (`GUIDELINES.md` §2).

---

## Tâche 4 : L'internationalisation

**Objectif** : aucune chaîne en dur, et ajouter une langue plus tard n'est pas
une reprise.

### Étapes

- [ ] `src/i18n/fr.ts` — toutes les chaînes, y compris les libellés des sept
      statuts, des quatre issues, des sept absences et des messages de vide.
- [ ] `t()` typée sur les clés de `fr.ts` : une clé inexistante doit être une
      **erreur de compilation**, pas une chaîne vide à l'exécution.
- [ ] `i18n.test.ts` : aucune clé orpheline, aucune clé manquante.
- [ ] Un test qui **balaie `src/`** et échoue sur toute chaîne littérale rendue
      dans du JSX. C'est le seul moyen mécanique de tenir la règle ; sans lui
      elle se dégrade en trois écrans.

---

## Tâche 5 : La vue de lecture du tableau de bord

**Objectif** : une seule vue qui répond à « qu'est-ce que j'affiche », avec le
repli des doublons et l'élection par confiance.

### Étapes

- [ ] Écrire `20260910010000_offers_dashboard.sql` :

```sql
create or replace view offers_dashboard as
select distinct on (g.display_key)
  s.*,
  g.display_key,
  count(*)              over (partition by g.display_key) as group_size,
  array_agg(s.source)   over (partition by g.display_key) as group_sources,
  -- Les colonnes de candidature sont PREFIXEES, et ce n'est pas cosmetique :
  -- `s.*` projette les ~31 colonnes d'offers_scored, dont la liste evoluera.
  -- Le jour ou l'une d'elles s'appellerait `status` ou `outcome`, la vue
  -- exposerait deux colonnes de meme nom — PostgreSQL l'accepte a la creation
  -- et c'est le client qui recevrait la mauvaise, en silence. Le prefixe rend
  -- la collision impossible.
  st.status            as candidature_statut,
  st.outcome           as candidature_issue,
  st.opened_at         as candidature_ouverte_le,
  st.applied_at        as candidature_envoyee_le,
  st.last_followup_at  as candidature_relancee_le,
  st.interview_at      as candidature_entretien_le,
  st.heritee           as candidature_heritee
from offers_scored s
join offers o                     on o.id = s.id
join offer_display_groups g       on g.offer_id = s.id
left join offer_application_state st on st.offer_id = s.id
order by
  g.display_key,
  -- L'ELECTION SE FAIT PAR CONFIANCE, PAS PAR SCORE. Mesure qui l'impose :
  -- la mission ALLEGIS GROUP est jugee deux fois. Adzuna, sur 500 caracteres
  -- tronques, rend fit 75 et confiance basse ; Free-Work, sur le texte
  -- integral, rend fit 58 et confiance haute, avec un verdict bien plus
  -- precis. Elire par final_score mettrait donc en tete le jugement le MOINS
  -- informe — et propagerait au passage une unite de remuneration fausse
  -- (450 EUR etiquetes « salaire » annuel au lieu de TJM).
  case s.confidence when 'haute' then 0 when 'moyenne' then 1 else 2 end,
  length(o.description) desc nulls last,
  s.final_score desc,
  s.published_at desc nulls last,
  s.id;
```

  **`array_agg` en fenêtre avant le `distinct on`** : les fonctions de
  fenêtrage sont évaluées avant `DISTINCT ON`, donc `group_size` et
  `group_sources` décrivent bien le groupe entier et non la seule ligne élue.
  Le vérifier plutôt que le croire — c'est exactement le genre d'ordre
  d'évaluation qu'on suppose de travers.

- [ ] **Mesurer** (`explain analyze`, trois fois) et écrire le chiffre dans
      `ETAT.md`. Repère : `offers_scored` seule coûte ~26 ms. Si la vue dépasse
      quelques centaines de millisecondes, **lire le plan** — la cause la plus
      probable est `offer_display_groups` rejouée par ligne, et le remède un
      index d'expression, pas une CTE `materialized` posée au hasard.
- [ ] **Prouver le repli sur les deux paires connues** : ALLEGIS GROUP et
      Digistrat consulting doivent rendre **une** ligne chacune, avec
      `group_size = 2`, et l'élue doit être celle de confiance **haute**
      (Free-Work), donc `fit_score` 58 et non 75.
- [ ] Compter les lignes : `offers_dashboard` doit en rendre **79 de moins**
      qu'`offers_scored` (1 269 → ~1 190). **Remesurer, ne pas recopier** : le
      corpus bouge chaque matin.
- [ ] Vérifier qu'aucune offre ne **disparaît** : toute ligne d'`offers_scored`
      doit se retrouver soit affichée, soit dans un groupe dont un
      représentant est affiché. Requête d'écart, attendu **zéro ligne**. C'est
      le contrôle qui protège le critère fondateur du dépôt.

---

## Tâche 6 : L'Edge Function de lecture et d'écriture

**Objectif** : le navigateur atteint la base sans jamais voir la
`service_role`.

### La posture de sécurité, énoncée honnêtement

Trois barrières, dont **aucune n'est une authentification** :

1. `verify_jwt = true` — la plateforme refuse tout appel sans jeton valide. La
   clé `anon` du navigateur sert exactement à ça, comme pour les crons.
2. Un **secret partagé** dans l'en-tête, vérifié par la fonction. Il écarte qui
   connaîtrait la référence de projet et la clé `anon`.
3. RLS actif sans policy : la clé `anon` ne lit **rien** directement.

**Ce que ça ne protège pas** : le secret est dans le bundle. Tant que la SPA
n'est servie qu'en local, il n'atteint personne. **Si elle est publiée un jour,
il faudra une vraie authentification** — à écrire dans `ETAT.md` comme une
condition, pas comme une option.

### Étapes

- [ ] `_shared/dashboard-query.ts` — construction des lectures. **Runtime-neutre** :
      client de base et configuration **en paramètre**.
- [ ] `_shared/dashboard-api.ts` — routage et **validation stricte des
      entrées** : tri parmi une liste fermée, pagination bornée, statut et
      issue validés contre les mêmes énumérations que les contraintes SQL.
      Toute valeur inattendue est un 400, jamais un défaut silencieux.
- [ ] Routes :
  - `GET /offers` — liste, tri, filtres, pagination
  - `GET /offers/:id` — le détail, avec **les jugements de tout le groupe**
  - `GET /brief` — les offres au-dessus de 50 sans décision enregistrée
  - `GET /stats` — entonnoir, série, compteur anti-perte
  - `POST /offers/:id/open` — crée la ligne `a_traiter` si absente
  - `PATCH /offers/:id/application` — statut, issue, dates, notes
- [ ] `api-dashboard/index.ts` — lit l'environnement (`requireEnv`), vérifie le
      secret, délègue. **Aucune logique métier ici.**
- [ ] Tests unitaires sur le routage et la validation, `fetch` et client
      injectés.
- [ ] Vérifier la neutralité runtime :
      `grep -rn "Deno\.\|node:" supabase/functions/_shared/ --include=*.ts | grep -v "__tests__"`
      ne rend rien.
- [ ] **Un test unitaire ne prouve rien sur un client d'API.** Terminer par un
      appel réel contre la fonction déployée : **401 sans jeton**, **403 avec
      jeton mais sans le secret**, **200 avec les deux**. Les trois, mesurés.

---

## Tâche 7 : L'écran du matin

**Objectif** : `Main.dc.html` en React. C'est l'écran qui justifie la phase.

### Étapes

- [ ] La bande « Ce matin » : les offres au-dessus de **50** sans décision, en
      **trois cartes** (direction A), avec la pagination `1–3 sur N`.
- [ ] La boucle qui se vide, la série, et le compteur anti-perte dans l'en-tête
      de liste. **Chacun doit avoir son état à zéro**, et le montrer comme
      `Etats.dc.html` le dessine — pas une zone blanche.
- [ ] La liste complète : **rien de masqué**, triée par rang, avec le
      basculeur « trier par correspondance ». Virtualiser si la mesure le
      justifie, **après** l'avoir mesurée.
- [ ] Le panneau de filtres, **aucun coché au démarrage**, et la ligne « non
      précisé » visible et chiffrée pour `work_mode`. **863 offres, 68 % du
      corpus, en dépendent** (`GUIDELINES.md` §3.2).
- [ ] **Ne pas construire de filtre par `domain`** : 960 valeurs distinctes sur
      1 269 lignes. Il s'affiche, il ne se facette jamais.
- [ ] **Ne pas construire de compteur « nouvelles aujourd'hui »** :
      `first_seen_at` ne porte que deux jours d'historique (`GUIDELINES.md`
      §3.3). Le remplacement est « N offres à décider ».
- [ ] Animations Framer Motion : `layout` sur les lignes, `AnimatePresence` sur
      la sortie d'une carte décidée. Sobre — une réorganisation lisible, pas un
      effet.
- [ ] Respecter `prefers-reduced-motion`.

---

## Tâche 8 : Le détail d'une offre

**Objectif** : `Detail.dc.html` en React, y compris le cas à deux jugements.

### Étapes

- [ ] Le rang **décomposé** en jetons signés, avec la phrase qui distingue le
      figé du réglable.
- [ ] Le bloc **« Vue sur deux sources »** quand `group_size > 1` : le jugement
      retenu et le jugement masqué, côte à côte, avec leurs confiances.
- [ ] La rémunération selon **trois rendus** (`GUIDELINES.md` §3.6) : montant
      sûr, montant barré + « unité incertaine », ou absence nommée. **Ne jamais
      afficher un nombre nu dont l'unité est douteuse** — 102 montants sur 599
      sont dans ce cas.
- [ ] L'extraction, avec les technos du CV distinguées des autres.
- [ ] Le fil du suivi et les actions de changement d'état, `heritee` signalé
      quand l'état vient d'une autre annonce du groupe.
- [ ] Le bouton vers l'annonce d'origine, avec l'icône de sortie.
- [ ] Le bouton d'import du CV. **Tranché le 2026-09-09 : il met à jour
      `candidate_profile.cv_text`, et il ne rejuge rien.** Coût zéro, les
      1 269 jugements payés restent valides.

      **La limite est assumée, donc elle doit être dite à l'écran** : les
      scores continuent de refléter le CV sous lequel ils ont été rendus. Après
      un import, afficher combien d'offres ont été jugées sous un
      `profile_version` antérieur — c'est une simple requête — et **ne
      proposer aucun bouton pour les rejuger**. Rejuger reste une opération
      délibérée en ligne de commande (`npm run score:backfill`), à ~12 € le
      passage.

      Ce qui est **interdit** ici : laisser croire par un libellé, une
      animation ou un état de chargement que l'import a mis les scores à jour.
      C'est exactement l'affordance qui annonce un fait qu'aucun code ne rend
      vrai (`GUIDELINES.md` §3.3).

---

## Tâche 9 : Le suivi et la gamification

**Objectif** : `Suivi.dc.html` en React, sans qu'aucun chiffre ne mente.

### Étapes

- [ ] L'entonnoir : trois étages comptés en base, deux derniers issus des
      décisions. **À zéro le premier jour, et il le dit.**
- [ ] Le pipeline en colonnes, la relance due calculée sur `applied_at`.
- [ ] La série : jours consécutifs avec au moins une candidature **envoyée**.
      Lire des offres ne la maintient pas — c'est voulu, et c'est ce qui la
      rend honnête.
- [ ] Le compteur anti-perte : offres au-dessus de 50 **sans ligne**
      `offer_applications`.
- [ ] Le taux de réponse affiché **brut** (`1 / 5`) sous 20 candidatures. Un
      pourcentage sur cinq envois est un chiffre inventé.
- [ ] **Chaque composant de cette tâche a un état à zéro**, et c'est cet état
      qui est vrai le jour de la livraison. Le construire d'abord.

---

## Tâche 10 : Déploiement, mesure, documentation

- [ ] Déployer `api-dashboard`, poser `DASHBOARD_TOKEN` par
      `npx supabase secrets set`. **Ne recopier sa valeur nulle part.**
- [ ] Éprouver la chaîne complète : lancer la SPA, ouvrir une offre, la
      retenir, la marquer postulée, **relire en base** que la ligne existe et
      que le groupe entier porte l'état.
- [ ] **Mesurer** : coût des deux nouvelles vues, temps de première peinture,
      poids du bundle. Écrire les chiffres, ne pas les estimer.
- [ ] Mettre à jour `ETAT.md` : tâches faites, mesures, problèmes découverts.
- [ ] Corriger le `ROADMAP` : phase 3 livrée, **Vite et non Next.js**, et la
      phase 5 (suivi des candidatures) est **partiellement absorbée** par cette
      phase — dire ce qui reste.
- [ ] Corriger `.vscode/settings.json`, qui parle encore d'un « futur dashboard
      Next.js ».
- [ ] Ajouter à `CLAUDE.md` la recette de consultation du tableau de bord et le
      piège d'outillage `deno fmt` / `dashboard/`.

---

## Revue finale de branche

Une revue large par un agent distinct, sur toute la branche. Points d'attention
nommés, parce que ce sont ceux où ce dépôt s'est déjà trompé :

- **Une absence rendue comme une autre.** Les sept natures doivent rester
  distinctes à l'écran. C'est le défaut le plus probable de cette phase.
- **Un chiffre de gamification qu'aucune ligne de code ne rend vrai.**
- **Un filtre par défaut qui masque.** Vérifier qu'aucun état initial ne cache
  d'offre.
- **Une offre qui disparaît au repli des doublons.** La requête d'écart de la
  tâche 5 doit rendre zéro ligne.
- **Le secret dans le bundle** : vérifier qu'aucune clé `service_role` n'a
  fuité côté navigateur, par `grep` sur le build.
- **Une affirmation de performance non mesurée** dans la documentation.
- **Un test de garde-fou qui ne refuse rien.** Les vérifier par mutation.

**Et le rappel qui vaut pour toute cette phase** : aucun test de ce dépôt ne
voit une mise en page. `jsdom` ne calcule ni largeur, ni hauteur, ni
débordement, ni troncature. Les maquettes approuvées sont le seul contrôle qui
les voie.

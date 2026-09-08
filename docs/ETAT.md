# État d'avancement et reste à faire

**Dernière mise à jour** : 2026-09-08
**Branche de travail** : `dedoublonnage`

Vision et phases : [`ROADMAP.md`](ROADMAP.md) · Règles du dépôt : [`../CLAUDE.md`](../CLAUDE.md)

---

## Où en est-on

**Le système tourne tout seul sur France Travail.** 700 offres en base, 6 retenues
par la vue `offers_shortlist`. La fonction est déployée et le cron `ft-daily`
s'exécute **chaque jour à 6 h UTC — 8 h à Marseille, PC éteint**. Chaîne
vérifiée de bout en bout : Vault, `pg_net`, fonction déployée, écriture en base.

**Les deux sources tournent seules, PC éteint.** `ft-daily` à 6 h 00 et
`adzuna-daily` à 6 h 30, tous deux actifs et prouvés par un run réel portant
`trigger = cron`. Le backfill Adzuna de 31 jours a ramené 476 offres, les 11
requêtes en HTTP 200, `fetched == total_available` partout. La sélection passe
de 6 à **12 offres**, moitié-moitié entre les deux sources.

**Le plan A est terminé.** Les 13 tâches sont livrées.

**Le plan « confiance par requête » (4 tâches, plus les correctifs de sa
revue) est terminé aussi.** Une requête Adzuna ancrée à une technologie
(`search_queries.trust = 'anchored'`) ouvre désormais `offers_shortlist` même
quand le lexique ne voit rien dans les 500 caractères tronqués — c'est ce qui
manquait pour exploiter les offres full remote qu'Adzuna indexe sans les
rendre lisibles. Résultat mesuré : la sélection passe de 31 à 66 puis, après
correction de la revue (`adzuna:remote:fr-js` déclassée), à **64** offres
(voir la section dédiée plus bas). **Ne pas figer ce nombre ici** : deux crons
collectent chaque matin, donc il bouge tous les jours. Le tableau ci-dessous
est recompté en base ; c'est lui qui fait foi, et la trajectoire 31 → 69 → 66
→ 64 ne décrit que l'effet du plan au moment de sa livraison.

```sql
select * from offers_shortlist order by score desc, published_at desc;
```

Recompté en base le 2026-09-08 en fin de chantier. **Ces nombres bougent
chaque matin** : deux crons collectent à 6 h et 6 h 30. Les recompter plutôt
que les recopier — c'est une requête, pas une archive.

| Indicateur | Valeur |
|---|---:|
| Offres collectées | 1 296 |
| — dont France Travail | 739 |
| — dont Adzuna | 557 |
| Offres retenues (`offers_shortlist`) | **65** |
| — dont locales (13, 83, 84) | 41 |
| — dont full remote national | 24 |
| — entrant **uniquement** par la confiance par requête | **34** |
| Mentionnant React / TypeScript / Next.js, **sur les 1 296 collectées** | 60 |
| — dont, **restreint aux 65 retenues** | 12 |
| Mentionnant LLM / IA / agents, **sur les 1 296 collectées** | 65 |
| — dont, **restreint aux 65 retenues** | 21 |
| Requêtes France Travail actives | 24 sur 38 |
| Requêtes Adzuna actives | 11 sur 11 |
| Jobs cron actifs | 2 |
| Termes au lexique | 67 |
| Tests | 219 verts *(recompté le 2026-09-08 en clôture du plan B ; couvre aussi Free-Work et Collective)* |

La ligne qui compte est la quatrième depuis le bas du bloc de sélection :
**34 des 65 offres retenues n'ont ni `core_hits` ni `ai_hits`**. Sans la
confiance par requête, elles seraient invisibles — c'est plus de la moitié de
la liste quotidienne.

**Les compteurs d'offres et de sélection de ce tableau datent d'avant le plan
B et ne couvrent que les deux API.** Depuis, Free-Work et Collective.work
alimentent la base elles aussi, et les deux tournent seules par Planificateur
Windows en plus des deux crons `pg_cron`. Le compte à quatre sources,
recompté en base le 2026-09-08 en clôture du plan B, est dans « Phase 1 —
Plan B » plus bas : **4 112 offres collectées, 87 retenues** (recompté le
2026-09-08 en clôture du plan de dédoublonnage — ces nombres bougent chaque
matin, quatre sources collectant seules). Les deux
rangées « Mentionnant React / TypeScript / Next.js » et « Mentionnant LLM /
IA / agents » ci-dessus restent telles quelles pour la même raison : ce sont
des mesures datées de la clôture du plan confiance-par-requête, sur les 1 296
offres API d'alors, et elles n'ont pas été refaites sur les 4 112 offres
actuelles — les recompter serait une tâche à part, pas une simple mise à jour
de nombre.

---

## Phase 1 — Plan A : les 2 API

| # | Tâche | État |
|---|---|---|
| 0 | Outillage, import map Deno, projet lié | ✅ |
| 1 | Migrations du schéma (6 tables, 2 vues) | ✅ |
| 2 | Données de référence (sources, requêtes, lexique) | ✅ |
| 3 | `_shared/types.ts`, `db.ts`, `logger.ts` | ✅ |
| 4 | `_shared/upsert.ts`, `run-tracker.ts` | ✅ |
| 5 | Authentification OAuth2 France Travail | ✅ |
| 6 | Client France Travail (`Content-Range`, pagination, backoff) | ✅ |
| 7 | Mapper France Travail, sur fixture réelle | ✅ |
| 8 | Orchestration mutualisée `run-collection.ts` | ✅ |
| 9 | Point d'entrée France Travail + **première collecte réelle** | ✅ |
| — | Classification du télétravail + repli département | ✅ |
| — | Vue `offers_shortlist` | ✅ |
| 10 | Déploiement France Travail + cron quotidien | ✅ |
| 11 | Adzuna : client, mapper, orchestration + **collecte réelle** | ✅ *(re-revue à refaire, voir ci-dessous)* |
| 12 | Déploiement Adzuna + cron `adzuna-daily` à 6 h 30 | ✅ |

Chaque tâche a été relue par un agent distinct, sur conformité au cahier des
charges **et** sur qualité.

## Phase 1 — Plan « confiance par requête »

**Terminé, 4 tâches.** Répond à P8 (résolu) : Adzuna tronque toute description
à 500 caractères, donc le lexique ne peut confirmer aucune offre dont la stack
technique figure plus loin dans le texte intégral. Le principe : certaines
requêtes Adzuna sont **ancrées** à une technologie précise, et le seul fait
d'avoir ramené une offre est déjà une preuve, même si la description tronquée
est muette.

| # | Tâche | État |
|---|---|---|
| 1 | Migration : `offers.found_by_query_ids`, `search_queries.trust`, seed du pari initial (7 requêtes `anchored`) | ✅ |
| 2 | `upsertOffers` peuple `found_by_query_ids` par union à chaque collecte | ✅ |
| 3 | Les vues exposent la provenance (`found_by_labels`, `trusted_query`) et `offers_shortlist` s'ouvre à une requête `anchored` | ✅ |
| 4 | Mesure du pari contre les offres réelles, correction du classement, documentation | ✅ |

### Décision de conception : un ensemble de requêtes, pas un scalaire de source

`found_by_query_ids` est un **tableau** (l'union des requêtes ayant ramené
l'offre), et `trusted_query` en dérive par `bool_or` sur ce tableau — pas une
colonne scalaire du genre `found_by_source` ou `first_query_id`. Raison : une
colonne scalaire aurait fait dépendre la confiance de l'**ordre d'exécution**
(`priority`), puisque l'upsert écrase et que « la dernière requête à voir une
offre fixe ses colonnes » est déjà la règle pour `remote_label` et la
provenance géographique — un couplage qui a coûté une migration corrective
entière (`20260907234512_fix_adzuna_priority_order.sql`, tâche 11). Si la
confiance dépendait de quelle requête a écrit l'offre en dernier, reclasser une
requête ou réordonner `priority` changerait silencieusement quelles offres
passent le filtre, sans lien logique avec la question posée (« une requête
digne de confiance a-t-elle vu cette offre ? »). L'ensemble supprime ce
couplage : une offre reste `trusted_query` tant qu'**au moins une** des
requêtes qui l'ont vue est `anchored`, quel que soit l'ordre dans lequel elles
sont passées.

### Résultat mesuré (tâche 4, corrigé par sa revue)

`offers_shortlist` passe de **31 à 69** offres avec le pari initial (7
requêtes `anchored`), sans aucune sortie (inclusion stricte prouvée par
intersection). Les 38 offres ajoutées, classées à la main sur le profil
front-end React/TypeScript, Marseille/Aix ou full remote national : **3
franchement pertinentes, 23 adjacentes** (Angular/Java/Vue, ou fullstack/
backend générique), **12 hors sujet** (marketing, impression, qualification
logicielle sans lien front-end...).

Compter par requête, restreint aux offres qui n'entrent **que** par
`trusted_query` (`core_hits = 0 and ai_hits = 0`, donc les 38 ajoutées) donne,
par étiquette — décompte **brut**, qui partage le mérite entre requêtes qui se
recouvrent sur une même offre :

| Requête | Offres | Pertinentes | Adjacentes | Hors sujet |
|---|---:|---:|---:|---:|
| `adzuna:local:react-ts` | 5 | 2 | 3 | 0 |
| `adzuna:local:typescript` | 9 | 2 | 6 | 1 |
| `adzuna:local:nextjs` | 2 | 2 | 0 | 0 |
| `adzuna:local:javascript` | 15 | 2 | 8 | 5 |
| `adzuna:remote:fr-ts` | 12 | 1 | 9 | 2 |
| `adzuna:remote:fr-js` | 5 | 1 | 2 | 2 |
| `adzuna:remote:fr-react` | 6 | 1 | 2 | 3 |

**Critère de décision** (celui demandé par la tâche) : une requête `anchored`
ne se déclasse que si elle fait entrer une **majorité** de hors sujet — pas au
premier faux positif, parce qu'une offre hors sujet en bas de liste triée par
score coûte peu, alors qu'une offre pertinente jamais affichée coûte cher.
Mesuré en comptant la contribution **marginale** de chaque requête (les
offres où elle est la **seule** étiquette `anchored` restante parmi
`found_by_labels`, donc la seule cause réelle de son entrée), pas le décompte
brut ci-dessus. **La revue de la tâche 4 a montré que ce décompte marginal
était incomplet pour `adzuna:local:javascript` (7 offres comptées au lieu de
12, en omettant Collective.work et Easy Partner — Vue.js —, un second
exemplaire « VIRTUALEXPO GROUP », et deux offres — W HUB « Data Ingénieur
SKYWISE » et EASY PARTNER « PL/SQL Senior » — que ce document classait
pourtant déjà hors sujet ailleurs, sans vérifier la cohérence entre les deux
sections)**, et qu'il n'avait pas été refait pour les cinq autres requêtes.
Refait au complet, requête par requête, sur les 66 offres (avant la
correction `fr-js` ci-dessous) :

| Requête | Marginal | Hors sujet | Adjacentes |
|---|---:|---:|---:|
| `adzuna:local:react-ts` | 0 | — | — |
| `adzuna:local:typescript` | 3 | 1 (33 %) | 2 |
| `adzuna:local:nextjs` | 0 | — | — |
| `adzuna:local:javascript` | 12 | 7 (58 %) | 5 |
| `adzuna:remote:fr-ts` | 9 | 2 (22 %) | 7 |
| `adzuna:remote:fr-js` | 2 | 2 (100 %) | 0 |

Deux requêtes franchissent la majorité de hors sujet sur ce décompte
corrigé : `javascript` et `fr-js`. Le coût du déclassement, mesuré offre par
offre avant toute décision, diverge complètement entre les deux :

- **`adzuna:remote:fr-js` se déclasse** (`anchored` → `net`, migration
  `20260908070000_declassify_fr_js_query.sql`). Ses 2 offres marginales
  (Diabolocom « Software Support Specialist LV2 », NEXTON « Consultant ECM /
  GED F/H ») sont toutes les deux hors sujet — aucune pertinente ni
  adjacente à perdre. Coût du déclassement : **zéro**. Vérifié en base par
  inclusion : `offers_shortlist` passe de 66 à **64**, exactement ces deux
  offres en moins (`company_name in ('Diabolocom','NEXTON')` ne rend plus que
  « NEXTON — AI Developer F/H », entrée par `fr-dev` et `ai_hits = 2`, sans
  rapport avec `fr-js`).
- **`adzuna:local:javascript` reste `anchored`**, malgré la même majorité de
  hors sujet (58 % par ligne, **55 % par annonce distincte** une fois fusionné
  le doublon de casse « Virtualexpo Group » / « VIRTUALEXPO GROUP », 6 hors
  sujet sur 11 annonces — voir P10). Contrairement à `fr-react` et `fr-js`,
  son coût de déclassement n'est **pas** nul : ses 5 offres adjacentes
  marginales (DigDash, Dassault Systèmes, Capgemini, Collective.work,
  Easy Partner — toutes Java/JS générique ou Vue.js) n'ont **aucune autre
  voie d'entrée** (ni `core_hits`, ni `ai_hits`, ni autre étiquette
  `anchored`) et disparaîtraient purement et simplement si la requête était
  déclassée. Le critère du projet vaut dans les deux sens : une offre hors
  sujet en bas de liste triée par score coûte peu, mais une offre adjacente
  **jamais affichée** coûte cher. Ici le coût (5 offres adjacentes rendues
  invisibles à l'avenir) l'emporte sur le bruit évité (7 offres hors sujet,
  déjà reléguées en bas de liste par un score nul ou quasi nul). Décision :
  rien ne change, aucune migration ne touche cette requête.
- **`adzuna:local:nextjs`**, jugée à volume trop faible en tâche 3 (0/2), est
  maintenant mesurable : **2/2 pertinentes**. Pari confirmé.
- **`react-ts`, `typescript` local, `fr-ts`** restent propres (0 à 22 % de
  hors sujet sur leur décompte marginal). Rien ne change.

**`adzuna:remote:fr-react`** a été déclassée par la tâche 4 elle-même
(`anchored` → `net`, migration `20260908050000_declassify_fr_react_query.sql`)
avant même cette revue, sur la base de 3 offres isolées, toutes hors sujet.
**Précision apportée par la revue** : ces 3 occurrences sont en réalité **une
seule et même annonce** — « Lead Product Marketing Manager - 100% remote »
(Boond), publiée trois fois (deux exemplaires au suffixe « (H/F) » près, un
troisième sans), un doublon intra-source du genre décrit en P10.
L'échantillon de preuve vaut donc **n = 1**, pas n = 3 comme le rapport
initial le laissait entendre en écrivant « 100 %, 3 cas sur 3 ». **La décision
reste correcte** : le coût mesuré du déclassement est nul quelle que soit la
taille de l'échantillon — les 3 autres offres où `fr-react` apparaît
(Konecta, RECRUT-INFO, Galadrim) restent couvertes par `fr-ts`, restée
`anchored` — ce qui rend la décision sûre malgré un échantillon de preuve
mince. Mais l'affirmation de robustesse statistique du rapport initial était
trompeuse et est corrigée ici.

Effet cumulé des deux déclassements, vérifié en base : `offers_shortlist`
passe de 69 (pari initial) à 66 (après `fr-react`, les 3 Boond sortent) puis à
**64** (après `fr-js`, Diabolocom et le NEXTON « Consultant ECM / GED »
sortent). Konecta/RECRUT-INFO/Galadrim et le NEXTON « AI Developer » restent
présents (vérifié nommément à chaque étape). Aucune régression sur une offre
pertinente ou adjacente.

### Nouvel axe réglable : `search_queries.trust`

`'anchored'` ou `'net'`, réglable par **migration** (donnée de référence,
jamais un `UPDATE` à la main) — voir `20260908033042_query_provenance_and_trust.sql`
(pose et pari initial), `20260908050000_declassify_fr_react_query.sql` et
`20260908070000_declassify_fr_js_query.sql` (corrections mesurées, la seconde
issue de la revue de la tâche 4). Une requête `anchored` ouvre
`offers_shortlist` par elle-même ; une requête `net` reste soumise à la
confirmation lexicale (`core_hits >= 1 or ai_hits >= 1`). L'effet est
immédiat sur les offres déjà collectées, `offers_shortlist` étant une vue.

## Phase 1 — Plan B : deux scrapers, et non quatre

**Terminé le 2026-09-08.** Plan :
[`plans/2026-09-08-plan-b-scrapers-free-work-collective.md`](superpowers/plans/2026-09-08-plan-b-scrapers-free-work-collective.md),
douze tâches, toutes livrées. Les fixtures — quatre pages Free-Work, une page
Collective, deux `robots.txt` — sont commitées sous `supabase/functions/_scrapers/`.

| # | Tâche | État |
|---|---|---|
| 1 | Migration : les deux sources scrapées et leurs requêtes | ✅ |
| 2 | Socle réseau — politesse et `robots.txt` | ✅ |
| 3 | Socle d'extraction — JSON-LD, `__NEXT_DATA__` et texte | ✅ |
| 4 | Réglages de source — lire `sources`, écrire l'état | ✅ |
| 5 | Département depuis un nom de commune (zone PACA) | ✅ |
| 6 | Client Free-Work — listing paginé puis pages de détail | ✅ |
| 7 | Mapper Free-Work — JSON-LD vers `NormalizedOffer` | ✅ |
| 8 | Lanceur commun aux deux scrapers | ✅ |
| 9 | Point d'entrée Free-Work + **première collecte réelle** | ✅ |
| 10 | Collective.work — client et mapper | ✅ |
| 11 | Point d'entrée Collective + **collecte réelle** | ✅ |
| 12 | Planification quotidienne, mesure d'ensemble et documentation | ✅ |

**Planification quotidienne** : `scripts/scrape-daily.cmd` lance les deux
scrapers en `--mode delta --trigger cron`, déclaré au Planificateur Windows
sous le nom « fast-travail scrapers », tous les jours à 07 h 15 — après
`ft-daily` (6 h UTC) et `adzuna-daily` (6 h 30 UTC), pour une sélection
complète en une fois. Piège vérifié avant commit : le nom d'utilisateur
(`Léo`) porte un accent, et un accent littéral dans un `.cmd` dépend à la fois
de l'encodage du fichier et du codepage actif à l'exécution — deux choses qui
peuvent diverger en silence. Le script utilise donc le nom court 8.3
(`C:\Users\LO1A5A~1\...`), un alias ASCII stable, pour poser `PATH` avant
d'appeler `deno` via `npm`. Vérifié : `cmd /c "where deno"` après ce `PATH`
résout bien `...\WinGet\Links\deno.exe`.

Preuve retenue, la même que pour `pg_cron` au plan A : `schtasks /Run /TN
"fast-travail scrapers"` puis une lecture de `collection_runs`. Deux lignes
portent `trigger = 'cron'`, `status = 'success'`, horodatées à la seconde où
la tâche a tourné :

```
source      | trigger | status  | offers_new | offers_updated | started_at
free_work   | cron    | success | 0          | 0              | 2026-09-08 09:52:45+00
collective  | cron    | success | 1          | 539            | 2026-09-08 09:53:56+00
```

Contrairement au plan A, le Planificateur Windows ne tourne que **PC allumé**
— compromis assumé du ROADMAP, documenté dans le script lui-même : les délais
de politesse et le temps de parcours ne tiennent pas dans les 2 secondes de
CPU d'une Edge Function.

**La reconnaissance a démenti trois affirmations de ce document.**

| Ce qui était écrit | Ce que la mesure dit |
|---|---|
| « Les quatre publient un sitemap XML, retenu comme surface de collecte » | **Faux pour trois sur quatre.** `codeur.com/sitemap.xml` répond 404. Le sitemap de Kicklox ne contient aucune mission, celui de Collective non plus — 85 URL de blog et de pages légales, et son board `/jobs` n'y figure même pas. Seul Free-Work publie un sitemap d'offres : 7 276 URL, **sans aucun `lastmod`**, donc inutilisable comme delta |
| « Le `robots.txt` des quatre autorise la collecte » | Exact, mais sans objet pour Kicklox : **il n'y a rien à collecter**. Aucune mission publique, `app.kicklox.com/missions` est une coquille SPA de 3 955 octets derrière un login |
| « Free-Work banne `Wget` et `HTTrack` » | Exact et sans conséquence : l'agent utilisateur honnête `fast-travail/0.1 (veille personnelle)` obtient **HTTP 200** sur les deux sources retenues. Aucune usurpation de navigateur n'est nécessaire |

**Périmètre retenu, sur mesure et non sur intention :**

| Source | Mesuré le 2026-09-08 | Décision |
|---|---|---|
| **Free-Work** | React **196**, TypeScript **180**, JavaScript **330**, Next.js 19, Marseille **66**, Aix **140**. Description **entière** (577 à 7 752 car., médiane 1 176). TJM structuré en JSON-LD sur 8 offres sur 12 | **Retenue** |
| **Collective.work** | 6 544 missions, 30 par page en JSON complet. Sur 300 mesurées : 12 TypeScript, 3 React, 4 en full remote, 11 en PACA dont 8 à Aix | **Retenue** |
| Codeur.com | 4 slugs front-end sur 103 projets ; flux WordPress / Webflow / SEO / marketing | Écartée : hors profil |
| Kicklox | aucune mission publique | Écartée : impossible |

**Free-Work vaut à elle seule les deux API réunies sur ce profil** : 196 offres
React contre 5 chez Adzuna et 0 chez France Travail. Et sa description n'étant
pas tronquée, **le lexique de compétences y redevient le filtre principal**,
comme sur France Travail. C'est aussi la première source à porter un TJM
structuré : `rate_raw`, nulle depuis le début du projet, cesse d'être morte.

**Décisions de conception tranchées** (détail et mesures dans le plan) :

- **Le sitemap est écarté comme surface** pour toutes les sources. On collecte
  par listing paginé : `/fr/tech-it/jobs/<facette>?sort=date&page=N` chez
  Free-Work — le tri par date est un vrai paramètre serveur, sans lui les dates
  d'une page vont du 27/08 au 07/09 —, `/jobs/fr?page=N` chez Collective, dont
  les filtres d'URL sont **ignorés par le serveur** (mesuré : `?query=react` rend
  la page 1 non filtrée).
- **Aucun champ stocké ne vient du HTML de présentation** : JSON-LD `JobPosting`
  chez Free-Work, `__NEXT_DATA__` chez Collective. Le HTML n'est lu que pour les
  URL et le signal d'arrêt.
- **Scripts Deno locaux, pas Node** — contrairement à ce qu'annonce le ROADMAP.
  La contrainte réelle était « hors Edge Functions », et Node coûterait un
  second outillage : `verify` ne couvre que Deno.
- **Le code va sous `supabase/functions/_scrapers/`**, et c'est mesuré :
  `deno fmt` formate le HTML, et l'exclusion `**/__tests__/fixtures/**` de
  `supabase/functions/deno.json` est résolue relativement au dossier de ce
  fichier. Des fixtures placées ailleurs font échouer `fmt:check`.
- **La politesse est une ligne en base** : les huit colonnes de `sources`
  (`min_delay_ms`, `max_pages_per_run`, `user_agent`, `robots_allows`…), créées
  au plan A et jamais utilisées, deviennent le cinquième axe réglable.
  `robots.txt` est revérifié à **chaque** exécution.

### Mesure d'ensemble, quatre sources — 2026-09-08

Recompté en base à la clôture du plan B, après le run `cron` de preuve
ci-dessus :

```sql
select source, count(*) as offres,
       count(*) filter (where remote_label = 'full') as full_remote,
       count(*) filter (where department in ('13','83','84')) as zone,
       count(*) filter (where rate_raw is not null) as avec_tjm,
       round(avg(length(description))) as desc_moy
from offers group by source order by source;
```

| Source | Offres | Full remote | Zone 13/83/84 | Avec TJM | Description moy. |
|---|---:|---:|---:|---:|---:|
| adzuna | 557 | 80 | 483 | 0 | 500 |
| collective¹ | 2 711 | 108 | 95 | 1 339 | 1 970 |
| france_travail | 739 | 9 | 440 | 0 | 2 606 |
| free_work | 105 | 3 | 33 | 34 | 1 684 |
| **Total** | **4 112** | **200** | **1 051** | **1 373** | |

¹ **Corrigé le 2026-09-08** : ce tableau annonçait 1 783 offres Collective sur
11 jours, en notant que le backfill restait à rejouer. Il l'a été depuis.
Collective couvre désormais **34 jours** (2026-08-06 au 2026-09-08), soit plus
que les 31 d'adzuna et de france_travail, pour **2 711 offres** — et elle
apporte **1 339 TJM** sur les 1 373 de la base. La colonne `rate_raw` était
morte il y a une semaine ; elle porte maintenant le tiers du corpus.

```sql
select source, count(*) from offers_shortlist group by source order by source;
select count(*) as total_shortlist from offers_shortlist;
```

| Source | Retenues |
|---|---:|
| adzuna | 51 |
| collective | 14 |
| france_travail | 14 |
| free_work | 3 |
| **Total** | **82** |

Sur ces 82, **49 par la zone locale et 33 par le full remote national** — les
deux catégories s'additionnent exactement au total, aucune offre n'entre par
les deux à la fois. Et **34 restent des entrées par la seule confiance de
requête** (`core_hits = 0 and ai_hits = 0`), toutes chez Adzuna — inchangé
depuis la clôture du plan confiance-par-requête, Free-Work n'ayant plus aucune
facette `anchored` depuis sa propre mesure (voir plus haut, migration
`20260908090000`).

**Mis à jour le 2026-09-08, à la clôture du plan de dédoublonnage** : ce 82
ne compte ni la croissance du corpus depuis (les crons ont continué de
tourner) ni le masquage des doublons. Recompté après coup, `offers_
shortlist` rend **87** offres (46 adzuna, 24 collective, 14 france_travail, 3
free_work), 47 par la zone locale et 40 par le full remote, 29 restant des
entrées par la seule confiance de requête. Ce nombre agrège les deux effets
— la croissance du corpus l'a fait monter à 92 avant tout dédoublonnage, puis
le masquage des doublons l'a ramené à 87 (5 masquées). Voir « Phase 1 — Plan
de dédoublonnage » plus bas pour le détail et la méthode.

**L'écart Free-Work / Adzuna, chiffré** — c'est la mesure qui a décidé du
classement `net` de Free-Work et qui reste la meilleure illustration de « la
description entière rend au lexique son rôle de filtre » :

| Source | Description médiane | `core_hits >= 1` |
|---|---:|---:|
| adzuna | 500 caractères | 7 sur 557 |
| free_work | 1 315 caractères | 59 sur 105 |

Adzuna tronque toujours à 500 (médiane et plafond confondus, comme mesuré au
plan A) ; Free-Work rend une description 2,6 fois plus longue en médiane, et
le lexique y trouve un signal sur **56 % des offres** contre **1,3 %** côté
Adzuna. C'est exactement l'écart que la requête `anchored` existe pour
combler côté Adzuna, et que Free-Work n'a jamais eu besoin de combler.

**Doublons inter-sources — P6 chiffré** :

```sql
select count(*) as doublons_inter_sources
from (select lower(title), company_name from offers group by 1, 2 having count(distinct source) > 1) t;
```

**19 groupes** de titre (normalisé en minuscules) et d'entreprise partagés par
deux sources ou plus, sur les 4 112 offres — quatre sources désormais, contre
deux au moment où P6 a été ouvert. Beaucoup d'annonces d'ESN paraissent
simultanément sur Free-Work et sur France Travail ; c'était la première dette
de la phase 2.

**P6 résolu le 2026-09-08** par le plan de dédoublonnage (détail dans
« Phase 1 — Plan de dédoublonnage » plus bas et dans « Problèmes ouverts »).
Cette mesure naïve (titre en minuscules et entreprise, sans normalisation du
suffixe H/F ni garde-fou de ville) est dépassée par la mécanique réelle :
`offer_duplicate_groups`, mesurée aujourd'hui, forme **46 groupes de fusion
inter-sources** (97 offres, 51 excédentaires) et en **bloque 2** (LTd,
SYNANTO) dont la fusion aurait été ambiguë — une même source y porte
plusieurs villes pour le même couple entreprise/intitulé, signe de missions
distinctes plutôt que d'une même annonce vue deux fois.

**Sémantique de `seen_count` sur les sources scrapées — une différence à ne
pas manquer.** Sur Free-Work, en mode delta, `needsKnownExternalIds = true` :
le détail d'une offre déjà connue n'est **pas** repayé, donc son
`seen_count` n'avance que quand une nouvelle facette la découvre pour la
première fois dans un run — c'est une passe de **découverte**, pas une
observation. Mesuré : 99 offres à `seen_count = 1`, 6 à `seen_count = 2`
(revues par une seconde facette). Sur Collective, `needsKnownExternalIds =
false` : la page de listing porte les missions entières, donc chaque passage
du scraper rafraîchit `last_seen_at` et incrémente `seen_count` pour **toute**
offre revue, exactement comme les deux API. Mesuré : 1 225 à `seen_count = 1`,
19 à `2`, 40 à `3`, 499 à `4` — quatre runs Collective à ce jour (un delta
initial, un backfill, puis deux delta), donc la borne à 4 correspond aux
offres vues aux quatre. Conclusion :
sur Free-Work, un `seen_count` élevé ne dit rien sur la fraîcheur d'une
annonce ; sur Collective (et les deux API), il en dit autant que documenté
plus bas dans ce fichier (« Attention à la sémantique »).

### Le backfill Collective était tronqué — corrigé par migration

`collection_query_results` du run de backfill (`05f6e113-…`) montrait
`fetched: 1800` sur `total_available: 6597`, `truncated: true` : le plafond de
60 pages arrêtait la collecte bien avant la fenêtre de 31 jours. Vérifié en
base : les 1 771 offres alors présentes ne remontaient qu'au 2026-08-28, soit
**11 jours de fenêtre réelle, pas 31**.

Mesuré avant de trancher, en listant réellement les pages (pas une
estimation) : la page 90 porte encore des dates du 2026-08-10/11 (dans la
fenêtre), et la page 92 est la première dont la date la plus récente
(2026-08-07) précède le début de fenêtre (2026-08-08) — **la frontière des 31
jours tombe page 92**. Coût d'un plafond couvrant réellement la fenêtre : le
délai de politesse sépare deux requêtes, pas la première, donc ~99 délais de
3 000 ms pour 100 pages, soit environ 5 minutes d'horloge — payé une seule
fois, en mode backfill uniquement. En delta (fenêtre de 3 jours), le run réel
de ce jour s'est arrêté après 18 pages (540 offres), très en dessous même de
l'ancien plafond : relever la limite ne coûte donc rien à la collecte
quotidienne.

**Décision : `max_pages_per_run` de Collective passe de 60 à 100** (migration
`20260908100000_raise_collective_max_pages.sql`), avec une marge de 8 pages
au-dessus de la frontière mesurée pour absorber la variation quotidienne de
volume. Masquer la troncature n'était pas défendable : le coût mesuré d'un
plafond correct (5 minutes, une fois) est minuscule au regard du gain (31
jours réels au lieu de 11, sur la seule source qui porte un TJM structuré).

**Le plafond corrigé ne suffit pas à lui seul : seule la CAUSE est corrigée,
pas la donnée.** Relever `max_pages_per_run` change ce qu'une *prochaine*
collecte backfill ramènera ; il ne rejoue rien. Le backfill tronqué à 60
pages n'a **pas été relancé** depuis cette migration, et les offres en base
couvrent donc toujours 11 jours, pas 31 (voir la note sous le tableau des
quatre sources ci-dessus) — relancer ce backfill est une collecte réelle de
l'ordre de 5 minutes, laissée au choix de l'utilisateur.

## Phase 1 — Plan de dédoublonnage

**Terminé le 2026-09-08, 4 tâches.** Répond à P6 et P10 (tous deux résolus,
voir plus bas), nés du même constat : `unique (source, external_id)` ne
protège contre aucune des deux formes de doublon que quatre sources
produisent — la même annonce republiée sous un nouvel `external_id` par une
seule source, ou la même annonce vue par plusieurs sources à la fois.

| # | Tâche | État |
|---|---|---|
| 1 | `offer_dedup_keys` — normalisation entreprise/intitulé/ville | ✅ |
| 2 | `offer_duplicate_groups` — regroupement et élection d'un représentant | ✅ |
| 3 | `offers_shortlist` masque les doublons ; correctif du défaut critique trouvé en revue | ✅ |
| 4 | Documentation, correction de P10, recette de surveillance | ✅ |

### Décision de conception : une clé asymétrique, mesurée et non supposée

**Intra-source** : `(source, entreprise, intitulé, ville)` — la ville est
indispensable. Chez **Achil**, republié via Collective, l'intitulé
« Collaborateur Comptable Confirmé » paraît sur **9 villes distinctes**
(Manosque, Aubière, Bourg-Saint-Maurice, Claye-Souilly, Aix-en-Provence,
Annecy, Cagnes-sur-Mer, Dunkerque, La Valette-du-Var) — mesuré à nouveau dans
cette tâche, chaque ville formant son propre groupe de taille 1. Sans la
ville dans la clé, ces 9 postes distincts fusionneraient en un seul,
masquant Aix-en-Provence derrière Dunkerque.

**Inter-sources** : `(entreprise, intitulé)`, **sans géographie**. Les quatre
sources décrivent le lieu à des granularités incompatibles (France Travail
« 74 - Annecy », Collective « 13100 Aix-en-Provence », Free-Work
« Marseille », Adzuna « Bouches-du-Rhône, Provence-Alpes-Côte d'Azur ») :
mettre la ville dans la clé inter avait fait tomber un essai de mesure de 48
groupes à 11, en confondant des postes réels sous des libellés de ville trop
fins pour se recouper eux-mêmes.

### Deux garde-fous, ajoutés en construisant et vérifiés en revue

1. **La fusion inter-sources n'est autorisée que si chaque source impliquée
   ne porte qu'une seule ville** pour ce couple entreprise/intitulé. Sans ce
   garde-fou, un cabinet de recrutement publiant plusieurs missions
   distinctes sous le même intitulé (mesuré sur LTd et SYNANTO) aurait
   fusionné des postes réellement différents via un pont ambigu.
2. **Une ville nulle ne sert jamais de base de fusion** (`coalesce(norm_city,
   offer_id)`) : deux offres d'une même entreprise/intitulé sans ville
   renseignée ne fusionnent que si l'`id`, unique par construction, les
   distingue. Sans ce garde-fou, deux missions distinctes de Propulse IT ou
   de Sharebound, toutes deux sans ville, auraient fusionné à tort.

**Interaction résiduelle entre les deux garde-fous, sans effet aujourd'hui**
mais notée par honnêteté : l'éligibilité inter-sources compte les villes
d'une source via ce même `coalesce(norm_city, offer_id)`, donc deux offres à
ville nulle d'une même source compteraient comme deux villes distinctes et
bloqueraient une fusion par ailleurs légitime. Sans effet mesuré à ce jour
(aucun candidat inter-sources actuel n'a de ville nulle), et l'erreur va dans
le sens conservateur — une paire visible en double plutôt qu'une offre
invisible à tort.

### Principe retenu : le dédoublonnage se fait DANS la sélection, pas avant elle

Élire le représentant sur toute la base, indépendamment des critères de
`offers_shortlist`, faisait **disparaître entièrement** deux postes (Akanea,
CN Amirault) : leur représentant élu était la ligne `france_travail`, qui
porte le texte intégral et donc un terme du signal rouge que les 500
caractères tronqués d'Adzuna ne montraient jamais — la ligne Adzuna, elle,
était visible avant le dédoublonnage. Corrigé : l'élection se fait désormais
**parmi les seules offres déjà éligibles** à `offers_shortlist`. Principe à
retenir pour toute évolution future de ce mécanisme : **seules des lignes
visibles se disputent la place.**

**Deux notions d'élection coexistent depuis ce correctif, et ne coïncident
plus.** `is_primary` (exposée par `offers_ranked`) élit un représentant sur
**tout** le corpus ; la sélection quotidienne élit un représentant **parmi
les offres éligibles**. `offers_hidden_duplicates` répond à la première
question (« quels doublons existent dans la base, et quel exemplaire fait
référence pour tout le corpus ») et non à la seconde (« qu'est-ce qui a
disparu de ma liste du jour »).

### Résultat mesuré le 2026-09-08

```sql
select count(distinct dup_group_id) as groupes,
       count(*) filter (where not is_primary) as masquees,
       count(*) as couvertes
from offer_duplicate_groups;
```

**3 770 groupes, 191 offres masquées sur 3 961** couvertes par la clé (les
151 offres sans `company_name` restent hors champ, délibérément). Par
source :

| Source | Masquées | Total |
|---|---:|---:|
| adzuna | 48 | 556 |
| collective | 115 | 2 711 |
| france_travail | 20 | 589 |
| free_work | 8 | 105 |

`offers_shortlist` passe de **92 à 87** offres (46 adzuna, 24 collective, 14
france_travail, 3 free_work) — 5 masquées, aucune disparue en silence :
`offers_hidden_duplicates` liste les 191 doublons du corpus et leur
exemplaire de référence, `dup_count`/`dup_sources`/`dup_first_seen_at`
restent portés par le représentant affiché. Sur ces 87 : **47 par la zone
locale et 40 par le full remote national**, et **29 restent des entrées par
la seule confiance de requête** (`core_hits = 0 and ai_hits = 0`).

### Problème ouvert — le cas Malt, mesuré plutôt que supposé

Deux annonces Malt « Senior Fullstack Engineer H/F » ont été fusionnées alors
que leurs textes n'ont **aucun recouvrement** — l'une décrit des
responsabilités concrètes, l'autre est de la communication de plateforme
générique. Le garde-fou « une seule ville par source » ne couvre pas ce cas :
Malt est une place de marché de freelances qui publie plusieurs missions
distinctes sous un même intitulé et une même ville de rattachement, un
employeur intermédiaire plutôt qu'un poste unique.

**Mesure demandée avant de trancher** : sur les 191 paires masquée/
représentant, un recouvrement lexical (mots de 6 lettres ou plus partagés
entre les deux descriptions) donne :

```sql
-- (requête complète dans le rapport de tâche 4 ; principe : mots de 6
-- lettres ou plus, comparés entre la description du représentant et celle
-- de chaque offre masquée de son groupe)
```

| Recouvrement | Paires |
|---|---:|
| 0 mot commun | **1** (Malt, « Senior Fullstack Engineer H/F ») |
| 1 à 3 mots communs | 6 (dont Akanea, AMILTONE, Boond, Experis France, Société Française de Garantie) |
| Total des paires masquées | 191 |

**Le signal n'est pas fiable tel quel** : parmi les 6 paires à faible
recouvrement, au moins deux sont des doublons déjà **prouvés** par lecture
intégrale en tâche 3 — AMILTONE (texte de mission identique mot pour mot
entre free_work et l'une des deux lignes Adzuna, la seconde ligne Adzuna
n'affichant que l'intro société avant la troncature à 500 caractères) et
Boond (la même annonce de marketing republiée 3 fois, quasi mot pour mot).
Leur faible score vient de la troncature Adzuna qui coupe le texte à des
endroits différents selon la longueur du titre — pas d'une différence de
poste. Un signal automatique fondé sur le seul recouvrement lexical
confondrait donc « vrai doublon tronqué différemment » et « faux positif
Malt » : **construire un tel signal est laissé en dehors du périmètre de
cette tâche** (aucune vue ni migration n'est touchée ici), mais la mesure — 1
cas sur 191 à recouvrement nul, 6 à recouvrement quasi nul — dit que le
problème est réel mais rare, et que Malt en est aujourd'hui l'unique
exemplaire propre. Consigné comme problème ouvert (voir P14) plutôt que
tranché en silence.

### Coût, à connaître avant d'écrire une nouvelle recette sur ces vues

`offers_shortlist` et `offers_hidden_duplicates` coûtent chacune de l'ordre
de **3,8 secondes** (mesuré en tâche 3 : 3 733 et 3 787 ms). Toute recette
qui les recombine — par exemple « qu'est-ce qui a disparu de ma liste
aujourd'hui » — doit forcer les CTE en `materialized`, sans quoi le
planificateur rejoue les vues coûteuses à chaque ligne au lieu de les
calculer une fois : la première version de cette recette expirait après le
délai serveur de deux minutes. La version qui fonctionne est en tête de la
migration `20260908190000_fix_hidden_duplicates_recipe.sql`.

## Phases 2 à 5

Pas commencées. Voir [`ROADMAP.md`](ROADMAP.md) : scoring IA, tableau de bord,
génération de CV et lettres, suivi des candidatures.

---

## Ce que la mesure a établi sur Adzuna

Trois faits mesurés le 2026-09-08 gouvernent la conception, et l'un d'eux a
démenti ce que `ROADMAP.md` et `CLAUDE.md` affirmaient.

**Adzuna tronque toute description à 500 caractères.** Mesuré sur 50 offres :
min 500, médiane 500, max 500, et 50 sur 50 finissent par « … ». Le lexique,
filtre principal pour France Travail, ne voit donc presque rien — 1 offre sur
50 mentionne « react » dans le texte reçu. Mais l'index d'Adzuna voit le texte
intégral : sur 19 offres rendues par `what_phrase=full remote`, 13 ne portent
pas la locution dans les 500 caractères reçus. **Sur Adzuna, la requête est
donc le filtre** — l'inverse exact de France Travail.

**`React` est inutilisable seul** : le lemmatiseur français d'Adzuna le confond
avec « réacteur ». 60 offres à Marseille, dont 8 titres de réacteurs
nucléaires et une seule contenant le mot. `what_exclude=réacteur` les ramène
toutes à zéro, vraies offres React comprises. Le lexique n'est pas menacé :
`react` y est en `fts`, insensible à cette collision.

**L'affirmation « Adzuna rend 36 offres React à Marseille » était fausse.**
C'était un `count` gonflé par la collision. Signal réel : 5 offres sur 31
jours. Là où Adzuna gagne, c'est le **full remote national** — 63 offres sur 31
jours contre 9 pour France Travail sur 699. Sur le local, les deux sources
concordent : Marseille est un marché Angular / Java.

---

## Problèmes ouverts, par priorité

### P1 — Le rayon local ne peut pas être ajusté finement

`distance_marseille_km` est `null` pour une bonne part des offres : l'API ne
renvoie les coordonnées que par intermittence. Le filtre géographique repose donc
sur le **département** (13, 83, 84), renseigné pour 695 offres sur 700. Ça marche,
mais « rayon de 40 km » n'est plus réglable au kilomètre — et le département 13
va jusqu'à Arles.

*Piste* : géocoder les communes depuis leur code INSEE, déjà présent dans
`commune_insee`, via un référentiel local.

### P2 — Précision de l'hybride

`/hybride/i` attrape aussi « Cloud, OnPremise, hybride » et « modèle hybride » au
sens Agile — des faux positifs sur l'infrastructure ou la méthodologie, pas sur le
mode de travail.

Sans effet sur `offers_shortlist`, qui ne retient que `full` ou le département
local. À affiner seulement si la distinction hybride devient utile.

### P3 — Défaut de pagination latent (France Travail)

La boucle de `fetchAllPages` avance par pas fixes de 150 sans tenir compte du
nombre d'offres réellement reçues. Si l'API renvoyait une page intermédiaire plus
courte sans que le total soit atteint, des offres seraient perdues **en
silence**.

Non déclenché sur les collectes réelles — `fetched` égalait `total_available`
sur les 24 requêtes, et de nouveau sur le run du cron — mais le défaut reste
dans le code. Le client Adzuna, lui, renseigne désormais `truncated`.

### ~~P8 — La sélection était étouffée : 3 retenues sur 76 full remote~~ *(résolu)*

Deux causes, et la première n'était pas celle qu'on croyait.

**Le signal IA était pollué par la lemmatisation française.** `agentique` était
en `fts`, or le stemmer français le réduit au même radical qu'`agent` : 46
correspondances pour 14 réelles, soit 32 faux positifs à +3 points, dont
« AGENT DE PRODUCTION (POSTE APRES MIDI 13H 21H) ». Et `prompt` captait
l'adjectif français (« une industrie *prompte* à valoriser l'initiative »),
pollué dans **les deux** modes de correspondance. Corrigés par les migrations
`20260908003545` et `20260908003753`. Le choix du mode dépend du mot et se
mesure : `rag` doit rester en `fts`, car en `ilike` il matcherait 282 offres
(« cadRAGe », « encadRAGement »).

**Et `core_hits >= 1` écartait les différenciateurs du profil.** Une offre
« Ingénieur Agentique FullStack » ou « AI Developer » ne nomme ni React ni
TypeScript dans les 500 caractères reçus. La règle est devenue
`core_hits >= 1 OR ai_hits >= 1`, le signal rouge restant éliminatoire
(migration `20260908004235`). **La sélection passe de 12 à 31 offres**, 19
locales et 12 en full remote. Sur les 19 ajoutées : 10 franchement
pertinentes, 4 adjacentes, 5 hors sujet que le score relègue en bas.

L'ordre importait : ouvrir le filtre **avant** d'assainir `ai_hits` ramenait 42
offres au lieu de 31, avec « Gestionnaire facturation » et « Chargé(e)
Prépaie » dedans.

*Reste ouvert, moins urgent* — **fait, voir « Phase 1 — Plan confiance par
requête » plus haut.** Ce paragraphe proposait de classer `fr-react` et
`fr-ts` comme ancrées à une techno, `it-jobs` et `fr-dev` comme des filets.
**Corrigé le 2026-09-08** : la mesure a démenti la moitié de ce pari sur
`fr-react` — sur les 6 offres qu'elle a fait entrer, elle n'est la seule cause
d'entrée que 3 fois, et ces 3 fois sont 3 doublons d'un poste de marketing
sans aucun rapport avec React. Reclassée `net` par la migration
`20260908050000`, sans perte mesurée d'aucune offre pertinente ou adjacente
(les autres offres qu'elle touchait restent couvertes par `fr-ts`). `fr-ts`,
elle, se confirme propre.

### P5 — Signal local mince, et ce n'est pas un défaut d'outillage

Le marché React marseillais est réellement petit : `React TypeScript` rend **5**
offres sur 31 jours à Marseille, `Next.js` en rend 2. Les deux sources
concordent, le local est dominé par Angular et Java. **Le gisement exploitable
est national et full remote** — 76 offres côté Adzuna contre 9 côté France
Travail — ce qui pèse sur la phase 2 et rend P8 prioritaire.

### ~~P6 — Dédoublonnage inter-sources absent~~ *(résolu)*

`unique (source, external_id)` empêchait les doublons **dans** une source,
pas entre sources. Résolu par le plan de dédoublonnage (voir « Phase 1 —
Plan de dédoublonnage ») : `offer_duplicate_groups` fusionne deux sources sur
`(entreprise, intitulé)` **sans géographie**, sous deux garde-fous — une
seule ville par source impliquée, et une ville nulle qui ne fonde jamais une
fusion.

Mesuré en base le 2026-09-08, après le déploiement des quatre migrations :
**46 groupes de fusion inter-sources** (97 offres, 51 excédentaires), et
**2 candidats bloqués** (LTd, SYNANTO) où une même source porte plusieurs
villes pour le couple entreprise/intitulé — signe de missions distinctes
plutôt que d'une annonce vue deux fois. Le chiffre naïf de 19 groupes cité
plus haut (titre en minuscules et entreprise, sans normalisation ni ville)
reste dans ce document par transparence méthodologique, mais n'est plus
l'état de l'art : il datait d'avant la construction de la clé asymétrique.

*Reste ouvert, à surveiller* : le cas Malt (annonces fusionnées sans
recouvrement textuel) montre que le garde-fou « une seule ville par source »
ne couvre pas les employeurs intermédiaires publiant plusieurs missions sous
un même intitulé — voir P14.

### ~~P10 — Doublons intra-source~~ *(résolu, et le chiffre corrigé)*

`unique (source, external_id)` n'empêchait pas non plus les doublons dans une
même source quand celle-ci republie la même annonce sous un nouvel
`external_id` — constant sur Adzuna. Résolu par la même migration que P6.

**Le chiffre ci-dessous, laissé pour mémoire, était gonflé : la clé qui l'a
produit ignorait la ville.** Chez **Achil**, republié via Collective,
l'intitulé « Collaborateur Comptable Confirmé » paraît sur **9 villes
distinctes** (mesuré à nouveau en tâche 4 : Manosque, Aubière,
Bourg-Saint-Maurice, Claye-Souilly, Aix-en-Provence, Annecy, Cagnes-sur-Mer,
Dunkerque, La Valette-du-Var) — 9 postes réels, pas une seule annonce
republiée 9 fois. Une clé `(source, company_name, titre normalisé)` sans
ville les aurait fusionnés en **un seul groupe de 9**, comptant 8 doublons
excédentaires là où il y en a 0. Mesuré sur l'ensemble du corpus actuel
(4 112 offres) pour chiffrer l'écart : la clé sans ville forme **213
groupes, 529 offres, 316 excédentaires** ; la clé correcte, avec ville et le
garde-fou `coalesce(norm_city, offer_id)` pour les villes nulles, n'en forme
que **133, pour 278 offres et 145 excédentaires** — l'excès retombe de
**316 à 145, soit environ 54 % de moins**, du même ordre que le « environ
60 % » pressenti avant de mesurer. Achil, pris isolément, illustre l'écart au
maximum : 8 des 8 doublons qu'une clé sans ville lui aurait attribués sont
des faux positifs.

Mesures historiques laissées en l'état ci-dessous, datées et non recomptées
(la base a grossi depuis, et la méthode a changé) :

- Sur l'ensemble des 1 253 offres collectées : **57 groupes, 126 offres,
  69 doublons excédentaires** (`company_name` non nul, pour éviter les faux
  positifs des offres sans employeur identifié). Chiffre revérifié par la
  revue de la tâche 4, trois façons indépendantes (`group by` classique,
  `company_name <> ''`, et une reformulation par `count() over (partition
  by ...)`), toutes stables à ce total — le rapport initial de la tâche 4
  annonçait par erreur 47/106/59.
- Sur les 64 offres que comptait `offers_shortlist` au moment de cette mesure
  (après le déclassement `fr-js` ci-dessus ; la sélection a grossi depuis, le
  cron tournant chaque matin) — ce qui compte pour l'usage réel, une
  liste triée par score que le propriétaire relit à la main : **5 paires
  détectées par regroupement sensible à la casse** (AMILTONE, Capgemini,
  KLANIK, Malt « Senior Fullstack Engineer », Pretto), soit 10 offres sur 64
  (16 %).
- **Angle mort du regroupement : il respecte la casse.** « Virtualexpo
  Group » et « VIRTUALEXPO GROUP » — la même annonce « Ingénieur
  qualification logiciel H/F » republiée deux fois — échappent au groupe
  pour cette seule raison, alors que le titre normalisé est identique.
  Regrouper insensible à la casse (`lower(company_name)`) fait passer le
  compte de la sélection à **6 groupes, 12 offres, 6 excédentaires** : la
  paire Virtualexpo s'ajoute aux 5 déjà détectées. Généralisation du cas Malt
  déjà noté ci-dessous (ordre des mots et ponctuation) : la normalisation de
  chaîne actuelle a plusieurs angles morts distincts, pas un seul.
- **Un doublon de plus, invisible à toute normalisation de titre** : Malt
  publie la même mission deux fois sous « Senior Java - Kotlin Developer H/F »
  et « Senior Java/Kotlin Developer » — ponctuation et ordre des mots
  diffèrent, pas seulement un suffixe. Un `group by (title, company_name)`
  strict, même après avoir retiré les suffixes `H/F`, ne le voit pas. Ce cas
  précis n'est pas couvert par `offer_dedup_keys` (qui ne normalise que le
  suffixe de genre, pas l'ordre des mots ni la ponctuation) : il resterait
  visible deux fois dans `offers_shortlist` aujourd'hui si les deux lignes
  passaient par ailleurs ses critères.

### P11 — Pages Free-Work sans `JobPosting` : seulement journalisées, jamais comptées

Le client Free-Work (`supabase/functions/_scrapers/free-work/client.ts:164`)
avertit et saute une page de détail dépourvue de JSON-LD `JobPosting` —
`log('warn', 'page d’offre sans JobPosting', …)` — mais rien de durable ne
l'enregistre : pas de colonne, pas de compteur en télémétrie. Trois pages sur
le premier run réel, plusieurs autres constatées pendant les essais de cette
tâche (log `warn` visible dans la sortie de `scrape-daily.cmd`), sans qu'on
sache si c'est une page retirée entre le listing et le détail, un format de
page différent, ou une erreur de parsing.

Volontairement **pas** de compteur ajouté ici — la tâche qui l'a découvert
n'est pas celle qui doit décider de l'instrumentation. Mais c'est le premier
endroit où chercher le jour où une question se pose sur la santé de la
collecte Free-Work (« pourquoi si peu d'offres nouvelles cette semaine ? ») :
`grep` les logs `warn` de `page d’offre sans JobPosting`, faute de mieux pour
l'instant.

### ~~P9 — La re-revue de la tâche 11~~ *(rendue, approuvée)*

**Conformité : les six constats traités. Qualité : approuvée**, sans constat
Critique ni Important. Le relecteur a vérifié chaque point contre le code réel
et non contre le rapport, recalculé à la main les valeurs attendues du test sur
fixture, et confronté la liste blanche des paramètres à la matrice réellement
en base.

Ses deux mineurs étaient fondés et sont corrigés (commit `3783854`) :

`what` était admis dans `extra_params` alors que le projet documente, dans le
même fichier, que ce n'est pas un ET logique — 1 offre contre 313 pour
`what_and`. La matrice se réglant en SQL, personne n'aurait lu
l'avertissement : une quatrième catégorie refuse désormais les paramètres
pièges, avec la mesure qui justifie le refus.

La garde de type sur `RemoteMode` gardait une conversion que le correcteur
attribuait à une limite de TypeScript. Le relecteur a démontré le contraire en
compilant l'alternative. Retenu : un `Record<Exclude<RemoteMode, null>, true>`,
qui supprime la conversion **et** rend la couverture exhaustive — ajouter un
mode sans l'ajouter là casse la compilation. `Object.hasOwn` plutôt que `in`,
qui aurait accepté « toString » comme mode de télétravail. Testé.

Il jugeait la seconde réserve du correcteur non fondée : l'ordre de la fixture
n'affaiblit pas le test, qui asserte aussi `external_id` et `title` — un
décalage futur échouerait explicitement au lieu de passer en silence.

### ~~`seen_count` ne s'incrémentait jamais~~ *(résolu)*

Le design promettait un `seen_count = seen_count + 1` à chaque collecte, présenté
comme un signal gratuit pour repérer les annonces qui traînent — poste dur à
pourvoir, ou offre republiée en boucle. Le code ne l'écrivait pas : mesuré, les
**1 176 offres avaient `seen_count = 1`** alors que les **1 176 avaient été
revues** au moins une fois (`last_seen_at <> first_seen_at`). Colonne morte, et
rien ne le consignait : un usage de phase 2 s'y serait fié en recevant un signal
faux et silencieux.

La cause : un upsert supabase-js écrase les colonnes qu'on lui passe, il ne sait
pas exprimer un incrément SQL. L'incrément se fait donc en JavaScript, à partir
de la valeur relue — et le `SELECT` existait déjà pour compter new/updated, donc
la colonne supplémentaire ne coûte pas un aller-retour. Non atomique par nature,
ce qui est sans effet ici : une source ne se collecte jamais en parallèle
d'elle-même, et les deux crons sont espacés d'une demi-heure pour des
exécutions de 11 et 17 secondes.

Vérifié par une collecte réelle après correctif : 57 offres à 2, trois à 3, une à
4, deux à 5.

**Attention à la sémantique**, que cette mesure a précisée : ce n'est **pas** un
compteur de collectes. `runCollection` appelle `upsertOffers` après **chaque
requête**, donc une offre que cinq requêtes de la matrice ramènent dans le même
run est comptée cinq fois — d'où les `seen_count = 5` observés dès la première
collecte. Le signal garde sa valeur (largement diffusée, ou en ligne depuis
longtemps : deux indices d'un poste dur à pourvoir), mais qui voudra « depuis
combien de jours » devra passer par `first_seen_at` et `last_seen_at`.

Les offres déjà en base repartent de 1 : l'historique des passages passés est
perdu, il n'avait jamais été écrit.

### P7 — La Corse s'encode de deux façons

Adzuna rend `'2A'` / `'2B'` via `_shared/departments.ts`, France Travail rend
`'20'` via `codePostal.slice(0,2)`. Deux encodages du même territoire dans une
même colonne `text`. Sans effet sur le filtre `('13','83','84')`.

### ~~P4 — `supabase functions serve` écrase les variables `SUPABASE_*`~~ *(résolu)*

La commande **réserve** ces noms et ignore silencieusement les valeurs de
`.env.local` : une collecte lancée ainsi écrit dans une Postgres locale
éphémère et vide, en croyant écrire sur le projet distant. Aucune erreur,
aucune ligne — un faux succès complet.

Résolu : deux scripts npm, `fn:local:ft` et `fn:local:adzuna`, lancent le point
d'entrée par `deno run --env-file=.env.local` sur le port 8000, sans en-tête
`Authorization` (`verify_jwt` est appliqué par la plateforme, pas par
`Deno.serve`). Documenté dans `CLAUDE.md` et dans les trois étapes du plan qui
pointaient encore vers `fn:serve`.

### P12 — Une offre Free-Work vue par trois facettes se paie trois fois

`knownExternalIds` est un instantané pris une seule fois avant la boucle, et il
n'est jamais complété par les offres découvertes en cours de run. Les facettes
`react`, `typescript` et `javascript` se recouvrent largement — 196, 180 et 330
offres — donc une offre listée par trois d'entre elles coûte **trois pages de
détail** à 3 000 ms chacune, dans le même run. Déjà visible : 6 offres portent
deux étiquettes de provenance, ce qui est exactement ce chemin.

Sans effet sur les données (l'upsert dédoublonne), mais c'est du temps de
collecte et de la charge inutiles chez l'hôte. Alimenter l'ensemble au fil des
requêtes serait un petit changement et un vrai gain de politesse au prochain
backfill.

### P13 — La provenance ne dit pas la même chose selon la source

Parce que Free-Work saute les offres déjà connues d'un run à l'autre, l'ensemble
`found_by_query_ids` d'une offre est **figé au run qui l'a découverte** :
mesuré, 99 des 105 offres Free-Work ne portent qu'une seule étiquette, là où
France Travail et Adzuna en accumulent jusqu'à cinq. `CLAUDE.md` laisse entendre
que `found_by_labels` dit *quelles requêtes ont ramené l'offre* ; pour Free-Work
il dit *quelle facette l'a vue en premier*.

C'est une seconde raison, indépendante de la mesure, pour laquelle le
déclassement des facettes en `net` était juste : une facette restée `anchored`
aurait fait dépendre la confiance de l'ordre des runs.

Même cause, même effet sur `last_seen_at`, qui ne se rafraîchit pas pour
Free-Work : cette colonne ne peut donc pas servir à distinguer une annonce
encore en ligne d'une annonce retirée, sur cette source. Personne ne s'en sert
aujourd'hui.

### P14 — Des fusions de doublons sans aucun recouvrement de texte, mesurées à 1 cas sur 191

Le garde-fou « une seule ville par source » (voir « Phase 1 — Plan de
dédoublonnage ») ne protège pas contre un employeur intermédiaire — place de
marché, ESN — qui publie plusieurs missions distinctes sous un même
intitulé et une même ville. Cas trouvé en tâche 3 : deux annonces Malt
« Senior Fullstack Engineer H/F » fusionnées à tort, l'une décrivant des
responsabilités concrètes, l'autre de la communication de plateforme
générique — aucune phrase commune.

Mesuré en tâche 4 sur les 191 paires masquée/représentante, par recouvrement
lexical (mots de 6 lettres ou plus partagés entre les deux descriptions) :
**1 paire à recouvrement nul (Malt)**, **6 à recouvrement quasi nul (1 à 3
mots)**. Mais ce signal n'est pas fiable en l'état : deux des six autres
paires à faible recouvrement (AMILTONE, Boond) sont des doublons **prouvés**
par lecture intégrale en tâche 3 — leur faible score vient de la troncature
Adzuna, qui coupe le texte à 500 caractères et à des endroits différents
selon la longueur du titre, pas d'une différence de poste. Un signal
automatique fondé sur le seul recouvrement lexical confondrait donc « vrai
doublon tronqué différemment » et « faux positif Malt ».

**Décision** : rien codé ici (aucune vue ni migration n'est touchée dans
cette tâche). Mais **attention au dénominateur, la revue finale l'a relevé** :
1 cas sur 191 paires masquées fait 0,5 % du corpus, et c'est le chiffre
rassurant — or la décision porte sur la **liste quotidienne**, qui ne perd
que **5 offres**, dont Malt. Le taux qui gouverne est donc **1 sur 5, soit
20 %**. C'est tout le reste du document qui raisonne sur le coût asymétrique
de la liste du matin ; ce paragraphe est le seul à avoir basculé sur le
corpus entier, et c'est précisément ce qui rendait le risque négligeable.
Le choix de ne rien automatiser reste défendable — le signal lexical
confondrait vrai doublon tronqué et faux positif — mais il se prend en
sachant qu'une disparition sur cinq est douteuse, pas une sur deux cents.
À revisiter si la proportion grossit, ou si une source publie
massivement au nom d'employeurs intermédiaires. En attendant, la recette de
surveillance ci-dessous (plus gros groupes de doublons) reste le meilleur
signal disponible sans coder de nouveau critère.

---

## Mineurs consignés

Les huit derniers viennent de la revue finale du plan B. Ils ont été vérifiés,
jugés non bloquants, et laissés en l'état délibérément.

| # | Sujet |
|---|---|
| M14 | `PoliteFetcher.requestCount` n'est lu par personne hors de son test, et le plan promet dans la sortie un champ `requests` que `CollectionSummary` n'a jamais eu. Câbler l'un ou supprimer les deux |
| M15 | `collective/mapper.ts` code l'URL de base en dur pour reconstruire le lien d'une mission, alors que `sources.base_url` la porte déjà et que le client la reçoit en paramètre. Deux vérités pour un même fait |
| M16 | Le troisième refus de `loadSourceSettings` — `user_agent` absent — est atteignable (la colonne est nullable) mais aucun test ne l'exerce |
| M17 | Le client Collective ne déduplique pas entre pages, là où celui de Free-Work le fait. Sans effet sur les données, mais `collection_query_results.fetched` est gonflé pour cette source : 1 800 annoncées pour 1 760 lignes réellement écrites, soit les 40 missions ayant changé de page pendant le parcours |
| M18 | `isPermanentContract === true ? 'CDI' : 'Freelance'` ne distingue pas `false` d'absent : si Collective cessait d'émettre le champ, tout deviendrait Freelance en silence. Mesuré aujourd'hui : 587 CDI, 1 196 Freelance, aucun null |
| M19 | La sélection de groupe de `robots.txt` compare le jeton d'agent par sous-chaîne de notre agent complet, plus large que la correspondance par jeton de produit du RFC 9309. Aucun `robots.txt` des deux sites ne contient de jeton piège, et l'erreur va dans le sens « collecter moins » |
| M20 | `contract_label` porte désormais quatre vocabulaires : libellé français (France Travail), temps de travail (Adzuna), énumérations schema.org jointes (Free-Work), rien (Collective). Et côté Free-Work l'ordre de la jointure varie — `CONTRACTOR, FULL_TIME` sur 18 offres, `FULL_TIME, CONTRACTOR` sur 3 — donc la même offre peut porter deux libellés différents. `contract_type`, lui, est cohérent entre les trois sources qui le renseignent |
| M21 | Le mapper Free-Work laisse tomber un `baseSalary` qui ne porterait qu'un `maxValue`, là où le mapper Adzuna rend « jusqu'à X ». Non exercé par les fixtures |
| M1 | `upsert_test.ts` : ternaire mort `offer ? [offer] : []` |
| M2 | `upsertOffers` déduit la source de `rows[0]` et suppose un lot monosource. L'invariant tient par construction, l'écriture est protégée par l'`onConflict` composé, mais le comptage de télémétrie serait faussé si l'invariant sautait. Une garde explicite manque |
| M3 | Correspondance des clés du payload `upsert` aux colonnes réelles : non vérifiable par le typage, `DbClient` n'étant pas typé sur le schéma |
| M4 | `client.ts` France Travail : le `break` sur `rangeStart !== start` est mathématiquement redondant et son commentaire évoque à tort un risque de boucle infinie |
| M6 | `runCollection` renvoie `success` sur une liste de requêtes vide. Cohérent avec la formule, mais masquerait une configuration où toutes les requêtes d'une source sont désactivées |
| M7 | Le champ `fetched` de la télémétrie compte les offres **après** mapping, pas le brut renvoyé par la source. Nommage trompeur |
| M11 | `published_since_days` est semé en base mais **lu par personne** : la fenêtre vient de `WINDOW_DAYS[mode]`. Colonne morte pour les deux sources |
| M12 | `contract_label` reçoit un temps de travail chez Adzuna (`full_time`) et un libellé de contrat chez France Travail. Divergence sémantique dans une même colonne |
| M13 | `salary_is_predicted`, présent dans chaque payload Adzuna, est ignoré : un salaire estimé s'afficherait comme publié. Aucun impact mesuré — 0 offre sur 50 est prédite dans l'échantillon |

---

## Une leçon de méthode, payée deux fois

**Un test unitaire ne prouve rien sur un client d'API.** Le défaut le plus grave
de la tâche 11 — `implies_remote` transmis à l'URL Adzuna, qui répond **HTTP
400** à tout paramètre inconnu — aurait fait échouer en entier les quatre
requêtes full remote en production. Les tests étaient verts : ils injectent un
`fetch` factice. Seul un appel réel sur l'URL **construite par le code** l'a
révélé.

Corollaire pour la suite : toute tâche livrant un client d'API doit se terminer
par un appel véritable sur une URL produite par le code, pas seulement par une
suite verte.

**Et une copie de travail peut mentir sans que rien ne casse.** Le fichier
`20260907234512_fix_adzuna_priority_order.sql` s'est retrouvé écrasé sur le
disque par le contenu d'une *autre* migration, celle du poids d'`angular`. La
version commitée était intacte et la base portait bien les bonnes priorités : la
corruption était purement locale, donc totalement silencieuse. Elle aurait
survécu à une reprise de session et fait rejouer la mauvaise migration.
Restaurée par `git checkout --`, après vérification en base des 11 priorités et
du poids d'`angular`. Le réflexe : `git status` avant tout `db push`, et croire
la base plutôt que le fichier.

---

## Ordre de travail decide (2026-09-08)

**1. Le dedoublonnage (P10 + P6), des que le chantier plan B est termine.**
Les deux se concoivent ensemble : c'est le meme probleme vu de deux cotes,
la meme annonce sous deux `external_id` dans une source, et la meme annonce
vue par deux sources.

Mesure du 2026-09-08 sur 1 399 offres, casse et suffixes « (H/F) »
normalises :

| | Groupes | Offres | En exces |
|---|---:|---:|---:|
| **Intra**-source (P10) | 57 | 139 | 82 |
| **Inter**-sources (P6) | 21 | 49 | — |

Repartition des groupes inter-sources par paire : **adzuna + france_travail
14**, adzuna + free_work 4, france_travail + free_work 3.

Ce dernier chiffre corrige une impression du document : P6 n'attendait pas
l'arrivee des scrapers pour etre reel. **Les deux API se recouvrent deja sur
14 annonces**, et personne ne l'avait mesure — la meme offre d'ESN publiee sur
les deux canaux. L'arrivee de Free-Work n'ajoute que 7 groupes pour l'instant,
mais elle republie beaucoup d'annonces d'ESN qui paraissent aussi sur France
Travail : le gisement grossira quand Collective entrera. La tache 12 du plan B
le chiffrera, on partira d'un nombre et non d'une intuition.

Ces nombres gonflent a chaque collecte : **les remesurer au demarrage, ne pas
les recopier.**

Cette tache a un **ordre impose**, seule de la liste : elle touche
`_shared/upsert.ts`, que les scrapers du plan B importeront. La faire avant
que trois sources de plus s'y branchent coute nettement moins cher que de la
retrofiter sur six.

**2. La phase 2, le scoring IA — precedee d'un brainstorming.**
Leo a des changements prevus sur cette phase : **ne pas partir du ROADMAP tel
quel**, refaire un brainstorming d'abord. Ce qui est acquis en revanche, c'est
que la phase 2 n'etait pas lancable avant : elle consomme `offers_shortlist`
comme pre-filtre decidant quelles offres meritent un appel payant, or ce
contrat bougeait encore. Il est stable depuis ce chantier, et son cout est
enfin chiffrable.

**Peuvent se glisser n'importe quand**, aucune collision avec le plan B :
P3 (pagination latente de France Travail, qui perdrait des offres en silence)
et P1 (geocodage par `commune_insee`, pour regler le rayon au kilometre plutot
qu'au departement).

## Decisions en attente

Aucune. Les dernieres tranchees : matrice Adzuna en requetes precises avec full
remote garanti par la requete, `category=it-jobs` conserve comme filet en
premiere position d'ecriture, `angular` et `java` a +1 en contexte, `cobol` en
signal rouge. Et pour ce chantier : un ensemble de requetes plutot qu'un
scalaire, `adzuna:local:javascript` maintenue `anchored` malgre sa majorite de
hors sujet, son declassement coutant 5 offres adjacentes sans autre voie
d'entree.

---

## Réglages à envisager après quelques jours de cron

Les tables de télémétrie répondent à ces questions sans deviner :

```sql
-- Requêtes improductives, candidates à la désactivation
select sq.label, sum(cqr.new_offers) as total_new, count(*) as runs
from search_queries sq
join collection_query_results cqr on cqr.query_id = sq.id
group by sq.label
having coalesce(sum(cqr.new_offers), 0) = 0
order by sq.label;

-- Requêtes tronquées, candidates au découpage
select distinct unit_label, total_available
from collection_query_results where truncated
order by total_available desc;
```

### Surveiller le dédoublonnage — repérer une source qui republierait massivement

`offer_duplicate_groups` ne dit rien tout seul si une source se met un jour à
republier la même annonce en boucle (un bug de scraper, une pagination qui
tourne en rond) : un tel emballement se verrait d'abord dans la taille des
plus gros groupes. Exécutée le 2026-09-08 :

```sql
select o.company_name, o.title, g.dup_count, g.dup_sources
from offer_duplicate_groups g
join offers o on o.id = g.offer_id
where g.is_primary
order by g.dup_count desc
limit 15;
```

```
company_name                | title                                                       | dup_count | dup_sources
Celad                       | Data Scientist – secteur bancaire (F/H)                    | 4         | {collective}
Achil                       | Chef de Mission - Equilibre Pro / Perso H/F                | 4         | {collective}
KLANIK                      | Développeur Java (H/F)                                     | 4         | {adzuna,france_travail}
NEW NET 3D                  | Développeur d'Applications C# .NET ... (H/F)               | 4         | {france_travail}
NEW NET 3D                  | Ingénieur Développement Full Stack Java / Angular (H/F)    | 3         | {france_travail}
KLANIK                      | Ingénieur IA (H/F)                                         | 3         | {adzuna,france_travail}
Amiltone                    | Développeur Java/Angular (H/F)                             | 3         | {adzuna,free_work}
...                                                                                       | ...       | ...
```

Rien d'anormal aujourd'hui : le plus gros groupe compte 4 offres, jamais plus,
et aucune source n'y domine systématiquement. Un groupe qui grimperait
soudain à 10 ou 20 pour une seule source, ou une même entreprise apparaissant
en boucle dans le haut de ce classement, serait le signal à suivre — à relire
de temps en temps, pas seulement quand la sélection paraît étrange.

### Vérifier que le dédoublonnage n'a pas dérapé — doit rendre zéro ligne

Environ 750 lignes de SQL décident si une offre est vue. Leurs invariants ont
été **prouvés** en revue par des requêtes écrites pour l'occasion, mais rien ne
les rejouait ensuite : `deno test` ne sait pas tester une vue. Voici de quoi
le faire, à lancer quand la liste paraît étrange, et après toute migration qui
touche `offers_ranked`, `offers_shortlist` ou les vues de dédoublonnage.

```sql
with elig as materialized (
  select id, dup_group_id from offers_ranked
  where red_flags = 0
    and (core_hits >= 1 or ai_hits >= 1 or trusted_query)
    and (department in ('13', '83', '84') or remote_label = 'full')
),
sl as materialized (select id, dup_group_id from offers_shortlist)
select 'groupe eligible sans ligne affichee' as anomalie, count(*) as n
  from (select dup_group_id from elig except select dup_group_id from sl) a
  having count(*) > 0
union all
select 'groupe affiche plusieurs fois', count(*)
  from (select dup_group_id from sl group by 1 having count(*) > 1) b
  having count(*) > 0
union all
select 'ligne affichee hors criteres', count(*)
  from sl where id not in (select id from elig)
  having count(*) > 0;
```

**Elle doit ne rien rendre.** Exécutée le 2026-09-08 : zéro ligne, sur 87
groupes éligibles et 87 lignes affichées.

Ce que chaque anomalie voudrait dire, et quoi faire :

| Anomalie | Ce qui s'est cassé | Où chercher |
|---|---|---|
| `groupe eligible sans ligne affichee` | **Le plus grave** : un poste a disparu de la liste alors qu'il satisfaisait les critères. C'est exactement le défaut trouvé en revue de la tâche 3, où le représentant était élu sans regarder s'il était lui-même visible | l'élection dans `offers_shortlist`, migration `20260908180000` |
| `groupe affiche plusieurs fois` | Le dédoublonnage ne dédoublonne plus — partition cassée, ou `dup_group_id` devenu nul quelque part | `coalesce(dup_group_id, id::text)` dans `offers_ranked` |
| `ligne affichee hors criteres` | Un filtre a sauté : signal rouge, lexique ou géographie | la clause `where` de `eligibles` |

`materialized` n'est pas décoratif ici non plus : sans lui la requête rejoue
les vues à chaque ligne et expire.

### Surveiller la confiance par requête — la seule chose qui remesure

`trusted_query` court-circuite **tout** le lexique : seul `red_flags` reste
éliminatoire. Sa sûreté ne repose que sur un classement à la main de 38 offres,
fait une fois le 2026-09-08. Rien ne le remesure tout seul. Voici de quoi le
faire, à lancer après quelques jours de cron.

**Ce qu'on regarde** : la contribution *marginale* de chaque requête ancrée —
les offres dont elle est la **seule** étiquette de confiance responsable de
l'entrée. Le décompte brut ne vaut rien : deux requêtes ancrées qui se
recouvrent se partagent un mérite qu'aucune n'a seule.

```sql
with marginales as (
  select o.id, o.title, o.company_name, o.score,
         (select array_agg(sq.label order by sq.label)
            from search_queries sq
           where sq.id = any (o.found_by_query_ids)
             and sq.trust = 'anchored' and sq.enabled) as ancrees
  from offers_shortlist o
  where o.core_hits = 0 and o.ai_hits = 0   -- entrées UNIQUEMENT par la confiance
)
select ancrees[1] as requete, count(*) as dont_elle_est_seule_responsable
from marginales
where array_length(ancrees, 1) = 1
group by 1 order by 2 desc;
```

Remplacer les deux dernières lignes par `select requete, title, company_name,
score from marginales where array_length(ancrees, 1) = 1 order by 1, score desc;`
donne les intitulés, seul moyen de juger.

**Ce qu'on en fait** : une requête ne se déclasse que si elle fait entrer une
**majorité** de hors-sujet *et* que son déclassement ne coûte aucune offre
pertinente ou adjacente. Le critère n'est pas « zéro bruit » : une offre hors
sujet en bas d'une liste triée par score coûte peu, une offre pertinente jamais
affichée coûte cher. C'est exactement ce raisonnement qui a fait déclasser
`fr-react` et `fr-js` — coût nul — et **maintenir** `adzuna:local:javascript`
malgré 7 hors-sujet sur 12, ses 5 adjacentes n'ayant aucune autre voie d'entrée.
Compter les **annonces**, pas les lignes : le défaut P10 en triple certaines.

Relevé du 2026-09-08 en fin de chantier, pour servir de point de comparaison :
`adzuna:local:javascript` 13, `adzuna:remote:fr-ts` 12,
`adzuna:local:typescript` 3, les autres 0.

Corriger un classement passe par une **migration**, jamais par un `UPDATE` :
c'est une donnée de référence, et la migration porte la mesure qui la justifie.

Désactiver une requête : `update search_queries set enabled = false where label = '…';`
Ajuster un poids : `update skill_lexicon set weight = … where term = '…';`
Dans les deux cas, l'effet est immédiat sur les offres déjà collectées — le score
est une vue.

Désactiver une requête ancrée lui retire aussi sa **confiance** : depuis la
migration `20260908080000`, `trusted_query` ne compte que les requêtes encore
actives. Ce n'était pas le cas à la livraison du plan — la vue ignorait
`enabled`, et le remède documenté ici n'aurait rien changé aux offres déjà
entrées. En revanche `found_by_labels` continue d'afficher la requête
désactivée : « elle a trouvé cette offre » reste un fait vrai.

**Désactiver, jamais supprimer.** `found_by_query_ids` est un `int[]`, qui ne
peut pas porter de clé étrangère : supprimer la ligne de `search_queries`
retirerait son étiquette en silence et pourrait faire **sortir** une offre de
la sélection. Et ne jamais réécrire les `keywords` d'une requête `anchored` —
créer une nouvelle étiquette : l'id survit à la redéfinition, donc les offres
déjà estampillées resteraient dignes de confiance sur la foi d'un texte de
requête disparu, sans aucun signal.

Régler la confiance d'une requête (`search_queries.trust`, `'anchored'` ou
`'net'`) : **par migration seulement**, à la différence des deux réglages
ci-dessus — c'est ce que la tâche 4 du plan « confiance par requête » impose
explicitement, pour garder une trace du pari et de sa correction (voir
`20260908033042`, `20260908050000` et `20260908070000`). Effet immédiat aussi
sur `offers_shortlist`, une fois la migration poussée.

**Ordre d'écriture, à ne pas confondre avec un ordre d'importance** : `priority`
croissante décide de l'ordre d'exécution, et comme l'upsert écrase, **la
dernière requête à voir une offre fixe ses colonnes scalaires** —
`remote_label`, `search_origin_insee`, `search_radius_km`. Les requêtes les
plus informatives doivent donc passer en dernier.

**Attention à un mot qui porte deux sens dans ce dépôt.** Le code appelle
« provenance » deux choses différentes, et elles ne s'écrivent pas de la même
façon :

| Ce que le code nomme ainsi | Ce que c'est | Comment ça s'écrit |
|---|---|---|
| `provenanceOf()`, `FtProvenance`, `AdzunaProvenance` (mappers) | la commune INSEE et le rayon de la requête | **dernier écrivain gagne** |
| `UpsertProvenance` (`_shared/upsert.ts`) | l'**id de la requête** qui a ramené l'offre | **union**, jamais écrasée |

La phrase ci-dessus ne vaut donc que pour la première. `found_by_query_ids`
échappe entièrement à l'ordre d'exécution : c'est tout l'objet de la décision
de conception « un ensemble, pas un scalaire » — la relire plus haut dans ce
document avant de toucher aux `priority` en croyant déplacer la confiance.

# État d'avancement et reste à faire

**Dernière mise à jour** : 2026-09-08
**Branche de travail** : `phase-1-collecte-api`

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

```sql
select * from offers_shortlist order by score desc, published_at desc;
```

| Indicateur | Valeur |
|---|---:|
| Offres collectées | 1 176 |
| — dont France Travail | 700 |
| — dont Adzuna | 476 |
| Offres retenues (`offers_shortlist`) | **31** |
| — dont locales (13, 83, 84) | 19 |
| — dont full remote national | 12 |
| Mentionnant React / TypeScript / Next.js | 47 |
| Mentionnant LLM / IA / agents | 67 |
| En full remote | 9 |
| Requêtes France Travail actives | 24 sur 38 |
| Requêtes Adzuna actives | 11 sur 11 |
| Jobs cron actifs | 2 |
| Termes au lexique | 67 |
| Tests | 115 verts |

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

## Phase 1 — Plan B : les 4 scrapers

**Pas commencé, et volontairement pas encore planifié.** Free-Work,
Codeur.com, Collective.work et Kicklox. Le `robots.txt` des quatre a été
vérifié et autorise la collecte ; les quatre publient un sitemap XML, retenu
comme surface de collecte plutôt que les pages de listing.

Le plan sera écrit contre des fixtures HTML réelles, à capturer d'abord. Deux
contraintes déjà connues : Codeur.com interdit les query strings sauf `?page=N`,
et Free-Work banne `Wget` et `HTTrack` nommément.

**Fait nouveau à exploiter** : Collective.work et Malt apparaissent comme
employeurs dans les résultats Adzuna. Adzuna couvre donc déjà une partie des
cibles du plan B, ce qui peut en réduire le périmètre.

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

*Reste ouvert, moins urgent* : la confiance par **requête** plutôt que par
source. `fr-react` et `fr-ts` sont ancrées à une techno ; `it-jobs` et
`fr-dev` sont des filets — le lemmatiseur d'Adzuna fait correspondre
« développeur » à « Business Developer ». Les distinguer exige de retenir
quelle requête a trouvé l'offre : une colonne de plus sur `offers`, peuplée
dès la collecte suivante.

### P5 — Signal local mince, et ce n'est pas un défaut d'outillage

Le marché React marseillais est réellement petit : `React TypeScript` rend **5**
offres sur 31 jours à Marseille, `Next.js` en rend 2. Les deux sources
concordent, le local est dominé par Angular et Java. **Le gisement exploitable
est national et full remote** — 76 offres côté Adzuna contre 9 côté France
Travail — ce qui pèse sur la phase 2 et rend P8 prioritaire.

### P6 — Dédoublonnage inter-sources absent, et désormais actif

`unique (source, external_id)` empêche les doublons **dans** une source, pas
entre sources. Les deux sources alimentent maintenant la base : le problème
n'est plus théorique. Première dette à payer en phase 2.

### P9 — La re-revue de la tâche 11 est en cours

Les six constats de revue ont été corrigés (commit `2c678d5`). Un premier
relecteur a été coupé par une limite de session avant de rendre son verdict ;
un second a été relancé sur le même diff,
`.superpowers/sdd/review-983e858..2c678d5.diff`.

Ce qui a été vérifié à la place, par exécution : `verify` vert à 115 tests, et
neuf contrôles de comportement sur le code réel, dont un appel HTTP véritable.
Deux réserves du correcteur restent non arbitrées : une conversion
`as readonly string[]` subsistant dans une garde de type, et l'ordre de la
fixture reconstruite.

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

---

## Mineurs consignés

| # | Sujet |
|---|---|
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

## Décisions en attente

Aucune. Les dernières tranchées : matrice Adzuna en requêtes précises avec full
remote garanti par la requête, `category=it-jobs` conservé comme filet en
première position d'écriture, `angular` et `java` à +1 en contexte, `cobol` en
signal rouge.

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

Désactiver une requête : `update search_queries set enabled = false where label = '…';`
Ajuster un poids : `update skill_lexicon set weight = … where term = '…';`
Dans les deux cas, l'effet est immédiat sur les offres déjà collectées — le score
est une vue.

**Ordre d'écriture, à ne pas confondre avec un ordre d'importance** : `priority`
croissante décide de l'ordre d'exécution, et comme l'upsert écrase, **la
dernière requête à voir une offre fixe ses colonnes** — provenance et
`remote_label` compris. Les requêtes les plus informatives doivent donc passer
en dernier.

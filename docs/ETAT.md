# État d'avancement et reste à faire

**Dernière mise à jour** : 2026-09-08
**Branche de travail** : `phase-1-collecte-api`

Vision et phases : [`ROADMAP.md`](ROADMAP.md) · Règles du dépôt : [`../CLAUDE.md`](../CLAUDE.md)

---

## Où en est-on

**Le système tourne tout seul.** 700 offres en base, 6 retenues par la vue
`offers_shortlist`. La fonction France Travail est déployée et le cron
`ft-daily` s'exécute **chaque jour à 6 h, PC éteint** — chaîne vérifiée de bout
en bout : Vault, `pg_net`, fonction déployée, écriture en base.

```sql
select * from offers_shortlist order by score desc, published_at desc;
```

| Indicateur | Valeur |
|---|---:|
| Offres collectées | 700 |
| Offres retenues (`offers_shortlist`) | 6 |
| Mentionnant React / TypeScript / Next.js | 47 |
| Mentionnant LLM / IA / agents | 67 |
| En full remote | 9 |
| Requêtes France Travail actives | 24 sur 38 |
| Termes au lexique | 66 |
| Tests | 70 verts |

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
| **11** | **Adzuna : client, mapper, orchestration** | **à faire** |
| **12** | **Déploiement Adzuna + cron** | **à faire** |

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

## Phases 2 à 5

Pas commencées. Voir [`ROADMAP.md`](ROADMAP.md) : scoring IA, tableau de bord,
génération de CV et lettres, suivi des candidatures.

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

### P3 — Défaut de pagination latent

La boucle de `fetchAllPages` avance par pas fixes de 150 sans tenir compte du
nombre d'offres réellement reçues. Si l'API renvoyait une page intermédiaire plus
courte sans que le total soit atteint, des offres seraient perdues **en
silence**.

Non déclenché sur la première collecte réelle — `fetched` égalait
`total_available` sur les 24 requêtes, et de nouveau sur le run du cron — mais le défaut reste dans le code.

### P4 — `supabase functions serve` écrase les variables `SUPABASE_*` *(contourné, à documenter)*

La commande **réserve** ces noms et ignore silencieusement les valeurs de
`.env.local`. Une collecte lancée ainsi écrit dans une Postgres locale éphémère
et vide, en croyant écrire sur le projet distant. Deux contournements :
`deno run --env-file=.env.local` directement sur le point d'entrée pour un test
local, ou `npx supabase db query --linked` pour toute vérification en base.

Reste à documenter dans le plan avant la tâche 11, qui porte la même étape.

### P5 — Signal local mince

6 offres retenues sur 700. France Travail seul ne suffit pas pour ce profil :
zéro offre React dans son index sur Marseille. Adzuna devrait changer l'échelle
(36 offres React à Marseille, 1481 au national) — c'est l'enjeu de la tâche 11.

### P6 — Dédoublonnage inter-sources absent

`unique (source, external_id)` empêche les doublons **dans** une source, pas
entre sources. Dès qu'Adzuna alimentera la base, une même offre pourra y figurer
deux fois. Première dette à payer en phase 2.

---

## Mineurs consignés

| # | Sujet |
|---|---|
| M1 | `upsert_test.ts` : ternaire mort `offer ? [offer] : []` |
| M2 | `upsertOffers` déduit la source de `rows[0]` et suppose un lot monosource. L'invariant tient par construction, l'écriture est protégée par l'`onConflict` composé, mais le comptage de télémétrie serait faussé si l'invariant sautait. Une garde explicite manque |
| M3 | Correspondance des clés du payload `upsert` aux colonnes réelles : non vérifiable par le typage, `DbClient` n'étant pas typé sur le schéma |
| M4 | `client.ts` : le `break` sur `rangeStart !== start` est mathématiquement redondant et son commentaire évoque à tort un risque de boucle infinie |
| M6 | `runCollection` renvoie `success` sur une liste de requêtes vide. Cohérent avec la formule, mais masquerait une configuration où toutes les requêtes d'une source sont désactivées |
| M7 | Le champ `fetched` de la télémétrie compte les offres **après** mapping, pas le brut renvoyé par la source. Nommage trompeur |

---

## Décisions en attente

Aucune. Les dernières tranchées : `angular` et `java` à +1 en contexte, `cobol`
en signal rouge, matrices France Travail et Adzuna révisées d'après les volumes
mesurés.

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

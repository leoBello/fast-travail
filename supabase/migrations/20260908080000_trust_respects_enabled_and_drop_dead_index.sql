-- Deux constats de la revue finale du plan "confiance par requete".
--
-- 1. DESACTIVER UNE REQUETE NE FAISAIT PLUS CE QUE LE DEPOT PROMET
--
-- La laterale posee par 20260908040000 calcule `trusted_query` avec
-- `bool_or(sq.trust = 'anchored')`, sans regarder `sq.enabled`. Or ETAT.md
-- documente, dans sa section de reglage, que desactiver une requete a un
-- "effet immediat sur les offres deja collectees" -- c'est le remede que le
-- proprietaire est cense appliquer quand une requete devient bruyante.
--
-- Le scenario qui rend le defaut visible : il voit les 7 offres hors sujet
-- que `adzuna:local:javascript` fait entrer, applique le remede documente
-- (`update search_queries set enabled = false ...`), recharge la selection --
-- et rien ne bouge. Les 7 restent a vie. Deux boutons voisins de semantiques
-- opposees : `trust = 'net'` etait bien retroactif, `enabled = false` ne
-- l'etait pas du tout.
--
-- Le code change, pas la promesse. `trusted_query` ne tient desormais compte
-- que des requetes ENCORE ACTIVES.
--
-- Mais le filtre porte sur la CONFIANCE, pas sur la PROVENANCE :
-- `found_by_labels` continue d'afficher toutes les requetes ayant ramene
-- l'offre, desactivees comprises. "Cette requete a trouve cette offre" reste
-- vrai quand on la desactive ; c'est un fait historique, et le perdre
-- appauvrirait la lecture quotidienne sans rien garantir de plus.
--
-- 2. L'INDEX GIN ETAIT MORT, ET SA JUSTIFICATION ECRITE ETAIT FAUSSE
--
-- 20260908033042 creait `offers_found_by_query_ids_idx` en GIN, justifie
-- ainsi : "l'operateur && (intersection) de la tache 3 s'en sert". La tache 3
-- n'a jamais ecrit de `&&`. Elle a ecrit une laterale en
-- `sq.id = any (o.found_by_query_ids)`, qui parcourt `search_queries` (56
-- lignes) et ne touche jamais `offers` par le tableau. Mesure :
-- `pg_stat_user_indexes` donne idx_scan = 0 et idx_tup_read = 0.
--
-- Le cout d'execution etait nul, ce n'est pas la raison de le retirer. La
-- raison est qu'une migration appliquee documentait un usage inexistant, et
-- que ce depot ne garde pas d'objet mort -- il a deja supprime une colonne
-- morte pour ce motif exact. Si un besoin d'intersection apparait un jour,
-- l'index se recree en une ligne, avec cette fois une mesure pour le
-- justifier.

drop index offers_found_by_query_ids_idx;

drop view offers_shortlist;
drop view offers_ranked;

create view offers_ranked as
select o.*,
       coalesce(s.score, 0)                       as score,
       coalesce(s.matched_terms, '{}'::text[])    as matched_terms,
       coalesce(s.core_hits, 0)                   as core_hits,
       coalesce(s.ai_hits, 0)                     as ai_hits,
       coalesce(s.red_flags, 0)                   as red_flags,
       haversine_km(43.2965, 5.3698, o.latitude, o.longitude) as distance_marseille_km,
       coalesce(fbq.labels, '{}'::text[])         as found_by_labels,
       coalesce(fbq.trusted, false)               as trusted_query
from offers o
left join offer_lexical_score s on s.offer_id = o.id
left join lateral (
  -- `labels` ne filtre pas sur `enabled` : la provenance est un fait
  -- historique. `trusted` le fait : la confiance, elle, se retire.
  select array_agg(sq.label order by sq.label)             as labels,
         bool_or(sq.trust = 'anchored' and sq.enabled)     as trusted
  from search_queries sq
  where sq.id = any (o.found_by_query_ids)
) fbq on true;

create view offers_shortlist as
select o.*,
       case
         when o.department in ('13', '83', '84') then 'local'
         when o.remote_label = 'full'            then 'full remote'
       end as acces
from offers_ranked o
where o.red_flags = 0
  and (o.core_hits >= 1 or o.ai_hits >= 1 or o.trusted_query)
  and (o.department in ('13', '83', '84') or o.remote_label = 'full');

comment on view offers_shortlist is
  'Offres retenues : sans signal rouge, portant React/TypeScript/Next.js, ou '
  'un signal IA, ou trouvees par une requete de confiance ENCORE ACTIVE '
  '(search_queries.trust = anchored et enabled), et soit dans les '
  'departements 13/83/84, soit en full remote. '
  'Trier par score desc, published_at desc.';

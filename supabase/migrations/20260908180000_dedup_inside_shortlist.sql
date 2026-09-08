-- Corrige un defaut CRITIQUE trouve par la revue de la tache 3 : un poste
-- pouvait disparaitre entierement de la selection.
--
-- CE QUI CLOCHAIT, ET POURQUOI PERSONNE NE L'AVAIT VU
--
-- Le representant d'un groupe etait elu sur TOUTE la base, sans regarder si
-- lui-meme satisfaisait les criteres de la selection. La shortlist se
-- contentait ensuite d'exiger `is_primary`.
--
-- Consequence mesuree sur deux des sept disparitions, Akanea et CN Amirault :
-- le representant elu etait la ligne france_travail, qui porte le texte
-- INTEGRAL — et ce texte contient un terme du signal rouge (« bac+2 »,
-- « debutant ») que les 500 caracteres tronques d'Adzuna ne montraient jamais.
-- La ligne Adzuna, elle, etait visible avant cette migration.
--
-- Resultat : avant, l'utilisateur voyait une ligne pour ces deux postes ;
-- apres, plus aucune. Le commentaire de la migration precedente affirmait
-- pourtant que chaque disparition etait « remplacee par la ligne
-- france_travail » — faux pour ces deux-la, puisque cette ligne n'entre
-- jamais dans la selection.
--
-- C'est exactement le cout que ce plan existait pour eviter : le projet a un
-- cout asymetrique, une offre affichee en trop se repere d'un coup d'oeil,
-- une offre JAMAIS AFFICHEE est perdue en silence.
--
-- LE CORRECTIF : dedoublonner DANS la selection, pas avant elle
--
-- L'election ne se fait plus sur toute la base mais parmi les offres qui
-- passent deja les criteres. Seules des lignes visibles se disputent la
-- place, donc un groupe dont une offre au moins est eligible garde toujours
-- exactement une ligne affichee. Si le meilleur candidat porte un signal
-- rouge, c'est le suivant qui s'affiche, au lieu que le poste s'evapore.
--
-- L'ordre d'election ne change pas — il reste celui que l'utilisateur a
-- choisi : d'abord l'offre qui porte un TJM, puis la description la plus
-- longue, puis la plus recente, puis l'id pour que l'ordre soit total et le
-- resultat reproductible.
--
-- `is_primary` reste expose par offers_ranked, mais ne gouverne plus la
-- selection : il dit desormais « representant de son groupe sur l'ensemble
-- de la base », ce qui reste l'information utile pour
-- offers_hidden_duplicates.
--
-- POINT DE VIGILANCE : les offres hors groupe
--
-- 151 offres n'ont pas d'entreprise et ne sont donc pas couvertes par
-- offer_dedup_keys : leur `dup_group_id` est null. Partitionner sur un null
-- les aurait TOUTES rassemblees dans une seule partition, dont une seule
-- ligne aurait survecu. D'ou le coalesce sur l'id, qui rend chacune unique.
-- C'est le meme piege que celui deja rencontre en tache 2 avec la ville
-- nulle, et il se paie de la meme facon : en silence.
--
-- offers_ranked gagne `dup_group_id`, dont la shortlist a besoin pour
-- partitionner. Les deux vues sont donc supprimees et recreees dans l'ordre,
-- avec leurs commentaires, qui disparaissent avec un drop.

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
       coalesce(fbq.trusted, false)               as trusted_query,
       coalesce(dg.dup_group_id, o.id::text)           as dup_group_id,
       coalesce(dg.dup_count, 1)                       as dup_count,
       coalesce(dg.dup_sources, array[o.source])       as dup_sources,
       coalesce(dg.dup_first_seen_at, o.first_seen_at) as dup_first_seen_at,
       coalesce(dg.is_primary, true)                   as is_primary
from offers o
left join offer_lexical_score s on s.offer_id = o.id
left join lateral (
  -- `labels` ne filtre pas sur `enabled` : la provenance est un fait
  -- historique. `trusted` le fait : la confiance, elle, se retire.
  select array_agg(sq.label order by sq.label)             as labels,
         bool_or(sq.trust = 'anchored' and sq.enabled)     as trusted
  from search_queries sq
  where sq.id = any (o.found_by_query_ids)
) fbq on true
left join offer_duplicate_groups dg on dg.offer_id = o.id;

create view offers_shortlist as
with eligibles as (
  select o.*,
         case
           when o.department in ('13', '83', '84') then 'local'
           when o.remote_label = 'full'            then 'full remote'
         end as acces
  from offers_ranked o
  where o.red_flags = 0
    and (o.core_hits >= 1 or o.ai_hits >= 1 or o.trusted_query)
    and (o.department in ('13', '83', '84') or o.remote_label = 'full')
),
elues as (
  select e.*,
         row_number() over (
           partition by e.dup_group_id
           order by (e.rate_raw is not null) desc,
                    length(coalesce(e.description, '')) desc,
                    e.published_at desc nulls last,
                    e.first_seen_at desc,
                    e.id
         ) as rang_dans_groupe
  from eligibles e
)
select * from elues where rang_dans_groupe = 1;

comment on view offers_shortlist is
  'Offres retenues : sans signal rouge, portant React/TypeScript/Next.js, ou '
  'un signal IA, ou trouvees par une requete de confiance encore active, et '
  'soit dans les departements 13/83/84, soit en full remote. Un seul '
  'representant par groupe de doublons, elu PARMI LES OFFRES ELIGIBLES : un '
  'poste dont la meilleure ligne porte un signal rouge garde ainsi sa '
  'deuxieme ligne, au lieu de disparaitre entierement. '
  'Trier par score desc, published_at desc.';

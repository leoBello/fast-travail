-- Deux constats de la revue du correctif precedent, tous deux fondes.
--
-- 1. J'AVAIS ECARTE L'INDEX TRIGRAMME SUR UNE PREMISSE FAUSSE
--
-- La migration 20260908230000 a rendu indexable la branche `fts` du lexique,
-- et ecartait un index trigramme sur la branche `ilike` au motif que « onze
-- balayages restent bon marche ».
--
-- La revue a isole les deux branches et mesure :
--
--   branche fts   (56 termes) : Bitmap Index Scan,     37,8 ms
--   branche ilike (11 termes) : Nested Loop, 1 611 a 4 007 ms selon le cache
--
-- Autrement dit, la branche `ilike` represente deja **92 a 98 %** du temps
-- restant de `offer_lexical_score`, a 4 146 offres. Ce n'etait donc pas un
-- risque futur mais le goulot present, et « bon marche » etait faux.
--
-- L'erreur de raisonnement est identifiable : j'avais refuse la vue
-- materialisee parce qu'elle romprait la promesse de `CLAUDE.md` — regler le
-- lexique a un effet IMMEDIAT sur les offres deja collectees, le score etant
-- une vue. Cet argument est bon pour une vue materialisee. Il ne vaut RIEN
-- pour un index : un index ne differe aucun calcul, la vue reste vivante, et
-- un `update skill_lexicon` continue de se voir a la lecture suivante. J'ai
-- transporte un argument valide d'un cas a un autre ou il ne s'applique pas.
--
-- MESURE, faite dans une transaction annulee avant de decider : avec l'index,
-- la branche `ilike` passe de 1 611-4 007 ms a **406 ms**.
--
-- LIMITE A CONNAITRE : un index trigramme n'aide que pour un motif d'au moins
-- trois caracteres. Sur les onze termes `ilike` actuels, un seul est plus
-- court — `c#` — et retombe sur un balayage. Un balayage au lieu de onze.
-- Si le lexique gagnait beaucoup de termes tres courts en `ilike`, le gain
-- fondrait ; c'est le premier endroit ou regarder si la vue ralentit.
--
-- 2. `matched_terms` N'ETAIT PAS DETERMINISTE, ET NE L'A JAMAIS ETE
--
-- La revue a compare la colonne que ma preuve d'identite ne couvrait pas :
-- `array_agg(term order by weight desc)`. Sur les 3 085 offres, **1 160
-- differaient** par l'ordre entre l'ancienne formulation et la nouvelle — et
-- 30 des 70 offres shortlistees portant un terme. Jamais un ensemble
-- different, seulement un ordre.
--
-- Ce n'est pas une regression introduite par l'union : un `order by weight
-- desc` sans departage n'a jamais ete deterministe, l'union a simplement
-- change l'ordre d'arrivee des lignes. Mais la colonne est AFFICHEE par la
-- recette de consultation du depot : un tiers des offres du jour la
-- presentaient dans un ordre different de la veille, sans raison.
--
-- Corrige a la racine plutot que constate : `order by weight desc, term`.
-- L'ordre devient total, donc stable pour toujours, quelle que soit la forme
-- future de la requete. C'est mieux que l'ancien comportement comme que le
-- nouveau.

create extension if not exists pg_trgm;

-- Index d'expression : il doit porter EXACTEMENT l'expression de la branche
-- `ilike` ci-dessous, sinon le planificateur ne le reconnaitra pas.
create index if not exists offers_title_description_trgm_idx
  on offers using gin ((title || ' ' || coalesce(description, '')) gin_trgm_ops);

create or replace view offer_lexical_score as
with hits as (
  -- Branche indexable par le GIN sur description_tsv : un seul operateur.
  select o.id      as offer_id,
         l.term,
         l.weight,
         l.category
  from skill_lexicon l
  join offers o on o.description_tsv @@ plainto_tsquery('french', l.term)
  where l.enabled
    and l.match_type = 'fts'

  union all

  -- Branche indexable par le GIN trigramme ci-dessus, pour les termes d'au
  -- moins trois caracteres. Les plus courts retombent sur un balayage.
  select o.id      as offer_id,
         l.term,
         l.weight,
         l.category
  from skill_lexicon l
  join offers o
    on (o.title || ' ' || coalesce(o.description, '')) ilike '%' || l.term || '%'
  where l.enabled
    and l.match_type = 'ilike'
)
select offer_id,
       sum(weight)                                   as score,
       -- `term` en second critere : sans lui l'ordre n'est pas total, donc pas
       -- deterministe, et la colonne affichee changeait d'ordre d'un jour a
       -- l'autre sur un tiers des offres.
       array_agg(term order by weight desc, term)    as matched_terms,
       count(*) filter (where category = 'core')     as core_hits,
       count(*) filter (where category = 'ai')       as ai_hits,
       count(*) filter (where category = 'red_flag') as red_flags
from hits
group by offer_id;

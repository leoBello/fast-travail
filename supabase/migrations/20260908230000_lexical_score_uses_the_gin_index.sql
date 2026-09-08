-- La liste quotidienne mettait 3,7 s, et ce cout grandissait avec le corpus.
--
-- LE PROFIL, MESURE PLUTOT QUE SUPPOSE
--
-- `offers_shortlist` s'appuie sur `offers_ranked`, qui s'appuie sur
-- `offer_lexical_score`. C'est cette derniere qui coute :
--
--   Nested Loop, 4 146 offres x 67 termes de lexique
--   = 277 782 evaluations de `@@ plainto_tsquery` ou de `ILIKE`
--   Execution Time: 5 832 ms
--
-- Le plan montrait un `Materialize` du lexique reparcouru pour CHAQUE offre.
-- Autrement dit : pour chaque offre, on essayait les 67 termes un par un.
--
-- POURQUOI L'INDEX NE SERVAIT PAS
--
-- L'index GIN `offers_description_tsv_idx` existe depuis la premiere
-- migration. Mais la vue exprimait la correspondance par un `case
-- l.match_type when 'fts' then ... when 'ilike' then ... end` place dans la
-- condition de jointure. Un `case` qui melange deux operateurs incompatibles
-- ne peut pas etre indexe : le planificateur n'a d'autre choix que de
-- l'evaluer ligne a ligne.
--
-- Le lexique compte 56 termes en `fts` et 11 en `ilike`. Les 56 etaient donc
-- indexables et ne l'etaient pas, a cause de la forme de la requete.
--
-- LE CORRECTIF : separer les deux modes par une union
--
-- Chaque branche porte alors un seul operateur, et la branche `fts` devient
-- indexable. Le plan le confirme : `Bitmap Index Scan on
-- offers_description_tsv_idx`, 56 boucles — une par terme, au lieu de 4 146
-- boucles sur le lexique entier. La branche `ilike` reste un balayage, mais
-- 11 fois et non 67.
--
-- MESURE : 5 832 ms -> 1 781 ms, soit 3,3 fois plus rapide.
--
-- RESULTAT IDENTIQUE, ET PROUVE : jointure externe complete entre l'ancienne
-- et la nouvelle formulation sur `offer_id`, `score`, `core_hits`, `ai_hits`
-- et `red_flags` — 3 085 lignes de chaque cote, **zero divergence**.
--
-- CE QUI A ETE ECARTE, ET POURQUOI
--
-- Une vue materialisee rafraichie par le cron aurait ete plus rapide encore.
-- Elle a ete refusee : `CLAUDE.md` promet que regler le lexique a un effet
-- **immediat** sur les offres deja collectees, parce que le score est une
-- vue. Materialiser romprait cette promesse — un `update skill_lexicon` ne
-- se verrait qu'apres le prochain rafraichissement, et le proprietaire
-- reglerait a l'aveugle. Le gain ne valait pas la perte de cette propriete.
--
-- CE QUI RESTE VRAI
--
-- Le cout demeure lineaire en offres x termes du lexique, simplement avec une
-- constante bien plus petite. Si le corpus decuple encore, la question se
-- reposera — et c'est alors la branche `ilike`, non indexable telle quelle,
-- qu'il faudra regarder en premier.

create or replace view offer_lexical_score as
with hits as (
  -- Branche indexable : un seul operateur, donc le GIN sur description_tsv
  -- s'applique, une passe par terme.
  select o.id      as offer_id,
         l.term,
         l.weight,
         l.category
  from skill_lexicon l
  join offers o on o.description_tsv @@ plainto_tsquery('french', l.term)
  where l.enabled
    and l.match_type = 'fts'

  union all

  -- Branche non indexable : `ilike` avec un joker en tete ne peut pas
  -- s'appuyer sur un index B-tree, et un trigramme serait un index de plus a
  -- maintenir pour onze termes. Onze balayages restent bon marche.
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
       array_agg(term order by weight desc)          as matched_terms,
       count(*) filter (where category = 'core')     as core_hits,
       count(*) filter (where category = 'ai')       as ai_hits,
       count(*) filter (where category = 'red_flag') as red_flags
from hits
group by offer_id;

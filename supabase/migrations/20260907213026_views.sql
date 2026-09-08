create or replace function haversine_km(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) returns double precision
language sql
immutable
returns null on null input
as $fn$
  select 6371 * 2 * asin(sqrt(
    pow(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    pow(sin(radians(lon2 - lon1) / 2), 2)
  ));
$fn$;

create view offer_lexical_score as
select o.id                                            as offer_id,
       sum(l.weight)                                   as score,
       array_agg(l.term order by l.weight desc)        as matched_terms,
       count(*) filter (where l.category = 'core')     as core_hits,
       count(*) filter (where l.category = 'ai')       as ai_hits,
       count(*) filter (where l.category = 'red_flag') as red_flags
from offers o
join skill_lexicon l
  on l.enabled
 and case l.match_type
       when 'fts'   then o.description_tsv @@ plainto_tsquery('french', l.term)
       when 'ilike' then (o.title || ' ' || coalesce(o.description, '')) ilike '%' || l.term || '%'
     end
group by o.id;

create view offers_ranked as
select o.*,
       coalesce(s.score, 0)                       as score,
       coalesce(s.matched_terms, '{}'::text[])    as matched_terms,
       coalesce(s.core_hits, 0)                   as core_hits,
       coalesce(s.ai_hits, 0)                     as ai_hits,
       coalesce(s.red_flags, 0)                   as red_flags,
       haversine_km(43.2965, 5.3698, o.latitude, o.longitude) as distance_marseille_km
from offers o
left join offer_lexical_score s on s.offer_id = o.id;

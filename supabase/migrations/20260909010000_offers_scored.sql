-- Le classement final. L'IA a produit fit_score (fige) ; ici on applique les
-- PREFERENCES, qui sont des lignes de scoring_weights. Un UPDATE sur cette
-- table reclasse tout le corpus sans un seul appel paye : c'est la propriete
-- que la phase 2 devait absolument preserver.
create or replace view offers_scored as
with w as materialized (
  select
    max(value) filter (where key = 'freelance_bonus')        as freelance_bonus,
    max(value) filter (where key = 'cdi_bonus')              as cdi_bonus,
    max(value) filter (where key = 'remote_full_bonus')      as remote_full_bonus,
    max(value) filter (where key = 'remote_hybrid_bonus')    as remote_hybrid_bonus,
    max(value) filter (where key = 'tjm_floor')              as tjm_floor,
    max(value) filter (where key = 'tjm_bonus_per_100')      as tjm_bonus_per_100,
    max(value) filter (where key = 'tjm_bonus_cap')          as tjm_bonus_cap,
    max(value) filter (where key = 'duration_long_months')   as duration_long_months,
    max(value) filter (where key = 'duration_long_bonus')    as duration_long_bonus,
    max(value) filter (where key = 'agentic_bonus')          as agentic_bonus,
    max(value) filter (where key = 'unwanted_tech_malus')    as unwanted_tech_malus,
    max(value) filter (where key = 'freshness_grace_days')   as freshness_grace_days,
    max(value) filter (where key = 'freshness_decay_per_day') as freshness_decay_per_day,
    max(value) filter (where key = 'freshness_malus_cap')    as freshness_malus_cap
  from scoring_weights
),
base as materialized (
  select
    s.offer_id,
    s.fit_score,
    s.verdict,
    s.extraction,
    s.truncated_input,
    s.scored_at,
    (s.extraction ->> 'engagement')                   as engagement,
    (s.extraction ->> 'work_mode')                    as work_mode,
    (s.extraction ->> 'seniority')                    as seniority,
    (s.extraction ->> 'domain')                       as domain,
    (s.extraction ->> 'confidence')                   as confidence,
    ((s.extraction ->> 'agentic_ai')::boolean)        as agentic_ai,
    ((s.extraction ->> 'duration_months')::numeric)   as duration_months,
    (s.extraction ->> 'compensation_kind')            as compensation_kind,
    ((s.extraction ->> 'compensation_min')::numeric)  as compensation_min,
    ((s.extraction ->> 'compensation_max')::numeric)  as compensation_max,
    coalesce(jsonb_array_length(s.extraction -> 'unwanted_tech'), 0) as unwanted_count,
    -- L'age se mesure sur la publication, et a defaut sur la premiere vue.
    extract(day from now() - coalesce(o.published_at, o.first_seen_at))::numeric as age_days
  from offer_ai_scores s
  join offers o on o.id = s.offer_id
  where s.fit_score is not null
)
select
  b.offer_id                       as id,
  o.source,
  o.title,
  o.company_name,
  o.city,
  o.department,
  o.url,
  o.published_at,
  b.fit_score,
  b.verdict,
  b.engagement,
  b.work_mode,
  b.seniority,
  b.domain,
  b.confidence,
  b.agentic_ai,
  b.duration_months,
  b.compensation_kind,
  b.compensation_min,
  b.compensation_max,
  b.unwanted_count,
  b.truncated_input,
  b.age_days,
  b.extraction,
  -- Le detail, pour que le classement soit explicable et non un nombre opaque.
  (case b.engagement
     when 'freelance' then w.freelance_bonus
     when 'cdi'       then w.cdi_bonus
     else 0 end)                                                        as bonus_engagement,
  (case b.work_mode
     when 'full_remote' then w.remote_full_bonus
     when 'hybride'     then w.remote_hybrid_bonus
     else 0 end)                                                        as bonus_remote,
  least(
    w.tjm_bonus_cap,
    greatest(0, coalesce(b.compensation_max, b.compensation_min, 0) - w.tjm_floor)
      / 100 * w.tjm_bonus_per_100
  )                                                                     as bonus_remuneration,
  (case when coalesce(b.duration_months, 0) >= w.duration_long_months
        then w.duration_long_bonus else 0 end)                          as bonus_duree,
  (case when b.agentic_ai then w.agentic_bonus else 0 end)              as bonus_agentique,
  (b.unwanted_count * w.unwanted_tech_malus)                            as malus_technos,
  least(
    w.freshness_malus_cap,
    greatest(0, b.age_days - w.freshness_grace_days) * w.freshness_decay_per_day
  )                                                                     as malus_fraicheur,
  greatest(0, least(100,
    b.fit_score
    + (case b.engagement when 'freelance' then w.freelance_bonus when 'cdi' then w.cdi_bonus else 0 end)
    + (case b.work_mode when 'full_remote' then w.remote_full_bonus when 'hybride' then w.remote_hybrid_bonus else 0 end)
    + least(w.tjm_bonus_cap,
        greatest(0, coalesce(b.compensation_max, b.compensation_min, 0) - w.tjm_floor)
          / 100 * w.tjm_bonus_per_100)
    + (case when coalesce(b.duration_months, 0) >= w.duration_long_months then w.duration_long_bonus else 0 end)
    + (case when b.agentic_ai then w.agentic_bonus else 0 end)
    - (b.unwanted_count * w.unwanted_tech_malus)
    - least(w.freshness_malus_cap,
        greatest(0, b.age_days - w.freshness_grace_days) * w.freshness_decay_per_day)
  ))::numeric(5,1)                                                      as final_score
from base b
join offers o on o.id = b.offer_id
cross join w;

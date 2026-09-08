-- Fuite decouverte en revue : LEAST/GREATEST ignorent les NULL en PostgreSQL.
-- Si une ligne de scoring_weights venait a manquer, max(value) filter (...)
-- rendait NULL pour ce poids ; le case correspondant rendait NULL ; la somme
-- entiere du final_score devenait NULL ; et least(100, NULL) rendait 100 --
-- pas d'erreur, pas de NULL visible, une offre projetee en tete de classement
-- a un score qui a l'air parfaitement legitime, sans aucun signal derriere.
--
-- Le correctif enveloppe chaque poids d'un coalesce dans la CTE `w`. Comme
-- les deux copies du calcul (le detail expose bonus_* / malus_*, et la somme
-- de final_score) lisent toutes deux w.<poids> -- jamais leurs propres
-- alias, une vue ne pouvant pas les reutiliser -- le coalesce n'a besoin
-- d'exister qu'une fois ici pour proteger les deux.
--
-- Valeurs de repli :
--   * bonus (freelance_bonus, cdi_bonus, remote_full_bonus,
--     remote_hybrid_bonus, tjm_bonus_per_100, tjm_bonus_cap,
--     duration_long_bonus, agentic_bonus) : 0. Pas de ligne, pas de bonus.
--   * malus (unwanted_tech_malus, freshness_decay_per_day,
--     freshness_malus_cap) : 0. Un malus dont le reglage a disparu ne doit
--     pas s'appliquer au hasard.
--   * les trois seuils sont differents : 0 n'y est pas neutre.
--     - tjm_floor -> 400 (la valeur semee). A 0, greatest(0, remuneration - 0)
--       accorderait le bonus de remuneration maximal a toute offre payee,
--       meme une offre au SMIC ; reproduire le seuil semee est le seul repli
--       qui ne fausse pas le bonus.
--     - duration_long_months -> 6 (la valeur semee). A 0,
--       coalesce(duration_months, 0) >= 0 est vrai pour TOUTE offre, y
--       compris celles sans duree connue : le bonus de mission longue
--       s'accorderait a tout le corpus au lieu des seules missions longues.
--     - freshness_grace_days -> 7 (la valeur semee). A 0, la decote
--       demarrerait des le premier jour pour toutes les offres au lieu de
--       laisser une periode de grace ; reproduire la grace semee est le seul
--       repli qui ne decote pas une offre du jour meme.
create or replace view offers_scored as
with w as materialized (
  select
    coalesce(max(value) filter (where key = 'freelance_bonus'), 0)         as freelance_bonus,
    coalesce(max(value) filter (where key = 'cdi_bonus'), 0)               as cdi_bonus,
    coalesce(max(value) filter (where key = 'remote_full_bonus'), 0)       as remote_full_bonus,
    coalesce(max(value) filter (where key = 'remote_hybrid_bonus'), 0)     as remote_hybrid_bonus,
    coalesce(max(value) filter (where key = 'tjm_floor'), 400)             as tjm_floor,
    coalesce(max(value) filter (where key = 'tjm_bonus_per_100'), 0)       as tjm_bonus_per_100,
    coalesce(max(value) filter (where key = 'tjm_bonus_cap'), 0)           as tjm_bonus_cap,
    coalesce(max(value) filter (where key = 'duration_long_months'), 6)    as duration_long_months,
    coalesce(max(value) filter (where key = 'duration_long_bonus'), 0)     as duration_long_bonus,
    coalesce(max(value) filter (where key = 'agentic_bonus'), 0)           as agentic_bonus,
    coalesce(max(value) filter (where key = 'unwanted_tech_malus'), 0)     as unwanted_tech_malus,
    coalesce(max(value) filter (where key = 'freshness_grace_days'), 7)    as freshness_grace_days,
    coalesce(max(value) filter (where key = 'freshness_decay_per_day'), 0) as freshness_decay_per_day,
    coalesce(max(value) filter (where key = 'freshness_malus_cap'), 0)     as freshness_malus_cap
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

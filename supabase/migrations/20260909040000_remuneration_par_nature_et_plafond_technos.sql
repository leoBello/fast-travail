-- Deux defauts de la MEME projection, corriges ensemble parce qu'ils sont la
-- meme erreur : une expression appliquee sans regarder ce qu'elle mesure.
--
--
-- DEFAUT 1 -- bonus_remuneration appliquait la formule de TJM aux SALAIRES
--
-- L'expression precedente lisait `coalesce(compensation_max, compensation_min)`
-- sans jamais regarder `compensation_kind`, puis divisait par 100 et
-- multipliait par `tjm_bonus_per_100`. Un salaire annuel de 35 000 EUR donnait
-- donc (35000 - 400) / 100 * 3 = 1 038 points, rabattus au plafond de 12.
--
-- Mesure du 2026-09-08 sur les 1 269 offres jugees, AVANT correctif :
--   compensation_kind = 'salaire' : n = 616, bonus moyen 11,29, au plafond 578
--   compensation_kind = 'tjm'     : n =  85, bonus moyen  3,61, au plafond   5
--
-- L'axe cense recompenser un bon TJM freelance recompensait donc
-- systematiquement le CDI salarie -- l'inverse exact de la preference declaree
-- (freelance_bonus 12 contre cdi_bonus 2). Une mission a 550 EUR/jour recevait
-- +4,5, un CDI a 35 k EUR recevait +12. La tete du classement en dependait :
-- un « Developpeur Full Stack » CDI a 35 k EUR, fit_score 68, atteignait 100,0
-- a egalite avec un freelance a fit_score 90.
--
-- CE QUI EST RETENU : une echelle propre au salaire, pas l'absence de bonus.
-- Ne rien accorder aurait mis un CDI a 75 k EUR et un CDI a 30 k EUR au meme
-- rang, ce qui jette un signal reel. L'echelle est calibree sur la conversion
-- usuelle TJM ~ (salaire annuel brut x 2) / 218 jours factures :
--   * salaire_floor = 40000. La conversion place tjm_floor = 400 a environ
--     43 600 EUR ; 40 000 est le meme plancher, arrondi vers le bas. Il a par
--     ailleurs une vertu mesuree : sur les 599 valeurs de salaire relevees,
--     23 sont sous 1 000 et 79 entre 1 000 et 20 000 -- soit 102 (17 %) qui ne
--     sont PAS des montants annuels (taux horaires et mensuels melanges, voir
--     la reserve d'amont plus bas). Toutes tombent sous le plancher et
--     recoivent 0, au lieu d'un bonus calcule sur une unite fausse.
--   * salaire_bonus_per_10k = 3. Sous la meme conversion, 100 EUR de TJM
--     valent ~10 900 EUR de salaire annuel : 3 points par tranche de 10 k EUR
--     est donc l'exact equivalent de tjm_bonus_per_100 = 3, et non une
--     seconde echelle plus genereuse.
--   * salaire_bonus_cap = 12, comme tjm_bonus_cap. Le plafond est atteint a
--     80 k EUR cote salaire et a 800 EUR/jour cote TJM -- deux valeurs que la
--     meme conversion fait correspondre. Un poids distinct plutot qu'un
--     partage de `tjm_bonus_cap` : les deux echelles doivent pouvoir bouger
--     separement, c'est tout l'interet de les avoir separees.
--
-- RESERVE D'AMONT, CONSIGNEE ET NON CODEE : les valeurs `salaire` extraites
-- vont de 4 a 150 000. Des taux horaires y sont melanges a des salaires
-- annuels, et le schema de sortie ne porte AUCUNE unite. Le plancher neutralise
-- la contamination sans la corriger. La corriger imposerait un champ d'unite
-- dans le schema, donc un changement de PROMPT_VERSION, donc le rachat des
-- 1 269 jugements deja payes : hors perimetre.
--
--
-- DEFAUT 2 (P15) -- le malus des technos non desirees n'etait pas plafonne
--
-- La vue ecrivait `b.unwanted_count * w.unwanted_tech_malus` sans `least`,
-- alors que tous les autres axes bornes le sont. Mesure du 2026-09-08 : 122
-- offres penalisees, 15 a deux termes ou plus, malus maximal observe 45 (trois
-- termes), et un « Developpeur Full Stack » a fit_score 80 tombant a 38,0.
--
-- C'est en contradiction directe avec une decision structurante du ROADMAP :
-- « java et angular en contexte, pas en signal rouge -- un rouge ecarterait
-- les offres React + Java Spring, un vrai marche ». Un malus non plafonne est
-- un signal rouge deguise : a trois termes il retire davantage que le plus
-- gros bonus du bareme (remote_full_bonus = 15).
--
-- unwanted_tech_malus_cap = 15, la valeur d'UN seul terme : la premiere techno
-- non desiree coute son prix plein, les suivantes ne font plus que confirmer.
-- L'offre descend, elle n'est jamais eliminee -- ce que la description du poids
-- `unwanted_tech_malus` promettait deja.
--
-- Ce qui n'est PAS touche : `profile_skills`. Reclasser `java` repaierait les
-- 1 269 jugements pour un gain mesure d'UNE seule offre repassant au-dessus
-- de 50.
--
--
-- COALESCE SUR LES QUATRE NOUVEAUX POIDS
--
-- Meme raison qu'en 20260909020000 : LEAST et GREATEST ignorent les NULL, donc
-- un poids manquant rendait NULL, puis une somme NULL, puis least(100, NULL) =
-- 100 -- une offre en tete du classement sans le moindre signal. Repli retenu :
--   * salaire_floor -> 40000 (la valeur semee). A 0, greatest(0, salaire - 0)
--     accorderait le bonus maximal a toute offre payee, y compris un taux
--     horaire de 4 EUR.
--   * salaire_bonus_per_10k -> 0 et salaire_bonus_cap -> 0 : pas de reglage,
--     pas de bonus. Un cap a 0 annule l'axe, ce qui est la direction sure.
--   * unwanted_tech_malus_cap -> 0 : identique a freshness_malus_cap, deja
--     replie ainsi. Un malus dont le plafond a disparu ne s'applique pas au
--     hasard.

insert into scoring_weights (key, value, description) values
  ('salaire_floor',           40000, 'Salaire annuel brut en dessous duquel aucun bonus n est accorde'),
  ('salaire_bonus_per_10k',       3, 'Points par tranche de 10 000 EUR de salaire annuel au-dessus du plancher'),
  ('salaire_bonus_cap',          12, 'Plafond du bonus de remuneration salariale'),
  ('unwanted_tech_malus_cap',    15, 'Plafond du malus de technos non desirees. Descend, n elimine jamais')
on conflict (key) do nothing;

create or replace view offers_scored as
with w as materialized (
  select
    coalesce(max(value) filter (where key = 'freelance_bonus'), 0)          as freelance_bonus,
    coalesce(max(value) filter (where key = 'cdi_bonus'), 0)                as cdi_bonus,
    coalesce(max(value) filter (where key = 'remote_full_bonus'), 0)        as remote_full_bonus,
    coalesce(max(value) filter (where key = 'remote_hybrid_bonus'), 0)      as remote_hybrid_bonus,
    coalesce(max(value) filter (where key = 'tjm_floor'), 400)              as tjm_floor,
    coalesce(max(value) filter (where key = 'tjm_bonus_per_100'), 0)        as tjm_bonus_per_100,
    coalesce(max(value) filter (where key = 'tjm_bonus_cap'), 0)            as tjm_bonus_cap,
    coalesce(max(value) filter (where key = 'salaire_floor'), 40000)        as salaire_floor,
    coalesce(max(value) filter (where key = 'salaire_bonus_per_10k'), 0)    as salaire_bonus_per_10k,
    coalesce(max(value) filter (where key = 'salaire_bonus_cap'), 0)        as salaire_bonus_cap,
    coalesce(max(value) filter (where key = 'duration_long_months'), 6)     as duration_long_months,
    coalesce(max(value) filter (where key = 'duration_long_bonus'), 0)      as duration_long_bonus,
    coalesce(max(value) filter (where key = 'agentic_bonus'), 0)            as agentic_bonus,
    coalesce(max(value) filter (where key = 'unwanted_tech_malus'), 0)      as unwanted_tech_malus,
    coalesce(max(value) filter (where key = 'unwanted_tech_malus_cap'), 0)  as unwanted_tech_malus_cap,
    coalesce(max(value) filter (where key = 'freshness_grace_days'), 7)     as freshness_grace_days,
    coalesce(max(value) filter (where key = 'freshness_decay_per_day'), 0)  as freshness_decay_per_day,
    coalesce(max(value) filter (where key = 'freshness_malus_cap'), 0)      as freshness_malus_cap
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
  -- Une echelle PAR NATURE de remuneration. `compensation_kind` ne vaut que
  -- 'tjm', 'salaire' ou null (enum du schema de sortie) : le `else 0` couvre
  -- le null, et une nature inconnue n'inventerait pas un bonus.
  (case b.compensation_kind
     when 'tjm' then least(
       w.tjm_bonus_cap,
       greatest(0, coalesce(b.compensation_max, b.compensation_min, 0) - w.tjm_floor)
         / 100 * w.tjm_bonus_per_100)
     when 'salaire' then least(
       w.salaire_bonus_cap,
       greatest(0, coalesce(b.compensation_max, b.compensation_min, 0) - w.salaire_floor)
         / 10000 * w.salaire_bonus_per_10k)
     else 0 end)                                                        as bonus_remuneration,
  (case when coalesce(b.duration_months, 0) >= w.duration_long_months
        then w.duration_long_bonus else 0 end)                          as bonus_duree,
  (case when b.agentic_ai then w.agentic_bonus else 0 end)              as bonus_agentique,
  least(w.unwanted_tech_malus_cap, b.unwanted_count * w.unwanted_tech_malus) as malus_technos,
  least(
    w.freshness_malus_cap,
    greatest(0, b.age_days - w.freshness_grace_days) * w.freshness_decay_per_day
  )                                                                     as malus_fraicheur,
  greatest(0, least(100,
    b.fit_score
    + (case b.engagement when 'freelance' then w.freelance_bonus when 'cdi' then w.cdi_bonus else 0 end)
    + (case b.work_mode when 'full_remote' then w.remote_full_bonus when 'hybride' then w.remote_hybrid_bonus else 0 end)
    + (case b.compensation_kind
         when 'tjm' then least(w.tjm_bonus_cap,
           greatest(0, coalesce(b.compensation_max, b.compensation_min, 0) - w.tjm_floor)
             / 100 * w.tjm_bonus_per_100)
         when 'salaire' then least(w.salaire_bonus_cap,
           greatest(0, coalesce(b.compensation_max, b.compensation_min, 0) - w.salaire_floor)
             / 10000 * w.salaire_bonus_per_10k)
         else 0 end)
    + (case when coalesce(b.duration_months, 0) >= w.duration_long_months then w.duration_long_bonus else 0 end)
    + (case when b.agentic_ai then w.agentic_bonus else 0 end)
    - least(w.unwanted_tech_malus_cap, b.unwanted_count * w.unwanted_tech_malus)
    - least(w.freshness_malus_cap,
        greatest(0, b.age_days - w.freshness_grace_days) * w.freshness_decay_per_day)
  ))::numeric(5,1)                                                      as final_score
from base b
join offers o on o.id = b.offer_id
cross join w;

-- Le jugement de l'IA, fige au moment de l'appel. prompt_version et
-- profile_version sont ce qui rend un re-scoring CIBLE : quand le prompt ou le
-- CV change, on ne repaie que les offres dont la version differe.
create table if not exists offer_ai_scores (
  offer_id         uuid primary key references offers (id) on delete cascade,
  fit_score        integer     check (fit_score between 0 and 100),
  verdict          text,
  extraction       jsonb,
  truncated_input  boolean     not null default false,
  model            text        not null,
  prompt_version   text        not null,
  profile_version  text        not null,
  input_tokens     integer     not null default 0,
  output_tokens    integer     not null default 0,
  cache_read_tokens integer    not null default 0,
  error            text,
  scored_at        timestamptz not null default now()
);

alter table offer_ai_scores enable row level security;

create index if not exists offer_ai_scores_versions
  on offer_ai_scores (prompt_version, profile_version);

-- Les preferences. Elles ne partent JAMAIS dans l'appel payant : ce que Leo
-- veut n'est pas un fait sur l'offre. Un UPDATE ici reclasse tout le passe
-- sans depenser un centime.
create table if not exists scoring_weights (
  key         text primary key,
  value       numeric not null,
  description text    not null
);

alter table scoring_weights enable row level security;

insert into scoring_weights (key, value, description) values
  ('freelance_bonus',        12, 'Freelance prioritaire sur le CDI'),
  ('cdi_bonus',               2, 'Le CDI reste acceptable, sans priorite'),
  ('remote_full_bonus',      15, 'Full teletravail : le critere le plus valorise'),
  ('remote_hybrid_bonus',     4, 'Hybride : acceptable, nettement moins bien'),
  ('tjm_floor',             400, 'TJM en dessous duquel aucun bonus n est accorde'),
  ('tjm_bonus_per_100',       3, 'Points par tranche de 100 EUR de TJM au-dessus du plancher'),
  ('tjm_bonus_cap',          12, 'Plafond du bonus de remuneration'),
  ('duration_long_months',    6, 'Duree a partir de laquelle une mission est dite longue'),
  ('duration_long_bonus',      8, 'Bonus de mission longue'),
  ('agentic_bonus',          10, 'IA, LLM, agents : differenciateur assume du profil'),
  ('unwanted_tech_malus',    15, 'Malus par techno non desiree. Descend, n elimine jamais'),
  ('freshness_grace_days',    7, 'Jours de score plein avant toute decote'),
  ('freshness_decay_per_day', 1, 'Points retires par jour au-dela de la periode de grace'),
  ('freshness_malus_cap',    25, 'Plafond de la decote de fraicheur')
on conflict (key) do nothing;

-- Les offres a scorer. Le perimetre est GEOGRAPHIQUE, pas lexical : le
-- pre-filtre du lexique ecartait 1 182 offres a portee que personne n'avait
-- lues, et les faire lire coute environ 6 EUR par mois (mesure 2026-09-08).
-- Le lexique reste expose comme signal de tri, il n'est plus une porte.
create or replace view offers_ai_candidates as
select
  o.id,
  o.source,
  o.title,
  o.description,
  o.company_name,
  o.city,
  o.department,
  o.remote_label,
  o.contract_type,
  o.contract_label,
  o.salary_raw,
  o.rate_raw,
  o.duration_raw,
  o.experience_raw,
  o.published_at,
  o.first_seen_at,
  -- Adzuna tronque TOUTE description a 500 caracteres, sans exception
  -- (mesure : min 500, mediane 500, max 500 sur 50 offres). Le drapeau part
  -- dans le prompt, qui interdit alors de conclure au rejet.
  (o.source = 'adzuna' and length(coalesce(o.description, '')) >= 500) as truncated_input,
  (select array_agg(sq.label order by sq.label)
     from search_queries sq
    where sq.id = any (o.found_by_query_ids)) as found_by_labels,
  s.prompt_version  as scored_prompt_version,
  s.profile_version as scored_profile_version
from offers o
left join offer_ai_scores s on s.offer_id = o.id
where o.department in ('13', '83', '84') or o.remote_label = 'full';

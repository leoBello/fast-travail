create table if not exists offer_applications (
  offer_id          uuid primary key references offers(id) on delete cascade,
  status            text not null default 'a_traiter',
  outcome           text,
  opened_at         timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  applied_at        timestamptz,
  last_followup_at  timestamptz,
  interview_at      timestamptz,
  notes             text,
  created_at        timestamptz not null default now(),
  -- PAS de colonne `updated_at`. Le depot n'a aucun declencheur et aucune
  -- convention de ce nom : la colonne serait figee a sa valeur par defaut, et
  -- afficherait une date de derniere modification FAUSSE que rien ne
  -- signalerait. `status_changed_at` porte deja la seule date de modification
  -- qui compte. Ne pas la rajouter « pour faire propre ».

  constraint offer_applications_status_connu check (
    status in ('a_traiter','retenue','postulee','relancee','entretien','terminee','ecartee')
  ),
  constraint offer_applications_outcome_connu check (
    outcome is null or outcome in ('offre_recue','refus','sans_reponse','desistement')
  ),
  -- Une issue ne qualifie qu'une candidature terminee. Sans cette garde, une
  -- offre « retenue » pourrait porter « refus » et le tableau de suivi
  -- afficherait une contradiction que rien ne signalerait.
  constraint offer_applications_issue_seulement_si_terminee check (
    outcome is null or status = 'terminee'
  ),
  -- On ne peut pas etre relance ni en entretien sans avoir postule. `ecartee`
  -- est volontairement HORS de cette liste : c'est une sortie possible a tout
  -- moment, y compris avant d'avoir postule.
  constraint offer_applications_date_envoi_coherente check (
    status not in ('postulee','relancee','entretien','terminee') or applied_at is not null
  )
);

alter table offer_applications enable row level security;

create index if not exists offer_applications_status_idx
  on offer_applications (status);
create index if not exists offer_applications_applied_at_idx
  on offer_applications (applied_at) where applied_at is not null;

create or replace view offer_display_groups as
select
  o.id as offer_id,
  coalesce(
    nullif(regexp_replace(lower(coalesce(o.company_name, '')), '[^a-z0-9]', '', 'g'), '')
      || '|' || regexp_replace(lower(o.title), '[^a-z0-9]', '', 'g'),
    o.id::text
  ) as display_key
from offers o;

-- Le `coalesce` exterieur n'est pas decoratif. Quand `company_name` est nul --
-- et il l'est sur une part reelle du corpus -- `nullif` rend NULL, la
-- concatenation rend NULL, et on retombe sur l'`id` : l'offre ne se groupe
-- avec personne. C'est le comportement voulu. Deux offres sans employeur
-- portant le meme intitule generique (« Developpeur Full Stack (H/F) ») ne
-- sont pas la meme mission, et les fusionner serait exactement la faute que
-- P14 decrit.

create or replace view offer_application_state as
select distinct on (g.offer_id)
  g.offer_id,
  a.offer_id as application_offer_id,
  a.status, a.outcome, a.opened_at, a.status_changed_at,
  a.applied_at, a.last_followup_at, a.interview_at, a.notes,
  (a.offer_id <> g.offer_id) as heritee
from offer_display_groups g
join offer_display_groups pair on pair.display_key = g.display_key
join offer_applications a on a.offer_id = pair.offer_id
order by g.offer_id, a.status_changed_at desc, a.offer_id;

-- `heritee` dit que l'etat vient d'une autre annonce du meme groupe. La
-- colonne existe pour que l'interface puisse le montrer plutot que de faire
-- croire a une action directe.

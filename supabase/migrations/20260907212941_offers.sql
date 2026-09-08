create table offers (
  id                  uuid primary key default gen_random_uuid(),
  source              text not null,
  external_id         text not null,
  url                 text,
  title               text not null,
  description         text,
  company_name        text,
  contract_type       text,
  contract_label      text,
  city                text,
  postal_code         text,
  commune_insee       text,
  department          text,
  latitude            double precision,
  longitude           double precision,
  is_remote           boolean,
  remote_label        text,
  salary_raw          text,
  rate_raw            text,
  duration_raw        text,
  start_date_raw      text,
  experience_raw      text,
  published_at        timestamptz,
  search_origin_insee text,
  search_radius_km    int,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  seen_count          int not null default 1,
  raw                 jsonb not null,
  description_tsv     tsvector generated always as (
                        to_tsvector('french', coalesce(title, '') || ' ' || coalesce(description, ''))
                      ) stored,
  constraint offers_source_external_id_key unique (source, external_id)
);

create index offers_description_tsv_idx on offers using gin (description_tsv);
create index offers_published_at_idx     on offers (published_at desc nulls last);
create index offers_source_idx           on offers (source);
create index offers_last_seen_at_idx     on offers (last_seen_at desc);

alter table offers enable row level security;
comment on table offers is 'Offres collectées, une ligne par offre unique par source. Aucune policy RLS : seule la service_role accède.';

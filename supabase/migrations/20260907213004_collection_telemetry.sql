create table search_queries (
  id                   serial primary key,
  source               text not null default 'france_travail',
  label                text not null unique,
  keywords             text,
  commune_insee        text,
  radius_km            int,
  extra_params         jsonb not null default '{}'::jsonb,
  published_since_days int not null default 3,
  priority             int not null default 100,
  enabled              boolean not null default true
);

create table collection_runs (
  id             uuid primary key default gen_random_uuid(),
  source         text not null,
  trigger        text not null check (trigger in ('cron', 'manual')),
  mode           text not null check (mode in ('backfill', 'delta')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running'
                 check (status in ('running', 'success', 'partial', 'failed')),
  offers_new     int not null default 0,
  offers_updated int not null default 0,
  error          text
);

create table collection_query_results (
  id              bigserial primary key,
  run_id          uuid not null references collection_runs(id) on delete cascade,
  query_id        int references search_queries(id),
  unit_label      text,
  http_status     int,
  total_available int,
  fetched         int,
  new_offers      int,
  updated_offers  int,
  truncated       boolean,
  duration_ms     int,
  error           text
);

create index collection_query_results_run_id_idx on collection_query_results (run_id);
create index collection_runs_started_at_idx      on collection_runs (started_at desc);

alter table search_queries            enable row level security;
alter table collection_runs           enable row level security;
alter table collection_query_results  enable row level security;

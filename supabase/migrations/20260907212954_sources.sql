create table sources (
  key               text primary key,
  kind              text not null check (kind in ('api', 'scrape')),
  base_url          text,
  sitemap_url       text,
  enabled           boolean not null default true,
  min_delay_ms      int not null default 3000,
  max_pages_per_run int not null default 40,
  user_agent        text,
  robots_checked_at timestamptz,
  robots_allows     boolean,
  last_run_at       timestamptz,
  last_status       text
);

alter table sources enable row level security;
comment on table sources is 'Etat et reglages de politesse par source. Ralentir une source est un UPDATE, pas un deploiement.';

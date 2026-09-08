create table skill_lexicon (
  id         serial primary key,
  term       text not null unique,
  weight     int  not null,
  category   text not null check (category in ('core', 'ai', 'strong', 'context', 'red_flag')),
  match_type text not null default 'fts' check (match_type in ('fts', 'ilike')),
  enabled    boolean not null default true
);

alter table skill_lexicon enable row level security;
comment on table skill_lexicon is 'CV mine en termes ponderes. Modifier un poids recalcule tous les scores via la vue offer_lexical_score.';

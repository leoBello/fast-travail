-- Sources API. Les scrapers seront ajoutés par le plan B.
insert into sources (key, kind, base_url, enabled, user_agent) values
  ('france_travail', 'api', 'https://api.francetravail.io', true, 'fast-travail/0.1 (veille personnelle)'),
  ('adzuna',         'api', 'https://api.adzuna.com',       true, 'fast-travail/0.1 (veille personnelle)')
on conflict (key) do nothing;

-- Matrice France Travail : passe locale Marseille rayon 40 km
insert into search_queries (source, label, keywords, commune_insee, radius_km, published_since_days, priority) values
  ('france_travail', 'ft:local:react',        'React',                  '13055', 40, 3, 10),
  ('france_travail', 'ft:local:typescript',   'TypeScript',             '13055', 40, 3, 10),
  ('france_travail', 'ft:local:nextjs',       'Next.js',                '13055', 40, 3, 10),
  ('france_travail', 'ft:local:frontend',     'front-end',              '13055', 40, 3, 20),
  ('france_travail', 'ft:local:dev-web',      'développeur web',        '13055', 40, 3, 20),
  ('france_travail', 'ft:local:dev-js',       'développeur JavaScript', '13055', 40, 3, 20),
  ('france_travail', 'ft:local:fullstack',    'full stack',             '13055', 40, 3, 20),
  ('france_travail', 'ft:local:lead',         'lead développeur',       '13055', 40, 3, 30),
  ('france_travail', 'ft:local:techlead',     'tech lead front',        '13055', 40, 3, 30),
  ('france_travail', 'ft:local:ingenieur',    'ingénieur d''études',    '13055', 40, 3, 30),
  ('france_travail', 'ft:local:consultant',   'consultant développeur', '13055', 40, 3, 30),
  ('france_travail', 'ft:local:supabase',     'Supabase',               '13055', 40, 3, 40)
on conflict (label) do nothing;

-- Matrice France Travail : passe full-remote nationale (pas de commune)
insert into search_queries (source, label, keywords, commune_insee, radius_km, published_since_days, priority) values
  ('france_travail', 'ft:remote:react',       'React',                null, null, 3, 50),
  ('france_travail', 'ft:remote:typescript',  'TypeScript',           null, null, 3, 50),
  ('france_travail', 'ft:remote:nextjs',      'Next.js',              null, null, 3, 50),
  ('france_travail', 'ft:remote:frontend',    'développeur front-end',null, null, 3, 50)
on conflict (label) do nothing;

-- Matrice France Travail : passe IA / LLM nationale
insert into search_queries (source, label, keywords, commune_insee, radius_km, published_since_days, priority) values
  ('france_travail', 'ft:ia:llm',             'LLM',              null, null, 3, 60),
  ('france_travail', 'ft:ia:generative',      'IA générative',    null, null, 3, 60),
  ('france_travail', 'ft:ia:agent',           'agent IA',         null, null, 3, 60)
on conflict (label) do nothing;

-- Lexique : noyau (+3)
insert into skill_lexicon (term, weight, category, match_type) values
  ('react', 3, 'core', 'fts'),
  ('typescript', 3, 'core', 'fts'),
  ('next.js', 3, 'core', 'ilike'),
  ('nextjs', 3, 'core', 'fts')
on conflict (term) do nothing;

-- Lexique : IA, différenciateur rare (+3)
insert into skill_lexicon (term, weight, category, match_type) values
  ('llm', 3, 'ai', 'fts'),
  ('mcp', 3, 'ai', 'fts'),
  ('agentique', 3, 'ai', 'fts'),
  ('prompt', 3, 'ai', 'fts'),
  ('ia générative', 3, 'ai', 'fts'),
  ('claude', 3, 'ai', 'fts'),
  ('openai', 3, 'ai', 'fts'),
  ('copilot', 3, 'ai', 'fts'),
  ('cursor', 3, 'ai', 'fts'),
  ('rag', 3, 'ai', 'fts')
on conflict (term) do nothing;

-- Lexique : compétences fortes (+2)
insert into skill_lexicon (term, weight, category, match_type) values
  ('javascript', 2, 'strong', 'fts'),
  ('node.js', 2, 'strong', 'ilike'),
  ('angular', 2, 'strong', 'fts'),
  ('postgresql', 2, 'strong', 'fts'),
  ('supabase', 2, 'strong', 'fts'),
  ('firebase', 2, 'strong', 'fts'),
  ('api rest', 2, 'strong', 'fts'),
  ('oauth', 2, 'strong', 'fts'),
  ('sso', 2, 'strong', 'fts'),
  ('jest', 2, 'strong', 'fts'),
  ('react testing library', 2, 'strong', 'fts'),
  ('tdd', 2, 'strong', 'fts'),
  ('tests unitaires', 2, 'strong', 'fts'),
  ('ci/cd', 2, 'strong', 'ilike'),
  ('gitlab', 2, 'strong', 'fts'),
  ('microservices', 2, 'strong', 'fts'),
  ('event-driven', 2, 'strong', 'ilike'),
  ('performance', 2, 'strong', 'fts'),
  ('scalabilité', 2, 'strong', 'fts'),
  ('google cloud functions', 2, 'strong', 'fts')
on conflict (term) do nothing;

-- Lexique : contexte et bonus (+1)
insert into skill_lexicon (term, weight, category, match_type) values
  ('agile', 1, 'context', 'fts'),
  ('scrum', 1, 'context', 'fts'),
  ('safe', 1, 'context', 'fts'),
  ('pi planning', 1, 'context', 'fts'),
  ('revue de code', 1, 'context', 'fts'),
  ('responsive', 1, 'context', 'fts'),
  ('html5', 1, 'context', 'fts'),
  ('css3', 1, 'context', 'fts'),
  ('es6', 1, 'context', 'fts'),
  ('python', 1, 'context', 'fts'),
  ('anglais', 1, 'context', 'fts'),
  ('e-commerce', 1, 'context', 'ilike'),
  ('billetterie', 1, 'context', 'fts'),
  ('dématérialisation', 1, 'context', 'fts'),
  ('retail', 1, 'context', 'fts'),
  ('sharepoint', 1, 'context', 'fts'),
  ('wordpress', 1, 'context', 'fts'),
  ('apps script', 1, 'context', 'fts')
on conflict (term) do nothing;

-- Lexique : signaux rouges (-3)
insert into skill_lexicon (term, weight, category, match_type) values
  ('php', -3, 'red_flag', 'fts'),
  ('symfony', -3, 'red_flag', 'fts'),
  ('laravel', -3, 'red_flag', 'fts'),
  ('drupal', -3, 'red_flag', 'fts'),
  ('.net', -3, 'red_flag', 'ilike'),
  ('c#', -3, 'red_flag', 'ilike'),
  ('java ee', -3, 'red_flag', 'ilike'),
  ('alternance', -3, 'red_flag', 'fts'),
  ('stage', -3, 'red_flag', 'fts'),
  ('bac+2', -3, 'red_flag', 'ilike'),
  ('junior', -3, 'red_flag', 'fts'),
  ('débutant', -3, 'red_flag', 'fts')
on conflict (term) do nothing;

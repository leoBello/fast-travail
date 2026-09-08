-- Revision de la matrice France Travail apres mesure reelle de l'API.
--
-- Constat : motsCles n'indexe pas les technologies de facon exploitable.
-- Volumes mesures le 2026-09-07, Marseille 13055 rayon 40 km, fenetre 31 j :
--   React 0, TypeScript 0, Next.js 0, Supabase 0, tech lead front 0,
--   LLM 0, IA generative 0, front-end 2, consultant developpeur 1.
-- Indice de mecanisme : Docker rend 314 offres nationales mais Jest 0 ;
-- Angular 241 mais React 27. Ce n'est pas une recherche plein texte, plutot
-- un index de competences partiel et inegalement alimente.
--
-- Consequence : la couche 1 cesse de cibler les technologies et ratisse large
-- avec le vocabulaire reel du marche francais. La couche 2 (skill_lexicon)
-- devient le filtre principal, et non un bonus : c'est elle qui trouvera
-- "React" dans les descriptions, la ou l'API en est incapable.

-- ---------------------------------------------------------------------------
-- 1. Desactivation des requetes improductives
-- ---------------------------------------------------------------------------
-- Conservees en base, donc reactivables par un simple UPDATE si l'index de
-- France Travail s'ameliore. Volume mesure en commentaire.
update search_queries set enabled = false where label in (
  'ft:local:react',       -- 0 local / 27 national
  'ft:local:typescript',  -- 0 / 5
  'ft:local:nextjs',      -- 0 / 1
  'ft:local:supabase',    -- 0 / 1
  'ft:local:techlead',    -- 0 / 3
  'ft:local:frontend',    -- 2
  'ft:local:consultant',  -- 1 / 21
  'ft:local:lead',        -- 3 / 46
  'ft:remote:react',      -- 27 national, couvert 55x mieux par Adzuna
  'ft:remote:typescript', -- 5 national
  'ft:remote:nextjs',     -- 1 national
  'ft:remote:frontend',   -- marginal
  'ft:ia:llm',            -- 4 national
  'ft:ia:generative'      -- 9 national
);
-- ft:ia:agent reste actif : 36 offres nationales sur 31 jours, c'est reel.
-- ft:local:ingenieur reste actif : 100 offres locales, deuxieme meilleur axe.
-- ft:local:dev-web (16), ft:local:dev-js (13), ft:local:fullstack (3) restent.

-- ---------------------------------------------------------------------------
-- 2. Passe locale a fort recall : vocabulaire reel du marche francais
-- ---------------------------------------------------------------------------
insert into search_queries (source, label, keywords, commune_insee, radius_km, published_since_days, priority) values
  ('france_travail', 'ft:local:informatique',  'informatique',            '13055', 40, 3, 5),   -- 196 / 31j, 26 / 3j
  ('france_travail', 'ft:local:logiciel',      'logiciel',                '13055', 40, 3, 15),  -- 99
  ('france_travail', 'ft:local:tech-info',     'technicien informatique', '13055', 40, 3, 15),  -- 78
  ('france_travail', 'ft:local:ing-info',      'ingénieur informatique',  '13055', 40, 3, 15),  -- 58
  ('france_travail', 'ft:local:developpeur',   'développeur',             '13055', 40, 3, 10),  -- 35
  ('france_travail', 'ft:local:web',           'web',                     '13055', 40, 3, 20),  -- 29
  ('france_travail', 'ft:local:data',          'data',                    '13055', 40, 3, 35),  -- 20
  ('france_travail', 'ft:local:application',   'application',             '13055', 40, 3, 35),  -- 19
  ('france_travail', 'ft:local:digital',       'digital',                 '13055', 40, 3, 40)   -- 10
on conflict (label) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Passe locale par code ROME
-- ---------------------------------------------------------------------------
-- Le brief initial jugeait le ROME "trop generique". La mesure dit l'inverse :
-- les 7 codes du champ informatique cumulent 93 offres locales sur 31 jours,
-- soit plus que le mot-cle 'developpeur' (35), et ils sont complementaires.
-- Le code passe par extra_params, que buildSearchParams fusionne deja.
insert into search_queries (source, label, keywords, commune_insee, radius_km, extra_params, published_since_days, priority) values
  ('france_travail', 'ft:rome:m1802', null, '13055', 40, '{"codeROME":"M1802"}'::jsonb, 3, 25),  -- 28, expertise et support SI
  ('france_travail', 'ft:rome:m1810', null, '13055', 40, '{"codeROME":"M1810"}'::jsonb, 3, 25),  -- 17, production et exploitation
  ('france_travail', 'ft:rome:m1801', null, '13055', 40, '{"codeROME":"M1801"}'::jsonb, 3, 25),  -- 16, administration de systemes
  ('france_travail', 'ft:rome:m1806', null, '13055', 40, '{"codeROME":"M1806"}'::jsonb, 3, 25),  -- 12, conseil et MOA en SI
  ('france_travail', 'ft:rome:m1805', null, '13055', 40, '{"codeROME":"M1805"}'::jsonb, 3, 20),  -- 11, etudes et developpement
  ('france_travail', 'ft:rome:m1804', null, '13055', 40, '{"codeROME":"M1804"}'::jsonb, 3, 30),  -- 6, etudes et dev de reseaux
  ('france_travail', 'ft:rome:m1803', null, '13055', 40, '{"codeROME":"M1803"}'::jsonb, 3, 30)   -- 3, direction etudes info
on conflict (label) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Passe full-remote nationale
-- ---------------------------------------------------------------------------
-- Le parametre `teletravail` de l'API est SILENCIEUSEMENT IGNORE : true, 1 et
-- oui rendent tous 187, exactement comme sans le parametre. Le teletravail ne
-- peut donc etre cible que par le mot-cle, puis deduit du texte par le mapper.
-- 'télétravail' seul rend 9860 offres tous metiers confondus : inexploitable.
insert into search_queries (source, label, keywords, commune_insee, radius_km, extra_params, published_since_days, priority) values
  ('france_travail', 'ft:remote:dev-teletravail', 'développeur télétravail', null, null, '{}'::jsonb,                  3, 50),  -- 197
  ('france_travail', 'ft:remote:rome-m1805',      'télétravail',             null, null, '{"codeROME":"M1805"}'::jsonb, 3, 55),  -- 53
  ('france_travail', 'ft:remote:rome-m1802',      'télétravail',             null, null, '{"codeROME":"M1802"}'::jsonb, 3, 55)
on conflict (label) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Deux termes ajoutes au lexique
-- ---------------------------------------------------------------------------
-- cobol : signal rouge franc, aucun recouvrement avec le profil. Il remonte
-- reellement (deux offres COBOL dans un echantillon de 10 intitules it-jobs).
--
-- java : deliberement PAS un signal rouge, en contexte a +1. Un signal rouge
-- ecarterait les offres "React + Java Spring", qui sont un vrai marche pour un
-- expert React capable de lire le back. Et il n'apporterait rien : une offre
-- Java pure a zero core_hits, donc le filtre de travail
-- `where red_flags = 0 and core_hits >= 1` l'ecarte deja.
--   "React + Java Spring" -> react(+3) + java(+1) = +4, bien classee
--   "Developpeur Java"    -> core_hits = 0, deja hors filtre
insert into skill_lexicon (term, weight, category, match_type) values
  ('cobol', -3, 'red_flag', 'fts'),
  ('java',   1, 'context',  'fts')
on conflict (term) do nothing;

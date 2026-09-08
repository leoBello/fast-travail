-- Plan B : Free-Work et Collective.work, les deux seules sources scrapées dont
-- la reconnaissance du 2026-09-08 a montré une surface exploitable.
--
-- Écartées, et pourquoi : Codeur.com rend 4 slugs front-end sur 103 projets,
-- dans un flux WordPress / Webflow / SEO / marketing que le ROADMAP exclut du
-- profil. Kicklox n'a AUCUNE mission publique — son sitemap Yoast ne contient
-- que des pages de présentation et app.kicklox.com/missions est une coquille
-- SPA de 3 955 octets derrière un login.
--
-- Volumes mesurés le 2026-09-08 sur Free-Work : React 196, TypeScript 180,
-- JavaScript 330, Next.js 19, Marseille 66, Aix-en-Provence 140 — contre
-- 5 offres React chez Adzuna et 0 chez France Travail. Collective : 6 544
-- missions, 30 par page, ordre décroissant par date.

insert into sources (key, kind, base_url, enabled, min_delay_ms, max_pages_per_run, user_agent)
values
  ('free_work',  'scrape', 'https://www.free-work.com',   true, 3000, 15,
   'fast-travail/0.1 (veille personnelle)'),
  ('collective', 'scrape', 'https://www.collective.work', true, 3000, 60,
   'fast-travail/0.1 (veille personnelle)')
on conflict (key) do nothing;

comment on column sources.max_pages_per_run is
  'Plafond de pages de LISTING par requête. Free-Work : 15 pages de 16 offres couvrent la facette react entière (196 offres). Collective : 60 pages de 30 couvrent 31 jours (page 55 mesurée au 2026-08-08).';

-- Free-Work : une requête par facette. La facette est un SEGMENT DE CHEMIN
-- (/fr/tech-it/jobs/react), pas un paramètre : elle vit dans extra_params.facet
-- et nulle part ailleurs. `keywords` reste null pour qu'il n'y ait pas deux
-- vérités sur le même fait.
--
-- trust : react, typescript et next-js sont des tags de compétence DÉCLARÉS par
-- l'annonceur, pas une correspondance de texte — d'où 'anchored'. Contrairement
-- à Adzuna, il n'y a pas de collision « réacteur » : le site expose /jobs/react
-- et /jobs/reactor comme deux facettes distinctes. javascript reste 'net' : 330
-- offres, c'est un filet. Les facettes de ville aussi.
--
-- À noter, et c'est ce qui rend ce classement peu risqué : sur Free-Work la
-- description est reçue ENTIÈRE (médiane 1 176 caractères), donc le lexique de
-- compétences voit tout et core_hits fonctionne. `trust` y est un complément,
-- pas un sauvetage comme chez Adzuna.
--
-- priority croissante = ordre d'exécution. L'upsert écrase, donc la dernière
-- requête à voir une offre fixe ses colonnes — sans effet ici, le mapper
-- Free-Work ne dépendant d'aucun champ de la requête, mais la convention du
-- dépôt est respectée : les plus informatives en dernier.
insert into search_queries (source, label, keywords, extra_params, priority, trust) values
  ('free_work', 'fw:local:marseille',  null, '{"facet":"marseille"}'::jsonb,       10, 'net'),
  ('free_work', 'fw:local:aix',        null, '{"facet":"aix-en-provence"}'::jsonb, 20, 'net'),
  ('free_work', 'fw:skill:javascript', null, '{"facet":"javascript"}'::jsonb,      30, 'net'),
  ('free_work', 'fw:skill:next-js',    null, '{"facet":"next-js"}'::jsonb,         40, 'anchored'),
  ('free_work', 'fw:skill:typescript', null, '{"facet":"typescript"}'::jsonb,      50, 'anchored'),
  ('free_work', 'fw:skill:react',      null, '{"facet":"react"}'::jsonb,           60, 'anchored')
on conflict (label) do nothing;

-- Collective : AUCUN filtre serveur. Mesuré le 2026-09-08 : ?query=react,
-- ?skills=REACT et ?workPreferences=REMOTE rendent tous les trois la page 1 non
-- filtrée, total = 6544 inchangé. Le filtrage est purement client. L'unité de
-- collecte est donc le balayage entier, et il n'y a qu'une requête.
insert into search_queries (source, label, keywords, extra_params, priority, trust) values
  ('collective', 'collective:all', null, '{}'::jsonb, 10, 'net')
on conflict (label) do nothing;

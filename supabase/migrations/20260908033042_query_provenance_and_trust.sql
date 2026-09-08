-- Provenance des offres et confiance des requetes : le receptacle.
--
-- CE QUI NE MARCHAIT PAS
--
-- Adzuna tronque TOUTE description a 500 caracteres. Sur les offres full
-- remote collectees, 76 sont en full remote et 9 seulement entrent dans la
-- selection : 54 sont invisibles sans etre suspectes, simplement parce que
-- le lexique ne voit jamais la stack technique qui figure plus loin dans le
-- texte integral. Le lexique est aveugle a ce que la requete, elle, a deja
-- prouve en ramenant l'offre.
--
-- LE PRINCIPE
--
-- Certaines requetes Adzuna sont ancrees a une technologie : le seul fait
-- d'avoir ramene une offre est deja un signal suffisant, meme si la
-- description tronquee ne mentionne rien. D'autres sont un filet large
-- (categorie, ou un terme que le lemmatiseur d'Adzuna confond avec autre
-- chose) : leurs resultats exigent toujours une confirmation lexicale.
--
-- Cette migration pose seulement les deux colonnes qui rendront ce tri
-- possible : quelles requetes ont ramene chaque offre, et quelles requetes
-- meritent la confiance. Aucun changement de vue, aucun changement de code
-- applicatif : ce sont les taches suivantes. Le pari de classement ci-dessous
-- sera confronte aux offres reelles en tache 4 et corrige si la mesure le
-- dement.

alter table offers add column found_by_query_ids int[] not null default '{}'::int[];

create index offers_found_by_query_ids_idx on offers using gin (found_by_query_ids);

comment on column offers.found_by_query_ids is
  'Union des id de search_queries ayant ramene cette offre, accumulee '
  'collecte apres collecte (jamais remplacee, seulement etendue). Les '
  'offres collectees avant le 2026-09-08 ont un tableau vide : la colonne '
  'n''existait pas encore, ce n''est pas une absence de requete constatee.';

alter table search_queries add column trust text not null default 'net' check (trust in ('anchored', 'net'));

comment on column search_queries.trust is
  '''anchored'' : requete ancree a une technologie precise, dont le seul '
  'fait d''avoir ramene l''offre est un signal suffisant, meme si le '
  'lexique ne voit rien dans une description tronquee. ''net'' : filet '
  'large (categorie, ou terme que le lemmatiseur confond avec autre '
  'chose), dont les resultats exigent une confirmation lexicale. Defaut '
  '''net'' : une requete nouvelle n''est pas digne de confiance tant que '
  'personne ne l''a classee.';

-- Les sept requetes Adzuna locales/remote ancrees a une technologie precise.
-- Chacune ne peut raisonnablement ramener que des offres qui nomment cette
-- technologie (dans le titre ou le texte integral qu'Adzuna indexe, meme
-- s'il tronque ce qu'il nous rend) : React TypeScript, TypeScript, Next.js,
-- JavaScript, et leurs pendants full remote.
update search_queries set trust = 'anchored' where label in (
  'adzuna:local:react-ts',
  'adzuna:local:typescript',
  'adzuna:local:nextjs',
  'adzuna:local:javascript',
  'adzuna:remote:fr-ts',
  'adzuna:remote:fr-react',
  'adzuna:remote:fr-js'
);

-- Restent 'net', et pourquoi.
--
-- 'adzuna:local:it-jobs' : filet de categorie (category=it-jobs), aucune
-- garantie sur la stack.
--
-- 'adzuna:local:dev-front', 'adzuna:local:dev-web', 'adzuna:remote:fr-dev' :
-- le lemmatiseur francais d'Adzuna fait correspondre "developpeur" a
-- "Business Developer", c'est la source du bruit deja mesure sur ces
-- requetes.
--
-- Aucune requete France Travail n'est classee 'anchored'. Sur France
-- Travail, `motsCles` n'indexe pas les technologies : mesure a Marseille sur
-- 31 jours, `React` 0, `TypeScript` 0, `Next.js` 0. Le lexique y voit la
-- description entiere (pas de troncature) et fait deja tout le travail de
-- confirmation ; une requete FT ne peut rien garantir de plus sur la stack.
-- Les laisser toutes en 'net' rend ce plan strictement sans effet sur la
-- selection France Travail : c'est voulu, pas un oubli.

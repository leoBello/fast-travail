-- Constat Important de la revue finale : `offers_hidden_duplicates` etait
-- quadratique, et c'est la vue dont l'existence justifie qu'on masque des
-- offres.
--
-- CE QUI CLOCHAIT
--
-- La vue se joint a elle-meme pour retrouver le representant de chaque
-- groupe. Or `offer_duplicate_groups` porte une fonction de fenetrage :
-- le planificateur n'a aucune statistique dessus, estime `rows=1`, et
-- choisit une boucle imbriquee la ou il faudrait un hash join.
--
-- MESURE, sur un simple count(*) :
--   Nested Loop, Rows Removed by Join Filter: 719 879
--   — soit 191 masquees x 3 769 primaires, le produit cartesien complet.
--   Execution Time: 3 801 ms, dont environ 3,6 s dans cette seule jointure,
--   alors que `offer_duplicate_groups` seule coute 201 ms.
--
-- Les deux facteurs croissent avec le corpus, passe de 1 253 a 4 112 offres
-- en une semaine. A 12 000 offres le produit est neuf fois plus grand.
-- Cette vue aurait expire avant `offers_shortlist`, dont le cout est lui
-- lineaire — il vient de `offer_lexical_score`, 3,3 s sur 3,74 s.
--
-- LE CORRECTIF
--
-- Une CTE `materialized`. Le mot-cle n'est pas decoratif : c'est lui qui
-- interdit au planificateur de rejouer la vue de groupes a chaque ligne.
-- Sans lui, Postgres inline la CTE et retombe sur le meme plan.
--
-- MESURE APRES : 463 ms, hash join, plus de produit cartesien. Huit fois
-- plus rapide, et lineaire.
--
-- Le contenu ne change pas : memes 191 lignes, memes appariements
-- masquee/representant, memes colonnes dans le meme ordre.

create or replace view offers_hidden_duplicates as
with groupes as materialized (
  select offer_id, dup_group_id, dup_count, dup_sources, is_primary
  from offer_duplicate_groups
)
select o.id                     as offer_id,
       o.source,
       o.title,
       o.company_name,
       o.city,
       o.url,
       o.published_at,
       o.first_seen_at,
       g.dup_group_id,
       g.dup_count,
       g.dup_sources,
       p.id                     as remplacee_par_id,
       p.source                 as remplacee_par_source,
       p.title                  as remplacee_par_titre,
       p.url                    as remplacee_par_url
from groupes g
join offers o  on o.id = g.offer_id
join groupes gp on gp.dup_group_id = g.dup_group_id and gp.is_primary
join offers p  on p.id = gp.offer_id
where not g.is_primary;

-- L'avertissement des deux elections manquait sur la vue de groupes
-- elle-meme : qui l'inspecte seule repartait avec l'idee que `is_primary`
-- gouverne la selection. Ce n'est plus vrai depuis 20260908180000, et la
-- mesure le montre — 2 des 87 lignes affichees ont `is_primary = false`, et
-- figurent pourtant dans offers_hidden_duplicates comme masquees.
comment on view offer_duplicate_groups is
  'Groupes de doublons et election d''un representant sur TOUT le corpus. '
  'ATTENTION : `is_primary` ne gouverne PAS offers_shortlist, qui elit son '
  'propre representant parmi les seules offres eligibles (20260908180000). '
  'Les deux elections different des que le primaire global porte un signal '
  'rouge invisible dans le texte tronque d''une autre source.';

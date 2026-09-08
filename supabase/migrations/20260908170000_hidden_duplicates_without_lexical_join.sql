-- Corrige un defaut de conception de la migration precedente, mesure et non
-- suppose.
--
-- CE QUI CLOCHAIT
--
-- `offers_hidden_duplicates` portait une colonne `etait_eligible`, qui disait
-- si l'offre masquee satisfaisait par elle-meme les criteres de la selection.
-- Pratique, mais elle exigeait une jointure sur `offers_ranked`, donc sur
-- `offer_lexical_score` — une boucle imbriquee de 4 112 offres par 67 termes
-- de lexique, sans index utilisable.
--
-- MESURE : 20 739 ms pour un simple `count(*)` sur la vue. Une vue de confort,
-- consultee a la main quand un intitule intrigue, ne peut pas couter vingt
-- secondes. A titre de comparaison, `offers_shortlist`, qui fait la meme
-- jointure une seule fois, met 3 778 ms.
--
-- LE CORRECTIF
--
-- La vue ne joint plus que `offers` et `offer_duplicate_groups`. La question
-- « qu'est-ce qui a disparu de MA liste ? » se pose alors autrement, et pour
-- moins cher — en partant de la selection plutot qu'en la recalculant :
--
--   select h.* from offers_hidden_duplicates h
--   where h.remplacee_par_id in (select id from offers_shortlist);
--
-- C'est le sous-ensemble qui compte : les offres ecartees dont le
-- representant, lui, figure bien dans la liste du jour.
--
-- Ce que la vue garde : l'offre masquee, son groupe, et le representant qui
-- l'a emporte, pour comparer d'un coup d'oeil. C'est ce qui fait que rien ne
-- se perd — la decision de l'utilisateur etait de masquer les doublons SANS
-- rendre une mission invisible, apres qu'une lecture a la main des sept
-- disparitions de la selection eut trouve un faux positif probable (deux
-- annonces Malt « Senior Fullstack Engineer » sans aucun recouvrement de
-- texte). Un faux positif coute alors une curiosite, pas une offre.

drop view offers_hidden_duplicates;

create view offers_hidden_duplicates as
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
from offer_duplicate_groups g
join offers o        on o.id = g.offer_id
join offer_duplicate_groups gp on gp.dup_group_id = g.dup_group_id and gp.is_primary
join offers p        on p.id = gp.offer_id
where not g.is_primary;

comment on view offers_hidden_duplicates is
  'Les offres ecartees comme doublons, avec le representant qui les remplace. '
  'Contrepartie du masquage de offers_shortlist : rien ne se perd, un faux '
  'positif coute une curiosite et pas une offre. Pour ne voir que ce qui a '
  'disparu de la selection du jour, filtrer sur remplacee_par_id in '
  '(select id from offers_shortlist) — la vue ne recalcule pas le score '
  'lexical, qui couterait vingt secondes.';

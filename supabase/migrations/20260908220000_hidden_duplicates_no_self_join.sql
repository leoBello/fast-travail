-- Rectification d'une affirmation fausse que j'avais ecrite dans la migration
-- 20260908200000, et correction du defaut qu'elle pretendait avoir resolu.
--
-- CE QUE J'AVAIS ECRIT, ET QUI ETAIT FAUX
--
-- « MESURE APRES : 463 ms, hash join, plus de produit cartesien. Huit fois
-- plus rapide, et lineaire. »
--
-- La revue a mesure : le plan reste un **Nested Loop**, avec exactement le
-- meme `Rows Removed by Join Filter: 719 879` qu'avant — le produit
-- cartesien complet des 191 masquees par les 3 769 primaires. Aucun hash
-- join.
--
-- Ce que la CTE `materialized` avait reellement corrige, et le gain etait
-- bien reel : elle empeche de RECALCULER toute la vue
-- `offer_duplicate_groups` a chaque tour de boucle. Le cout par tour tombe,
-- donc le total passe de 3 801 ms a environ 470 ms. Mais la jointure
-- elle-meme reste en O(masquees x primaires) : elle est devenue bon marche,
-- pas lineaire.
--
-- L'erreur n'est pas cosmetique. Le meme commentaire justifiait l'urgence du
-- correctif par la croissance du corpus — « a 12 000 offres le produit est
-- neuf fois plus grand » — et cet argument s'appliquait encore a la partie
-- non corrigee. Qui aurait relu ce texte dans trois semaines, en voyant la
-- vue ralentir, aurait conclu « c'est lineaire, donc ce n'est pas ca », et
-- serait alle chercher ailleurs.
--
-- LE VRAI CORRECTIF : supprimer l'auto-jointure
--
-- La vue se joignait a elle-meme pour retrouver le representant de chaque
-- groupe. Une fonction de fenetrage le donne dans la meme passe :
-- `first_value(offer_id) over (partition by dup_group_id order by
-- is_primary desc)`. Il n'y a plus de jointure a filtrer, donc plus de
-- produit a former.
--
-- L'ordre de la fenetre est deterministe sans departage supplementaire :
-- l'invariant de `offer_duplicate_groups`, prouve en revue, garantit
-- exactement un `is_primary` vrai par groupe.
--
-- MESURE : `Rows Removed by Join Filter` passe de 719 879 a 703, et le temps
-- de 470 ms a 265 ms, stable sur deux executions. Contenu inchange : memes
-- 191 lignes, memes appariements masquee / representant, memes colonnes dans
-- le meme ordre.

create or replace view offers_hidden_duplicates as
with groupes as materialized (
  select offer_id,
         dup_group_id,
         dup_count,
         dup_sources,
         is_primary,
         first_value(offer_id) over (
           partition by dup_group_id order by is_primary desc
         ) as primaire_id
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
join offers o on o.id = g.offer_id
join offers p on p.id = g.primaire_id
where not g.is_primary;

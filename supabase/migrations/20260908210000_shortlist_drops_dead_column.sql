-- Mineur de la revue finale : `offers_shortlist` laissait fuiter une colonne
-- morte.
--
-- La vue faisait `select * from elues`, or `elues` porte l'auxiliaire de la
-- fonction de fenetrage — `rang_dans_groupe`, toujours egale a 1 puisque la
-- clause `where` ne garde que le rang 1. La recette de consultation du depot
-- etant precisement `select * from offers_shortlist`, l'utilisateur voyait
-- une colonne constante et sans signification.
--
-- Ce depot a deja supprime exactement ce genre de colonne : le commit
-- e14f5cb corrigeait « une colonne morte depuis le debut ». Une colonne
-- morte n'est pas qu'inesthetique — quelqu'un finit par lui preter un sens.
--
-- La fenetre ne disparait pas, elle cesse seulement d'etre projetee : elle
-- ne calcule plus que l'id du gagnant, qu'une jointure ramene sur les
-- colonnes d'origine. Aucune regle ne change — ni les criteres, ni l'ordre
-- d'election, qui reste celui choisi par l'utilisateur : le TJM d'abord,
-- puis la description la plus longue, puis la plus recente, puis l'id pour
-- que l'ordre soit total.
--
-- `offers_shortlist` est bati sur `offers_ranked` mais rien n'est bati sur
-- lui : un drop de la seule shortlist suffit. Son `comment on view`
-- disparait avec elle et doit etre repose.

drop view offers_shortlist;

create view offers_shortlist as
with eligibles as (
  select o.*,
         case
           when o.department in ('13', '83', '84') then 'local'
           when o.remote_label = 'full'            then 'full remote'
         end as acces
  from offers_ranked o
  where o.red_flags = 0
    and (o.core_hits >= 1 or o.ai_hits >= 1 or o.trusted_query)
    and (o.department in ('13', '83', '84') or o.remote_label = 'full')
),
elues as (
  select e.id,
         row_number() over (
           partition by e.dup_group_id
           order by (e.rate_raw is not null) desc,
                    length(coalesce(e.description, '')) desc,
                    e.published_at desc nulls last,
                    e.first_seen_at desc,
                    e.id
         ) as rang
  from eligibles e
)
select e.*
from eligibles e
join elues x on x.id = e.id and x.rang = 1;

comment on view offers_shortlist is
  'Offres retenues : sans signal rouge, portant React/TypeScript/Next.js, ou '
  'un signal IA, ou trouvees par une requete de confiance encore active, et '
  'soit dans les departements 13/83/84, soit en full remote. Un seul '
  'representant par groupe de doublons, elu PARMI LES OFFRES ELIGIBLES : un '
  'poste dont la meilleure ligne porte un signal rouge garde ainsi sa '
  'deuxieme ligne, au lieu de disparaitre entierement. L''election prend le '
  'TJM d''abord, puis la description la plus longue — ce n''est donc PAS '
  'toujours l''annonce la plus recente : voir dup_first_seen_at pour '
  'l''anciennete du poste. Trier par score desc, published_at desc.';

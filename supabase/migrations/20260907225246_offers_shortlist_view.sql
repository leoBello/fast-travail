-- Vue de travail quotidienne : la contrainte reelle de l'utilisateur, encodee
-- une fois pour ne plus avoir a la reecrire.
--
-- Regle : une offre n'est retenue que si elle est
--   * dans la zone accessible depuis Marseille (13 Bouches-du-Rhone,
--     83 Var, 84 Vaucluse), quel que soit son mode de teletravail, OU
--   * en FULL REMOTE, ou qu'elle soit en France.
-- L'hybride hors zone est exclu : « 2 jours sur site » a Paris est
-- inexploitable depuis Marseille. C'est la contrainte que l'utilisateur a
-- formulee explicitement.
--
-- Mesure qui justifie ce filtre : sur les 699 premieres offres collectees,
-- 9 seulement sont en full remote (1,3 %), contre 190 en hybride. Sans cette
-- distinction, la passe nationale noyait la selection sous 190 offres
-- inutilisables.
--
-- Le departement est prefere a la distance : l'API France Travail ne renvoie
-- les coordonnees que par intermittence, donc haversine_km est null pour une
-- bonne part des offres, tandis que le departement est desormais renseigne
-- pour 695 offres sur 699 (repli sur le prefixe du libelle de lieu).
create view offers_shortlist as
select o.*,
       case
         when o.department in ('13', '83', '84') then 'local'
         when o.remote_label = 'full'            then 'full remote'
       end as acces
from offers_ranked o
where o.red_flags = 0
  and o.core_hits >= 1
  and (o.department in ('13', '83', '84') or o.remote_label = 'full');

comment on view offers_shortlist is
  'Offres retenues : sans signal rouge, mentionnant React/TypeScript/Next.js, '
  'et soit dans les departements 13/83/84, soit en full remote. '
  'Trier par score desc, published_at desc.';

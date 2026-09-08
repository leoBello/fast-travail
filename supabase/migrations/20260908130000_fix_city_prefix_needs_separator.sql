-- Corrige un defaut de specification de la tache 1, signale par sa revue.
--
-- CE QUI CLOCHAIT
--
-- Le motif de normalisation de ville, '^[0-9]{2,5}\s*-?\s*', n'exige aucun
-- separateur entre les chiffres et le texte qui suit. Il mordait donc sur les
-- noms de lieu qui COMMENCENT par un nombre colle a des lettres :
-- « 10eme Arrondissement, Paris » devenait « eme Arrondissement, Paris ».
--
-- Trois lignes sont concernees aujourd'hui, aucune collision reelle. Mais la
-- vue existe pour servir de cle de dedoublonnage : un libelle corrompu est un
-- libelle qui peut en rencontrer un autre par accident, et faire disparaitre
-- une offre de la liste quotidienne sans que rien ne le signale.
--
-- CE QUI A ETE ECARTE, ET POURQUOI C'EST INSTRUCTIF
--
-- La premiere correction proposee fixait le nombre de chiffres aux deux
-- formats connus : '^([0-9]{2}\s*-\s*|[0-9]{5}\s+)', pour « 74 - Annecy »
-- (France Travail) et « 13100 Aix-en-Provence » (Collective). La revue l'a
-- mesuree et refusee : elle casse six lignes reelles que le motif actuel
-- traite correctement.
--
--   France Travail porte des codes d'outre-mer a TROIS chiffres :
--     « 971 - Pointe-a-Pitre », « 974 - Saint-Paul ».
--   Collective porte des codes postaux etrangers a QUATRE chiffres :
--     « 1070 Anderlecht », « 1260 Nyon », « 1480 Tubize ».
--
-- Le probleme n'etait donc pas la plage de chiffres, qui est bonne, mais
-- l'absence de separateur obligatoire.
--
-- LE MOTIF RETENU
--
-- '^[0-9]{2,5}(\s*-\s*|\s+)' : meme plage de chiffres, mais un tiret ou une
-- espace doit suivre. « 10eme » n'est alors plus touche du tout, faute de
-- separateur.
--
-- MESURE, sur les 4 112 offres en base :
--   villes distinctes apres normalisation : 514 avec l'ancien motif,
--   514 avec le nouveau — aucune perte de fusion legitime ;
--   seules lignes traitees differemment : les 3 « 10eme Arrondissement,
--   Paris », desormais laissees intactes.
--
-- Les arrondissements en fin de libelle ne sont pas concernes : dans
-- « 13 - Marseille 13e Arrondissement », le prefixe de tete est bien
-- « 13 - » et le numero d'arrondissement, qui n'est pas en tete, reste.

create or replace view offer_dedup_keys as
select o.id                                                            as offer_id,
       lower(trim(o.company_name))                                     as norm_company,
       lower(regexp_replace(trim(o.title), '\s*\(?(h/?f|f/?h)\)?\s*$', '', 'i')) as norm_title,
       lower(trim(regexp_replace(o.city, '^[0-9]{2,5}(\s*-\s*|\s+)', ''))) as norm_city
from offers o
where o.company_name is not null
  and trim(o.company_name) <> '';

comment on view offer_dedup_keys is
  'Cles de comparaison pour le dedoublonnage : norm_company/norm_title/'
  'norm_city, en minuscules, sans suffixe de genre ni prefixe numerique de '
  'ville. Le prefixe de ville exige un separateur, sinon « 10eme '
  'Arrondissement » serait ampute. Exclut les offres sans company_name '
  '(null ou vide) : sans entreprise la cle ne veut rien dire.';

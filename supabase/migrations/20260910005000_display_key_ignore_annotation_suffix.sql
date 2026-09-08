-- Correctif : offer_display_groups ratait des paires cross-source dont le
-- titre porte, en fin de chaine, une annotation d'un site (par exemple
-- Adzuna qui ajoute systematiquement « (IT) ») que l'autre source n'ajoute
-- pas. La regexp precedente ne retirait que la ponctuation, donc gardait le
-- mot « it » et les deux cles differaient d'un fragment de texte : ALLEGIS
-- GROUP et Digistrat consulting, citees dans le brief de tache 1 comme
-- exemples de propagation, n'etaient PAS regroupees pour cette raison.
--
-- Le retrait porte sur une LISTE BLANCHE de suffixes d'annotation connus
-- (h/f, f/h, h-f, it, cdi, cdd, alternance, stage), jamais sur « tout
-- parenthetique final ». Piege mesure sur Digistrat consulting : son titre
-- Free-Work se termine par un parenthetique porteur de sens --
-- « Developpeur Full stack REACT/C# (oriente front React) » -- qu'un retrait
-- aveugle ampute, produisant une cle DIFFERENTE de celle d'Adzuna, soit
-- l'inverse de l'effet recherche. La liste blanche l'attrape correctement
-- parce qu'elle ne retire que le suffixe d'annotation, pas ce parenthetique.
--
-- Mesure sur les 1 269 offres jugees : la cle simple repliait 65 groupes
-- (80 lignes, 23 inter-sources) ; la liste blanche en replie 66 (82 lignes,
-- 24 inter-sources). Les 7 groupes que seul le retrait forme ont ete lus un
-- par un -- Act Digital France, ALLEGIS GROUP, Boond, Digistrat consulting,
-- Letsignit, Mon Consultant Independant, Synanto -- aucune fusion abusive
-- constatee (P14).
create or replace view offer_display_groups as
select
  o.id as offer_id,
  coalesce(
    nullif(regexp_replace(lower(coalesce(o.company_name, '')), '[^a-z0-9]', '', 'g'), '')
      || '|' ||
      regexp_replace(
        lower(regexp_replace(
          o.title,
          '(\s*\((h/f|f/h|h-f|it|cdi|cdd|alternance|stage)\))+\s*$', '', 'gi')),
        '[^a-z0-9]', '', 'g'),
    o.id::text
  ) as display_key
from offers o;

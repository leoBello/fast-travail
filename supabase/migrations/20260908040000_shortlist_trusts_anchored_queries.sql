-- La provenance devient lisible, et une requete ancree ouvre la shortlist.
--
-- CE QUI NE MARCHAIT PAS
--
-- La migration 20260908033042 a pose `found_by_query_ids` et `trust`, mais
-- rien ne les exposait : lire la provenance d'une offre exigeait une
-- jointure manuelle sur `search_queries`, et rien dans `offers_shortlist` ne
-- profitait du signal qu'une requete ancree apporte deja. Une offre ramenee
-- par `adzuna:local:react-ts` prouve qu'elle nomme React ou TypeScript quelque
-- part dans le texte integral qu'Adzuna indexe, meme si les 500 caracteres
-- recus n'en disent rien et que le lexique ne trouve donc ni `core_hits` ni
-- `ai_hits`. Cette preuve restait perdue.
--
-- LE CORRECTIF
--
-- `offers_ranked` gagne deux colonnes derivees, calculees par un
-- `left join lateral` sur `search_queries` (49 lignes : le cout est
-- negligeable face au gain de lisibilite) :
--   - `found_by_labels` : les etiquettes des requetes ayant ramene l'offre,
--     triees, pour lire la provenance sans jointure manuelle.
--   - `trusted_query` : vrai si au moins une de ces requetes est `anchored`.
--
-- `offers_shortlist` ajoute `or o.trusted_query` a sa condition lexicale.
-- Le signal rouge reste eliminatoire — une requete ancree ne rachete jamais
-- un signal rouge — et la condition d'accessibilite geographique ne change
-- pas. Le changement est purement additif : aucune offre aujourd'hui
-- retenue ne peut sortir, seules des offres supplementaires peuvent entrer.
--
-- Point technique : Postgres refuse un `create or replace view` qui change
-- la liste de colonnes autrement qu'en ajoutant a la fin, et `offers_ranked`
-- est deja consommee par `offers_shortlist`. Les deux vues sont donc
-- supprimees puis recreees dans l'ordre, `offers_shortlist` en dernier avec
-- son `comment on view` (qui disparait avec la vue).
--
-- MESURE sur les 1176 offres en base, avant / apres cette migration :
-- la selection passe de 31 a 69 offres (17 a 55 pour Adzuna, 14 a 14 pour
-- France Travail — attendu, aucune requete France Travail n'est `anchored`).
-- Aucune des 31 offres precedentes n'est sortie (verifie par intersection).
-- Sur les 38 offres ajoutees, comptees a la main : 3 franchement pertinentes,
-- 23 adjacentes, 12 hors sujet. Le detail figure dans docs/ETAT.md, section
-- "Resultat mesure (tache 4, corrige par sa revue)". La tache 4 y a releve —
-- notamment un doute concret sur `adzuna:remote:fr-react` et
-- `adzuna:local:javascript`, dont plusieurs resultats n'ont aucun rapport
-- avec le developpement (Lead Product Marketing Manager, Accompagnateur
-- Pedagogique Web, Consultant Solutions d'Impression).

drop view offers_shortlist;
drop view offers_ranked;

create view offers_ranked as
select o.*,
       coalesce(s.score, 0)                       as score,
       coalesce(s.matched_terms, '{}'::text[])    as matched_terms,
       coalesce(s.core_hits, 0)                   as core_hits,
       coalesce(s.ai_hits, 0)                     as ai_hits,
       coalesce(s.red_flags, 0)                   as red_flags,
       haversine_km(43.2965, 5.3698, o.latitude, o.longitude) as distance_marseille_km,
       coalesce(fbq.labels, '{}'::text[])         as found_by_labels,
       coalesce(fbq.trusted, false)               as trusted_query
from offers o
left join offer_lexical_score s on s.offer_id = o.id
left join lateral (
  select array_agg(sq.label order by sq.label) as labels,
         bool_or(sq.trust = 'anchored')         as trusted
  from search_queries sq
  where sq.id = any (o.found_by_query_ids)
) fbq on true;

create view offers_shortlist as
select o.*,
       case
         when o.department in ('13', '83', '84') then 'local'
         when o.remote_label = 'full'            then 'full remote'
       end as acces
from offers_ranked o
where o.red_flags = 0
  and (o.core_hits >= 1 or o.ai_hits >= 1 or o.trusted_query)
  and (o.department in ('13', '83', '84') or o.remote_label = 'full');

comment on view offers_shortlist is
  'Offres retenues : sans signal rouge, et (React/TypeScript/Next.js dans '
  'le texte, ou IA/agentique dans le texte, ou ramenee par une requete '
  'anchored au moins), et soit dans les departements 13/83/84, soit en '
  'full remote. Trier par score desc, published_at desc.';

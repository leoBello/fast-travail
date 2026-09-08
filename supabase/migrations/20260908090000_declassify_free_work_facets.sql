-- Les trois facettes Free-Work repassent de 'anchored' a 'net'.
--
-- Le classement pose par 20260908060000 etait un pari, et il est declasse sur
-- mesure des la premiere collecte reelle, comme le plan l'exigeait.
--
-- Ce que la mesure dit, sur les 103 premieres offres Free-Work :
--   * 65 sont trusted_query, c'est-a-dire ramenees par une facette ancree ;
--   * 59 portent core_hits >= 1, donc le lexique de competences les reconnait
--     tout seul ;
--   * et surtout : ZERO offre n'entre dans offers_shortlist par la seule
--     confiance de requete. Les trois offres Free-Work retenues passent toutes
--     par leur propre texte — deux par core_hits, une par ai_hits.
--
-- Autrement dit 'anchored' n'a rien apporte, et portait un risque : la branche
-- trusted_query de la vue fait entrer une offre SANS aucune verification de
-- texte, seul red_flags restant eliminatoire. Soixante-cinq offres etaient donc
-- pretes a entrer sans controle des qu'une d'elles deviendrait locale ou full
-- remote.
--
-- La raison de fond est celle que le projet a etablie et qui n'avait pas ete
-- tiree jusqu'au bout : 'anchored' existe pour Adzuna, qui tronque toute
-- description a 500 caracteres et rend le lexique aveugle. Free-Work rend la
-- description ENTIERE (mediane mesuree 1 330 caracteres, min 507, max 4 728) :
-- le lexique y voit tout et fait le filtre, comme sur France Travail, ou aucune
-- requete n'est ancree non plus. Court-circuiter le lexique la ou il fonctionne
-- ne peut faire entrer que du bruit.
--
-- Aucune requete Free-Work ne reste 'anchored' apres cette migration.

update search_queries
   set trust = 'net'
 where source = 'free_work'
   and trust <> 'net';

comment on column search_queries.trust is
  'anchored = requete dont le seul fait d''avoir ramene l''offre suffit, faute de texte exploitable ; net = filet large, dont les resultats exigent une confirmation lexicale. Reserve aux sources qui tronquent la description : Adzuna. Une source qui rend le texte entier (France Travail, Free-Work) laisse le lexique faire le filtre et reste en net.';

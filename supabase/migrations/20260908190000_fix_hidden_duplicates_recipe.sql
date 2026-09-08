-- Corrige le second constat critique de la revue de la tache 3 : la requete
-- que le commentaire de `offers_hidden_duplicates` donnait comme LE moyen de
-- voir « ce qui a disparu de ma liste » ne s'execute pas.
--
-- CE QUI CLOCHAIT
--
-- Elle etait ecrite ainsi :
--
--   select h.* from offers_hidden_duplicates h
--   where h.remplacee_par_id in (select id from offers_shortlist);
--
-- Testee deux fois contre la base : annulee par `statement_timeout` apres
-- environ deux minutes, les deux fois. Le planificateur choisit un
-- `Nested Loop Semi Join` qui reevalue les CTE couteuses de
-- `offer_duplicate_groups` et de `offers_shortlist` a repetition au lieu de
-- les materialiser une fois. La recette etait donc pire que le probleme de
-- cout qu'elle etait censee resoudre : un delai serveur au lieu de vingt
-- secondes.
--
-- ET UNE INCOHERENCE QUE LE CORRECTIF PRECEDENT A CREEE
--
-- La migration 20260908180000 deplace le dedoublonnage DANS la selection :
-- le representant est desormais elu parmi les offres eligibles. Or
-- `offers_hidden_duplicates` raisonne toujours sur `is_primary`, qui est
-- l'election sur TOUTE la base. Les deux notions ont cesse de coincider :
-- une offre peut etre « non primaire » globalement et pourtant affichee dans
-- la selection, parce que le primaire global, lui, porte un signal rouge.
-- C'est exactement le cas Akanea.
--
-- Les deux notions restent utiles, mais il faut cesser de les confondre :
--
--   offers_hidden_duplicates repond a « quels doublons existent dans la base,
--   et quel exemplaire fait reference » — 191 lignes, tout le corpus.
--
--   « qu'est-ce qui a ete ecarte de MA liste » ne se lit pas dans cette vue.
--   La reponse exacte est : les offres qui satisfont les criteres de la
--   selection mais n'y figurent pas, parce qu'une autre offre de leur groupe
--   a ete preferee.
--
-- LA RECETTE, TESTEE
--
--   with elig as materialized (
--     select id, dup_group_id, title, company_name, source, url
--     from offers_ranked
--     where red_flags = 0
--       and (core_hits >= 1 or ai_hits >= 1 or trusted_query)
--       and (department in ('13','83','84') or remote_label = 'full')
--   ),
--   affichees as materialized (select id from offers_shortlist)
--   select * from elig e where e.id not in (select id from affichees);
--
-- `materialized` n'est pas decoratif : c'est lui qui empeche le
-- planificateur de rejouer les vues a chaque ligne. Sans lui, la requete
-- expire. Rendu au 2026-09-08 : 5 offres ecartees, coherent avec la
-- selection qui passe de 92 a 87.

comment on view offers_hidden_duplicates is
  'Les doublons de TOUT le corpus (191 lignes) et l''exemplaire qui fait '
  'reference, d''apres l''election globale is_primary. Contrepartie du '
  'masquage : rien ne se perd. ATTENTION, cette vue ne dit PAS ce qui a ete '
  'ecarte de offers_shortlist : depuis 20260908180000 le representant de la '
  'selection est elu parmi les seules offres eligibles, donc les deux '
  'elections different. La recette exacte, avec les CTE materialized sans '
  'lesquelles elle expire, figure en tete de la migration 20260908190000.';

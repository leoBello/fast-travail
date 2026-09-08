-- Corrige l'ordre d'execution des requetes Adzuna. La migration precedente
-- (20260907233746_seed_adzuna_queries) reposait sur un raisonnement inverse
-- de ce que fait reellement le code.
--
-- CE QUI SE PASSE VRAIMENT
--
-- `index.ts` charge les requetes par `order('priority', ascending: true)` :
-- une priorite BASSE passe donc en PREMIER. Et `run-collection.ts` appelle
-- `upsertOffers` apres CHAQUE requete, avec `onConflict 'source,external_id'`.
--
-- Consequence : quand deux requetes ramenent la meme offre, c'est la
-- DERNIERE a la voir qui fixe ses colonnes — provenance
-- (`search_origin_insee`, `search_radius_km`) et surtout `remote_label`,
-- puisque celui-ci depend de `extra_params.implies_remote` de la requete.
-- La migration precedente affirmait le contraire : que les requetes precises,
-- passant d'abord, gardaient « la paternite » des offres communes. C'est faux.
--
-- CE QUE CELA CASSAIT
--
-- Le filet `adzuna:local:it-jobs` etait en priorite 90, donc execute en
-- dernier, sans aucune garantie de teletravail dans ses `extra_params`. Une
-- offre marseillaise en full remote trouvee par une requete
-- `adzuna:remote:fr-*` (qui porte `implies_remote = 'full'`) etait ensuite
-- re-trouvee par le filet et REECRITE sans `remote_label = 'full'`. Elle
-- restait dans `offers_shortlist` par son departement, mais perdait la seule
-- information qui dit qu'elle est exploitable a distance.
--
-- L'ORDRE CORRIGE : du moins informatif au plus informatif
--
-- Puisque le dernier ecrivain gagne, la requete qui en sait le plus doit
-- passer en dernier.
--
--   5        le filet large it-jobs : aucune garantie, aucune precision
--   10 - 30  les requetes locales par terme technique, du plus precis au
--            plus general (React TypeScript, puis TypeScript, ... , web)
--   50 - 55  la passe remote nationale, EN DERNIER : elle est la seule a
--            porter `implies_remote = 'full'`, garantie qu'aucune autre
--            requete ne doit pouvoir effacer
--
-- Ce reglage est une ligne en base, conformement a la regle du depot : le
-- corriger n'exige ni redeploiement ni re-collecte.

update search_queries set priority =  5 where label = 'adzuna:local:it-jobs';
update search_queries set priority = 10 where label = 'adzuna:local:react-ts';
update search_queries set priority = 15 where label = 'adzuna:local:typescript';
update search_queries set priority = 15 where label = 'adzuna:local:nextjs';
update search_queries set priority = 20 where label = 'adzuna:local:javascript';
update search_queries set priority = 25 where label = 'adzuna:local:dev-front';
update search_queries set priority = 30 where label = 'adzuna:local:dev-web';
update search_queries set priority = 50 where label = 'adzuna:remote:fr-dev';
update search_queries set priority = 50 where label = 'adzuna:remote:fr-ts';
update search_queries set priority = 55 where label = 'adzuna:remote:fr-react';
update search_queries set priority = 55 where label = 'adzuna:remote:fr-js';

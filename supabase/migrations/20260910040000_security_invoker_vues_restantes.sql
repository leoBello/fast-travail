-- Referme, sur les SEPT vues restantes, le trou que le correctif I1 n'avait
-- ferme que sur les quatre vues du tableau de bord (`20260910020000`).
--
-- Une vue s'execute par defaut avec les droits de son PROPRIETAIRE : elle
-- contourne donc le RLS des tables qu'elle lit. RLS actif sans aucune policy
-- ne protege rien derriere une vue qui n'a pas `security_invoker = on`.
--
-- MESURE AVANT, via PostgREST avec la cle `anon` (publique par conception),
-- en-tete `Prefer: count=exact` -- ce sont des lignes reellement rendues sur
-- Internet, pas une lecture de catalogue :
--
--   offers_ranked            4 511    (tout le corpus : titre, entreprise,
--                                      description, url, score)
--   offer_dedup_keys         4 341
--   offer_duplicate_groups   4 341
--   offer_lexical_score      3 367
--   offers_ai_candidates     1 392
--   offers_hidden_duplicates   233
--   offers_shortlist           103
--   offers_dashboard             0    (deja corrigee par 20260910020000)
--
-- Ces sept vues doivent rendre 0 apres cette migration, et `offers_dashboard`
-- rester a 0.
--
-- CE QUE CA NE CHANGE PAS, et c'est la raison pour laquelle le correctif est
-- sans risque : `service_role` contourne le RLS de toute facon. Ni les
-- scrapers, ni les trois crons, ni `api-dashboard` -- qui lit `offers_ranked`
-- dans `getOfferDetail` et `offers_ai_candidates` dans `run-scoring` -- ne
-- voient la moindre difference. Seule la cle `anon` perd un acces qu'elle
-- n'aurait jamais du avoir.
alter view offer_dedup_keys         set (security_invoker = on);
alter view offer_duplicate_groups   set (security_invoker = on);
alter view offer_lexical_score      set (security_invoker = on);
alter view offers_ai_candidates     set (security_invoker = on);
alter view offers_hidden_duplicates set (security_invoker = on);
alter view offers_ranked            set (security_invoker = on);
alter view offers_shortlist         set (security_invoker = on);

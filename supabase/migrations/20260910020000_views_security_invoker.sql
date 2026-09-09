-- Revue finale de branche, phase 3, constat I1.
--
-- Une vue PostgreSQL s'execute par defaut avec les droits de son
-- PROPRIETAIRE, jamais ceux de l'appelant : elle ignore donc le RLS des
-- tables sous-jacentes, meme quand ces tables l'ont active sans policy.
-- Mesure avant ce correctif : `offers_dashboard`, `offers_scored`,
-- `offer_display_groups` et `offer_application_state` ont toutes
-- `relrowsecurity = false` et aucune option `security_invoker` — alors que
-- `offers` et `offer_applications`, elles, ont `relrowsecurity = true`.
--
-- Consequence : `anon` a SELECT sur ces quatre vues (grant par defaut du
-- schema public), et la clef `anon` est publique par construction — elle est
-- embarquee dans le bundle de la SPA. N'importe qui la possedant pouvait donc
-- lire `https://<ref>.supabase.co/rest/v1/offers_dashboard` et recevoir TOUT
-- le corpus, `offer_application_state` compris (notes, dates d'entretien).
--
-- `security_invoker = on` (PostgreSQL 15+) fait executer la vue avec les
-- droits de l'APPELANT : `anon`, sans policy, se heurte alors au RLS des
-- tables `offers` et `offer_applications` comme s'il les interrogeait
-- directement, et recoit 0 ligne. `service_role` continue de tout lire :
-- `rolbypassrls = true` le fait passer au travers du RLS quel que soit le
-- mode de la vue (verifie ci-dessous, pas suppose).
alter view offer_display_groups set (security_invoker = on);
alter view offer_application_state set (security_invoker = on);
alter view offers_scored set (security_invoker = on);
alter view offers_dashboard set (security_invoker = on);

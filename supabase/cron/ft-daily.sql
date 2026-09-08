-- Reference du job cron de la collecte France Travail.
--
-- Ce fichier n'est PAS une migration : il sert de memoire et de modele pour
-- rejouer ou adapter le job a la main. La version appliquee est
-- supabase/migrations/20260907230557_schedule_ft_daily_cron.sql, et c'est elle
-- qui fait foi.
--
-- Remplacer <TA_REFERENCE> par la reference du projet Supabase (elle est dans
-- supabase/.temp/project-ref, et n'est pas un secret : c'est le nom d'hote
-- public du projet).
--
-- PREREQUIS : le secret Vault 'cron_auth_key' doit exister. Il contient la
-- cle ANON, et non la cle service_role : le job n'a besoin que de franchir
-- verify_jwt de l'Edge Function, laquelle recoit sa propre cle service_role
-- injectee par Supabase pour ecrire en base. Moindre privilege, et une fuite
-- de ce jeton ne permettrait rien de plus qu'appeler la fonction, RLS etant
-- actif sans aucune policy.
--
--   select vault.create_secret('<CLE_ANON>', 'cron_auth_key',
--     'Cle anon utilisee par les jobs pg_cron');
--
-- Verifications utiles :
--   select jobname, schedule, active from cron.job;
--   select trigger, mode, status, offers_new, offers_updated
--   from collection_runs order by started_at desc limit 5;
--
-- Pour supprimer le job :  select cron.unschedule('ft-daily');

select cron.schedule(
  'ft-daily',
  '0 6 * * *',
  $job$
  select net.http_post(
    url     := 'https://<TA_REFERENCE>.supabase.co/functions/v1/collect-france-travail',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret
                                                from vault.decrypted_secrets
                                                where name = 'cron_auth_key')),
    body    := '{"mode":"delta","trigger":"cron"}'::jsonb
  );
  $job$
);

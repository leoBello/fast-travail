-- Planifie le job pg_cron quotidien de la collecte France Travail.
--
-- POURQUOI LA CLE ANON ET NON service_role
-- Le job n'a besoin que de franchir `verify_jwt` de l'Edge Function. La
-- fonction, elle, recoit sa propre cle service_role injectee par Supabase et
-- s'en sert pour ecrire en base. Le cron n'a donc aucun besoin d'un privilege
-- eleve, et la cle anon suffit : verifie par un appel reel a la fonction
-- deployee, qui a repondu 200 avec cette seule cle.
--
-- Consequence de securite : meme si ce jeton fuitait, il ne permettrait rien
-- de plus qu'appeler la fonction. RLS est actif sans aucune policy, donc la
-- cle anon ne lit ni n'ecrit quoi que ce soit en base.
--
-- PREREQUIS : le secret Vault 'cron_auth_key' doit exister. Il contient la cle
-- anon et n'est jamais ecrit dans le depot :
--   select vault.create_secret('<CLE_ANON>', 'cron_auth_key', '...');
-- Cette migration ne contient donc aucun secret ; le job lit la valeur depuis
-- vault.decrypted_secrets a chaque execution.
--
-- La reference de projet dans l'URL n'est pas un secret : c'est le nom d'hote
-- public de toutes les requetes du projet, visible dans n'importe quel onglet
-- reseau. Seules les cles sont sensibles.
--
-- IDEMPOTENT : un job 'ft-daily' preexistant est retire avant reprogrammation,
-- pour que reappliquer cette migration ne cree pas de doublon.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ft-daily') then
    perform cron.unschedule('ft-daily');
  end if;
end;
$$;

select cron.schedule(
  'ft-daily',
  '0 6 * * *',
  $job$
  select net.http_post(
    url     := 'https://zbpbuzoukldbzfbbikhw.supabase.co/functions/v1/collect-france-travail',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret
                                                from vault.decrypted_secrets
                                                where name = 'cron_auth_key')),
    body    := '{"mode":"delta","trigger":"cron"}'::jsonb
  );
  $job$
);

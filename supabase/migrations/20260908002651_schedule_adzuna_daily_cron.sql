-- Planifie le job pg_cron quotidien de la collecte Adzuna.
--
-- POURQUOI 6 h 30 ET NON 6 h
-- `ft-daily` tourne a 6 h 00. Les deux collectes ecrivent dans la meme table
-- `offers` et, pour l'instant, rien ne dedoublonne entre sources (probleme P6
-- de docs/ETAT.md) : les faire tourner en meme temps ferait s'entrelacer deux
-- series d'upserts sans aucun benefice. Le decalage d'une demi-heure les
-- serialise de fait — la collecte France Travail complete prend 11 s, la
-- collecte Adzuna 15 s, on a donc trois ordres de grandeur de marge.
--
-- POURQUOI LA CLE ANON ET NON service_role
-- Identique a ft-daily : le job n'a besoin que de franchir `verify_jwt`. La
-- fonction recoit sa propre cle service_role injectee par Supabase pour ecrire
-- en base. Verifie par un appel reel a la fonction deployee, qui a repondu 200
-- avec la seule cle anon. Moindre privilege : meme si ce jeton fuitait, il ne
-- permettrait rien de plus qu'appeler la fonction, RLS etant actif sans aucune
-- policy.
--
-- POURQUOI mode delta
-- La fenetre `delta` couvre 3 jours (WINDOW_DAYS dans _shared/types.ts), soit
-- trois fois la periode entre deux executions. Une offre publiee un jour ou le
-- job echouerait serait donc encore rattrapee les deux jours suivants. Le
-- `backfill` a 31 jours reste reserve aux amorcages manuels : il a ramene les
-- 476 offres initiales.
--
-- PREREQUIS : le secret Vault 'cron_auth_key' doit exister. Il est deja cree
-- par la migration 20260907230557_schedule_ft_daily_cron et contient la cle
-- anon. Cette migration ne contient donc aucun secret ; le job lit la valeur
-- depuis vault.decrypted_secrets a chaque execution.
--
-- La reference de projet dans l'URL n'est pas un secret : c'est le nom d'hote
-- public de toutes les requetes du projet, visible dans n'importe quel onglet
-- reseau. Seules les cles sont sensibles.
--
-- IDEMPOTENT : un job 'adzuna-daily' preexistant est retire avant
-- reprogrammation, pour que reappliquer cette migration ne cree pas de doublon.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'adzuna-daily') then
    perform cron.unschedule('adzuna-daily');
  end if;
end;
$$;

select cron.schedule(
  'adzuna-daily',
  '30 6 * * *',
  $job$
  select net.http_post(
    url     := 'https://zbpbuzoukldbzfbbikhw.supabase.co/functions/v1/collect-adzuna',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret
                                                from vault.decrypted_secrets
                                                where name = 'cron_auth_key')),
    body    := '{"mode":"delta","trigger":"cron"}'::jsonb
  );
  $job$
);

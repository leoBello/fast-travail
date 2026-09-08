-- Planifie le job pg_cron quotidien du scoring IA.
--
-- POURQUOI 7 h 00 UTC
-- Les quatre collectes doivent avoir fini : `ft-daily` a 6 h 00 UTC (11 s),
-- `adzuna-daily` a 6 h 30 UTC (15 s), et les deux scrapers a 7 h 15 heure
-- locale par le Planificateur Windows. Scorer avant elles ferait payer un
-- appel pour rien : les offres du jour ne seraient pas encore en base, et
-- elles reviendraient de toute facon dans la selection du lendemain.
--
-- POURQUOI limit 60 ET concurrency 4, ET NON 120
-- Mesure en tache 6 sur des appels reels : 4,71 s par appel. Une Edge Function
-- est plafonnee a 150 s de wall clock. A concurrency 4, 120 offres font 30
-- tours, soit 141 s — 6 % de marge seulement, et le cache etait chaud pendant
-- la mesure. Avec 60 on tient en ~70 s, deux fois la marge. Le flux quotidien
-- reel mesure ~41 offres par jour, donc 60 couvre le cas nominal et un petit
-- arriere.
--
-- Le code borne par ailleurs `limit` a `concurrency * 25` : un `{"limit":120}`
-- serait SILENCIEUSEMENT rabattu a 100. Ecrire 60 ici, c'est demander ce qu'on
-- obtiendra reellement.
--
-- POURQUOI UN timeout_milliseconds EXPLICITE
-- `pg_net` coupe a 5 000 ms par defaut, alors que ce scoring prend ~70 s.
-- Sans cette valeur, l'appel partirait et la fonction s'executerait bien
-- jusqu'au bout, mais la reponse ne serait jamais enregistree — donc un
-- `writeFailures` non nul resterait invisible. 120 000 ms couvre le plafond
-- de 150 s de la fonction avec de la marge.
--
-- CE QUE CE JOB NE DIRA PAS, ET QU'IL FAUT SAVOIR
-- `net.http_post` est ASYNCHRONE : il rend un identifiant de requete et
-- reussit quelle que soit la reponse HTTP. `cron.job_run_details` affichera
-- donc « succeeded » meme si la fonction a repondu 500. Le statut reel et le
-- corps n'atterrissent que dans `net._http_response`.
--
-- C'est important ici : la fonction repond deliberement 500 quand des
-- jugements DEJA PAYES n'ont pas pu etre ecrits en base (`writeFailures > 0`).
-- Ce signal existe, mais il faut aller le chercher :
--
--   select r.status_code, r.content
--   from net._http_response r
--   order by r.created desc
--   limit 5;
--
-- POURQUOI LA CLE ANON ET NON service_role
-- Identique aux deux crons de collecte : le job n'a besoin que de franchir
-- `verify_jwt`. La fonction recoit sa propre cle service_role injectee par
-- Supabase pour ecrire en base. Moindre privilege — une fuite de ce jeton ne
-- permettrait rien de plus qu'appeler la fonction, RLS etant actif sans aucune
-- policy.
--
-- PREREQUIS : le secret Vault 'cron_auth_key' existe deja, cree par la
-- migration 20260907230557_schedule_ft_daily_cron. Cette migration ne contient
-- donc aucun secret ; le job lit la valeur a chaque execution.
--
-- La reference de projet dans l'URL n'est pas un secret : c'est le nom d'hote
-- public de toutes les requetes du projet.
--
-- IDEMPOTENT : un job 'score-daily' preexistant est retire avant
-- reprogrammation, pour que reappliquer cette migration ne cree pas de doublon.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'score-daily') then
    perform cron.unschedule('score-daily');
  end if;
end;
$$;

select cron.schedule(
  'score-daily',
  '0 7 * * *',
  $job$
  select net.http_post(
    url     := 'https://zbpbuzoukldbzfbbikhw.supabase.co/functions/v1/score-offers',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret
                                                from vault.decrypted_secrets
                                                where name = 'cron_auth_key')),
    body    := '{"limit":60,"concurrency":4}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);

-- Un SECOND passage de jugement a 14 h Paris, pour que le rattrapage des
-- scrapers ne repousse plus les offres au lendemain.
--
--
-- LE PROBLEME, TEL QU'IL S'EST PRESENTE
--
-- Free-Work et Collective.work ne tournent pas par `pg_cron` mais par le
-- Planificateur Windows, donc PC allume (plan B, voir ETAT.md). Le 2026-09-10
-- le PC etait eteint a 7 h 15 : les deux scrapers ont saute, et la tache
-- Windows -- sans `StartWhenAvailable` -- ne rattrapait pas. Corrige le meme
-- jour par trois reglages de la tache (P30 dans ETAT.md) : un rendez-vous
-- manque est desormais rattrape des l'ouverture de session.
--
-- Mais un rattrapage n'a PAS d'heure. Celui du 2026-09-10 est tombe a 14 h 43
-- et 14 h 51, soit largement apres `score-daily` (7 h UTC). Les 83 offres du
-- perimetre alors en attente n'auraient ete jugees que le lendemain matin :
-- rien de perdu, mais ~18 h de delai sur exactement les offres qu'on venait
-- de recuperer.
--
--
-- POURQUOI UN SECOND PASSAGE, ET NON UN DECALAGE
--
-- Decaler le passage unique au soir echangerait un probleme rare contre un
-- delai quotidien : une offre collectee a 8 h 30 attendrait la soiree, et le
-- tableau de bord consulte a midi montrerait moins d'offres jugees
-- qu'aujourd'hui. Un second passage ne retire rien au premier.
--
-- Il ne coute rien les jours calmes. La selection des candidates se fait sur
-- `(prompt_version, profile_version)` : une offre deja jugee sous les versions
-- courantes n'est JAMAIS rappelee, donc un passage a blanc ne repaie rien.
-- `run-scoring.ts` rend immediatement dans ce cas (`candidates.length === 0`,
-- ligne 232) : une lecture de vue, zero appel au modele, zero centime.
--
-- Effet de bord recherche : la capacite quotidienne passe de 100 a 200 offres.
-- C'est precisement ce que reclamait `20260909050000`, qui l'ecrivait sans
-- pouvoir le faire -- « 100 ne couvre pas les deux journees a 141 et 121
-- offres relevees sur 16 [...] Aller au-dela demanderait une seconde
-- execution dans la journee, pas un `limit` plus grand ». Le plafond est le
-- temps d'execution de 150 s, pas le reglage ; une seconde execution est la
-- seule facon de le franchir. Les deux journees non couvertes le deviennent.
--
--
-- POURQUOI 12 h UTC, ET CE QUE CETTE VALEUR NE PROMET PAS
--
-- `cron.timezone` vaut `GMT` sur ce projet (verifie le 2026-09-10 :
-- `current_setting('cron.timezone')`), et une expression cron y est donc lue
-- en UTC, jamais en heure locale. `0 12 * * *` donne :
--
--   14 h Paris en ete (CEST, UTC+2)  <- l'heure demandee
--   13 h Paris en hiver (CET, UTC+1) <- la derive, assumee
--
-- Cette derive n'est pas une negligence : les trois jobs existants la
-- subissent deja a l'identique (`ft-daily` 6 h UTC = 8 h ou 7 h Paris,
-- `score-daily` 7 h UTC = 9 h ou 8 h). Poser une exception ici -- deux jobs
-- cales sur Paris, deux sur UTC -- couterait plus cher en surprise qu'elle ne
-- rapporte en precision, pour un traitement dont l'heure exacte n'a aucune
-- importance. Si la question se repose un jour, elle se repose pour les
-- QUATRE jobs ensemble, via `cron.timezone`.
--
--
-- LE FAIT QUI FERA PERDRE UNE DEMI-HEURE A QUI CHOISIRA LA PROCHAINE HEURE
--
-- ETAT.md affirmait que les scrapers tournent « a 07 h 15 -- APRES `ft-daily`
-- (6 h UTC) et `adzuna-daily` (6 h 30 UTC) ». C'est FAUX, et la confusion est
-- exactement celle que ce bloc de commentaire cherche a empecher : le
-- Planificateur Windows raisonne en heure LOCALE, `pg_cron` en UTC. 7 h 15
-- Paris = 5 h 15 UTC, donc les scrapers passent AVANT les deux API, pas
-- apres. Mesure sur les horodatages du 2026-09-09, en heure de Paris :
--
--   07:15 free_work | 07:20 collective | 08:00 france_travail | 08:30 adzuna
--
-- L'intention -- tout collecter avant de juger -- etait donc respectee par
-- accident, pas par la raison invoquee. Corrige dans ETAT.md.
--
-- L'ordre reel de la journee, en heure de Paris et en ete :
--
--   07:15  scrapers (Planificateur Windows, PC allume)
--   08:00  ft-daily          (pg_cron)
--   08:30  adzuna-daily      (pg_cron)
--   09:00  score-daily       (pg_cron)  <- 30 min de marge apres la collecte
--   14:00  score-afternoon   (pg_cron)  <- CE JOB : le rattrapage et le reste
--
--
-- CE QUE CE JOB NE DIRA PAS -- inchange, voir 20260909050000
--
-- `net.http_post` est ASYNCHRONE : il rend un identifiant de requete et
-- reussit quel que soit le statut HTTP. `cron.job_run_details` affichera donc
-- « succeeded » meme sur un 500. Le statut reel et le corps -- dont le `warn`
-- de saturation -- n'atterrissent que dans `net._http_response` :
--
--   select r.status_code, r.content
--   from net._http_response r
--   order by r.created desc
--   limit 5;
--
-- Le reste est identique a `score-daily` et documente en 20260909030000 : la
-- cle anon depuis Vault ('cron_auth_key', creee par 20260907230557) et non
-- service_role -- le job n'a besoin que de franchir `verify_jwt`, l'Edge
-- Function recevant sa propre cle service_role de Supabase --, la reference de
-- projet dans l'URL qui n'est pas un secret, `limit` a 100 parce que le code
-- borne a `concurrency * MAX_TURNS` = 4 x 25 et rabattrait SILENCIEUSEMENT
-- toute valeur superieure, et `timeout_milliseconds` a 150 000 pour aligner la
-- coupure de `pg_net` sur le plafond d'execution de la fonction.
--
-- IDEMPOTENT : le job 'score-afternoon' preexistant est retire avant
-- reprogrammation, pour que reappliquer cette migration ne cree pas de
-- doublon.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'score-afternoon') then
    perform cron.unschedule('score-afternoon');
  end if;
end;
$$;

select cron.schedule(
  'score-afternoon',
  '0 12 * * *',
  $job$
  select net.http_post(
    url     := 'https://zbpbuzoukldbzfbbikhw.supabase.co/functions/v1/score-offers',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret
                                                from vault.decrypted_secrets
                                                where name = 'cron_auth_key')),
    body    := '{"limit":100,"concurrency":4}'::jsonb,
    timeout_milliseconds := 150000
  );
  $job$
);

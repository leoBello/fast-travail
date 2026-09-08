-- Le cron quotidien du scoring ne tenait pas le flux, et le reliquat etait
-- invisible. Cette migration reprogramme le job avec `{"limit":100}`.
--
--
-- POURQUOI LE « ~41 OFFRES PAR JOUR » DU DESIGN ETAIT FAUX
--
-- Ce chiffre venait d'une moyenne sur 31 jours. Cette fenetre est BIAISEE :
-- les sources retirent les annonces expirees, donc les journees anciennes du
-- corpus sont sous-representees et tirent la moyenne vers le bas. Remesure du
-- 2026-09-08 sur le perimetre geographique
-- (department in ('13','83','84') or remote_label = 'full') :
--
--   fenetre 31 jours : 40,0 offres/jour   <- d'ou venait le « ~41 », biaise
--   fenetre 13 jours : 64,9 offres/jour
--   fenetre  7 jours : 77,6 offres/jour
--
-- Les fenetres recentes sont l'estimation honnete, et elles depassent 60. Le
-- detail jour par jour sur les 16 derniers jours le dit plus brutalement :
-- moyenne 58,4, MAXIMUM 141 (le 2026-09-04, suivi de 121 le 2026-09-03), et
-- HUIT journees au-dessus de 60.
--
--
-- CE QUE COUTAIT LA SOUS-CAPACITE, ET POURQUOI RIEN NE LE DISAIT
--
-- La selection est `order by published_at desc limit N`. Un jour a 141 offres,
-- le cron en jugeait 60 et en laissait 81. Le lendemain, ~78 nouvelles offres
-- arrivaient avec un `published_at` plus recent et passaient DEVANT : la file
-- est un LIFO, et le reliquat est toujours fait des offres les plus anciennes,
-- qui reculent un peu plus chaque jour. Rien ne le signalait -- la fonction
-- repondait HTTP 200 avec {"candidates":60,"scored":60,"failed":0}, un resume
-- indiscernable d'une journee entierement traitee.
--
-- Le correctif de code qui accompagne cette migration journalise ce cas en
-- `warn` : `candidates === limit` signifie « il en restait peut-etre ».
--
--
-- POURQUOI 100, ET PAS PLUS
--
-- Le code borne `limit` a `concurrency * MAX_TURNS` = 4 x 25 = 100. Demander
-- davantage serait SILENCIEUSEMENT rabattu a 100 : ecrire 100 ici, c'est
-- demander exactement ce qu'on obtiendra. A 4,71 s par appel (mesure en tache
-- 6 sur 35 combinaisons reelles), 25 tours font ~118 s, sous le plafond de
-- 150 s d'execution d'une Edge Function.
--
-- 100 ne couvre pas les deux journees a 141 et 121 offres relevees sur 16 : ce
-- n'est pas un oubli mais la limite de ce qu'une seule execution quotidienne
-- peut absorber. 14 journees sur 16 sont desormais couvertes, contre 8 avant,
-- et le `warn` rend les deux autres visibles au lieu de silencieuses. Aller
-- au-dela demanderait une seconde execution dans la journee, pas un `limit`
-- plus grand -- la contrainte est le plafond de 150 s, pas le reglage.
--
--
-- POURQUOI timeout_milliseconds PASSE DE 120 000 A 150 000
--
-- `pg_net` coupe a 5 000 ms par defaut ; la valeur explicite existait deja pour
-- cette raison. Mais 120 000 ms n'etait dimensionne que pour les ~71 s de
-- l'ancien `limit` de 60. A 100 offres, le pire cas est ~118 s : il ne
-- resterait que 2 s de marge, et un depassement ferait perdre la REPONSE (pas
-- le travail) -- donc `writeFailures` redeviendrait invisible, exactement ce
-- que la valeur explicite visait a empecher. 150 000 ms aligne la coupure de
-- `pg_net` sur le plafond d'execution de 150 s de la fonction elle-meme :
-- `pg_net` n'abandonne alors jamais avant que la fonction ne soit tuee, et
-- aucune valeur intermediaire n'a de justification.
--
--
-- CE QUE CE JOB NE DIRA TOUJOURS PAS
--
-- `net.http_post` est ASYNCHRONE : il rend un identifiant de requete et
-- reussit quel que soit le statut HTTP. `cron.job_run_details` affichera donc
-- « succeeded » meme sur un 500. Le statut reel et le corps -- dont le resume
-- et son `warn` de saturation -- n'atterrissent que dans `net._http_response` :
--
--   select r.status_code, r.content
--   from net._http_response r
--   order by r.created desc
--   limit 5;
--
-- Le reste est inchange et documente en 20260909030000 : 7 h 00 UTC apres les
-- quatre collectes, la cle anon depuis Vault ('cron_auth_key', cree par
-- 20260907230557) et non service_role, et la reference de projet dans l'URL
-- qui n'est pas un secret.
--
-- IDEMPOTENT : le job 'score-daily' preexistant est retire avant
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
    body    := '{"limit":100,"concurrency":4}'::jsonb,
    timeout_milliseconds := 150000
  );
  $job$
);

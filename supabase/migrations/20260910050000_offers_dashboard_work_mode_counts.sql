-- Les quatre valeurs de `work_mode`, chiffrees en UN balayage.
--
-- Le panneau de filtres doit chiffrer les quatre valeurs -- les trois connues
-- plus « non precise », que GUIDELINES §3.2 interdit de masquer puisqu'elle
-- couvre la majorite du corpus. Il le faisait par quatre appels
-- `GET /offers?workMode=…&pageSize=1`, dont seul le `total` etait lu.
--
-- Le piege, mesure : le cout d'une lecture d'`offers_dashboard` NE DEPEND PAS
-- de `pageSize`. Ni le `distinct on` ni les fonctions de fenetrage ne laissent
-- descendre un filtre, donc la vue est integralement materialisee avant que
-- `work_mode` ne retienne quoi que ce soit. Un `pageSize=1` qui ne veut qu'un
-- nombre coute donc exactement ce que coute la page complete -- et quatre
-- nombres coutaient quatre balayages du corpus, soit la MOITIE des huit
-- requetes du chargement du tableau de bord.
--
-- `coalesce(work_mode, 'non_precise')` porte la meme convention que le filtre
-- de lecture (`WORK_MODE_UNSPECIFIED`, dashboard-query.ts) : un `work_mode`
-- nul est une valeur nommee, jamais un silence.
--
-- Cette vue ne rend QUE les valeurs presentes. C'est
-- `getWorkModeCounts` (dashboard-query.ts) qui complete a 0 les valeurs
-- absentes, pour que l'ecran affiche toujours les quatre lignes : une valeur
-- a zero doit se lire « zero », pas disparaitre du panneau.
create or replace view offers_dashboard_work_mode_counts as
select
  coalesce(work_mode, 'non_precise') as work_mode,
  count(*)                           as total
from offers_dashboard
group by 1;

-- `security_invoker` pose des la creation, jamais ajoute apres coup : sans lui
-- la vue s'executerait avec les droits de son proprietaire et rendrait a la
-- cle `anon` ce que le RLS lui refuse par les tables. Voir `20260910020000`
-- (les quatre vues du tableau de bord) et `20260910040000` (les sept autres).
alter view offers_dashboard_work_mode_counts set (security_invoker = on);

-- Les huit valeurs de statut de candidature, chiffrees en UN balayage.
--
-- La barre d'onglets de « Toute la veille » affiche un compte par onglet.
-- Le reflexe a NE PAS avoir sur ce schema serait sept appels
-- `GET /offers?statut=…&pageSize=1` dont seul le `total` est lu : le cout
-- d'une lecture d'`offers_dashboard` NE DEPEND PAS de `pageSize` -- ni le
-- `distinct on` ni les fonctions de fenetrage ne laissent descendre un
-- filtre, donc la vue est integralement materialisee avant que le statut ne
-- retienne quoi que ce soit. Sept nombres couteraient sept balayages du
-- corpus. C'est exactement la lecon de `20260910050000` (work_mode), et
-- CLAUDE.md l'ecrit noir sur blanc.
--
-- `coalesce(candidature_statut, 'aucune')` porte la meme convention que le
-- filtre de lecture (`STATUT_UNDECIDED`, dashboard-query.ts) : une offre sans
-- ligne `offer_applications` est une valeur NOMMEE, jamais un silence.
-- 'aucune' n'entre en collision avec aucune valeur de
-- `offer_applications_status_connu` (a_traiter, retenue, postulee, relancee,
-- entretien, terminee, ecartee).
--
-- Cette vue ne rend QUE les valeurs presentes. C'est `getStatutCounts`
-- (dashboard-query.ts) qui complete a 0 les huit clefs, pour qu'un onglet
-- dont aucune offre ne releve affiche « 0 » plutot que de disparaitre.
create or replace view offers_dashboard_status_counts as
select
  coalesce(candidature_statut, 'aucune') as statut,
  count(*)                               as total
from offers_dashboard
group by 1;

-- `security_invoker` pose des la creation, jamais ajoute apres coup : sans lui
-- la vue s'executerait avec les droits de son proprietaire et rendrait a la
-- cle `anon` ce que le RLS lui refuse par les tables. Voir `20260910020000`,
-- `20260910040000` et `20260910050000`.
alter view offers_dashboard_status_counts set (security_invoker = on);

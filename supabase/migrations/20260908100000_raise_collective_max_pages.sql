-- Le backfill Collective etait tronque : 60 pages plafonnaient la collecte a
-- 1 800 missions sur 6 597 disponibles (`collection_query_results`, run
-- 05f6e113-da62-4b96-ba68-e15aa3213b43, fetched: 1800, total_available: 6597,
-- truncated: true). La fenetre de 31 jours n'etait donc jamais atteinte : les
-- 1 771 offres en base ne remontaient qu'au 2026-08-28, soit 11 jours, pas 31.
--
-- Mesure avant decision (2026-09-08, listing reel, pas d'estimation) : pages
-- 90 a 93 recuperees en direct pour situer la frontiere du 31e jour
-- (2026-08-08). Page 90 : 2026-08-10/11 (dans la fenetre). Page 92 : premiere
-- page dont la date la plus recente (2026-08-07) precede le 2026-08-08 -- c'est
-- la page ou la boucle s'arreterait. Donc une collecte qui couvre reellement
-- 31 jours demande ~92 pages, pas 60.
--
-- Cout d'un plafond a 100 pages (marge de 8 pages au-dessus de la frontiere
-- mesuree, pour absorber la variation quotidienne du volume publie) : le delai
-- de politesse separe deux requetes, pas la premiere -- 99 delais de 3 000 ms,
-- soit environ 5 minutes de temps d'horloge, plus le temps reseau. Ce cout ne
-- se paie qu'en mode backfill (fenetre de 31 jours) : en delta, la fenetre est
-- de 3 jours (`WINDOW_DAYS`), et le run reel de ce jour s'est arrete apres 18
-- pages (540 offres) -- tres en dessous meme de l'ancien plafond de 60. Relever
-- le plafond ne ralentit donc jamais la collecte quotidienne, seule une
-- re-execution ponctuelle du backfill en profite.
--
-- Alternative rejetee : laisser 60 et documenter la troncature comme
-- acceptable. Rejetee parce que le cout mesure d'un plafond correct est
-- minuscule (5 minutes, une fois) au regard du gain (31 jours reels au lieu de
-- 11, sur la source qui porte helas le seul TJM structure du projet) --
-- masquer la troncature aurait ete moins honnete que la corriger.

update sources
   set max_pages_per_run = 100
 where key = 'collective'
   and max_pages_per_run <> 100;

comment on column sources.max_pages_per_run is
  'Plafond de pages de LISTING par requete. Free-Work : 15 pages de 16 offres couvrent la facette react entiere (196 offres). Collective : 100 pages de 30 couvrent reellement 31 jours -- mesure en direct le 2026-09-08, la frontiere du 31e jour tombe page 92 ; les 60 initiales tronquaient le backfill a 11 jours (voir 20260908100000).';

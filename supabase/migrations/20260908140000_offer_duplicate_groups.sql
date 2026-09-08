-- Construit les groupes de doublons et elit un representant par groupe,
-- au-dessus de offer_dedup_keys (tache precedente).
--
-- LES DEUX CLES, ET COMMENT ELLES SE COMBINENT SANS SE CONTREDIRE
--
-- Intra-source : (source, norm_company, norm_title, norm_city). Inter-
-- sources : (norm_company, norm_title), sans ville -- les quatre sources
-- decrivent le lieu a des granularites incompatibles (mesure dans la tache
-- precedente et dans CLAUDE.md).
--
-- Une offre ne doit appartenir qu'a UN SEUL groupe final. Vu comme un graphe
-- ou deux offres sont reliees si elles partagent la cle intra (meme source)
-- OU la cle inter (sources differentes), le groupe final est la composante
-- connexe. Ce graphe a une propriete qui simplifie tout : dans un ensemble
-- d'offres qui partagent (norm_company, norm_title), des qu'AU MOINS DEUX
-- sources sont representees, chaque offre d'une source a une arete directe
-- vers chaque offre de toute autre source (l'egalite de la cle inter ne
-- depend pas de la ville), donc toutes les offres de l'ensemble finissent
-- dans une seule composante, quel que soit le nombre de villes en jeu. Et si
-- une seule source est representee, aucune arete inter n'existe : la
-- composante reste exactement l'intra-groupe. D'ou la regle codee ci-dessous
-- sans avoir a calculer un graphe explicite :
--
--   si (norm_company, norm_title) est vu sur >= 2 sources -> un seul groupe
--   final pour tout cet ensemble, ville ignoree ;
--   sinon -> groupe final = groupe intra (source, company, title, city).
--
-- MESURE -- CANDIDATS INTER, VALIDATION DU CHIFFRE DEJA CONNU
--
-- 48 couples (norm_company, norm_title) sont vus sur au moins 2 sources.
-- C'est exactement le 48 cite dans CLAUDE.md ("Mettre la ville dans la cle
-- inter fait tomber le resultat de 48 groupes a 11"), mesure independamment
-- ici : la construction retrouve le meme chiffre par un chemin different, ce
-- qui la corrobore.
--
-- LE CAS ABSURDE TROUVE EN CONSTRUISANT -- GARDE-FOU AJOUTE
--
-- Fusionner sans condition des que 2 sources partagent (company, title)
-- suppose implicitement qu'une seule mission est en jeu. Deux des 48
-- candidats contredisent cette hypothese, et de la meme facon que le cas
-- Achil qui a motive toute la conception :
--
--   LTd / "Technicien Support Proximite / VIP (H/F)" : France Travail porte
--   CETTE offre sur 9 villes distinctes du 13/83 (Aix, Marseille 1er, Salon-
--   de-Provence, Vitrolles, Toulon...), Adzuna sur 2 libelles de ville
--   distincts pour le meme intitule. ce sont des missions differentes d'un
--   cabinet de recrutement, pas une seule offre vue deux fois.
--
--   SYNANTO Aix en Provence / "Developpeur .Net / Angular (H/F)" : France
--   Travail porte 2 villes (Aix-en-Provence, Marseille 1er), Adzuna 1 libelle
--   vague ("Bouches-du-Rhone, Provence-Alpes-Cote d'Azur") qui recouvre les
--   deux. Fusionner aveuglement aurait mis les 2 postes FT dans le meme
--   groupe final via ce pont Adzuna, alors qu'on ne peut pas dire lequel des
--   deux le pont represente : c'est exactement le risque nomme dans le
--   brief -- un faux positif qui ferait disparaitre une offre reelle.
--
-- Regle retenue : la fusion inter-sources n'est autorisee que si, pour
-- CHAQUE source qui contribue a ce (company, title), cette source ne porte
-- qu'UNE SEULE ville distincte. Des qu'une source en porte plusieurs (Achil-
-- like), la totalite de l'ensemble -- y compris les autres sources --
-- retombe sur le decoupage intra, plutot que de risquer un pont ambigu. Sur
-- les 48 candidats, 46 verifient cette condition et fusionnent (KLANIK,
-- Soors... verifies ci-dessous, coherents), 2 (LTd, SYNANTO) ne la verifient
-- pas et restent decoupes par intra-groupe : 4 lignes LTd et 3 lignes SYNANTO
-- distinctes plutot qu'un seul groupe de 4 et un seul groupe de 3.
--
-- SECOND CAS TROUVE EN CONSTRUISANT -- LA VILLE NULLE N'EST PAS UNE VILLE
--
-- 106 offres sur 3961 ont norm_city NULL (o.city absent malgre company_name
-- present). SQL traite deux NULL comme egaux pour un GROUP BY : sans garde-
-- fou, deux offres de la meme source, meme entreprise, meme intitule, ville
-- absente TOUTES LES DEUX auraient fusionne a tort. Verifie sur un cas reel :
-- PROPULSE IT porte "Expert Infra As Code" et "EXPERT INFRA AS CODE" --
-- meme norm_title apres mise en minuscules, meme source (collective), ville
-- NULL dans les deux cas -- mais deux missions differentes (deux external_id,
-- deux URLs, deux descriptions sans rapport : l'une "Consultant senior...
-- experience de l'I[nfra]", l'autre "expert technique sur l'infra As Code et
-- le CI/CD"). Meme constat sur Sharebound / "Dev Full-stack" (3 offres, 2 a
-- ville NULL, descriptions sans rapport). Correctif : la ville utilisee pour
-- le decoupage intra est coalesce(norm_city, offer_id) -- l'id, unique par
-- construction, ne fusionne jamais deux offres entre elles. Une ville
-- reellement partagee continue de fusionner normalement ; une ville absente
-- ne fusionne plus JAMAIS deux offres au hasard. Choix conforme au risque
-- assume par ce chantier : mieux vaut une paire visible a tort qu'une offre
-- invisible a tort. Verifie apres correctif : Propulse IT et Sharebound
-- rendent chacune des groupes de taille 1, aucune fusion residuelle.
--
-- ELECTION DU REPRESENTANT
--
-- Ordre impose par le cahier des charges, jusqu'au bout pour un ordre total :
-- 1) rate_raw non nul d'abord, 2) description la plus longue, 3) published_at
-- le plus recent (null en dernier), 4) first_seen_at le plus recent, 5) id --
-- sans ce dernier critere, deux executions pourraient elire des representants
-- differents en cas d'egalite parfaite sur les 4 premiers.
--
-- MESURE FINALE, sur les 3961 offres couvertes par offer_dedup_keys :
--   3770 groupes finaux, 191 offres masquees (une seule visible par groupe).
--   Par source (masquees/total) : france_travail 20/589, adzuna 48/556,
--   collective 115/2711, free_work 8/105.
--   Preuve qu'aucun groupe n'a 0 ou 2 representants : requete de controle
--   (group by dup_group_id having count(*) filter (where is_primary) <> 1)
--   -- 0 ligne.
--   Determinisme : le meme calcul, rejoue 3 fois, produit le meme md5 agrege
--   des couples (offer_id, is_primary) -- meme valeur les 3 fois.
--   Achil "Collaborateur Comptable Confirme H/F" : 9 offres, 9 villes
--   distinctes, 9 groupes de taille 1, toutes representantes. Le chiffre
--   mesure est 9, ni le "dix villes" ni le "huit offres" avances avant
--   mesure -- signale dans le rapport de tache plutot que corrige en
--   silence, l'ecart etant dans l'enonce et non dans les donnees ou le code.
--
-- Dix groupes multi-offres tires au hasard et relus un a un (voir rapport de
-- tache pour le detail complet) : aucun faux positif trouve. Les fusions
-- inter-sources vues (KLANIK Marseille 8e/Allauch, Soors Courbevoie) portent
-- sur un seul couple de villes par source, donc hors du garde-fou ci-dessus,
-- et decrivent bien un seul poste sur les deux sources.
create view offer_duplicate_groups as
with keyed as (
  select k.offer_id,
         o.source,
         k.norm_company,
         k.norm_title,
         coalesce(k.norm_city, o.id::text) as city_key,
         o.rate_raw,
         o.description,
         o.published_at,
         o.first_seen_at
  from offer_dedup_keys k
  join offers o on o.id = k.offer_id
),
per_source_city as (
  select norm_company, norm_title, source, count(distinct city_key) as cities_here
  from keyed
  group by norm_company, norm_title, source
),
inter_eligible as (
  select norm_company, norm_title
  from per_source_city
  group by norm_company, norm_title
  having count(distinct source) >= 2 and max(cities_here) = 1
),
grouped as (
  select k.*,
         (ie.norm_company is not null) as use_inter,
         case when ie.norm_company is not null then null else k.source end as group_source,
         case when ie.norm_company is not null then null else k.city_key end as group_city
  from keyed k
  left join inter_eligible ie using (norm_company, norm_title)
),
group_summary as (
  select use_inter, group_source, norm_company, norm_title, group_city,
         count(*) as dup_count,
         array_agg(distinct source order by source) as dup_sources,
         min(first_seen_at) as dup_first_seen_at
  from grouped
  group by use_inter, group_source, norm_company, norm_title, group_city
)
select
  g.offer_id,
  md5(row(g.use_inter, g.group_source, g.norm_company, g.norm_title, g.group_city)::text) as dup_group_id,
  gs.dup_count,
  gs.dup_sources,
  gs.dup_first_seen_at,
  (row_number() over (
     partition by g.use_inter, g.group_source, g.norm_company, g.norm_title, g.group_city
     order by (g.rate_raw is not null) desc,
               length(g.description) desc nulls last,
               g.published_at desc nulls last,
               g.first_seen_at desc,
               g.offer_id
   ) = 1) as is_primary
from grouped g
join group_summary gs
  on gs.use_inter is not distinct from g.use_inter
 and gs.group_source is not distinct from g.group_source
 and gs.norm_company = g.norm_company
 and gs.norm_title = g.norm_title
 and gs.group_city is not distinct from g.group_city;

comment on view offer_duplicate_groups is
  'Groupes de doublons et representant elu, au-dessus de offer_dedup_keys. '
  'Cle intra-source (source, company, title, city) ; cle inter-sources '
  '(company, title) sans ville, appliquee seulement quand chaque source '
  'impliquee ne porte qu''une ville pour ce couple -- sinon repli sur '
  'l''intra, pour ne jamais fusionner a tort plusieurs missions distinctes '
  '(cas Achil, LTd, SYNANTO). Ville NULL traitee comme unique par offre '
  '(jamais fusionnee sur une ville absente partagee). is_primary : une '
  'seule ligne vraie par dup_group_id, ordre total donc deterministe.';

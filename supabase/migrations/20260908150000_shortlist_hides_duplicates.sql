-- La selection quotidienne cesse d'afficher les doublons.
--
-- CE QUI NE MARCHAIT PAS
--
-- offer_duplicate_groups (tache precedente) sait deja dire, pour chaque
-- offre, si elle est le representant elu de son groupe (is_primary), mais
-- rien ne branchait cette information sur offers_ranked ni sur
-- offers_shortlist. La liste que le proprietaire relit chaque matin
-- continuait donc a montrer plusieurs lignes pour le meme poste des qu'il
-- est collecte par plusieurs sources ou reapparait plusieurs fois sur la
-- meme source.
--
-- LE CORRECTIF
--
-- `offers_ranked` gagne quatre colonnes derivees d'un `left join` sur
-- `offer_duplicate_groups` : `dup_count`, `dup_sources`, `dup_first_seen_at`,
-- `is_primary`. Le `left join` est deliberement pas un `join` :
-- `offer_duplicate_groups` ne couvre que les offres avec `company_name`
-- (151 offres sur 4112 en sont exclues, cf. `offer_dedup_keys`), et ces
-- offres sans entreprise ne doivent pas disparaitre pour autant. Sur ces
-- lignes non couvertes, les quatre colonnes prennent une valeur par defaut
-- neutre : `dup_count` 1, `dup_sources` un tableau a un seul element (la
-- source de l'offre), `dup_first_seen_at` son propre `first_seen_at`,
-- `is_primary` vrai. Une offre non groupee est un groupe de taille 1 dont
-- elle est forcement le representant.
--
-- `dup_first_seen_at` est expose sur TOUTES les lignes, groupees ou non
-- (jamais NULL) : la ligne gardee d'un groupe est la plus recente choisie
-- par l'election de la tache precedente, ce qui masque l'anciennete reelle
-- du poste -- or un poste longtemps en ligne est un poste difficile a
-- pourvoir. Cette colonne est la compensation de ce choix, et une colonne
-- qui n'existerait que sur les lignes groupees serait une colonne qu'on
-- oublie de lire.
--
-- `offers_shortlist` ajoute `and o.is_primary` a sa condition : le signal
-- rouge reste eliminatoire, la regle lexicale/IA/confiance ne change pas, la
-- condition d'accessibilite geographique non plus. Le changement ne peut que
-- RETIRER des lignes deja retenues, jamais en ajouter.
--
-- Point technique deja paye deux fois dans ce depot : Postgres refuse un
-- `create or replace view` qui change la liste de colonnes autrement qu'en
-- ajoutant a la fin, et `offers_shortlist` est batie sur `offers_ranked`.
-- Les deux vues sont donc supprimees puis recreees dans l'ordre,
-- `offers_shortlist` en dernier avec son `comment on view` (qui disparait
-- avec la vue).
--
-- MESURE, sur les 4112 offres en base, avant / apres cette migration :
--
--   offers_shortlist, total et par source :
--     avant : 92  (adzuna 51, collective 24, france_travail 14, free_work 3)
--     apres : 85  (adzuna 44, collective 24, france_travail 14, free_work 3)
--
--   7 offres sortent, TOUTES cote adzuna ; aucune source autre qu'adzuna
--   n'est touchee. Verifie par inclusion (l'ensemble des id apres est un
--   sous-ensemble strict de l'ensemble d'avant), pas par soustraction
--   d'entiers. Les 151 offres sans entreprise restent presentes : verifie
--   par une requete dediee (voir rapport de tache), aucune n'a disparu.
--
--   Les 7 offres relues une a une (le detail complet, avec les descriptions
--   comparees, est dans .superpowers/sdd/task-3-report.md) :
--
--   - AMILTONE / "Developpeur Java/Angular (H/F)" (2 lignes adzuna sorties,
--     remplacees par la ligne free_work) : le texte des missions ("Vos
--     missions ? Integre a nos equipes sur notre Factory...") est identique
--     mot pour mot entre free_work et l'une des deux lignes adzuna ; la
--     seconde ligne adzuna montre le debut du meme texte de presentation
--     Amiltone tronque avant la section missions. Meme poste, JUSTIFIE.
--   - CN Amirault / "Staff Engineer Back-End Node.js H/F" (1 ligne adzuna
--     sortie, remplacee par la ligne france_travail) : ouverture du texte
--     identique mot pour mot ("Rejoignez une startup geniale dans la
--     fintech..."). Meme poste, JUSTIFIE.
--   - KLANIK / "Ingenieur IA (H/F)" (2 lignes adzuna sorties, remplacees par
--     la ligne france_travail) : le texte complet cote france_travail
--     contient mot pour mot les deux fragments tronques a 500 caracteres
--     cote adzuna (le debut du texte de presentation KLANIK, ET la section
--     mission sur les agents IA autonomes). Meme poste, JUSTIFIE.
--   - Akanea / "Developpeur - h/f" (1 ligne adzuna sortie, remplacee par la
--     ligne france_travail) : les deux lignes adzuna du groupe (dont celle
--     qui sort) partagent un texte tronque a 500 caracteres strictement
--     identique, qui ne depasse jamais le paragraphe de presentation
--     d'entreprise -- la partie specifique au poste n'est jamais recue
--     d'aucune des deux. DOUTE NON RESOLU : rien ne prouve que la mission
--     france_travail (maintenance Java/.NET d'applications web) soit la
--     MEME mission que celle des deux lignes adzuna plutot qu'une mission
--     voisine chez le meme employeur (300 salaries, plusieurs equipes de
--     developpement). Signale plutot que tranche, voir rapport de tache.
--   - Malt / "Senior Fullstack Engineer" (1 ligne adzuna sortie, remplacee
--     par une autre ligne adzuna du meme groupe) : DOUTE CONCRET. Les deux
--     descriptions ne se recoupent sur AUCUNE phrase -- l'une decrit des
--     responsabilites de poste ("Think product-first... You'll own your
--     features end-to-end"), l'autre est un texte de recrutement generique
--     sur Malt en tant que marketplace ("Malt is Europe's leading freelance
--     marketplace... connecting over 1,000,000 freelancers"). Meme
--     entreprise, meme intitule generique, meme ville vague ("Paris,
--     Ile-de-France"), publiees a 8 jours d'ecart : le risque nomme dans
--     CLAUDE.md et dans la tache precedente (Achil, LTd, SYNANTO) -- une
--     entreprise qui diffuse plusieurs missions distinctes sous un intitule
--     generique -- n'est ici couvert par AUCUN garde-fou existant, les deux
--     lignes partageant la meme ville. Cette offre disparait sans preuve
--     qu'elle soit un doublon. A traiter en tache 4.

drop view offers_shortlist;
drop view offers_ranked;

create view offers_ranked as
select o.*,
       coalesce(s.score, 0)                       as score,
       coalesce(s.matched_terms, '{}'::text[])    as matched_terms,
       coalesce(s.core_hits, 0)                   as core_hits,
       coalesce(s.ai_hits, 0)                     as ai_hits,
       coalesce(s.red_flags, 0)                   as red_flags,
       haversine_km(43.2965, 5.3698, o.latitude, o.longitude) as distance_marseille_km,
       coalesce(fbq.labels, '{}'::text[])         as found_by_labels,
       coalesce(fbq.trusted, false)               as trusted_query,
       coalesce(dg.dup_count, 1)                       as dup_count,
       coalesce(dg.dup_sources, array[o.source])       as dup_sources,
       coalesce(dg.dup_first_seen_at, o.first_seen_at) as dup_first_seen_at,
       coalesce(dg.is_primary, true)                   as is_primary
from offers o
left join offer_lexical_score s on s.offer_id = o.id
left join lateral (
  -- `labels` ne filtre pas sur `enabled` : la provenance est un fait
  -- historique. `trusted` le fait : la confiance, elle, se retire.
  select array_agg(sq.label order by sq.label)             as labels,
         bool_or(sq.trust = 'anchored' and sq.enabled)     as trusted
  from search_queries sq
  where sq.id = any (o.found_by_query_ids)
) fbq on true
left join offer_duplicate_groups dg on dg.offer_id = o.id;

create view offers_shortlist as
select o.*,
       case
         when o.department in ('13', '83', '84') then 'local'
         when o.remote_label = 'full'            then 'full remote'
       end as acces
from offers_ranked o
where o.red_flags = 0
  and (o.core_hits >= 1 or o.ai_hits >= 1 or o.trusted_query)
  and (o.department in ('13', '83', '84') or o.remote_label = 'full')
  and o.is_primary;

comment on view offers_shortlist is
  'Offres retenues : sans signal rouge, portant React/TypeScript/Next.js, ou '
  'un signal IA, ou trouvees par une requete de confiance ENCORE ACTIVE '
  '(search_queries.trust = anchored et enabled), et soit dans les '
  'departements 13/83/84, soit en full remote, et representant elu de son '
  'groupe de doublons (is_primary, cf. offer_duplicate_groups). '
  'Trier par score desc, published_at desc.';

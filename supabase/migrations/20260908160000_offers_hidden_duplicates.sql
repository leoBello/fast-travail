-- La contrepartie du masquage : rien ne se perd.
--
-- POURQUOI CETTE VUE EXISTE
--
-- La migration precedente restreint offers_shortlist aux representants de
-- groupe. Sur les 92 offres de la selection, 7 disparaissent. La lecture a la
-- main de ces 7, exigee par le plan, a donne 5 doublons averes, 1 plausible
-- mais non prouve (Akanea, dont les deux annonces Adzuna ne montrent que du
-- texte de presentation d'entreprise dans les 500 caracteres recus), et
-- 1 FAUX POSITIF PROBABLE : deux annonces Malt « Senior Fullstack Engineer »
-- dont les textes n'ont aucun recouvrement — l'une decrit des
-- responsabilites concretes, l'autre est de la communication de plateforme.
-- Un intitule generique et une ville vague ont masque ce qui ressemble a deux
-- missions distinctes.
--
-- Le cout de ce projet est asymetrique et l'utilisateur l'a pose comme tel :
-- une offre affichee en trop se repere d'un coup d'oeil, une offre JAMAIS
-- AFFICHEE est perdue. Masquer sans recours aurait donc echange un gain de
-- 7 lignes sur 92 contre le risque de rendre une mission reelle invisible,
-- sans que rien ne le signale.
--
-- LA DECISION, prise par l'utilisateur sur cette mesure
--
-- On masque, mais rien ne se perd. Le representant porte deja `dup_count`,
-- qui dit « 2 annonces » au lieu de laisser croire a une annonce unique. Et
-- cette vue rend consultables, en une requete, les offres ecartees et le
-- representant qui les remplace. Un faux positif coute alors une curiosite,
-- pas une offre.
--
-- COMMENT S'EN SERVIR
--
--   select * from offers_hidden_duplicates order by remplacee_par_titre;
--
-- Et pour ne regarder que ce qui a ete ecarte de la selection du jour, la
-- colonne `etait_eligible` dit si l'offre masquee aurait de toute facon
-- satisfait les criteres de offers_shortlist : c'est le seul sous-ensemble
-- qui change quelque chose a la lecture quotidienne.

create view offers_hidden_duplicates as
select o.id                     as offer_id,
       o.source,
       o.title,
       o.company_name,
       o.city,
       o.url,
       o.published_at,
       o.first_seen_at,
       g.dup_group_id,
       g.dup_count,
       g.dup_sources,
       -- Le representant qui l'a emporte, pour pouvoir comparer d'un coup
       -- d'oeil sans avoir a rejoindre soi-meme.
       p.id                     as remplacee_par_id,
       p.source                 as remplacee_par_source,
       p.title                  as remplacee_par_titre,
       p.url                    as remplacee_par_url,
       -- Vrai si cette offre masquee satisfaisait par elle-meme les criteres
       -- de la selection quotidienne. Les autres n'y seraient jamais entrees,
       -- doublon ou pas : les distinguer evite de confondre « ecartee comme
       -- doublon » et « jamais retenue ».
       (r.red_flags = 0
         and (r.core_hits >= 1 or r.ai_hits >= 1 or r.trusted_query)
         and (r.department in ('13', '83', '84') or r.remote_label = 'full')
       )                        as etait_eligible
from offer_duplicate_groups g
join offers o        on o.id = g.offer_id
join offers_ranked r on r.id = g.offer_id
join offer_duplicate_groups gp on gp.dup_group_id = g.dup_group_id and gp.is_primary
join offers p        on p.id = gp.offer_id
where not g.is_primary;

comment on view offers_hidden_duplicates is
  'Les offres ecartees comme doublons, avec le representant qui les remplace. '
  'Contrepartie du masquage de offers_shortlist : rien ne se perd, un faux '
  'positif coute une curiosite et pas une offre. La colonne etait_eligible '
  'isole celles qui auraient de toute facon figure dans la selection.';

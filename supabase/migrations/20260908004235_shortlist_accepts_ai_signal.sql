-- L'IA devient un billet d'entree, a l'egal de React.
--
-- CE QUI NE MARCHAIT PAS
--
-- La vue exigeait `core_hits >= 1`, donc la presence explicite de React,
-- TypeScript ou Next.js. Deux effets se combinaient pour rendre la selection
-- trop etroite.
--
-- D'abord, Adzuna tronque TOUTE description a 500 caracteres — mesure sur 50
-- offres : min 500, mediane 500, max 500. La stack technique figure presque
-- toujours plus loin dans le texte, donc le lexique ne la voit jamais. Sur les
-- 476 offres Adzuna collectees, 7 SEULEMENT ont un `core_hits`, alors que 76
-- sont en full remote. Trois offres sur soixante-seize entraient dans la
-- selection.
--
-- Ensuite, et c'est le fond du probleme, l'IA et le developpement agentique
-- sont des DIFFERENCIATEURS du profil, pas des competences secondaires. Or une
-- offre « Ingenieur Agentique FullStack » ou « AI Developer » n'a aucun
-- `core_hits` : elle ne nomme ni React ni TypeScript dans ce qu'on recoit.
-- Elle etait donc invisible, alors qu'elle vise exactement le profil.
--
-- LE CORRECTIF
--
-- `core_hits >= 1 OR ai_hits >= 1`. Le signal rouge reste eliminatoire, et la
-- condition d'accessibilite geographique ne change pas.
--
-- MESURE sur les 1176 offres en base : la selection passe de 12 a 31 offres.
-- Sur les 19 offres ajoutees, comptees a la main : 10 franchement pertinentes
-- (Architecte solutions IA a 21 points a Marseille, Architecte Solutions
-- Data & IA chez KLANIK, AI Developer et Developpeur IA Generative en full
-- remote, Ingenieur Agentique FullStack en full remote), 4 adjacentes (Data
-- Engineer, Backend developer, DevOps) et 5 hors sujet (Banque a Distance,
-- radio logicielle, reglementation nucleaire, Marketing). Le classement par
-- score relegue ces dernieres en bas, ou elles se reperent d'un coup d'oeil.
--
-- PREALABLE INDISPENSABLE, DEJA APPLIQUE
--
-- Cette ouverture n'etait pas tenable avant les migrations 20260908003545 et
-- 20260908003753, qui ont corrige deux collisions de lemmatisation francaise
-- polluant `ai_hits`. Avant elles, la meme regle ramenait 42 offres au lieu de
-- 31, dont « AGENT DE PRODUCTION (POSTE APRES MIDI 13H 21H) », « Gestionnaire
-- facturation » et « Charge(e) Prepaie » : le stemmer francais confondait
-- « agentique » et « agent », et « prompt » captait l'adjectif francais.
-- Ouvrir le filtre sur un signal pollue aurait noye la selection.
--
-- Effet immediat sur les offres deja collectees : aucune re-collecte, la vue
-- se recalcule seule.

create or replace view offers_shortlist as
select o.*,
       case
         when o.department in ('13', '83', '84') then 'local'
         when o.remote_label = 'full'            then 'full remote'
       end as acces
from offers_ranked o
where o.red_flags = 0
  and (o.core_hits >= 1 or o.ai_hits >= 1)
  and (o.department in ('13', '83', '84') or o.remote_label = 'full');

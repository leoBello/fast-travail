-- Matrice de requetes Adzuna, etablie sur des volumes MESURES le 2026-09-08.
--
-- POURQUOI CETTE MATRICE NE RESSEMBLE PAS A CELLE DE FRANCE TRAVAIL
--
-- Adzuna tronque TOUTE description a 500 caracteres : mesure sur 50 offres,
-- longueur min 500, mediane 500, max 500, et 50 sur 50 finissent par « … ».
-- Le lexique de competences (skill_lexicon), qui est le filtre principal pour
-- France Travail, ne voit donc que ce debut de texte — or la stack technique
-- et les conditions de teletravail figurent presque toujours plus loin dans
-- une annonce : sur ces 50 offres, 1 seule mentionne « react » et 1 seule
-- mentionne « teletravail » dans ce qu'on recoit.
--
-- Mais l'index d'Adzuna, lui, voit le texte integral : sur 19 offres rendues
-- par what_phrase='full remote', 13 ne portent PAS la locution dans les 500
-- caracteres recus. Adzuna l'a pourtant trouvee.
--
-- Consequence : sur Adzuna, LA REQUETE EST LE FILTRE — l'inverse exact de
-- France Travail, ou l'index de l'API est inutilisable et ou notre lexique
-- fait le travail. D'ou des requetes precises ici, et non un ratissage large.
--
-- POURQUOI `React` N'APPARAIT JAMAIS SEUL
--
-- Le lemmatiseur francais d'Adzuna ramene « React » et « reacteur » au meme
-- radical. Mesure : what_and=React a Marseille rend 60 offres, dont 8 titres
-- de reacteurs nucleaires, et 1 seule contenant « react » comme mot. Preuve
-- de la collision : what_and=React&what_exclude=reacteur rend 0 offre —
-- l'exclusion emporte aussi les vraies offres React. React n'est donc
-- utilise qu'ANCRE a un second terme (TypeScript) ou a une locution exacte.
--
-- Le lexique n'est pas menace pour autant : « react » y est en match_type
-- 'fts', et la recherche plein texte francaise ne confond pas les deux
-- radicaux (verifie en base). Le bruit est collecte puis ecarte.
--
-- LES DEUX AXES RESTENT SEPARES, jamais combines : a Marseille, category
-- =it-jobs rend 385 offres sur 31 jours et les requetes par terme technique
-- en rendent d'autres que la categorie ne classe pas « informatique ».
-- Les combiner perdrait l'essentiel des secondes.
--
-- Volumes mesures, fenetre 3 j / 31 j, notes en commentaire de chaque ligne.
-- Rappel : la fenetre reelle vient de WINDOW_DAYS[mode] cote code (3 en
-- delta, 31 en backfill) ; published_since_days est conserve au defaut.

insert into search_queries
  (source, label, keywords, commune_insee, radius_km, extra_params, published_since_days, priority)
values
  -- ---------------------------------------------------------------------
  -- AXE LOCAL : Marseille, rayon 40 km (rayon valide empiriquement sur
  -- France Travail : 20 km=136, 40=196, 70=212, 100=272 offres).
  -- ATTENTION : le raisonnement sur les priorites qui figurait ici etait FAUX.
  -- Il est corrige par la migration 20260907234512_fix_adzuna_priority_order.
  -- Seuls ces commentaires ont ete rectifies apres application (un commentaire
  -- est inerte, le SQL execute n'a pas change) ; les valeurs, elles, sont
  -- corrigees par la migration suivante et non ici.
  -- ---------------------------------------------------------------------
  ('adzuna', 'adzuna:local:react-ts',    'React TypeScript',      '13055', 40, '{}'::jsonb,                     3,  5),  --  2 / 5
  ('adzuna', 'adzuna:local:typescript',  'TypeScript',            '13055', 40, '{}'::jsonb,                     3, 10),  --  3 / 11
  ('adzuna', 'adzuna:local:nextjs',      'Next.js',               '13055', 40, '{}'::jsonb,                     3, 10),  --  0 / 2
  ('adzuna', 'adzuna:local:javascript',  'JavaScript',            '13055', 40, '{}'::jsonb,                     3, 15),  --  3 / 19
  ('adzuna', 'adzuna:local:dev-front',   'développeur front-end', '13055', 40, '{}'::jsonb,                     3, 20),  --  6 / 20
  ('adzuna', 'adzuna:local:dev-web',     'développeur web',       '13055', 40, '{}'::jsonb,                     3, 25),  --  4 / 36

  -- Le filet large. Bruyant et non filtrable faute de texte (Java, Angular,
  -- infra, paie s'y melent), mais c'est le seul rattrapage d'une offre
  -- pertinente dont le titre ne porte aucun terme technique reconnaissable.
  -- Sa priorite est corrigee par la migration suivante : voir l'avertissement
  -- en tete de l'axe local.
  ('adzuna', 'adzuna:local:it-jobs',     null,                    '13055', 40, '{"category":"it-jobs"}'::jsonb, 3, 90),  -- 77 / 385

  -- ---------------------------------------------------------------------
  -- AXE REMOTE NATIONAL : full remote VRAI PAR CONSTRUCTION.
  --
  -- Hors zone marseillaise, seul le full remote est exploitable — l'hybride
  -- « 2 jours sur site » a Paris ne l'est pas. Or classifyRemote ne peut pas
  -- trancher sur 500 caracteres tronques. La garantie vient donc de la
  -- requete : what_phrase impose la locution exacte dans le texte INTEGRAL,
  -- et implies_remote='full' dit au mapper de combler le silence des 500
  -- caracteres recus. Le texte garde le dernier mot quand il dit quelque
  -- chose : une offre affichant « teletravail : 2 jours » reste 'hybride'.
  --
  -- La locution retenue est « full remote », en anglais et sans accent :
  -- mesure, les locutions accentuees ou porteuses de « % » ne se combinent
  -- pas a what_and (« teletravail complet » + TypeScript rend 0, alors que
  -- « teletravail complet » seul rend 63).
  -- ---------------------------------------------------------------------
  ('adzuna', 'adzuna:remote:fr-dev',   'développeur', null, null, '{"what_phrase":"full remote","implies_remote":"full"}'::jsonb, 3, 50),  -- 34 / 63
  ('adzuna', 'adzuna:remote:fr-ts',    'TypeScript',  null, null, '{"what_phrase":"full remote","implies_remote":"full"}'::jsonb, 3, 50),  --  7 / 19
  ('adzuna', 'adzuna:remote:fr-react', 'React',       null, null, '{"what_phrase":"full remote","implies_remote":"full"}'::jsonb, 3, 55),  --  6 / 15
  ('adzuna', 'adzuna:remote:fr-js',    'JavaScript',  null, null, '{"what_phrase":"full remote","implies_remote":"full"}'::jsonb, 3, 55)   --  5 / 12
on conflict (label) do nothing;

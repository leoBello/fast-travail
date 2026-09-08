-- Poser la normalisation qui rendra deux libelles comparables, et prouver
-- qu'elle ne fusionne rien a tort avant de batir le dedoublonnage dessus.
--
-- LE RISQUE PROPRE A CETTE VUE
--
-- Une normalisation trop large masquerait en silence une offre pertinente :
-- Collective diffuse pour des reseaux de recrutement, et "Collaborateur
-- Comptable Confirme H/F" chez Achil y parait dans au moins 9 villes
-- distinctes (Manosque, Aubiere, Bourg-Saint-Maurice, Claye-Souilly,
-- Aix-en-Provence, Annecy, Cagnes-sur-Mer, Dunkerque, La Valette-du-Var) :
-- 9 postes differents, a ne jamais fusionner. Verifie sur ces 9 lignes :
-- norm_company et norm_title sont identiques (comme voulu, c'est la meme
-- offre-type), mais norm_city les 9 fois distinct. La cle de dedoublonnage
-- (tache suivante, sur les trois colonnes) les garde donc separees.
--
-- MESURE 1 -- SUFFIXE DE GENRE DU TITRE
--
-- Sur les 4112 offres en base, lower(regexp_replace(title, suffixe H/F ou
-- F/H en fin de chaine, '', 'i')) fusionne 139 groupes, regroupant 309
-- libelles distincts (avant normalisation) en 139 apres. Echantillon des 15
-- plus gros groupes relu integralement : "Developpeur Java" / "Developpeur
-- JAVA" / "Developpeur Java (H/F)" / "Developpeur JAVA (H/F)" / "Developpeur
-- Java H/F" (5 variantes) ; "Data Analyst", "Data Engineer", "Technicien
-- support informatique", "Comptable fournisseurs", "DevOps", "Chef de projet
-- IT", "Administrateur systemes et reseaux", "Developpeur C# .Net",
-- "Developpeur .NET / Angular", "Ingenieur DevOps", "Comptable",
-- "Collaborateur comptable", "Business Analyst", "Comptable general" : dans
-- les 15 groupes, chaque variante n'est que casse + presence/absence du
-- suffixe de genre, jamais un intitule different. Recherche explicite de
-- contre-exemple : liste des 17 suffixes reellement captures par le motif
-- sur toute la base (" H/F", " (H/F)", "F/H", " (F/H)", " h/f", " (h/f)" et
-- variantes d'espacement) -- aucun ne capture autre chose qu'un marqueur de
-- genre. Regle jugee sure.
--
-- MESURE 2 -- PREFIXE NUMERIQUE DE VILLE
--
-- lower(trim(regexp_replace(city, prefixe numerique de tete, ''))) fusionne
-- 74 groupes, regroupant 169 libelles de ville distincts en 74. Echantillon
-- des 15 plus gros groupes relu integralement ("Venelles", "Paris", "Lyon",
-- "Montpellier", "Nice", "Ollioules", "Massy", "Marignane", "Meyreuil",
-- "Bordeaux", "Nantes", "Caen", "Niort", "Chatillon", "Nanterre") : toujours
-- la meme ville, sous forme "NN - Ville", "CODE_POSTAL Ville" ou "Ville" nu.
--
-- Piege verifie plutot que suppose : une ville dont le nom commence par un
-- nombre existe bel et bien -- "10eme Arrondissement, Paris" (3 offres). Le
-- motif ^[0-9]{2,5}\s*-?\s* y capture "10" (2 chiffres, satisfait {2,5}) et
-- le reduit a "eme Arrondissement, Paris", ce qui est une corruption du
-- libelle. Verifie qu'elle ne provoque PAS de fusion aujourd'hui : aucune
-- autre ville de la base ne normalise vers "eme arrondissement, paris" (une
-- seule ligne trouvee). Les arrondissements a un chiffre ("1er", "2eme",
-- "8eme", "9eme Arrondissement, Paris") ne sont eux pas touches : un seul
-- chiffre ne satisfait pas le minimum {2,5} du motif. Le risque est donc
-- reel mais dormant : un futur "11eme" ou "20eme Arrondissement, Paris"
-- fusionnerait avec "10eme" sous la meme cle. Decision : garder le motif
-- exact du cahier des charges (le format "NN - Ville" qu'il vise est tres
-- majoritaire et mesure sans aucune fausse fusion), et consigner ce cas
-- comme limite connue plutot que de le corriger hors perimetre de la tache.
--
-- MESURE 3 -- EXCLUSION FAUTE D'ENTREPRISE
--
-- 151 offres sur 4112 ont company_name nul ou vide, et sont donc exclues du
-- dedoublonnage (sans entreprise la cle n'a pas de sens). Repartition par
-- source : france_travail 150 sur 739, adzuna 1 sur 557, collective 0 sur
-- 2711, free_work 0 sur 105.
--
-- unaccent (mesure, non installe) : en approximant le pliage d'accents par
-- translate() sur les voyelles et consonnes francaises courantes, seuls 3
-- groupes de ville ("Gemenos"/"Gemenos accentue", "Ile-de-France"/"Ile-de-
-- France accentue", "Merignac"/"Merignac accentue") et 2 groupes d'entreprise
-- ("Reseau Talents"/variante accentuee, "Skilloe"/variante accentuee)
-- gagneraient a etre fusionnes en plus. Gain mesure reel mais marginal ; ne
-- justifie pas d'installer l'extension pour cette tache -- decision a part
-- si besoin.
create view offer_dedup_keys as
select o.id                                                            as offer_id,
       lower(trim(o.company_name))                                     as norm_company,
       lower(regexp_replace(trim(o.title), '\s*\(?(h/?f|f/?h)\)?\s*$', '', 'i')) as norm_title,
       lower(trim(regexp_replace(o.city, '^[0-9]{2,5}\s*-?\s*', '')))  as norm_city
from offers o
where o.company_name is not null
  and trim(o.company_name) <> '';

comment on view offer_dedup_keys is
  'Cles de comparaison pour le dedoublonnage (tache suivante) : '
  'norm_company/norm_title/norm_city, en minuscules, sans suffixe de genre '
  'ni prefixe numerique de ville. Exclut les offres sans company_name '
  '(null ou vide) : sans entreprise la cle ne veut rien dire.';

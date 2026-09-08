-- Resserre le terme 'prompt', qui captait un adjectif francais courant.
--
-- LE DEFAUT
--
-- 'prompt' etait cense reperer le « prompt engineering ». Mais « prompt » est
-- aussi un adjectif francais ordinaire, et les offres d'emploi en abusent :
--   « une industrie a la pointe de la technologie, PROMPTE a valoriser
--     l'initiative et l'engagement de ses collaborateurs »
-- Cet extrait provient d'une offre intitulee « AGENT DE PRODUCTION (POSTE
-- APRES MIDI 13H 21H) », qui recevait ainsi +3 points de signal IA.
--
-- Contrairement a la collision « agentique » / « agent », changer de
-- match_type n'aide pas ici : les DEUX modes sont pollues.
--   plainto_tsquery('french','prompt')  ->  8 offres
--   ilike '%prompt%'                    ->  8 offres
-- Sur ces 8, trois seulement relevent de l'IA.
--
-- LE CORRECTIF, ET LA PREUVE QU'IL NE COUTE RIEN
--
-- Remplacer 'prompt' par la locution 'prompt engineering'. Verifie terme par
-- terme : toutes les offres reellement IA conservent d'autres signaux du
-- lexique, donc aucune n'est perdue.
--   AI-Native Web Developer          -> ia generative, claude
--   Consultant AI Apps Microsoft     -> ia generative, openai, copilot, rag, llm
--   Developpeur Python IA            -> rag, llm, ia generative, openai
--   DEVELOPPEUR SENIOR .NET/WORKFLOWS AGENTIQUES -> llm, agentique, agentic, ia generative
--   Charge de projets digitaux, IA   -> ia generative
-- Les trois offres qui perdent TOUT signal IA sont exactement les faux
-- positifs : « AGENT DE PRODUCTION », « Assistant(e) DATA & Etudes en
-- urbanisme commercial » et « Developpeur informatique ».
--
-- 'prompting' et 'few-shot' ont ete mesures a 0 occurrence : les ajouter
-- serait du code mort. On s'abstient (YAGNI).
--
-- Effet immediat sur les offres deja collectees : le score est une VUE.

update skill_lexicon
set term = 'prompt engineering'
where term = 'prompt';

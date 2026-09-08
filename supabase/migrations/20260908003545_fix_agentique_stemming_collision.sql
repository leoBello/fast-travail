-- Corrige une collision de lemmatisation francaise qui gonflait les scores.
--
-- LE DEFAUT
--
-- Le terme 'agentique' etait en match_type 'fts', donc evalue par
-- `plainto_tsquery('french', 'agentique')`. Or le stemmer francais Snowball
-- reduit « agentique » et « agent » au MEME radical. Dans un corpus d'offres
-- d'emploi, ou « agent de production », « agent commercial » et « agent de
-- planning » sont partout, la consequence est massive.
--
-- MESURE sur les 1176 offres collectees :
--   plainto_tsquery('french','agentique')  ->  46 offres
--   ilike '%agentique%'                    ->  14 offres
-- Soit 32 FAUX POSITIFS, chacun credite de +3 points. Exemples reels :
-- « AGENT DE PRODUCTION (POSTE APRES MIDI 13H 21H) » a 7 points et 2 ai_hits,
-- « Gestionnaire facturation », « Charge(e) Prepaie », « Gestionnaire de
-- production ferroviaire ». Aucune de ces offres n'a le moindre rapport avec
-- l'IA agentique.
--
-- C'est la meme classe de defaut que la collision « React » / « reacteur »
-- deja documentee dans CLAUDE.md, sur un autre terme : la lemmatisation
-- francaise rapproche des radicaux qui n'ont rien a voir dans notre domaine.
--
-- LE CORRECTIF
--
-- Passer 'agentique' en 'ilike'. Aucun mot francais ne contient « agentique »
-- comme sous-chaine sauf lui-meme et son pluriel, donc la recherche par
-- sous-chaine est ici PLUS PRECISE que la recherche plein texte. Les 14
-- correspondances restantes sont de tres bonne qualite : « Developpeur IA
-- Agentique », « Ingenieur Agentique FullStack », « Ingenieur en IA
-- Generative et Systemes Multi-Agents ».
--
-- POURQUOI PAS L'INVERSE POUR TOUS LES TERMES : verifie terme par terme, le
-- choix depend du mot. 'rag' DOIT rester en 'fts' : en 'ilike' il matcherait
-- 282 offres (« cadRAGe », « encadRAGement »). Mesures :
--   agentique  fts=46  ilike=14   -> ilike gagne
--   rag        fts=9   ilike=282  -> fts gagne, largement
--   prompt     fts=8   ilike=8    -> equivalents
--   llm        fts=14  ilike=17   -> equivalents
--   mcp        fts=5   ilike=5    -> equivalents
--
-- AJOUT : 'agentic', la forme anglaise, presente dans 6 offres et qu'aucun
-- terme ne captait. En 'ilike' pour la meme raison, et parce qu'elle est
-- incluse dans « agentics » comme dans « agentic AI ».
--
-- Effet immediat sur les offres deja collectees : le score est une VUE, il se
-- recalcule seul. Aucune re-collecte, aucun redeploiement.

update skill_lexicon
set match_type = 'ilike'
where term = 'agentique';

insert into skill_lexicon (term, category, weight, match_type, enabled)
values ('agentic', 'ai', 3, 'ilike', true)
on conflict (term) do nothing;

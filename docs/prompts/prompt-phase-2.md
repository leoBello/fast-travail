Tu démarres la **phase 2** de `fast-travail`, dans `c:\Users\Léo\Workspace\fast-travail`.
C'est une veille automatisée d'offres d'emploi que j'utilise pour de vrai, pour trouver
un poste rapidement. Toute décision qui ne sert pas cet objectif est reportée.

**On commence par un brainstorming, pas par du code.** J'ai des changements en tête sur
cette phase et je veux qu'on les explore avant d'écrire quoi que ce soit. Ne me propose
pas de plan avant qu'on ait discuté.

## Lis d'abord

Dans cet ordre, et ne me redemande pas ce qu'ils contiennent — ils sont tenus à jour et
leurs chiffres ont été vérifiés en base :

1. `CLAUDE.md` — les règles du dépôt, non négociables
2. `docs/ETAT.md` — l'état exact, les problèmes ouverts, les décisions déjà tranchées
3. `docs/RESTE-A-FAIRE.md` — ce qui reste, avec coût et priorité
4. `docs/ROADMAP.md` — **mais voir l'avertissement ci-dessous**

## L'avertissement qui compte le plus

**Le `ROADMAP` ne fait plus foi tel quel sur la phase 2.** Il la décrit comme « faire lire
chaque offre retenue par Claude Haiku pour juger l'adéquation au CV », avec une table de
profil / CV structuré. C'est le point de départ historique, pas la cible. J'ai des
changements prévus. Traite ce texte comme une intention initiale à réinterroger, pas
comme un cahier des charges.

## Où en est le projet

La **phase 1 est close**. Quatre sources collectent seules, PC éteint : France Travail et
Adzuna en Edge Functions Deno déclenchées par `pg_cron` (6 h et 6 h 30), Free-Work et
Collective.work en scrapers Deno lancés par le Planificateur Windows.

En base : **4 112 offres**, **87 retenues** par la vue `offers_shortlist`, 221 tests verts.

Quatre chantiers livrés et fusionnés depuis : la confiance par requête, le plan B des
scrapers, le dédoublonnage, et trois réglages de perf et de justesse.

## Les faits mesurés qui doivent orienter la conception de la phase 2

Ceux-là ne sont pas des opinions, ils ont été mesurés et ils ont déjà démenti des
suppositions du design initial.

**Le pré-filtre est stable et rapide.** `offers_shortlist` rend 87 offres en **0,76 s**.
C'était 3,7 s il y a quelques heures ; le coût reste linéaire en offres × termes du
lexique, mais avec une constante bien plus petite. C'est ce qui débloque la phase 2 :
son modèle de coût — combien d'offres méritent un appel payant — repose entièrement sur
cette vue, et ce contrat vient enfin de cesser de bouger.

**Adzuna tronque toute description à 500 caractères.** Mesuré sur 50 offres : min 500,
médiane 500, max 500. **46 des 87 offres retenues viennent d'Adzuna.** Un scoring qui
lit `description` verra donc un texte amputé sur plus de la moitié de la sélection, et
ne le saura pas s'il ne le vérifie pas. Ne tente jamais de compenser cette troncature
par du code : c'est impossible, c'est mesuré, et le tenter serait un défaut de
conception. La parade existante est la **confiance par requête** — une offre est retenue
par la requête qui l'a trouvée quand son texte se tait.

**`rate_raw` porte 1 373 TJM**, dont 1 339 venant de Collective. C'était une colonne
morte il y a une semaine. Pour du freelance, c'est une entrée que le scoring devrait
exploiter — et aucune des deux API ne la fournit jamais.

**Le gisement est national et full remote.** Le marché React marseillais est réellement
petit : les quatre sources concordent, le local est dominé par Angular et Java. Ce n'est
pas un défaut d'outillage, c'est une contrainte de marché, et elle est consignée pour
qu'aucune session n'aille « réparer » la matrice de requêtes.

**La sélection porte des colonnes que la phase 2 peut exploiter** : `score` et
`matched_terms` (le lexique), `found_by_labels` et `trusted_query` (quelle requête a
trouvé l'offre, et si elle est ancrée à une technologie), `dup_count` et
`dup_first_seen_at` (en combien d'exemplaires le poste a été vu, et depuis quand — un
signal de poste difficile à pourvoir), `acces` (local ou full remote).

## Le profil visé

Développeur **front-end React / TypeScript**, zone Marseille / Aix-en-Provence ou full
remote national, avec **l'IA et le développement agentique comme différenciateurs
assumés**. Angular, Vue ou Java = adjacent. Commercial, marketing, paie, support,
pédagogie = hors sujet.

## Le critère qui gouverne toutes les décisions de ce dépôt

**Le coût est asymétrique.** Une offre affichée en trop se repère d'un coup d'œil ; une
offre **jamais affichée** est perdue. Ce qui fait rater une offre passe donc toujours
devant ce qui fait perdre du temps. Ce critère a déjà tranché plusieurs arbitrages, et
il tranchera ceux de la phase 2.

## Comment je veux que tu travailles

**Pilotage par sous-agents, c'est une exigence.** Un sous-agent implémenteur par tâche,
une revue par un agent distinct après chaque tâche — sur conformité **et** sur qualité —
et une revue large de toute la branche à la fin. Utilise la compétence
`subagent-driven-development`. Écris des tests.

Les revues trouvent du vrai : sur les quatre derniers chantiers, elles ont inversé une
décision, trouvé deux défauts critiques qui faisaient disparaître des offres en silence,
et démonté deux affirmations fausses que j'avais moi-même écrites. Ne les traite pas
comme une formalité.

**Tiens `docs/ETAT.md` à jour** : chaque tâche finie, chaque problème découvert, chaque
décision prise y va. C'est le document qui permet de reprendre après une interruption.

Zéro erreur de lint, zéro erreur de formatage, zéro test rouge, et **aucun contournement
du linter** — `CLAUDE.md` liste ce qui est interdit et pourquoi. Si le linter signale
quelque chose, le code change, pas la règle.

## Les pièges qui m'ont coûté du temps — ne les repaie pas

- **Deno est hors du PATH.** Toute commande `deno` ou `npm run` doit être précédée, dans
  le **même** appel shell, de :
  `export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links"`
  L'état du shell ne persiste pas entre deux appels.
- **Pour interroger la base** : `npx supabase db query --linked "<SQL>"`. Le drapeau
  `--linked` est **obligatoire** — sans lui la commande cible une base locale inexistante
  et échoue sur un refus de connexion trompeur. Passe le SQL sur **une seule ligne** :
  une requête multi-ligne se fait manger par le shell et revient en « query: Too small ».
  Certaines vues coûtent une seconde ou deux.
- **`npm run fn:serve` ne sert pas à tester une collecte.** La commande réserve
  `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` et ignore **silencieusement**
  `.env.local` : la collecte écrit dans une Postgres locale vide en croyant écrire sur le
  projet distant. Aucune erreur, aucune ligne, un faux succès complet. Utilise
  `npm run fn:local:ft` ou `npm run fn:local:adzuna`.
- **N'interroge jamais un endpoint de collecte avec un corps vide** : `dryRun` vaut
  `false` par défaut, donc `{}` déclenche une vraie collecte.
- **Une migration vide s'applique « avec succès » en ne faisant rien.** Vérifie la taille
  du fichier avant `db push`, et l'effet en base après. `git status` avant tout `db push`.
- **Un test unitaire ne prouve rien sur un client d'API.** Le pire défaut de la phase 1 —
  un paramètre inconnu envoyé à Adzuna, qui répond HTTP 400 — avait tous ses tests verts,
  parce qu'ils injectent un `fetch` factice. Seul un appel réel l'a révélé. Toute tâche
  livrant un client d'API se termine par un appel véritable. **Cela vaudra pour ton
  client Claude.**
- **Une affirmation de performance se mesure, elle ne se déduit pas.** J'ai écrit « hash
  join, linéaire » après une optimisation ; la revue a montré que le plan restait une
  boucle imbriquée avec le même produit cartésien. Lis les plans, ne les suppose pas.

## Ce que tu ne dois pas faire

- Ne touche pas au schéma à la main : toute évolution passe par une migration, données de
  référence comprises, avec des écritures idempotentes.
- Ne mets jamais un secret dans le dépôt. La référence de projet `zbpbuzoukldbzfbbikhw`
  n'en est pas un — c'est le nom d'hôte public. Les clés, si.
- Ne code pas les axes réglables — rayon, matrice de requêtes, lexique, confiance par
  requête. Ce sont des lignes en base.
- Ne tente pas de compenser la troncature d'Adzuna par du code.
- Ne me demande pas d'autorisation entre deux tâches d'un plan validé : exécute, et
  arrête-toi si tu es bloqué ou si une décision m'appartient vraiment.

## Ce que j'attends de toi maintenant

Lis les quatre documents, puis **brainstorme avec moi**. Dis-moi ce que tu comprends de
l'état actuel, et surtout **pose-moi les questions qui vont faire diverger la conception**
— sur ce que je veux vraiment de cette phase, sur le coût que j'accepte de payer, sur ce
qui me ferait dire qu'elle marche. Ne présuppose pas que le `ROADMAP` a raison.

Le plan ne s'écrira qu'après.

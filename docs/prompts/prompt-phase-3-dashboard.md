Tu démarres la **phase 3** de `fast-travail`, dans `c:\Users\Léo\Workspace\fast-travail` :
le **tableau de bord**. C'est une veille automatisée d'offres d'emploi que j'utilise pour
de vrai, pour trouver un poste rapidement. Toute décision qui ne sert pas cet objectif est
reportée.

**On commence par un brainstorming et des maquettes, pas par du code.** Je veux qu'on
explore l'interface avant d'écrire une ligne. Ne me propose pas de plan d'implémentation
avant qu'on ait discuté et que j'aie validé des maquettes.

## Lis d'abord

Dans cet ordre. Ils sont tenus à jour et leurs chiffres ont été vérifiés en base :

1. `CLAUDE.md` — les règles du dépôt, non négociables
2. `docs/ETAT.md` — l'état exact, les problèmes ouverts, les décisions déjà tranchées
3. `docs/ROADMAP.md` — la vision et les cinq phases
4. `docs/RESTE-A-FAIRE.md` — ce qui reste, avec coût et priorité
5. `docs/superpowers/specs/2026-09-08-scoring-ia-phase2-design.md` — le design de la phase 2,
   dont le tableau de bord consomme la sortie

Et, pour le design, les références d'un autre projet à moi (voir plus bas) :

6. `C:\Users\Léo\Workspace\prospeo\docs\design\GUIDELINES.md` — **lis-le en entier, c'est le
   ton et le niveau d'exigence que je veux ici**
7. `C:\Users\Léo\Workspace\prospeo\docs\design\HANDOFF.md`
8. `C:\Users\Léo\Workspace\prospeo\docs\design\maquettes\` — les artboards existants

## Où en est le projet

**Les phases 1 et 2 sont closes et fusionnées dans `master`.**

**Phase 1** : quatre sources collectent seules, PC éteint — France Travail et Adzuna en
Edge Functions Deno déclenchées par `pg_cron` (6 h et 6 h 30 UTC), Free-Work et
Collective.work en scrapers Deno lancés par le Planificateur Windows. Dédoublonnage
intra- et inter-sources, scoring lexical, confiance par requête.

**Phase 2** : chaque offre géographiquement atteignable est lue par `claude-sonnet-5`, qui
en tire une **note de correspondance au CV**, un **verdict** d'une phrase et une
**extraction structurée**. Un cron `score-daily` tourne à 7 h UTC. **1 269 offres sont
jugées, 0 en erreur.** Coût mesuré : 12,68 $ d'amorçage, de l'ordre de 20 €/mois en régime.

**Ta phase 3 est la première à avoir une interface.** Tout ce qui précède se consulte
aujourd'hui en SQL, à la main.

## La décision de conception qui gouverne cette interface

C'est la plus importante du projet, et elle a une conséquence directe sur ce que le
tableau de bord peut offrir.

**Ce que l'IA juge est figé ; ce que je préfère est réglable.** L'IA ne note que la
**correspondance de compétences** entre l'offre et mon CV (`fit_score`, 0-100) — un fait
objectif, figé au moment de l'appel, dont la reproduction coûte de l'argent. Mes
**préférences** — freelance, télétravail, TJM, durée de mission, IA/agentique, technos non
désirées, fraîcheur — vivent dans une table `scoring_weights` et sont appliquées par une
vue SQL.

**Conséquence : changer un poids reclasse instantanément tout le corpus, gratuitement.**
La vue coûte 25 ms sur 4 146 offres, mesuré par `explain analyze`. C'est une invitation
évidente pour l'interface — des réglages qu'on manipule et dont on voit le classement se
réordonner en direct — mais je te laisse juger si c'est une bonne idée ou une complication.

## Les données dont tu disposes

**La vue `offers_scored`** est la source du tableau de bord. Ses colonnes :

```
id, source, title, company_name, city, department, url, published_at,
fit_score, verdict,
engagement, work_mode, seniority, domain, confidence, agentic_ai,
duration_months, compensation_kind, compensation_min, compensation_max,
unwanted_count, truncated_input, age_days, extraction,
bonus_engagement, bonus_remote, bonus_remuneration, bonus_duree,
bonus_agentique, malus_technos, malus_fraicheur,
final_score
```

Recette de consultation, documentée dans `CLAUDE.md` :

```sql
select title, company_name, final_score, fit_score, engagement, work_mode,
       compensation_min, agentic_ai, confidence, verdict
from offers_scored order by final_score desc limit 40;
```

**Ce que ces colonnes te donnent, et qui est précieux pour une interface :**

- `final_score` **est décomposé** en ses six composantes (`bonus_*`, `malus_*`). Le
  classement est donc **explicable** : on peut montrer *pourquoi* une offre est où elle
  est. C'était un choix délibéré — un score opaque n'est pas corrigeable à l'œil.
- `verdict` est une phrase en français qui dit pourquoi ce score de correspondance.
- `confidence` vaut `haute`, `moyenne` ou `basse`. **`basse` signale une offre jugée sur un
  texte tronqué** — Adzuna coupe toute description à 500 caractères, et 557 offres du
  périmètre sont dans ce cas. Ces offres sont volontairement conservées : le modèle a
  interdiction de conclure au rejet quand le texte se tait.
- `truncated_input` dit la même chose, en fait brut.
- `extraction` (`jsonb`) porte aussi `stack` (les technos détectées) et `unwanted_tech`,
  qui ne sont pas remontées à plat dans la vue.
- `agentic_ai` dit si la mission touche aux LLM, aux agents ou au protocole MCP — c'est
  mon différenciateur assumé.

**Les autres tables utiles** : `offers` (le corpus complet, 4 100+), `offers_shortlist`
(l'ancienne sélection lexicale, conservée), `offers_hidden_duplicates` (les doublons
masqués et leur exemplaire de référence), `scoring_weights` (14 poids réglables),
`profile_skills` (les compétences du CV, pondérées), `candidate_profile` (le CV expurgé),
`search_queries`, `skill_lexicon`, `collection_runs`.

## Ce que je veux du tableau de bord

**L'objectif** : mettre en avant les informations les plus pertinentes déjà acquises, pour
que je décide vite à qui postuler — et que j'aie **envie** de postuler.

Ce que j'ai en tête, et sur quoi je te veux force de proposition :

- **Une liste triée par score et pertinence**, avec les informations essentielles.
- **Un clic ouvre le détail** d'une offre, avec tout ce qui aide à décider.
- **Un bouton pour importer mon CV.**
- **Un bouton qui redirige vers l'offre d'origine.**
- **Un suivi de candidature** : où j'en suis sur chaque offre.
- **Un aspect « gamification »** qui donne envie de postuler. C'est le point sur lequel
  j'attends le plus de propositions.

Pour tout le reste — la structure, les filtres, ce qu'on montre et ce qu'on cache, comment
on rend la gamification sans qu'elle devienne gadget — **brainstorme avec moi et
propose**. Ne te contente pas d'exécuter cette liste.

## Deux questions d'architecture que tu devras trancher avec moi

Je les signale parce qu'elles ne sont pas dans les documents et qu'elles changent le plan.

**1. Le suivi de candidature n'existe pas en base.** Le `ROADMAP` le place en phase 5
(« historique : offre, date, documents envoyés, statut, relances »). Or tu en as besoin
maintenant. Il faudra donc créer une table — par migration, comme tout ici — et décider
quelles étapes elle porte. Propose-moi un jeu d'états, ne l'invente pas en silence.

**2. Comment le navigateur lit-il la base ?** C'est le point dur, et il est piégeux.
**RLS est actif sur toutes les tables, sans aucune policy** : seule la clé `service_role`
accède aux données, et cette clé **ne doit jamais atteindre le navigateur** — le `ROADMAP`
le dit explicitement. Trois voies possibles, à trancher ensemble : un petit serveur qui
garde la clé, des policies RLS avec une authentification, ou autre chose que tu proposeras.
Ne suppose pas que `supabase-js` avec la clé `anon` fonctionnera : il ne rendra rien.

## Le design — c'est là que j'ai le plus d'exigences

**Inspire-toi de `C:\Users\Léo\Workspace\prospeo\docs\design`.** Tu y trouveras des
maquettes et des guidelines. Je veux **le même niveau de rigueur ici** : des règles de
design strictes, claires et écrites, pas un goût implicite.

Lis `GUIDELINES.md` de prospeo en entier. Retiens en particulier ces principes, que je veux
reconduire :

- **Un vocabulaire d'interface, et un seul.** Un composant qui a besoin de quelque chose que
  le kit n'a pas étend le kit — il ne le double pas. Un second badge, une seconde carte sont
  des dialectes, et un dialecte se paie à chaque écran suivant.
- **Une absence se nomme, jamais elle ne se vide.** « Pas encore collecté », « non publié par
  la source », « jamais scoré », « aucune candidature » sont des absences de **natures
  différentes** et doivent avoir des rendus **distincts**. `null` est porteur de sens : une
  offre sans score n'est pas une offre à zéro.
- **Ne jamais construire une affordance qui annonce un fait qu'aucun code ne peut rendre
  vrai.** C'est particulièrement important pour la gamification que je te demande : un
  chiffre motivant fondé sur rien est pire que pas de chiffre.
- **La couleur n'est jamais le seul indicateur d'un état.** Tout badge porte un mot, toute
  pastille un `aria-label`.
- **Aucune couleur en dur** : uniquement des variables de thème.
- **Aucune chaîne en dur** : tout passe par `t()`.
- **Aucun test ne voit une mise en page.** `jsdom` ne calcule ni largeur, ni hauteur, ni
  débordement, ni troncature. La maquette approuvée est le **seul** contrôle qui les voie —
  c'est pourquoi elle n'est pas une formalité.

**La bibliothèque de composants à reprendre** est celle de
`C:\Users\Léo\Workspace\prospeo\apps\dashboard\` — regarde `src/ui/kit/` (`Badge`, `Card`,
`Tooltip`, `StatusBadge`, `EmptyState`), `src/ui/theme.css`, `src/i18n/`, et les tests
`src/ui/guidelines.test.ts`, `src/ui/theme.test.ts`, `src/i18n/i18n.test.ts` qui font
respecter mécaniquement ce qui peut l'être. Sa stack : **React 18, TypeScript, Vite,
Base UI, CSS Modules, Vitest**.

### Les contraintes non négociables

- **React + TypeScript.**
- **Mode sombre par défaut.**
- **Interface moderne et haut de gamme.** Ajoute **GSAP** ou **Framer Motion** pour les
  animations — dis-moi lequel tu recommandes et pourquoi.
- **De beaux composants** : des badges, des icônes **SVG**. **Aucun emoji, nulle part.**
- **Aucun texte en dur.** Tout dans des fichiers i18n. **Français uniquement pour
  l'instant** — mais structure-le pour qu'ajouter une langue ne soit pas une reprise.
- **Des règles de design écrites**, à la manière du `GUIDELINES.md` de prospeo, versionnées
  dans ce dépôt.

Pour l'UI et l'UX tu peux t'appuyer sur la compétence **`ui-ux-pro-max`**, et pour produire
les maquettes sur la compétence **`design`**. **Présente-moi les maquettes pour validation
avant tout code.**

## Le critère qui gouverne toutes les décisions de ce dépôt

**Le coût est asymétrique.** Une offre affichée en trop se repère d'un coup d'œil ; une
offre **jamais affichée** est perdue. Ce qui fait rater une offre passe donc toujours devant
ce qui fait perdre du temps. Ce critère a déjà tranché une dizaine d'arbitrages, et il
tranchera les tiens — y compris sur les filtres par défaut de l'interface : un filtre trop
serré au démarrage est exactement le genre de chose qui fait disparaître une offre.

## Comment je veux que tu travailles

**Pilotage par sous-agents, c'est une exigence.** Un sous-agent implémenteur par tâche, une
revue par un agent distinct après chaque tâche — sur conformité **et** sur qualité — et une
revue large de toute la branche à la fin. Utilise la compétence
`subagent-driven-development`. Écris des tests.

Les revues trouvent du vrai. Sur la phase 2, elles ont trouvé : un schéma de sortie que
l'API refusait en HTTP 400 (chaque appel aurait échoué), une boucle infinie qui dépensait
~16 €/h sans progresser, un score de 100 rendu en silence parce que `LEAST` ignore les NULL
en PostgreSQL, et un bonus de rémunération qui favorisait le CDI contre ma priorité
freelance. **Aucun de ces défauts n'était visible avec les tests au vert.** Ne traite pas
les revues comme une formalité.

**Tiens `docs/ETAT.md` à jour** : chaque tâche finie, chaque problème découvert, chaque
décision prise y va. C'est le document qui permet de reprendre après une interruption.

Zéro erreur de lint, zéro erreur de formatage, zéro test rouge, et **aucun contournement du
linter** — `CLAUDE.md` liste ce qui est interdit et pourquoi. Si le linter signale quelque
chose, le code change, pas la règle.

## Les pièges qui m'ont coûté du temps — ne les repaie pas

- **Deno est hors du PATH.** Toute commande `deno` ou `npm run` doit être précédée, dans le
  **même** appel shell, de :
  `export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links"`
  L'état du shell ne persiste pas entre deux appels. *(Le tableau de bord sera sans doute en
  Node plutôt qu'en Deno — dis-moi ce que tu proposes, sachant que le reste du dépôt est en
  Deno et que `npm run verify` ne couvre aujourd'hui que `supabase/functions/` et
  `scripts/`.)*
- **Pour interroger la base** : `npx supabase db query --linked "<SQL>"`. Le drapeau
  `--linked` est **obligatoire** — sans lui la commande cible une base locale inexistante et
  échoue sur un refus de connexion trompeur. Passe le SQL sur **une seule ligne**.
- **Une migration vide s'applique « avec succès » en ne faisant rien.** Vérifie la taille du
  fichier avant `db push`, et l'effet en base après. `git status` avant tout `db push`.
- **Vérifie qu'un créneau de timestamp de migration est libre** avant de t'en servir : une
  collision avec une autre branche a déjà coûté un renommage.
- **`db diff` ne fonctionne pas sur cette machine** : il exige Docker, qui n'est pas démarré.
- **Le `python` de Git Bash est CPython Windows**, `os.linesep = CRLF`. Un `open(p,'w')`
  réécrit tout un fichier en CRLF alors que le dépôt est en LF — un passage a produit
  2 800 lignes de diff pour 120 ajoutées, et **rien ne l'aurait signalé**.
- **Une affirmation de performance se mesure, elle ne se déduit pas.** J'ai écrit « hash
  join, linéaire » après une optimisation ; la revue a montré que le plan restait une boucle
  imbriquée. Lis les plans, ne les suppose pas.

## Ce que tu ne dois pas faire

- Ne touche pas au schéma à la main : toute évolution passe par une migration, données de
  référence comprises, avec des écritures idempotentes.
- **Ne mets jamais un secret dans le dépôt, et surtout pas la clé `service_role` dans du code
  qui part au navigateur.** La référence de projet `zbpbuzoukldbzfbbikhw` n'est pas un
  secret — c'est le nom d'hôte public.
- Ne code pas les axes réglables — rayon, matrice de requêtes, lexique, confiance par
  requête, poids de scoring, compétences du profil. Ce sont des lignes en base.
- **Ne relance pas de scoring sans nécessité** : `npm run score:backfill` coûte de l'argent
  réel. Les 1 269 jugements existants sont payés et valides ; ne change ni `PROMPT_VERSION`
  ni `profile_version` sans une raison mesurée.
- Ne me demande pas d'autorisation entre deux tâches d'un plan validé : exécute, et
  arrête-toi si tu es bloqué ou si une décision m'appartient vraiment.

## Deux problèmes ouverts qui peuvent te concerner

- **P21** — la réflexion du modèle représente 65 % de la facture du scoring. La désactiver
  ramènerait le coût vers ~7 €/mois, mais l'effet sur la qualité des jugements n'a pas été
  mesuré. Décision non tranchée.
- **P22** — l'unité des rémunérations extraites est ambiguë : les valeurs vont de 4 à
  150 000, des taux horaires mêlés à des salaires annuels. **Cela te concerne directement si
  tu affiches une rémunération** : ne présente pas un nombre dont l'unité est incertaine
  comme s'il était sûr.

Les autres problèmes ouverts sont dans `docs/ETAT.md`, avec leur mesure.

## Ce que j'attends de toi maintenant

Lis les documents, explore la base pour voir les données réelles, puis **brainstorme avec
moi**. Dis-moi ce que tu comprends de l'état actuel, et surtout **pose-moi les questions qui
vont faire diverger la conception** — sur ce que je veux vraiment voir en premier écran, sur
ce qui me ferait dire que ce tableau de bord marche, sur la forme que doit prendre la
gamification pour motiver sans mentir.

Ensuite, propose-moi des **maquettes**, que je valide avant tout code. Le plan
d'implémentation ne s'écrira qu'après.

Tu reprends le chantier `fast-travail`, dans `c:\Users\Léo\Workspace\fast-travail`. C'est une veille automatisée d'offres d'emploi que j'utilise **pour de vrai, pour trouver un poste rapidement**. Toute décision qui ne sert pas cet objectif est reportée.

**Commence par lire `CLAUDE.md` puis `docs/ETAT.md`.** Le premier porte les règles du dépôt, le second l'état exact, les problèmes ouverts priorisés et les décisions déjà tranchées avec leur raison. Ils sont tenus à jour et fiables : les chiffres d'`ETAT.md` ont été vérifiés en direct contre la base distante lors de la dernière revue. Ne me redemande pas ce qu'ils contiennent.

## Où on en est

La phase 1 est terminée et fusionnée dans `master` (PR #1). Deux sources collectent seules, chaque matin, PC éteint : `ft-daily` à 6 h et `adzuna-daily` à 6 h 30, en Edge Functions Deno déclenchées par `pg_cron`. En base : **1 193 offres** (700 France Travail, 493 Adzuna), **31 retenues** par la vue `offers_shortlist`, 67 termes au lexique, 35 requêtes actives, **120 tests verts**.

La branche `phase-1-collecte-api` est fusionnée et entièrement contenue dans `master` ; travaille sur une branche neuve.

## Comment je veux que tu travailles

C'est une exigence, pas une préférence : **pilotage par sous-agents**. Un sous-agent implémenteur par tâche, une revue par un agent distinct après chaque tâche — sur conformité **et** sur qualité —, et une revue large de toute la branche à la fin. Utilise la compétence `subagent-driven-development`. Écris des tests. Tiens `docs/ETAT.md` à jour : chaque tâche finie, chaque problème découvert, chaque décision prise y va. C'est ce document qui permet de reprendre après une interruption.

**Zéro erreur de lint, zéro erreur de formatage, zéro test rouge**, et **aucun contournement du linter** — `CLAUDE.md` liste ce qui est interdit et pourquoi. Si le linter signale quelque chose, le code change, pas la règle.

## Les pièges qui m'ont coûté du temps — ne les repaie pas

- **Deno est hors du PATH.** Toute commande `deno` ou `npm run` doit être précédée, dans le **même** appel shell, de `export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links"`. L'état du shell ne persiste pas entre deux appels.
- **`npm run fn:serve` ne sert pas à tester une collecte.** La commande réserve les noms `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` et ignore silencieusement `.env.local` : la collecte écrit dans une Postgres locale vide en croyant écrire sur le projet distant. Aucune erreur, aucune ligne, un faux succès complet. Utilise `npm run fn:local:ft` ou `npm run fn:local:adzuna`.
- **Pour interroger la base : `npx supabase db query --linked "<SQL>"`.** Le drapeau `--linked` est obligatoire, sans lui la commande cible une base locale inexistante et échoue sur un refus de connexion trompeur. Passe le SQL **sur une seule ligne** : une requête multi-ligne se fait manger par le shell et revient en erreur « query: Too small ».
- **Un test unitaire ne prouve rien sur un client d'API.** Le pire défaut de la phase 1 — un paramètre inconnu envoyé à Adzuna, qui répond **HTTP 400** — avait tous ses tests verts, parce qu'ils injectent un `fetch` factice. Seul un appel réel sur l'URL **construite par le code** l'a révélé. Toute tâche livrant un client d'API se termine par un appel véritable.
- **N'interroge jamais un endpoint de collecte avec un corps vide.** `dryRun` vaut `false` par défaut : `{}` déclenche une vraie collecte. Attends la ligne `Listening` dans la sortie du serveur, puis envoie un corps explicite.
- **Une migration vide s'applique « avec succès » en ne faisant rien.** Vérifie la taille du fichier avant `db push`, et vérifie l'effet en base après.
- **La lemmatisation française rapproche des radicaux étrangers au domaine.** « React » et « réacteur » chez Adzuna ; « agentique » et « agent » dans Postgres. Avant d'ajouter un terme au lexique, compare le nombre de correspondances en `fts` et en `ilike` : le bon mode dépend du mot et se mesure. `rag` doit rester en `fts`, sinon il matche « cadRAGe ».

## Ce que je veux que tu fasses, par ordre de valeur

**1. La confiance par requête.** C'est ce qui rapporte des offres. Adzuna tronque toute description à 500 caractères, donc le lexique n'y voit presque rien et la vue `offers_shortlist` s'appuie sur `core_hits` ou `ai_hits`. Résultat mesuré : **76 offres Adzuna en full remote, 9 retenues** — et **7 offres Adzuna sur 493** ont un `core_hits`. Relâcher le filtre a été mesuré et laisse entrer le bruit — « Business Developer », « Sales », « UX designer » — parce que la requête `adzuna:remote:fr-dev` est trop large. La bonne réponse est de faire confiance **par requête** : `fr-react` et `fr-ts` sont ancrées à une techno, `it-jobs` et `fr-dev` sont des filets. Cela suppose de retenir **quelle requête a trouvé chaque offre** — une colonne de plus sur `offers`, renseignée par la provenance, peuplée dès la collecte suivante. Attention : l'upsert écrase, et c'est la **dernière** requête à voir une offre qui fixe ses colonnes ; l'ordre d'exécution vient de `priority` croissante.

**2. Le dédoublonnage inter-sources.** `unique (source, external_id)` empêche les doublons dans une source, pas entre sources. Les deux sources écrivent maintenant dans la même table : la dette est réelle, plus théorique.

**3. Le plan B, les quatre scrapers** — Free-Work, Codeur.com, Collective.work, Kicklox. Rien n'est planifié, délibérément : le plan doit être écrit contre des fixtures HTML réelles, à capturer d'abord. Le `robots.txt` des quatre autorise la collecte et les quatre publient un sitemap XML, retenu comme surface plutôt que les pages de listing. Deux contraintes connues : Codeur.com interdit les query strings sauf `?page=N`, et Free-Work banne `Wget` et `HTTrack` nommément. Fait nouveau à exploiter : Collective.work et Malt apparaissent déjà comme employeurs dans les résultats Adzuna, ce qui peut réduire le périmètre.

Les problèmes P1 à P7 et les mineurs M1 à M13 d'`ETAT.md` sont connus, justifiés et assumés. Ne me les resignale pas comme des découvertes ; dis-moi seulement si l'un d'eux est plus grave que le document ne le prétend.

## Ce que tu ne dois pas faire

- Ne touche pas au schéma à la main : **toute évolution passe par une migration**, données de référence comprises, avec des inserts idempotents.
- Ne mets jamais un secret dans le dépôt. La référence de projet `zbpbuzoukldbzfbbikhw` n'en est pas un — c'est le nom d'hôte public. Les clés, si.
- Ne code pas les trois axes réglables — rayon, matrice de requêtes, lexique. Ce sont des **lignes en base** : les ajuster est un `UPDATE`, jamais un redéploiement ni une re-collecte.
- Ne tente pas de compenser la troncature d'Adzuna par du code. C'est impossible, c'est mesuré, et le tenter serait un défaut de conception.
- Ne me demande pas d'autorisation entre deux tâches d'un plan validé : exécute, et arrête-toi si tu es bloqué ou si une décision m'appartient vraiment.

Commence par lire les deux documents, dis-moi ce que tu comprends de l'état actuel, et propose-moi ton plan pour le point 1 avant de coder.

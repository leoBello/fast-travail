# fast-travail — règles du projet

Veille automatisée d'offres d'emploi pour un profil développeur front-end
React / TypeScript, zone Marseille / Aix-en-Provence et full-remote national.

| Document | À quoi il sert |
|---|---|
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Vision produit, les 5 phases, décisions structurantes et ce que la mesure a démenti |
| [`docs/ETAT.md`](docs/ETAT.md) | **Où on en est, ce qui reste, problèmes ouverts priorisés.** À lire en premier pour reprendre le travail |
| [`docs/superpowers/specs/2026-09-07-collecte-offres-phase1-design.md`](docs/superpowers/specs/2026-09-07-collecte-offres-phase1-design.md) | Design détaillé de la phase 1 |
| [`docs/superpowers/plans/2026-09-07-collecte-api-france-travail-adzuna.md`](docs/superpowers/plans/2026-09-07-collecte-api-france-travail-adzuna.md) | Plan d'implémentation, tâche par tâche |

**Tenir `ETAT.md` à jour** fait partie du travail : chaque tâche terminée, chaque
problème découvert et chaque décision prise y sont consignés. C'est le document
qui permet de reprendre après une interruption.

## Qualité — non négociable

**Zéro erreur de lint, zéro erreur de formatage, zéro test rouge.** La porte
unique est :

```bash
export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links" && npm run verify
```

`verify` enchaîne `fmt:check`, `lint`, `check` puis `test`. Il doit passer
avant tout commit. Une tâche dont `verify` échoue n'est pas terminée.

Le `check` (typecheck) n'est pas redondant avec `test` : les `index.ts` des
Edge Functions ne sont importés par aucun test, donc `deno test` ne les
typecheck pas. Sans cette étape, une erreur de type dans un point d'entrée
passerait inaperçue jusqu'au déploiement.

Piège à connaître en écrivant ces commandes : `deno check` accepte très bien
un **dossier**, mais un glob `**/*.ts` que le shell n'expanse pas matche zéro
fichier et sort en 0 — un succès silencieux qui ne vérifie rien. Toujours
passer un dossier.

**Aucun contournement du linter n'est autorisé.** Sont interdits :

| Interdit | Pourquoi |
|---|---|
| `// deno-lint-ignore` et `// deno-lint-ignore-file` | Masque le problème au lieu de le corriger |
| `// eslint-disable` sous toutes ses formes | Idem |
| `// @ts-ignore` | Éteint le typage à l'endroit exact où il servait |
| `// @ts-expect-error` | Même chose, avec une fausse impression de rigueur |
| `as any`, `as unknown as X` hors fichiers de test | Fait passer un mensonge de type pour une conversion |
| `--no-check`, `--allow-dirty`, `--force` | Contourne la vérification plutôt que la satisfaire |

Si le linter ou le compilateur signale quelque chose, **le code change, pas la
règle**. Le seul assouplissement admis concerne les faux clients de base de
données dans les fichiers `__tests__/`, où un `as unknown as DbClient` est le
moyen normal de fabriquer un double de test.

### Exclure n'est pas contourner

`supabase/functions/deno.json` exclut `**/__tests__/fixtures/**` du formatage.
Ce n'est pas un contournement : une fixture est la **capture verbatim** d'une
réponse d'API externe. La reformater masquerait sa nature, et chaque nouvelle
capture ferait échouer `verify` sans qu'une ligne de code ait bougé. Une
exclusion se justifie quand le fichier n'est pas du code du projet ; jamais
quand le code déplaît au linter.

## Outillage

- **Deno 2.9.6** est installé mais **hors du PATH** hérité par les shells.
  Toute commande `deno` ou `npm run` qui l'invoque doit être précédée, dans le
  **même** appel shell, de :
  `export PATH="$PATH:/c/Users/Léo/AppData/Local/Microsoft/WinGet/Links"`
  L'état du shell ne persiste pas entre deux appels.
- **Toute commande `deno` doit porter `--config supabase/functions/deno.json`.**
  Deno découvre `deno.json` en remontant depuis le répertoire courant, jamais en
  descendant : sans ce drapeau, l'import map n'est pas résolue et le typecheck
  échoue sur `@std/assert`. Les scripts npm le font déjà.
- **Supabase CLI** : toujours `npx supabase`, jamais `supabase` nu. La version
  est pinnée en devDependency, donc reproductible.
- **`supabase functions serve` ne sert pas à tester une collecte.** La commande
  **réserve** les noms `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` et ignore
  **silencieusement** les valeurs de `.env.local`. Une collecte lancée ainsi
  écrit dans une Postgres locale éphémère et vide en croyant écrire sur le
  projet distant : aucune erreur, aucune ligne, un faux succès complet. Pour un
  essai local contre la base distante, lancer le point d'entrée directement —
  `npm run fn:local:ft` ou `npm run fn:local:adzuna`, qui font
  `deno run --env-file=.env.local`. L'absence de `verify_jwt` en local est
  normale : il est appliqué par la plateforme, pas par `Deno.serve`.
- **VS Code** : l'extension `denoland.vscode-deno` est **indispensable**. Sans
  elle, le serveur TypeScript de Node analyse les Edge Functions et signale des
  erreurs qui n'existent pas (`Deno.serve` inconnu, imports en `.ts` refusés).
  `.vscode/settings.json` active Deno uniquement sur `supabase/functions/`.
  Prettier et ESLint sont exclus de ce dossier par `.prettierignore` et
  `.eslintignore` : leurs conventions Node y sont fausses.

## Frontières d'architecture

**`supabase/functions/_shared/` est runtime-neutre.** Aucun `Deno.env`, aucun
accès `Deno.*`, aucun import `node:` dans ces fichiers — la configuration
arrive **en paramètre**. Ces fichiers seront importés tels quels par des
scripts Node (les scrapers de la phase suivante). Contrôle :

```bash
grep -rn "Deno\.\|node:" supabase/functions/_shared/ --include=*.ts | grep -v "__tests__"
```

Cette commande doit ne rien renvoyer. La lecture de l'environnement
(`requireEnv`) appartient aux `index.ts` de chaque fonction, qui sont du code
Deno assumé.

**L'orchestration de collecte est mutualisée** dans
`_shared/run-collection.ts` et sert les six sources. Les `index.ts` ne font que
lire l'environnement, charger les requêtes et déléguer. Ne jamais dupliquer la
boucle.

**Le code partagé reste sous `supabase/functions/_shared/`**, pas à la racine :
le CLI n'embarque dans le bundle que ce qui se trouve sous `supabase/functions`,
sauf avec le flag expérimental `--use-api`.

## Base de données

- **Toute évolution de schéma passe par une migration.** Ne rien créer à la main
  dans le tableau de bord : la base et le dépôt divergeraient.
- **Les données de référence passent aussi par des migrations**, avec des
  inserts idempotents (`on conflict do nothing`). `seed.sql` ne s'exécute que
  sur un `db reset` local, et il n'y a pas de base locale ici.
- **RLS activé sur toutes les tables, sans aucune policy.** Seule la clé
  `service_role` accède aux données. Une table sans RLS rendrait la base
  lisible depuis Internet via la clé `anon`, qui est publique par nature.
- **Pour interroger ou modifier la base distante, utiliser
  `npx supabase db query --linked "<SQL>"`.** C'est le chemin direct : il
  exécute du SQL arbitraire sur le projet distant, sans Docker ni script
  intermédiaire. **Le drapeau `--linked` est obligatoire** — sans lui, la
  commande cible une base *locale* qui n'existe pas ici et échoue sur un refus
  de connexion trompeur.
- **`db diff` ne fonctionne pas sur cette machine** : il exige un démon Docker
  pour sa base fantôme, et Docker Desktop n'est pas démarré. Vérifier le schéma
  par `db query --linked` à la place, ou fonctionnellement en écrivant puis en
  relisant une ligne de sonde.

## Secrets

- `.env.local` est gitignoré et ne doit **jamais** être commité, ni son contenu
  recopié dans un rapport, un commentaire ou un message.
- **Ce qui est secret, et ce qui ne l'est pas.** Sont sensibles : la clé
  `service_role`, le mot de passe de la base, les identifiants France Travail et
  Adzuna. Ne le sont pas : la **référence du projet** (`zbpbuzoukldbzfbbikhw`),
  qui est le nom d'hôte public de toutes les requêtes du projet et apparaît dans
  n'importe quel onglet réseau. Elle peut donc figurer dans une migration. La clé
  `anon` est publique par conception, mais reste hors du dépôt par hygiène : elle
  passe par Vault.
- Les secrets des Edge Functions passent par `npx supabase secrets set`.
- Le jeton utilisé par les jobs `pg_cron` passe par **Vault**
  (`vault.decrypted_secrets`, secret nommé `cron_auth_key`), jamais en clair dans
  la définition du job. **C'est la clé `anon`, pas `service_role`** : le job n'a
  besoin que de franchir `verify_jwt`, tandis que l'Edge Function reçoit sa propre
  clé `service_role` injectée par Supabase pour écrire en base. Moindre privilège :
  une fuite de ce jeton ne permettrait rien de plus qu'appeler la fonction, RLS
  étant actif sans aucune policy.
- `verify_jwt` reste à `true` sur toutes les fonctions : une Edge Function
  déployée est une URL publique sur Internet. « Pas d'authentification » signifie
  pas d'auth *utilisateur* dans l'application, pas un endpoint ouvert à tous.

## Ce que la mesure a démenti

Deux suppositions du design initial se sont révélées fausses à l'usage. Elles
sont documentées ici parce qu'elles orientent toute décision future sur les
sources.

**`motsCles` de France Travail n'indexe pas les technologies.** Mesuré à
Marseille, rayon 40 km, 31 jours : `React` 0, `TypeScript` 0, `Next.js` 0.
Onze des dix-neuf requêtes initiales rendaient 0 à 3 offres. La collecte ratisse
donc large avec le vocabulaire réel du marché (`informatique`,
`ingénieur d'études`, codes ROME), et **le lexique de compétences est le filtre
principal** — c'est lui qui trouve « React » dans les descriptions.

**Adzuna, et non France Travail, est la source principale pour ce profil** :
React y rend 36 offres à Marseille et 1481 au national, contre 0 et 27. Deux
pièges y sont vérifiés : `what` n'est pas un ET logique (utiliser `what_and`),
et `category=it-jobs` rate 52 des 60 offres React de Marseille — catégorie et
mots-clés sont deux requêtes séparées, jamais combinées.

## Consulter les offres

```sql
select source, title, company_name, city,
       coalesce(rate_raw, salary_raw) as remu,
       score, matched_terms, distance_marseille_km
from offers_ranked
where red_flags = 0 and core_hits >= 1
order by score desc, published_at desc;
```

Les trois axes réglables — rayon, matrice de requêtes, lexique — sont des
**lignes en base**, jamais du code. Les ajuster est un `UPDATE`, sans
redéploiement ni re-collecte.

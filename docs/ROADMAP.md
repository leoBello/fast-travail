# fast-travail — vision produit et feuille de route

**Objectif** : automatiser la veille d'offres d'emploi pour réduire à quelques
minutes par jour un travail de tri qui en prend plusieurs heures, avec un
contrôle humain avant chaque candidature. Pas d'auto-apply aveugle.

**Objectif réel derrière l'objectif** : trouver un poste rapidement. Toute
décision d'architecture qui n'y contribue pas directement est reportée.

---

## Le profil ciblé, et ses contraintes

Développeur front-end senior, 7 ans d'expérience, basé à Marseille.

| Dimension | Contrainte |
|---|---|
| Stack | React, TypeScript, Next.js — le noyau non négociable |
| Différenciateurs rares | IA et agents (LLM, MCP, développement agentique), Supabase, TDD |
| Adjacents crédibles | Angular, Node.js, PostgreSQL, Firebase / GCP |
| Écartés | Java EE (périmé), WordPress (bas de gamme), Python / PyTorch (hors cible) |
| Géographie | Marseille, Aix-en-Provence et alentours — rayon de 40 km |
| **Hors zone** | **Full remote uniquement.** L'hybride « 2 jours sur site » à Paris est inexploitable |
| Contrat | CDI ou missions freelance |

Ces contraintes ne sont pas décoratives : elles sont encodées dans la vue
`offers_shortlist` et dans le lexique de compétences, et elles se règlent par
`UPDATE` sans toucher au code.

---

## Architecture générale

**Supabase Cloud** (région `eu-west-3`) porte la base PostgreSQL, les Edge
Functions et les tâches planifiées. Le choix du cloud sur le local vient d'un
besoin précis : `pg_cron` doit tourner même PC éteint.

**Split de runtime**, imposé par une limite mesurée et non par goût :

| | Sources | Runtime | Déclenchement |
|---|---|---|---|
| **API** | France Travail, Adzuna | Edge Functions Deno | `pg_cron` quotidien, PC éteint |
| **Scrapers** | Free-Work, Collective.work | Scripts Deno locaux | Planificateur Windows quotidien, ou manuel |

**Deux scrapers, pas quatre.** Codeur.com et Kicklox faisaient partie de
l'intention initiale ; la reconnaissance du 2026-09-08, contre des pages
réelles, les a écartés sur mesure : Codeur.com ne rend que 4 slugs front-end
sur 103 projets, un flux WordPress / Webflow / SEO / marketing hors profil ;
Kicklox n'a **aucune** mission publique, `app.kicklox.com/missions` étant une
coquille SPA de 3 955 octets derrière un login. Free-Work et Collective.work,
eux, mesurent une vraie surface : 196 offres React sur Free-Work contre 5 chez
Adzuna et 0 chez France Travail, 6 544 missions sur Collective. Détail des mesures et des pistes écartées : [`ETAT.md`](ETAT.md), section
« Phase 1 — Plan B ».

**Scripts Deno, pas Node.** La contrainte réelle est « hors Edge Functions »,
pas « Node » : le brief initial supposait Node sans raison technique. Deno
coûte un outillage en moins — `npm run verify` (format, lint, typecheck,
tests) couvre déjà tout `supabase/functions/`, scrapers compris, par la même
porte que les deux API. Un second outillage Node aurait dupliqué cette
chaîne pour deux scripts.

Les Edge Functions du free tier sont limitées à 150 s de wall clock et **2 s de
CPU** par requête, et n'embarquent aucun Chromium. Parser des pages HTML avec
des délais de politesse n'y tient pas. Le code partagé
(`supabase/functions/_shared/`) est donc **runtime-neutre** : il ne lit jamais
l'environnement, la configuration lui est injectée, et les scripts Deno des
scrapers l'importent tel quel.

**Trois axes réglables, tous en données** — rayon géographique, matrice de
requêtes, lexique de compétences. Les ajuster est un `UPDATE`, jamais un
redéploiement ni une re-collecte.

---

## Les phases

### Phase 1 — Collecte *(en cours)*

Alimenter la base en offres, avec dédoublonnage et télémétrie par requête.

- **Plan A — les 2 API** : France Travail et Adzuna, en Edge Functions avec cron.
  Design : [`specs/2026-09-07-collecte-offres-phase1-design.md`](superpowers/specs/2026-09-07-collecte-offres-phase1-design.md).
  Plan : [`plans/2026-09-07-collecte-api-france-travail-adzuna.md`](superpowers/plans/2026-09-07-collecte-api-france-travail-adzuna.md).
- **Plan B — deux scrapers, et non quatre** : Free-Work et Collective.work,
  écrit quand le plan A tournait, contre des fixtures HTML réelles capturées
  d'abord. Découpage assumé : un plan écrit trop tôt contre des pages inconnues
  serait périmé avant exécution. Codeur.com et Kicklox faisaient partie de
  l'intention initiale (« les 4 scrapers ») ; la reconnaissance les a écartés
  sur mesure, pas sur intuition — détail ci-dessus et dans `ETAT.md`.

Le scoring lexical, gratuit et déterministe, est déjà livré dans cette phase.
Il n'était pas prévu au brief initial comme filtre principal — la mesure l'a
promu à ce rôle (voir « Ce que la mesure a démenti »).

### Phase 2 — Scoring IA

Faire lire chaque offre retenue par Claude Haiku, pour juger l'adéquation au CV
au-delà des correspondances de mots. Le score lexical ne disparaît pas : il
devient le **pré-filtre qui décide quelles offres méritent un appel payant**.
Bien régler les poids en phase 1 réduit donc directement le coût de la phase 2.

Introduit une table de profil / CV structuré, délibérément absente de la phase 1
puisqu'elle n'y aurait servi à rien.

### Phase 3 — Tableau de bord

Interface Next.js locale pour parcourir, filtrer et marquer les offres. Aucune
authentification : usage mono-utilisateur. La clé `service_role` reste côté
serveur, jamais exposée au navigateur.

C'est là que se paiera la dette du filtrage géographique : les coordonnées sont
absentes d'une bonne part des offres, et un filtre sur la distance les
écarterait silencieusement.

### Phase 4 — Génération de CV et de lettres

À la demande, avec Claude Sonnet : adapter le CV et rédiger une lettre pour une
offre donnée. Le contrôle humain reste systématique avant envoi.

### Phase 5 — Suivi des candidatures

Historique : offre, date, documents envoyés, statut, relances. Ferme la boucle
entre la veille et la candidature.

---

## Ce que la mesure a démenti

Deux suppositions du design initial se sont révélées fausses face à l'API
réelle. Elles sont consignées ici parce qu'elles orientent toute décision
future sur les sources.

**`motsCles` de France Travail n'indexe pas les technologies.** Mesuré à
Marseille, rayon 40 km, 31 jours : `React` 0 offre, `TypeScript` 0, `Next.js` 0,
`Supabase` 0. Onze des dix-neuf requêtes initiales rendaient 0 à 3 offres.
Indice de mécanisme : `Docker` rend 314 offres nationales mais `Jest` 0 ;
`Angular` 241 mais `React` 27. Ce n'est pas une recherche plein texte.

**Conséquence : les deux couches se sont inversées.** La collecte ratisse large
avec le vocabulaire réel du marché (`informatique`, `ingénieur d'études`, codes
ROME), et **le lexique de compétences est devenu le filtre principal** — c'est
lui qui trouve « React » dans les descriptions, là où l'API en est incapable.

**Adzuna indexe les technologies, mais n'en restitue que 500 caractères.**
C'est la mesure la plus structurante de la phase 1, et elle a démenti une
affirmation que ce document portait lui-même.

Adzuna tronque **toute** description à 500 caractères — mesuré sur 50 offres :
min 500, médiane 500, max 500, et 50 sur 50 terminées par « … ». Le lexique de
compétences, qui est le filtre principal pour France Travail, ne voit donc que
ce début de texte, alors que la stack technique et les conditions de
télétravail figurent presque toujours plus loin. Une offre sur 50 mentionne
« react » dans ce qu'on reçoit. Mais l'index d'Adzuna, lui, voit tout : sur 19
offres rendues par `what_phrase=full remote`, 13 ne portent pas la locution
dans les 500 caractères reçus.

**Les deux sources appellent donc des stratégies opposées.** France Travail :
index inutilisable, texte intégral disponible, donc requêtes larges et filtrage
par le lexique. Adzuna : index puissant, texte tronqué, donc **la requête est
le filtre**.

**Ce que ce document affirmait à tort** : « Adzuna, et non France Travail, est
la source principale pour ce profil — React y rend 36 offres à Marseille ». Ce
36 était un `count`, et le lemmatiseur français d'Adzuna confond « React » avec
« réacteur » : sur ces 60 offres, 8 titres sont des réacteurs nucléaires et une
seule contient « react » comme mot. `what_exclude=réacteur` les ramène toutes à
zéro, vraies offres React comprises — les deux termes sont indissociables. Le
signal React local réel sur Adzuna est de **5 offres sur 31 jours**.

**Où Adzuna gagne réellement** : le full remote national. 63 offres sur 31
jours par `what_phrase='full remote'` ancré sur « développeur », 19 sur
TypeScript, et l'échantillon est exactement le profil visé. France Travail n'en
avait rendu que 9 sur 699. Sur le marché local, les deux sources concordent en
revanche : Marseille est un marché Angular / Java, pas React.

**Le marché local est mince, et ce n'est pas un défaut d'outillage.** Les deux
sources indépendamment le disent. Ce constat pèse sur la phase 2 : le gisement
exploitable est national et full remote.

**Le full remote est rare : 1,3 % des offres.** Sur 699 offres collectées, 9
seulement sont en full remote, contre 190 en hybride. La passe nationale ramène
donc beaucoup de bruit pour très peu d'exploitable, et le rayon marseillais
compte bien plus que prévu.

**Free-Work rend à la description entière son rôle de filtre, et ouvre un
champ que ni France Travail ni Adzuna ne donnaient.** Mesuré le 2026-09-08,
en clôture du plan B : la description Free-Work fait **1 315 caractères** de
médiane, contre 500 chez Adzuna (troncature systématique, jamais un
caractère de plus). Conséquence directe sur le lexique : `core_hits >= 1`
touche **59 offres Free-Work sur 105**, contre 7 sur 557 chez Adzuna. Comme
sur France Travail, texte intégral disponible = lexique filtre principal ;
c'est pourquoi les facettes Free-Work sont restées `net` et non `anchored`
(aucune n'a fait entrer d'offre par la seule confiance de requête — voir
`ETAT.md`). Free-Work est aussi la première source du projet à porter un TJM
**structuré** en JSON-LD : `rate_raw`, colonne morte depuis le début du
projet faute de source la renseignant, cesse de l'être — 34 offres sur 105 en
portent un.

---

## Décisions structurantes, et leur raison

| Décision | Raison |
|---|---|
| Supabase Cloud plutôt que local | `pg_cron` doit tourner PC éteint |
| Scrapers hors Edge Functions | 2 s de CPU par requête, aucun Chromium |
| Code partagé dans `supabase/functions/_shared/` | Seul dossier embarqué au déploiement sans flag expérimental |
| Données de référence par migration, pas `seed.sql` | Il n'y a pas de base locale, `seed.sql` ne s'exécuterait jamais |
| Payload brut conservé en `jsonb` | Permet de rétro-classer l'historique sans re-collecter — déjà utilisé une fois |
| Score en **vue**, pas en colonne | Modifier un poids recalcule tout, sans re-collecte |
| Département plutôt que distance pour filtrer | Les coordonnées manquent trop souvent ; le département est déductible du libellé |
| `java` et `angular` en contexte (+1), pas en signal rouge | Un rouge écarterait les offres « React + Java Spring », un vrai marché. Et une offre Java pure a zéro `core_hits`, donc déjà hors filtre |
| RLS activé partout, zéro policy | Sans lui, la clé `anon`, publique par nature, lirait toute la base |

---

## Hors périmètre, assumé

- Auto-apply : jamais. Le contrôle humain avant candidature est un principe, pas une étape à optimiser.
- Authentification utilisateur : inutile pour un usage mono-utilisateur local.
- Dédoublonnage inter-sources : reporté, mais c'est la première dette à payer dès qu'une deuxième source alimente la base.
- MCP : sans objet. On appelle les API depuis notre propre backend ; le MCP sert à connecter un client IA interactif.
- Sources écartées faute de listing public : Comet, Malt, Crème de la Crème, 404Works, FreelanceRepublik.

---

Suivi d'avancement et problèmes ouverts : [`ETAT.md`](ETAT.md).
Règles de travail sur le dépôt : [`../CLAUDE.md`](../CLAUDE.md).

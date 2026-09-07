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
| **Scrapers** | Free-Work, Codeur.com, Collective.work, Kicklox | Scripts Node locaux | manuel ou Planificateur Windows |

Les Edge Functions du free tier sont limitées à 150 s de wall clock et **2 s de
CPU** par requête, et n'embarquent aucun Chromium. Parser des pages HTML avec
des délais de politesse n'y tient pas. Le code partagé
(`supabase/functions/_shared/`) est donc **runtime-neutre** : il ne lit jamais
l'environnement, la configuration lui est injectée, et les scripts Node
l'importent tel quel.

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
- **Plan B — les 4 scrapers** : à écrire quand le plan A tourne, contre des
  fixtures HTML réelles qu'il faudra d'abord capturer. Découpage assumé : un
  plan écrit trop tôt contre des pages inconnues serait périmé avant exécution.

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

**Adzuna, et non France Travail, est la source principale pour ce profil** :
React y rend 36 offres à Marseille et 1481 au national, contre 0 et 27. Le brief
misait sur France Travail et ses 500 000 offres ; elles existent, mais son index
ne permet pas d'y trouver un développeur React.

**Le full remote est rare : 1,3 % des offres.** Sur 699 offres collectées, 9
seulement sont en full remote, contre 190 en hybride. La passe nationale ramène
donc beaucoup de bruit pour très peu d'exploitable, et le rayon marseillais
compte bien plus que prévu.

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

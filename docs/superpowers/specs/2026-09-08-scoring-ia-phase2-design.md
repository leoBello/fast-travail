# Phase 2 — Scoring IA : design

**Date** : 2026-09-08 · **État** : validé en brainstorming, plan à exécuter
Vision : [`../../ROADMAP.md`](../../ROADMAP.md) · Avancement : [`../../ETAT.md`](../../ETAT.md)

---

## Ce que cette phase change, et pourquoi le ROADMAP ne fait plus foi

Le ROADMAP décrit la phase 2 ainsi : « le score lexical devient le pré-filtre
qui décide quelles offres méritent un appel payant ». Cette phrase repose sur
une prémisse — l'appel payant est cher — **que la mesure a démentie**.

Mesuré le 2026-09-08, sur la base réelle :

| Mesure | Valeur |
|---|---:|
| Matière textuelle des 87 offres retenues (titre + description) | 145 000 car. ≈ **41 K tokens** |
| Corpus entier, 4 146 offres | 7,96 M car. ≈ **2,3 M tokens** |
| Offres franchissant le filtre **géographique** mais écartées par le lexique | **1 182** |
| Flux en régime permanent (retenues par jour de publication, 13 jours) | **4 à 5 / jour** |
| Flux géographiquement éligible | **~41 / jour** |
| Coût mensuel Sonnet 5 sur le périmètre géographique, cache compris | **~6 €/mois** |
| Coût d'amorçage, une fois | **~6 €** |

**Conséquence : le pré-filtre lexical perd sa raison d'être comme porte.**
Il écarte aujourd'hui 1 182 offres à portée géographique que personne n'a
lues — c'est-à-dire le seul endroit du système où le critère fondateur du
dépôt (« une offre jamais affichée est perdue ») est violé. Les faire toutes
lire coûte moins qu'un café par mois.

**Le périmètre de lecture de l'IA est donc le filtre géographique**
(`department in ('13','83','84') or remote_label = 'full'`), pas
`offers_shortlist`. Le lexique reste, comme signal de tri parmi d'autres ; il
cesse d'être une condition d'entrée.

Réserve de méthode sur le « 4 à 5 par jour » : `first_seen_at` ne porte que
deux jours de recul, tout le reste étant du backfill. Le chiffre est déduit de
`published_at` sur 13 jours. Il est bon en ordre de grandeur, pas au chiffre
près, et il devra être remesuré après une semaine de cron.

---

## Le principe directeur : séparer ce qui est figé de ce qui est réglable

C'est la décision de conception la plus importante de cette phase, et elle
protège la propriété qui fait la valeur du système actuel.

Tout le score d'aujourd'hui est une **vue** : changer un poids du lexique
reclasse instantanément 4 146 offres, sans re-collecte et sans dépense. Un
verdict d'IA, lui, est **figé au moment de l'appel** : le re-produire coûte de
l'argent. Un score IA monolithique détruirait donc cette propriété — chaque
changement d'avis vaudrait un re-scoring complet du corpus.

D'où la séparation :

| | Qui le produit | Nature | Coût d'un changement d'avis |
|---|---|---|---|
| **Correspondance de compétences** (`fit_score`), extraction structurée, verdict court | Claude, une fois par offre | **Figé** en base | Un re-scoring, payant |
| **Préférences** — freelance, télétravail, TJM, durée, agentique, technos non désirées, fraîcheur | Une vue SQL lisant `scoring_weights` | **Réglable** | `UPDATE`, gratuit, rétroactif |

Le CV et l'offre suffisent à juger la correspondance : c'est un fait objectif,
stable, qui ne change que si le CV change. Ce que Léo *veut* n'est pas un fait
sur l'offre, et n'a rien à faire dans l'appel payant.

### Ce que le CV a révélé, et qui rend cette séparation obligatoire

Le CV porte **WordPress**, **Java EE** et **Python / PyTorch**. Le ROADMAP les
classe explicitement en « écartés » — bas de gamme, périmé, hors cible. Une IA
à qui l'on demande « note la correspondance au CV » donnera donc, très
logiquement, une bonne note à une mission WordPress.

« Correspond au CV » n'est pas « je le veux ». Mélanger les deux dans un seul
nombre sorti du modèle produirait un classement faux et non corrigeable sans
repayer. La séparation ci-dessus est la réponse, et le malus des technos non
désirées est une **ligne en base**, jamais un signal rouge éliminatoire : une
offre « React + un peu de Java Spring » doit descendre, pas disparaître.

### Fréquence et récence

Comptées dans le CV : React **7** expériences sur 8, TypeScript 6, Node.js 3,
Next.js 2, Angular **1**, Java EE 2. Mais Angular et Java EE sont les
expériences les **plus anciennes** (2019-2021), là où React et TypeScript sont
continus jusqu'à aujourd'hui. `profile_skills` porte donc les deux colonnes,
`occurrences` **et** `last_used_year` : une pondération par la seule fréquence
surévaluerait Angular.

---

## La troncature Adzuna : mesurée infaisable à contourner

Le brainstorming envisageait une cinquième surface de scraping, en suivant
l'URL de l'offre pour lire le texte complet. **Mesuré le 2026-09-08, c'est
impossible sur la seule source qui en aurait besoin :**

```
GET https://www.adzuna.fr/robots.txt                   -> 403 (CloudFront, "Request blocked")
GET https://www.adzuna.fr/details/5874124131           -> 403
GET https://www.adzuna.fr/robots.txt (curl par defaut) -> 403
```

Adzuna bloque au niveau du CDN quel que soit l'agent. On ne peut pas même lire
son `robots.txt` — et la règle du dépôt veut qu'une autorisation se constate à
chaque collecte. Pas de `robots.txt` lisible = pas d'autorisation. Passer
outre exigerait d'usurper un navigateur, ce que `CLAUDE.md` interdit.

France Travail, lui, autorise le scraping (`robots.txt` lisible, rien
n'interdit les pages d'offres) — mais son API rend déjà 2 606 caractères en
moyenne. **La cinquième surface est impossible là où elle servirait et inutile
là où elle est permise.**

Piste explorée et abandonnée sur mesure : récupérer le texte via un jumeau de
dédoublonnage (une offre Adzuna tronquée dont un exemplaire France Travail ou
Free-Work porterait le texte entier). Mesuré : **2 offres sur 46**. Ne sauve
rien.

**Parade retenue, conforme au coût asymétrique** : l'offre est envoyée avec un
drapeau `truncated_input`, et le prompt **interdit de conclure au rejet** sur
un texte tronqué. Dans ce cas le modèle score sur ce qu'il a — titre,
entreprise, requête qui a trouvé l'offre, TJM — et marque
`extraction.confidence = 'basse'`. Une offre douteuse reste visible.

---

## Modèle de données

Quatre objets nouveaux, tous par migration, données de référence comprises.

### `candidate_profile` — le CV, expurgé

Une seule ligne active (`is_active`). Colonnes : `id`, `label`, `is_active`,
`cv_text`, `seniority_years`, `created_at`.

`cv_text` est le CV **sans coordonnées** — ni téléphone, ni e-mail, ni
LinkedIn. Ces lignes ne servent à rien au scoring et n'ont aucune raison de
partir dans chaque requête vers un tiers.

### `profile_skills` — le sixième axe réglable

`term`, `occurrences`, `last_used_year`, `stance`
(`'core' | 'adjacent' | 'unwanted'`), `weight`. Semée depuis le CV par
migration, ajustable ensuite par `UPDATE` : c'est ici que « je ne veux plus de
WordPress » s'exprime, sans toucher au code ni repayer un appel.

### `offer_ai_scores` — le jugement figé

Une ligne par offre jugée. `offer_id` (FK vers `offers`, `on delete cascade`),
`fit_score` (0-100), `verdict` (texte court), `extraction` (`jsonb`),
`truncated_input` (bool), `model`, `prompt_version`, `profile_version`,
`input_tokens`, `output_tokens`, `scored_at`, `error`.

`prompt_version` et `profile_version` sont ce qui rend un re-scoring
**ciblé** : quand le prompt ou le CV change, on ne repaie que les offres dont
la version diffère, pas le corpus.

### `scoring_weights` — les préférences, en données

`key`, `value` (`numeric`), `description`. Les clés semées par migration :

| Clé | Rôle |
|---|---|
| `freelance_bonus` | Freelance prioritaire |
| `remote_full_bonus` / `remote_hybrid_bonus` | Le télétravail total prime, l'hybride vaut moins |
| `tjm_floor` / `tjm_bonus_per_100` | Rémunération |
| `duration_long_months` / `duration_long_bonus` | Mission longue |
| `agentic_bonus` | IA / agentique, différenciateur assumé |
| `unwanted_tech_malus` | WordPress, Java EE pur, Python — descend, n'élimine pas |
| `freshness_grace_days` (7) / `freshness_decay_per_day` | Décote de fraîcheur |

### Vue `offers_scored`

Combine `fit_score` et les poids en un `final_score` borné à 0-100, et expose
l'extraction à plat pour être filtrable en SQL. C'est elle que remplacera
`offers_shortlist` dans l'usage quotidien ; `offers_shortlist` reste en place,
inchangée, tant que la phase 2 n'est pas mesurée.

**Décote de fraîcheur** : score plein pendant `freshness_grace_days` (7), puis
`greatest(0, age_days - grace) * freshness_decay_per_day` retranché. Une offre
de 25 jours reste visible, derrière une offre équivalente d'hier.

---

## Le contrat de l'appel

**Modèle** : `claude-sonnet-5`. Le ROADMAP prévoyait Haiku pour un motif de
coût qui n'existe pas (4 € d'écart mensuel), alors que le besoin réclame du
jugement de nuance — « du Vue.js, mais le profil peut correspondre : score
moyen ». Vérifié par appel réel le 2026-09-08 : **HTTP 200**.

**L'en-tête `anthropic-workspace-id` est obligatoire.** La clé du projet n'est
pas rattachée à un workspace ; sans cet en-tête, l'API répond **400**
(`This API key is not scoped to a workspace`). Mesuré, pas supposé.

**Client en `fetch` injecté, pas via le SDK npm.** Motif : tous les clients du
dépôt (France Travail, Adzuna, les deux scrapers) reçoivent `fetch` en
paramètre et sont testés en injectant un double. Le SDK fonctionnerait — la
règle du dépôt interdit les imports `node:` dans nos fichiers, pas les
dépendances `npm:`, et `_shared/db.ts` en importe déjà une. Mais il imposerait
un second style de test pour le seul client qui en aurait un différent, et une
couche de plus entre nous et un en-tête dont on vient de voir qu'il décide du
succès de la requête.

**Sortie contrainte** par `output_config.format` (structured outputs) : le
schéma garantit que `fit_score` est un entier 0-100 et que l'extraction porte
tous ses champs. Pas d'analyse de texte libre.

**Le CV est mis en cache de prompt** (`cache_control`), placé avant la partie
volatile — l'offre. Le CV expurgé et la grille dépassent le minimum cacheable
d'environ 1 024 tokens. À vérifier par `usage.cache_read_input_tokens` non nul
sur le deuxième appel : un cache silencieusement inactif est le défaut
classique, et il triplerait la facture sans rien signaler.

**Un appel par offre**, jamais un lot d'offres dans un même prompt : un lot
partage un contexte, et une offre contaminerait le jugement de la suivante.
La parallélisation se fait par requêtes concurrentes, pas par empilement.

---

## Exécution et cadence

**Edge Function `score-offers` + `pg_cron` pour le quotidien**, script Deno
local pour l'amorçage — le même code, deux points d'entrée, comme
`run-collection.ts` sert déjà quatre sources.

Ce qui rend l'amorçage gratuit à écrire : l'orchestration est définie comme
« prends les N offres éligibles non encore scorées **dans la version courante
du prompt et du profil**, les plus récentes d'abord ». Le backfill n'est alors
pas un mode : c'est le même appel relancé jusqu'à ce qu'il ne rende plus rien.
Idempotent, reprenable après une coupure, et sans état à suivre.

**Cadence** : `pg_cron` à **7 h 00 UTC**, après les quatre collectes
(`ft-daily` 6 h UTC, `adzuna-daily` 6 h 30 UTC, scrapers 7 h 15 heure locale).
Volume quotidien attendu : ~41 offres, largement dans les 150 s de plafond
d'une Edge Function avec une concurrence de 4.

**La Batch API est écartée pour l'instant** : moitié prix, mais elle impose un
état à suivre entre soumission et récupération pour économiser environ 3 € par
mois. À reconsidérer si le volume change d'ordre de grandeur.

---

## Comment on saura que ça marche

Décision de Léo : **la pertinence se jugera à la livraison du tableau de bord**
(phase 3), et les retouches se feront à ce moment-là. Aucune vérité terrain
n'est constituée dans cette phase.

C'est un risque assumé, et il est consigné comme tel : rien ici ne prouve que
le classement produit est meilleur que le score lexical. Ce que la séparation
figé / réglable garantit, c'est que **la plupart des retouches seront des
`UPDATE` gratuits** plutôt qu'un re-scoring payant — c'est précisément ce qui
rend acceptable de reporter la mesure.

---

## Hors périmètre

- Le tableau de bord et le bouton « importer un CV » : phase 3.
- La génération de CV et de lettres : phase 4.
- Toute forme de scraping de l'URL d'origine des offres : mesuré infaisable.
- Le remplacement de `offers_shortlist`, qui reste en place inchangée.
- La Batch API, l'auto-apply, l'authentification.

## Risques connus

| Risque | Parade |
|---|---|
| Le cache de prompt n'est pas actif et la facture triple en silence | Vérifier `cache_read_input_tokens` sur le deuxième appel, en tâche de mesure |
| 46 des 87 retenues sont tronquées à 500 car. et le jugement porte sur peu de matière | Drapeau `truncated_input`, interdiction de rejeter, `confidence` basse |
| Un changement de prompt oblige à repayer | `prompt_version` en base : seules les offres périmées sont rejouées |
| Le classement n'est pas mesuré avant la phase 3 | Assumé ; atténué par des préférences réglables sans re-scoring |
| L'API échoue partiellement sur un lot | `error` stocké par offre, l'offre reste candidate au prochain passage |

/**
 * Types de vocabulaire des « faits » d'une offre jugée : télétravail,
 * engagement, confiance, et l'issue d'une candidature terminée.
 *
 * Alignés sur `supabase/functions/_shared/scoring-types.ts` (`Confidence`,
 * `WorkMode`, `Engagement`) et sur la contrainte
 * `offer_applications_outcome_connu` (migration
 * `20260910000000_offer_applications.sql`), mais **redéfinis ici plutôt
 * qu'importés** : le dashboard est un projet Node distinct de l'exécution
 * Deno des Edge Functions (frontières d'architecture, `CLAUDE.md`), et rien
 * ne relie leurs graphes de modules à la compilation — importer depuis
 * `supabase/functions/` casserait la frontière que ce fichier documente.
 * Le commentaire ci-dessus est le lien qui doit rester vrai si l'une des
 * deux définitions bouge ; comme pour `StatusBadge.tsx`
 * (`SuiviStatus` ↔ `offer_applications_status_connu`) et `Absence.tsx`
 * (`AbsenceNature` ↔ mesure en base), c'est une référence en commentaire,
 * pas un import.
 */

/**
 * Les quatre issues d'une candidature terminée
 * (`offer_applications_outcome_connu`). Un second axe, jamais une étape de
 * plus (GUIDELINES §1) : une candidature peut n'avoir aucune issue tant
 * qu'elle n'est pas `terminee`.
 */
export type Issue = 'offre_recue' | 'refus' | 'sans_reponse' | 'desistement';

/**
 * Les valeurs connues de `WorkMode` (`scoring-types.ts`), sans le `null`
 * qu'il porte : `null` a son propre libellé (« non précisé », GUIDELINES
 * §3.2), et une clé de dictionnaire ne peut pas être `null`.
 */
export type TeletravailConnu = 'full_remote' | 'hybride' | 'sur_site';

/** Idem pour `Engagement` : `'autre' | null` du type source, `null` à part. */
export type EngagementConnu = 'freelance' | 'cdi' | 'cdd' | 'autre';

/** `Confidence` (`scoring-types.ts`) — jamais `null`, contrairement aux deux précédents. */
export type Confiance = 'haute' | 'moyenne' | 'basse';

/** Les valeurs connues de `Seniority` (`data/types.ts`, miroir de
 * `scoring-types.ts`), sans le `null` qu'il porte — même principe que
 * `TeletravailConnu`/`EngagementConnu` ci-dessus (tâche 8). */
export type SenioriteConnue = 'junior' | 'confirme' | 'senior' | 'lead';

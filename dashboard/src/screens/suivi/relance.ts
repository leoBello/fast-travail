/**
 * La relance due (`Suivi.dc.html`, colonne « Postulée ») : un fait calculé
 * sur `candidature_envoyee_le` (`applied_at`), jamais une invention — voir
 * task-9-brief.md, « la relance due calculée sur applied_at ».
 *
 * `RELANCE_DUE_DAYS` est un réglage d'écran, pas une donnée mesurée en base :
 * aucune ligne de `scoring_weights` ni `search_queries` ne porte de seuil de
 * relance (vérifié — CLAUDE.md documente les axes réglables, aucun n'en
 * parle). Une semaine sans nouvelle après un envoi est le repère usuel pour
 * relancer une candidature ; ce n'est pas une mesure du dépôt, seulement un
 * choix d'écran assumé et isolé ici pour rester facile à ajuster.
 */
export const RELANCE_DUE_DAYS = 7;

/**
 * Jours écoulés depuis `dateIso`, arrondis vers le bas, jamais négatifs (une
 * horloge cliente légèrement en avance ne doit pas afficher un compte
 * négatif) — même construction que `formatPublication` (`data/format.ts`).
 * `null` sur une date absente ou invalide : l'appelant décide du rendu.
 */
export function joursDepuis(dateIso: string | null, maintenant: Date = new Date()): number | null {
  if (dateIso === null) return null;
  const parsed = Date.parse(dateIso);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, Math.floor((maintenant.getTime() - parsed) / 86_400_000));
}

/**
 * Vrai quand une candidature `postulée` attend une relance :
 * `joursDepuis(appliedAt) >= RELANCE_DUE_DAYS`. `null` (pas d'envoi connu,
 * cas qui ne devrait pas survenir pour une offre `postulée` — la contrainte
 * SQL `offer_applications_applied_at_requis` l'exige) rend `false` : jamais
 * de relance affirmée sur un fait absent.
 */
export function relanceDue(appliedAt: string | null, maintenant: Date = new Date()): boolean {
  const jours = joursDepuis(appliedAt, maintenant);
  return jours !== null && jours >= RELANCE_DUE_DAYS;
}

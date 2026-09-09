import type { OfferApplicationState, OfferDashboardRow, OfferScoredRow } from './types';

/**
 * Une ligne `offers_dashboard` minimale, valide, que chaque test surcharge
 * sur ce qu'il éprouve. Partagée entre `format.test.ts` et les tests des
 * composants d'écran (tâche 7) pour ne pas répéter ce littéral partout —
 * un champ ajouté au type ne se corrige alors qu'à un seul endroit.
 */
export function ligneOffre(partiel: Partial<OfferDashboardRow> = {}): OfferDashboardRow {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    source: 'adzuna',
    title: 'Développeur React',
    company_name: 'Acme',
    city: 'Marseille',
    department: '13',
    url: 'https://exemple.test/offre',
    published_at: '2026-09-08T08:00:00.000Z',
    fit_score: 80,
    verdict: 'Bon alignement.',
    engagement: null,
    work_mode: null,
    seniority: null,
    domain: null,
    confidence: 'haute',
    agentic_ai: false,
    duration_months: null,
    compensation_kind: null,
    compensation_min: null,
    compensation_max: null,
    unwanted_count: 0,
    truncated_input: false,
    age_days: 1,
    extraction: {
      stack: [],
      seniority: null,
      work_mode: null,
      engagement: null,
      duration_months: null,
      compensation_kind: null,
      compensation_min: null,
      compensation_max: null,
      agentic_ai: false,
      unwanted_tech: [],
      domain: null,
      confidence: 'haute',
    },
    bonus_engagement: 0,
    bonus_remote: 0,
    bonus_remuneration: 0,
    bonus_duree: 0,
    bonus_agentique: 0,
    malus_technos: 0,
    malus_fraicheur: 0,
    final_score: 80,
    display_key: 'acme|developpeurreact',
    group_size: 1,
    group_sources: ['adzuna'],
    candidature_statut: null,
    candidature_issue: null,
    candidature_ouverte_le: null,
    candidature_envoyee_le: null,
    candidature_relancee_le: null,
    candidature_entretien_le: null,
    candidature_heritee: null,
    found_by_labels: [],
    trusted_query: false,
    ...partiel,
  };
}

/** Un jugement individuel d'`offers_scored` (tâche 8, `TwoSourcesPanel`) —
 * même motif que `ligneOffre` ci-dessus, un littéral minimal valide que
 * chaque test surcharge. */
export function jugementOffre(partiel: Partial<OfferScoredRow> = {}): OfferScoredRow {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    source: 'adzuna',
    title: 'Développeur React',
    company_name: 'Acme',
    city: 'Marseille',
    department: '13',
    url: 'https://exemple.test/offre',
    published_at: '2026-09-08T08:00:00.000Z',
    fit_score: 80,
    verdict: 'Bon alignement.',
    engagement: null,
    work_mode: null,
    seniority: null,
    domain: null,
    confidence: 'haute',
    agentic_ai: false,
    duration_months: null,
    compensation_kind: null,
    compensation_min: null,
    compensation_max: null,
    unwanted_count: 0,
    truncated_input: false,
    age_days: 1,
    extraction: {
      stack: [],
      seniority: null,
      work_mode: null,
      engagement: null,
      duration_months: null,
      compensation_kind: null,
      compensation_min: null,
      compensation_max: null,
      agentic_ai: false,
      unwanted_tech: [],
      domain: null,
      confidence: 'haute',
    },
    bonus_engagement: 0,
    bonus_remote: 0,
    bonus_remuneration: 0,
    bonus_duree: 0,
    bonus_agentique: 0,
    malus_technos: 0,
    malus_fraicheur: 0,
    final_score: 80,
    found_by_labels: [],
    trusted_query: false,
    ...partiel,
  };
}

/** `offer_application_state` (tâche 8, `SuiviSection`). */
export function etatCandidature(
  partiel: Partial<OfferApplicationState> = {},
): OfferApplicationState {
  return {
    offer_id: '11111111-1111-1111-1111-111111111111',
    application_offer_id: '11111111-1111-1111-1111-111111111111',
    status: 'retenue',
    outcome: null,
    opened_at: '2026-09-07T08:00:00.000Z',
    status_changed_at: '2026-09-07T08:00:00.000Z',
    applied_at: null,
    last_followup_at: null,
    interview_at: null,
    notes: null,
    heritee: false,
    ...partiel,
  };
}

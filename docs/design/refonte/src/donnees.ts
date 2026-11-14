import type { Engagement, Source, StatutCandidature, Teletravail } from './types';

/** Le jour de la maquette : celui où les données ont été lues en base. */
export const AUJOURDHUI = new Date('2026-10-20T08:15:00+02:00');

/** Comptes lus en base le 2026-10-20 (offers_dashboard, offers, offer_ai_scores). */
export const COMPTES = {
  collectees: 18_427,
  jugees: 3_003,
  jugementsReussis: 3_859,
  auDessusDuSeuil: 79,
  aDecider: 49,
  jamaisOuvertes: 49,
  jugementsEnEchec: 2_147,
  premierEchec: '2 octobre',
  dernierJugementReussi: '1er octobre',
  postulees: 13,
  relancesDues: 12,
  derniereCandidature: '17 septembre',
} as const;

/** `GET /statut-counts` : les huit clés, zéros compris. */
export const COMPTES_STATUT: Record<'a_traiter' | StatutCandidature | 'toutes', number> = {
  a_traiter: 2_966,
  retenue: 0,
  postulee: 12,
  relancee: 1,
  entretien: 0,
  terminee: 0,
  ecartee: 24,
  toutes: 3_003,
};

/** `GET /work-mode-counts` : « non précisé » est une valeur, pas un silence (GUIDELINES §3.2). */
export const COMPTES_TELETRAVAIL: Record<Teletravail | 'non_precise', number> = {
  full_remote: 467,
  hybride: 320,
  sur_site: 150,
  non_precise: 2_066,
};

export const LIBELLE_SOURCE: Record<Source, string> = {
  adzuna: 'Adzuna',
  france_travail: 'France Travail',
  collective: 'Collective.work',
  free_work: 'Free-Work',
};

export const LIBELLE_TELETRAVAIL: Record<Teletravail, string> = {
  full_remote: 'Full remote',
  hybride: 'Hybride',
  sur_site: 'Sur site',
};

export const LIBELLE_ENGAGEMENT: Record<Engagement, string> = {
  freelance: 'Freelance',
  cdi: 'CDI',
  cdd: 'CDD',
  autre: 'Autre contrat',
};

export const LIBELLE_STATUT: Record<StatutCandidature, string> = {
  retenue: 'Retenue',
  postulee: 'Postulée',
  relancee: 'Relancée',
  entretien: 'Entretien',
  terminee: 'Terminée',
  ecartee: 'Écartée',
};

/** `profile_skills` : les termes du CV, avec leur position. */
export const PROFIL: Record<string, 'core' | 'adjacent' | 'unwanted'> = {
  react: 'core',
  typescript: 'core',
  javascript: 'core',
  supabase: 'core',
  tdd: 'core',
  llm: 'core',
  mcp: 'core',
  agentique: 'core',
  'next.js': 'core',
  postgresql: 'adjacent',
  jest: 'adjacent',
  angular: 'adjacent',
  'node.js': 'adjacent',
  nodejs: 'adjacent',
  java: 'unwanted',
  wordpress: 'unwanted',
  python: 'unwanted',
};

export function positionProfil(techno: string): 'core' | 'adjacent' | 'unwanted' | null {
  const cle = techno.toLowerCase().replace(/\s+/g, '').replace(/\.js$/, '.js');
  return PROFIL[cle] ?? PROFIL[cle.replace('.js', '')] ?? null;
}

/** `scoring_weights` : les préférences, réglables et gratuites. */
export const POIDS = {
  freelance_bonus: 12,
  cdi_bonus: 2,
  remote_full_bonus: 15,
  remote_hybrid_bonus: 4,
  agentic_bonus: 10,
  duration_long_bonus: 8,
  tjm_bonus_cap: 12,
  freshness_decay_per_day: 1,
  freshness_grace_days: 7,
  freshness_malus_cap: 25,
} as const;

const entier = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

export const nombre = (n: number) => entier.format(n);
export const score = (n: number) => decimal.format(n);
export const signe = (n: number) => (n > 0 ? `+${decimal.format(n)}` : `−${decimal.format(-n)}`);
export const pourcent = (n: number) => `${decimal.format(n)} %`;

export function joursDepuis(dateIso: string): number {
  return Math.floor((AUJOURDHUI.getTime() - Date.parse(`${dateIso}T12:00:00+02:00`)) / 86_400_000);
}

export function montant(r: { nature: 'tjm' | 'salaire'; min: number | null; max: number | null }) {
  const fmt = (v: number) => (r.nature === 'salaire' ? `${entier.format(v / 1000)} k€` : `${v} €`);
  const plage =
    r.min !== null && r.max !== null && r.min !== r.max
      ? `${fmt(r.min)} – ${fmt(r.max)}`
      : fmt((r.min ?? r.max) as number);
  return r.nature === 'tjm' ? `${plage} / jour` : `${plage} / an`;
}

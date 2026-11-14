export type Source = 'adzuna' | 'france_travail' | 'collective' | 'free_work';
export type Teletravail = 'full_remote' | 'hybride' | 'sur_site';
export type Engagement = 'freelance' | 'cdi' | 'cdd' | 'autre';
export type Confiance = 'haute' | 'moyenne' | 'basse';
export type StatutCandidature =
  | 'retenue'
  | 'postulee'
  | 'relancee'
  | 'entretien'
  | 'terminee'
  | 'ecartee';

/** Une ligne d'`offers_dashboard`, réduite à ce que la maquette affiche. */
export interface Offre {
  id: string;
  source: Source;
  titre: string;
  employeur: string | null;
  lieu: string | null;
  /** Produit par le modèle, figé. */
  fit: number;
  /** `fit` + préférences de `scoring_weights`, plafonné à 100. */
  final: number;
  verdict: string;
  engagement: Engagement | null;
  teletravail: Teletravail | null;
  confiance: Confiance;
  agentique: boolean;
  tronque: boolean;
  remuneration: { nature: 'tjm' | 'salaire'; min: number | null; max: number | null } | null;
  bonus: {
    engagement: number;
    teletravail: number;
    remuneration: number;
    duree: number;
    agentique: number;
    /** Négatif : un malus. */
    technos: number;
    /** Négatif : un malus. */
    fraicheur: number;
  };
  ageJours: number;
  exemplaires: number;
  sources: Source[];
  stack: string[];
}

export interface Candidature {
  id: string;
  statut: StatutCandidature;
  titre: string;
  employeur: string | null;
  engagement: Engagement | null;
  teletravail: Teletravail | null;
  final: number;
  fit: number;
  envoyeeLe: string | null;
}

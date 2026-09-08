export type SkillStance = 'core' | 'adjacent' | 'unwanted';
export type Confidence = 'haute' | 'moyenne' | 'basse';
export type WorkMode = 'full_remote' | 'hybride' | 'sur_site' | null;
export type Engagement = 'freelance' | 'cdi' | 'cdd' | 'autre' | null;
export type Seniority = 'junior' | 'confirme' | 'senior' | 'lead' | null;

export interface CandidateProfileRow {
  label: string;
  cv_text: string;
  seniority_years: number;
  profile_version: string;
}

export interface ProfileSkillRow {
  term: string;
  occurrences: number;
  last_used_year: number | null;
  stance: SkillStance;
  weight: number;
}

export interface OfferToScore {
  id: string;
  source: string;
  title: string | null;
  description: string | null;
  company_name: string | null;
  city: string | null;
  department: string | null;
  remote_label: string | null;
  contract_type: string | null;
  contract_label: string | null;
  salary_raw: string | null;
  rate_raw: string | null;
  duration_raw: string | null;
  experience_raw: string | null;
  published_at: string | null;
  truncated_input: boolean;
  found_by_labels: string[] | null;
  scored_prompt_version: string | null;
  scored_profile_version: string | null;
}

export interface OfferExtraction {
  stack: string[];
  seniority: Seniority;
  work_mode: WorkMode;
  engagement: Engagement;
  duration_months: number | null;
  compensation_kind: 'tjm' | 'salaire' | null;
  compensation_min: number | null;
  compensation_max: number | null;
  agentic_ai: boolean;
  unwanted_tech: string[];
  domain: string | null;
  confidence: Confidence;
}

export interface OfferJudgement {
  fit_score: number;
  verdict: string;
  extraction: OfferExtraction;
}

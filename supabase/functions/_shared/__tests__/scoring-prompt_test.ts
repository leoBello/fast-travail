import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { buildOfferText, buildSystemBlocks, PROMPT_VERSION } from '../scoring-prompt.ts';
import type { CandidateProfileRow, OfferToScore, ProfileSkillRow } from '../scoring-types.ts';

const profile: CandidateProfileRow = {
  label: 'CV test',
  cv_text: 'LEO BELLO, developpeur front-end senior React TypeScript.',
  seniority_years: 7,
  profile_version: 'cv-2026-09-08',
};

const skills: ProfileSkillRow[] = [
  { term: 'react', occurrences: 7, last_used_year: 2026, stance: 'core', weight: 3 },
  { term: 'angular', occurrences: 1, last_used_year: 2020, stance: 'adjacent', weight: 0.5 },
  { term: 'wordpress', occurrences: 1, last_used_year: 2023, stance: 'unwanted', weight: 0.5 },
];

function offer(overrides: Partial<OfferToScore> = {}): OfferToScore {
  return {
    id: 'abc',
    source: 'adzuna',
    title: 'Developpeur React',
    description: 'Une mission React TypeScript.',
    company_name: 'ACME',
    city: 'Marseille',
    department: '13',
    remote_label: 'full',
    contract_type: 'freelance',
    contract_label: null,
    salary_raw: null,
    rate_raw: '500 EUR/jour',
    duration_raw: '12 mois',
    experience_raw: null,
    published_at: '2026-09-01T00:00:00Z',
    truncated_input: false,
    found_by_labels: ['adzuna:local:react-ts'],
    scored_prompt_version: null,
    scored_profile_version: null,
    ...overrides,
  };
}

Deno.test('le CV est cachable : le bloc systeme porte cache_control', () => {
  const blocks = buildSystemBlocks(profile, skills);
  const cached = blocks.filter((b) => b.cache_control?.type === 'ephemeral');
  assertEquals(cached.length, 1, 'un seul point de cache, sur le bloc stable');
  assertStringIncludes(cached[0].text, 'LEO BELLO');
});

Deno.test('les competences partent avec leur posture et leur recence', () => {
  const text = buildSystemBlocks(profile, skills).map((b) => b.text).join('\n');
  assertStringIncludes(text, 'react');
  assertStringIncludes(text, '2020');
  assertStringIncludes(text, 'wordpress');
});

Deno.test('le prompt interdit de rejeter sur un texte tronque', () => {
  const text = buildSystemBlocks(profile, skills).map((b) => b.text).join('\n');
  assertStringIncludes(text.toLowerCase(), 'tronqu');
  assert(/jamais|interdit|ne (pas|jamais)/i.test(text));
});

Deno.test('le texte de l offre porte la troncature et la provenance', () => {
  const tronquee = buildOfferText(offer({ truncated_input: true }));
  assertStringIncludes(tronquee, 'TRONQUEE');
  assertStringIncludes(tronquee, 'adzuna:local:react-ts');
  assertStringIncludes(tronquee, '500 EUR/jour');
});

Deno.test('une offre non tronquee ne porte pas l avertissement', () => {
  const complete = buildOfferText(offer({ truncated_input: false }));
  assert(!complete.includes('TRONQUEE'));
});

Deno.test('PROMPT_VERSION est une chaine non vide et stable', () => {
  assert(PROMPT_VERSION.length > 0);
});

import type { SystemBlock } from './claude.ts';
import type { CandidateProfileRow, OfferToScore, ProfileSkillRow } from './scoring-types.ts';

/**
 * Toute modification du texte ci-dessous DOIT changer cette version, mais
 * seulement a partir du moment ou un jugement existe deja en base : c'est
 * cette colonne ecrite qui melangerait deux jugements differents sans aucun
 * signal si la version ne changeait pas. Avant la premiere ecriture, le
 * prompt est encore en cours de redaction et peut bouger sans renumeroter.
 */
export const PROMPT_VERSION = 'scoring-v1-2026-09-08';

/**
 * Schema de sortie. `additionalProperties: false` est ce qui rend la sortie
 * sure.
 *
 * Formes mesurees le 2026-09-08 contre l'API reelle (HTTP 400 sinon) :
 * - un `integer` ne peut pas porter `minimum`/`maximum` — la borne de
 *   fit_score est donc portee par le texte des consignes, pas par le schema.
 * - une enumeration nullable ne peut pas s'ecrire `type: [..., 'null']` avec
 *   `null` dans `enum` : il faut `anyOf: [{ enum: [...sans null] }, { type: 'null' }]`.
 * - un nullable SANS enumeration (`type: [T, 'null']` seul) est accepte tel quel.
 * - `maxLength` sur une chaine est accepte.
 */
export const JUDGEMENT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    fit_score: { type: 'integer' },
    verdict: { type: 'string', maxLength: 300 },
    extraction: {
      type: 'object',
      properties: {
        stack: { type: 'array', items: { type: 'string' } },
        seniority: {
          anyOf: [
            { type: 'string', enum: ['junior', 'confirme', 'senior', 'lead'] },
            { type: 'null' },
          ],
        },
        work_mode: {
          anyOf: [
            { type: 'string', enum: ['full_remote', 'hybride', 'sur_site'] },
            { type: 'null' },
          ],
        },
        engagement: {
          anyOf: [
            { type: 'string', enum: ['freelance', 'cdi', 'cdd', 'autre'] },
            { type: 'null' },
          ],
        },
        duration_months: { type: ['integer', 'null'] },
        compensation_kind: {
          anyOf: [
            { type: 'string', enum: ['tjm', 'salaire'] },
            { type: 'null' },
          ],
        },
        compensation_min: { type: ['number', 'null'] },
        compensation_max: { type: ['number', 'null'] },
        agentic_ai: { type: 'boolean' },
        unwanted_tech: { type: 'array', items: { type: 'string' } },
        domain: { type: ['string', 'null'] },
        confidence: { type: 'string', enum: ['haute', 'moyenne', 'basse'] },
      },
      required: [
        'stack',
        'seniority',
        'work_mode',
        'engagement',
        'duration_months',
        'compensation_kind',
        'compensation_min',
        'compensation_max',
        'agentic_ai',
        'unwanted_tech',
        'domain',
        'confidence',
      ],
      additionalProperties: false,
    },
  },
  required: ['fit_score', 'verdict', 'extraction'],
  additionalProperties: false,
};

const CONSIGNES = `Tu evalues l'adequation entre un CV et une offre d'emploi.

Tu produis TROIS choses, et rien d'autre :
1. fit_score : un entier de 0 a 100 inclus, jamais en dehors de ces bornes,
   mesurant la correspondance des COMPETENCES entre le CV et l'offre. C'est un
   fait objectif sur l'offre.
2. verdict : une seule phrase, en francais, disant pourquoi ce score.
3. extraction : les faits de l'offre, tels qu'ils y figurent.

REGLE CAPITALE — tu ne juges PAS ce que le candidat prefere.
Ne tiens aucun compte, dans fit_score, du fait que le poste soit en freelance
ou en CDI, du niveau de teletravail, de la remuneration, de la duree, ni du
caractere desirable de la technologie. Ces preferences sont appliquees
ailleurs, apres toi. Tu notes uniquement : « ce candidat sait-il faire ce
travail ». Une mission WordPress parfaitement adaptee au CV recoit un
fit_score eleve — c'est correct, un autre etage la fera descendre.

Comment ponderer les technologies : une technologie souvent presente ET
recente dans le CV vaut beaucoup ; presente mais ancienne, elle vaut peu. Une
techno voisine que le candidat peut manifestement apprendre (Vue.js pour un
profil React, par exemple) merite un score MOYEN, pas un score bas.

REGLE SUR LES TEXTES TRONQUES — elle prime sur tout le reste.
Certaines offres arrivent avec une description coupee a 500 caracteres. Elles
sont signalees par « DESCRIPTION TRONQUEE ». Dans ce cas il t'est INTERDIT de
conclure au rejet : tu ne sais pas ce que contient la partie manquante, et la
pile technique figure presque toujours plus loin dans le texte. Note alors sur
ce que tu as — l'intitule, l'entreprise, la requete qui a trouve l'offre, la
remuneration — sans jamais descendre sous 40 au seul motif que le texte se
tait, et mets confidence a "basse".

extraction.unwanted_tech : liste les technologies de l'offre marquees
« non desiree » dans la grille de competences ci-dessous. Liste-les meme quand
le fit_score est eleve : c'est un fait, pas un jugement.

extraction.agentic_ai : true si la mission touche aux modeles de langage, aux
agents, au protocole MCP ou a l'ingenierie de prompts.

Reponds uniquement par le JSON demande.`;

export function buildSystemBlocks(
  profile: CandidateProfileRow,
  skills: ProfileSkillRow[],
): SystemBlock[] {
  const grille = skills
    .map((s) =>
      `- ${s.term} : ${
        s.stance === 'core' ? 'noyau' : s.stance === 'adjacent' ? 'adjacent' : 'non desiree'
      }` +
      `, ${s.occurrences} experience(s)` +
      `, derniere utilisation ${s.last_used_year ?? 'jamais'}`
    )
    .join('\n');

  // Un seul point de cache, sur le bloc stable : le CV et la grille ne
  // changent pas d'un appel a l'autre, l'offre si. Le minimum cachable est
  // d'environ 1 024 tokens ; verifier cache_read_input_tokens en tache 8.
  return [
    {
      type: 'text',
      text:
        `${CONSIGNES}\n\n--- CV DU CANDIDAT (${profile.seniority_years} ans d'experience) ---\n` +
        `${profile.cv_text}\n\n--- GRILLE DE COMPETENCES ---\n${grille}`,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

export function buildOfferText(offer: OfferToScore): string {
  const lignes: string[] = [];
  if (offer.truncated_input) {
    lignes.push('DESCRIPTION TRONQUEE a 500 caracteres par la source. Ne conclus pas au rejet.');
  }
  lignes.push(`Intitule : ${offer.title ?? 'inconnu'}`);
  lignes.push(`Entreprise : ${offer.company_name ?? 'inconnue'}`);
  lignes.push(`Lieu : ${offer.city ?? 'inconnu'} (departement ${offer.department ?? '?'})`);
  lignes.push(`Teletravail declare : ${offer.remote_label ?? 'non precise'}`);
  lignes.push(`Contrat : ${offer.contract_type ?? offer.contract_label ?? 'non precise'}`);
  if (offer.rate_raw) lignes.push(`TJM : ${offer.rate_raw}`);
  if (offer.salary_raw) lignes.push(`Salaire : ${offer.salary_raw}`);
  if (offer.duration_raw) lignes.push(`Duree : ${offer.duration_raw}`);
  if (offer.experience_raw) lignes.push(`Experience demandee : ${offer.experience_raw}`);
  if (offer.published_at) lignes.push(`Publiee le : ${offer.published_at}`);
  if (offer.found_by_labels?.length) {
    lignes.push(`Trouvee par la ou les requetes : ${offer.found_by_labels.join(', ')}`);
  }
  lignes.push('', '--- DESCRIPTION ---', offer.description ?? '(aucune description)');
  return lignes.join('\n');
}

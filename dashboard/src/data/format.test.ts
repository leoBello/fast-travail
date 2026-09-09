import { describe, expect, it } from 'vitest';
import {
  badgeAgentique,
  badgeConfiance,
  badgeEngagement,
  badgesDeFaits,
  badgeTeletravail,
  badgeTexteCoupe,
  estTechnoDuCv,
  formatCompensation,
  formatEmployeur,
  formatLieu,
  formatPublication,
  scoreJetons,
} from './format';
import { ligneOffre as ligne } from './test-fixtures';

describe('badges de faits', () => {
  it('ne rend aucun badge de télétravail/engagement quand la valeur est nulle — jamais une case vide', () => {
    const row = ligne({ work_mode: null, engagement: null, agentic_ai: false });
    expect(badgeTeletravail(row)).toBeNull();
    expect(badgeEngagement(row)).toBeNull();
    expect(badgeAgentique(row)).toBeNull();
    expect(badgesDeFaits(row)).toEqual([]);
  });

  it('rend le badge "Full remote" quand work_mode est connu', () => {
    const badge = badgeTeletravail(ligne({ work_mode: 'full_remote' }));
    expect(badge).toEqual({ cle: 'teletravail', ton: 'accent', label: 'Full remote' });
  });

  it("marque le freelance en succès, le reste (CDI/CDD/autre) en neutre — l'engagement n'a qu'une préférence déclarée", () => {
    expect(badgeEngagement(ligne({ engagement: 'freelance' }))?.ton).toBe('succes');
    expect(badgeEngagement(ligne({ engagement: 'cdi' }))?.ton).toBe('neutre');
  });

  it('ne rend le badge IA/agents que si agentic_ai est vrai', () => {
    expect(badgeAgentique(ligne({ agentic_ai: false }))).toBeNull();
    expect(badgeAgentique(ligne({ agentic_ai: true }))).not.toBeNull();
  });

  it('marque la confiance basse en ambre ("alerte"), jamais en rouge (GUIDELINES §3.7)', () => {
    expect(badgeConfiance(ligne({ confidence: 'basse' })).ton).toBe('alerte');
    expect(badgeConfiance(ligne({ confidence: 'haute' })).ton).toBe('succes');
    expect(badgeConfiance(ligne({ confidence: 'moyenne' })).ton).toBe('neutre');
  });

  it("n'affiche le badge de troncature que si truncated_input est vrai, indépendamment de la confiance", () => {
    expect(badgeTexteCoupe(ligne({ truncated_input: false, confidence: 'basse' }))).toBeNull();
    expect(badgeTexteCoupe(ligne({ truncated_input: true, confidence: 'haute' }))).not.toBeNull();
  });
});

describe('formatEmployeur / formatLieu — absences nommées, jamais une case vide', () => {
  it("rend l'employeur connu tel quel", () => {
    expect(formatEmployeur(ligne({ company_name: 'Katchme' }))).toEqual({
      connu: true,
      texte: 'Katchme',
    });
  });

  it('signale un employeur absent (null ou chaîne vide)', () => {
    expect(formatEmployeur(ligne({ company_name: null }))).toEqual({ connu: false });
    expect(formatEmployeur(ligne({ company_name: '   ' }))).toEqual({ connu: false });
  });

  it('préfère la ville, puis le département tel que reçu, puis signale l’absence', () => {
    expect(formatLieu(ligne({ city: 'Paris 1er', department: '75' }))).toEqual({
      connu: true,
      texte: 'Paris 1er',
    });
    expect(formatLieu(ligne({ city: null, department: '44' }))).toEqual({
      connu: true,
      texte: '44',
    });
    expect(formatLieu(ligne({ city: null, department: null }))).toEqual({ connu: false });
  });
});

describe('formatCompensation — trois rendus, jamais un nombre nu (GUIDELINES §3.6)', () => {
  const PLANCHER = 40000; // scoring_weights.salaire_floor, valeur semée — lu via GET /config en vrai.

  it("rend un TJM connu, quelle que soit sa valeur — jamais 'incertain' côté TJM", () => {
    const c = formatCompensation(
      ligne({ compensation_kind: 'tjm', compensation_min: 450, compensation_max: null }),
      PLANCHER,
    );
    expect(c).toEqual({ kind: 'connu', texte: '450 €/j' });
  });

  it('rend un salaire au-dessus du plancher comme connu', () => {
    const c = formatCompensation(
      ligne({ compensation_kind: 'salaire', compensation_min: null, compensation_max: 65000 }),
      PLANCHER,
    );
    expect(c).toEqual({ kind: 'connu', texte: '65 k€/an' });
  });

  it('rend un salaire sous le plancher comme incertain — le montant existe, son unité non (P22)', () => {
    const sousLePlancher = PLANCHER - 1000;
    const c = formatCompensation(
      ligne({
        compensation_kind: 'salaire',
        compensation_min: sousLePlancher,
        compensation_max: null,
      }),
      PLANCHER,
    );
    expect(c.kind).toBe('incertain');
  });

  it("rend 'absent' quand rien n'a été extrait", () => {
    const c = formatCompensation(
      ligne({ compensation_kind: null, compensation_min: null, compensation_max: null }),
      PLANCHER,
    );
    expect(c).toEqual({ kind: 'absent' });
  });

  it(
    "salaireFloor encore inconnu (null, /config pas répondu) : rendu 'attente', jamais " +
      "'connu' (fausse certitude) ni 'incertain' (accusation sans preuve) — correctif de revue, " +
      'tâche 10',
    () => {
      // Le cas exact que la revue a signalé : 4000 est BIEN sous le vrai
      // plancher (40000). Un premier jet rendait `connu` par défaut ici — une
      // fausse certitude affichée pendant le chargement, pas une absence
      // d'information (GUIDELINES §3.3/§3.6).
      const c = formatCompensation(
        ligne({ compensation_kind: 'salaire', compensation_min: 4000, compensation_max: null }),
        null,
      );
      expect(c.kind).toBe('attente');
      expect(c).toMatchObject({ texte: '4 k€/an' }); // le chiffre reste affiché, lui n'est pas en cause
    },
  );

  it("salaireFloor connu (non null) : jamais 'attente', même à la limite exacte du plancher", () => {
    const c = formatCompensation(
      ligne({ compensation_kind: 'salaire', compensation_min: 40000, compensation_max: null }),
      40000,
    );
    expect(c.kind).not.toBe('attente');
  });
});

describe('estTechnoDuCv — les technos présentes dans profile_skills (tâche 10)', () => {
  it('reconnaît une techno du CV, insensible à la casse', () => {
    expect(estTechnoDuCv(['react', 'typescript'], 'React')).toBe(true);
    expect(estTechnoDuCv(['react', 'typescript'], 'TypeScript')).toBe(true);
  });

  it('ne reconnaît pas une techno absente de profile_skills', () => {
    expect(estTechnoDuCv(['react'], 'NestJS')).toBe(false);
  });

  it('cvSkills=null (chargement de /config) : jamais de correspondance affirmée', () => {
    expect(estTechnoDuCv(null, 'React')).toBe(false);
  });
});

describe('formatPublication', () => {
  const maintenant = new Date('2026-09-09T12:00:00.000Z');

  it('affiche des jours entiers écoulés depuis la publication', () => {
    expect(formatPublication('2026-09-05T08:00:00.000Z', maintenant)).toEqual({
      connu: true,
      texte: '4 j',
    });
  });

  it("affiche un libellé distinct pour aujourd'hui plutôt que '0 j'", () => {
    expect(formatPublication('2026-09-09T06:00:00.000Z', maintenant)).toEqual({
      connu: true,
      texte: "aujourd'hui",
    });
  });

  it('ne rend jamais un nombre de jours négatif (horloge cliente en avance)', () => {
    const futur = formatPublication('2026-09-10T00:00:00.000Z', maintenant);
    expect(futur).toEqual({ connu: true, texte: "aujourd'hui" });
  });

  it('signale une date de publication absente ou invalide', () => {
    expect(formatPublication(null, maintenant)).toEqual({ connu: false });
    expect(formatPublication('pas une date', maintenant)).toEqual({ connu: false });
  });
});

describe('scoreJetons — la décomposition réglable, sans jamais un jeton à zéro', () => {
  it('ne rend aucun jeton quand tous les bonus/malus sont à zéro', () => {
    expect(scoreJetons(ligne())).toEqual([]);
  });

  it('rend un jeton par bonus/malus non nul, signé, avec le bon libellé', () => {
    const row = ligne({
      work_mode: 'full_remote',
      bonus_remote: 15,
      engagement: 'freelance',
      bonus_engagement: 12,
      bonus_agentique: 10,
      malus_technos: 8,
    });
    const jetons = scoreJetons(row);
    expect(jetons).toEqual([
      { cle: 'bonus_remote', libelle: 'Full remote', valeur: 15 },
      { cle: 'bonus_engagement', libelle: 'Freelance', valeur: 12 },
      { cle: 'bonus_agentique', libelle: 'IA / agents', valeur: 10 },
      { cle: 'malus_technos', libelle: 'technos non désirées', valeur: -8 },
    ]);
  });

  it('ne rend pas de jeton bonus_remote si work_mode est nul, même si la colonne était non nulle', () => {
    // Garde-fou défensif : ne jamais afficher "+15" sans dire de quoi —
    // ce cas ne devrait pas survenir en pratique (la vue n'accorde le bonus
    // que si work_mode est connu), mais le rendu doit rester sûr si les
    // deux se désynchronisaient.
    const jetons = scoreJetons(ligne({ work_mode: null, bonus_remote: 15 }));
    expect(jetons.find((j) => j.cle === 'bonus_remote')).toBeUndefined();
  });
});

// @vitest-environment node
//
// Ce fichier ne monte rien : il vérifie le dictionnaire et `t()`
// eux-mêmes, pas un composant qui les consommerait (aucun écran n'existe
// encore — tâches 7-9).
import { describe, expect, it } from 'vitest';
import type { AbsenceNature } from '../ui/kit/Absence';
import type { SuiviStatus } from '../ui/kit/StatusBadge';
import type { Confiance, EngagementConnu, Issue, TeletravailConnu } from './domaine';
import { fr } from './fr';
import { t } from './i18n';

describe('t() — résolution des clés', () => {
  it('rend une entrée fixe telle quelle', () => {
    expect(t('statuts.a_traiter')).toBe('À traiter');
    expect(t('issues.refus')).toBe('Refus');
    expect(t('absences.echec-jugement')).toBe('Jugement en échec');
  });

  it('appelle une entrée paramétrée avec ses arguments', () => {
    expect(t('vides.rienADeciderDetail', 6)).toBe(
      "6 offres du jour sont traitées. C'est le résultat normal du travail fait.",
    );
    expect(t('jourZero.decidees', 3)).toBe('3 décidées');
    expect(t('jourZero.resume', { n: 17, seuil: 70 })).toBe(
      "17 offres à 70 ou plus vous attendent. Aucune n'a encore été regardée.",
    );
  });

  it('accorde le singulier quand le compte vaut un', () => {
    // Piège classique d'un message compté : « 1 offres » serait faux. Ce
    // test échoue si quelqu'un simplifie `rienADeciderDetail` en retirant
    // l'accord — vérifié par mutation, voir le rapport de tâche.
    expect(t('vides.rienADeciderDetail', 1)).toBe(
      "1 offre du jour est traitée. C'est le résultat normal du travail fait.",
    );
    expect(t('jourZero.decidees', 1)).toBe('1 décidée');
    expect(t('jourZero.resume', { n: 1, seuil: 70 })).toBe(
      "1 offre à 70 ou plus vous attend. Aucune n'a encore été regardée.",
    );
  });

  it('transmet une chaîne déjà formatée sans la reformater', () => {
    expect(t('vides.collectePasTourneeDetail', 'hier à 6 h 30')).toBe(
      "Dernière réussite hier à 6 h 30. La liste ci-dessous date d'hier.",
    );
  });
});

/**
 * Compte les feuilles atteignables de `noeud` (chaîne ou fonction, chacune
 * comptée une fois) et vérifie que chacune est bien non vide — une chaîne
 * vide ou une fonction qui rend `''` seraient une clé « manquante » au
 * sens du brief (présente mais sans contenu), pas détectée par `tsc`.
 */
function feuilles(noeud: object): unknown[] {
  const acc: unknown[] = [];
  for (const valeur of Object.values(noeud)) {
    if (typeof valeur === 'string' || typeof valeur === 'function') acc.push(valeur);
    else if (typeof valeur === 'object' && valeur !== null) acc.push(...feuilles(valeur));
  }
  return acc;
}

describe('fr.ts — aucune clé manquante, aucune clé orpheline', () => {
  it('trouve des feuilles dans le dictionnaire — sinon les contrôles suivants passeraient à vide', () => {
    // Garde-fou (même forme que guidelines.test.ts, tâche 3) : si
    // `feuilles()` se casse et rend toujours `[]`, chaque `expect` sur un
    // ensemble vide serait vrai par vacuité. Compté au moment d'écrire ce
    // test : 33 feuilles. Le seuil est posé nettement en dessous pour ne
    // pas casser à la moindre reformulation future.
    expect(feuilles(fr).length).toBeGreaterThanOrEqual(20);
  });

  it("n'a aucune feuille vide", () => {
    const fonctionsSondees = feuilles(fr).map((v) =>
      typeof v === 'function'
        ? // Sondée avec des arguments neutres : seule l'absence totale de
          // texte (chaîne vide) est une faute ici, pas la formulation.
          (v as (...a: unknown[]) => string)(0, { n: 0, seuil: 0 })
        : v,
    );
    for (const valeur of fonctionsSondees) {
      expect(typeof valeur).toBe('string');
      expect((valeur as string).length).toBeGreaterThan(0);
    }
  });

  // Chaque bloc ci-dessous compare les clés RÉELLEMENT écrites dans `fr.ts`
  // à un ensemble `attendu` typé indépendamment contre le même type
  // source (`SuiviStatus`, `Issue`, …). Les deux objets sont soumis au
  // même contrôle du compilateur, mais par deux chemins distincts : si
  // `fr.ts` affaiblissait un jour son `satisfies Record<Enum, string>`
  // (ex. vers `Record<string, string>`) pour faire taire une erreur
  // `tsc`, ce test — indépendant de cette annotation — resterait le seul
  // filet qui détecte la clé orpheline ou manquante qui en résulterait.

  it('statuts : exactement les sept de offer_applications_status_connu', () => {
    const attendu: Record<SuiviStatus, true> = {
      a_traiter: true,
      retenue: true,
      postulee: true,
      relancee: true,
      entretien: true,
      terminee: true,
      ecartee: true,
    };
    expect(Object.keys(fr.statuts).sort()).toEqual(Object.keys(attendu).sort());
  });

  it('issues : exactement les quatre de offer_applications_outcome_connu', () => {
    const attendu: Record<Issue, true> = {
      offre_recue: true,
      refus: true,
      sans_reponse: true,
      desistement: true,
    };
    expect(Object.keys(fr.issues).sort()).toEqual(Object.keys(attendu).sort());
  });

  it('absences : exactement les huit natures mesurées (AbsenceNature)', () => {
    const attendu: Record<AbsenceNature, true> = {
      'non-publiee': true,
      'non-precisee': true,
      'texte-coupe': true,
      'aucune-techno': true,
      'salaire-non-publie': true,
      'unite-incertaine': true,
      'hors-perimetre': true,
      'echec-jugement': true,
    };
    expect(Object.keys(fr.absences).sort()).toEqual(Object.keys(attendu).sort());
  });

  it('texte-coupe et aucune-techno restent distincts par le seul libellé', () => {
    // Le piège nommé par le brief : `stack = []` est la même donnée pour
    // les deux ; seul le mot change. Un `expect(...).not.toBe(...)` est
    // le contrôle mécanique le plus direct de « ce projet s'y trompe le
    // plus facilement ».
    expect(fr.absences['texte-coupe']).not.toBe(fr.absences['aucune-techno']);
    // Et aucun des deux ne doit se réduire à un simple « stack vide » qui
    // effacerait la distinction que les deux libellés existent pour porter.
    expect(fr.absences['texte-coupe'].toLowerCase()).not.toContain('stack');
    expect(fr.absences['aucune-techno'].toLowerCase()).not.toContain('stack');
  });

  it('teletravail : les valeurs connues de WorkMode, plus le cas non précisé', () => {
    const attendu: Record<TeletravailConnu, true> & Record<'nonPrecise', true> = {
      full_remote: true,
      hybride: true,
      sur_site: true,
      nonPrecise: true,
    };
    expect(Object.keys(fr.teletravail).sort()).toEqual(Object.keys(attendu).sort());
  });

  it('engagement : les valeurs connues de Engagement, plus le cas non précisé', () => {
    const attendu: Record<EngagementConnu, true> & Record<'nonPrecise', true> = {
      freelance: true,
      cdi: true,
      cdd: true,
      autre: true,
      nonPrecise: true,
    };
    expect(Object.keys(fr.engagement).sort()).toEqual(Object.keys(attendu).sort());
  });

  it('confiance : les trois niveaux de Confidence, jamais un doute sur la basse', () => {
    const attendu: Record<Confiance, true> = { haute: true, moyenne: true, basse: true };
    expect(Object.keys(fr.confiance)).toEqual(expect.arrayContaining(Object.keys(attendu)));
    // GUIDELINES §3.7 : la confiance basse n'est pas un doute sur l'offre,
    // seulement sur le texte lu. Le mot « douteu » (douteuse, douteux) ne
    // doit apparaître dans aucun des trois libellés.
    for (const cle of Object.keys(attendu) as Confiance[]) {
      expect(fr.confiance[cle].toLowerCase()).not.toContain('douteu');
    }
  });
});

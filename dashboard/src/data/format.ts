import type { BadgeTon } from '../ui/kit/Badge';
import type { ScoreJeton } from '../ui/kit/Score';
import { t } from '../i18n/i18n';
import type { CompensationKind, OfferDashboardRow, Seniority } from './types';

/**
 * Fonctions pures qui traduisent une ligne `offers_dashboard` en faits
 * affichables — badges, absences, montants. Séparées du rendu React pour
 * rester testables sans DOM (`jsdom` ne voit ni largeur ni troncature —
 * GUIDELINES §4 — mais CETTE logique-là, elle, se laisse vérifier).
 *
 * Rien ici ne décide *comment* une absence se dessine (c'est `Absence.tsx`,
 * kit) : ces fonctions décident seulement *quelle* nature s'applique, à
 * partir des données réelles.
 */

export interface FaitBadge {
  cle: string;
  ton: BadgeTon;
  label: string;
  discontinu?: boolean;
}

/** `work_mode` connu → un badge ; `null` → rien ici (la ligne "non précisé"
 * du panneau de filtres, elle, doit rester visible — GUIDELINES §3.2 — mais
 * une carte ou une ligne de liste n'affiche jamais une case vide en badge). */
export function badgeTeletravail(row: OfferDashboardRow): FaitBadge | null {
  if (row.work_mode === null) return null;
  return { cle: 'teletravail', ton: 'accent', label: t(`teletravail.${row.work_mode}`) };
}

export function badgeEngagement(row: OfferDashboardRow): FaitBadge | null {
  if (row.engagement === null) return null;
  const ton: BadgeTon = row.engagement === 'freelance' ? 'succes' : 'neutre';
  return { cle: 'engagement', ton, label: t(`engagement.${row.engagement}`) };
}

export function badgeAgentique(row: OfferDashboardRow): FaitBadge | null {
  if (!row.agentic_ai) return null;
  return { cle: 'agentique', ton: 'info', label: t('iaAgents.badge') };
}

const TON_CONFIANCE: Record<OfferDashboardRow['confidence'], BadgeTon> = {
  haute: 'succes',
  moyenne: 'neutre',
  basse: 'alerte',
};

/**
 * `Pick<…>` plutôt que la ligne complète : `TwoSourcesPanel` (tâche 8)
 * applique ce badge à un `OfferScoredRow` (un jugement individuel du
 * groupe), qui ne porte pas les colonnes `candidature_*`/`group_*` d'une
 * `OfferDashboardRow`. Élargir la forme acceptée à ce que la fonction LIT
 * réellement rend les deux appelants valides sans dupliquer le badge — même
 * donnée, même rendu, quelle que soit la ligne qui la porte.
 */
export function badgeConfiance(row: Pick<OfferDashboardRow, 'confidence'>): FaitBadge {
  return {
    cle: 'confiance',
    ton: TON_CONFIANCE[row.confidence],
    label: t(`confiance.${row.confidence}`),
  };
}

/** Distinct de l'absence `stack` (`texte-coupe`, kit `Absence`) : ce badge
 * porte le FAIT `truncated_input`, pas une valeur de champ manquante.
 * `Pick<…>`, même raison que `badgeConfiance` ci-dessus. */
export function badgeTexteCoupe(row: Pick<OfferDashboardRow, 'truncated_input'>): FaitBadge | null {
  if (!row.truncated_input) return null;
  return { cle: 'texte-coupe', ton: 'alerte', label: t('matin.texteCoupe500'), discontinu: true };
}

/** Toutes les cartes/lignes de faits d'une offre, dans l'ordre de la
 * maquette (télétravail, engagement, IA/agents), plus la confiance et
 * l'éventuel avertissement de troncature — appelants séparés : la maquette
 * les place à des endroits différents de la carte. */
export function badgesDeFaits(row: OfferDashboardRow): FaitBadge[] {
  return [badgeTeletravail(row), badgeEngagement(row), badgeAgentique(row)].filter(
    (badge): badge is FaitBadge => badge !== null,
  );
}

/**
 * La séniorité, toujours en badge — y compris quand elle est inconnue
 * (tâche 8, en-tête du détail). Distinct de `badgeTeletravail`/
 * `badgeEngagement` ci-dessus, qui rendent `null` (aucun badge) sur une
 * valeur inconnue : la maquette (`Detail.dc.html`) dessine explicitement une
 * pastille « Séniorité non précisée » plutôt que de la faire disparaître —
 * un choix propre à cet écran, pas une règle générale du kit.
 */
export function badgeSeniorite(seniority: Seniority): FaitBadge {
  if (seniority === null) {
    return { cle: 'seniorite', ton: 'neutre', label: t('seniorite.nonPrecise') };
  }
  return { cle: 'seniorite', ton: 'neutre', label: t(`seniorite.${seniority}`) };
}

export type Employeur = { connu: true; texte: string } | { connu: false };

export function formatEmployeur(row: OfferDashboardRow): Employeur {
  if (row.company_name === null || row.company_name.trim() === '') return { connu: false };
  return { connu: true, texte: row.company_name };
}

export type Lieu = { connu: true; texte: string } | { connu: false };

/**
 * `city`, sinon le `department` tel que reçu (un code de source, pas un nom
 * de région — aucune table de correspondance département→nom n'existe dans
 * ce dépôt ; l'afficher tel quel reste honnête, l'inventer ne le serait
 * pas), sinon l'absence.
 */
export function formatLieu(row: OfferDashboardRow): Lieu {
  if (row.city !== null && row.city.trim() !== '') return { connu: true, texte: row.city };
  if (row.department !== null && row.department.trim() !== '') {
    return { connu: true, texte: row.department };
  }
  return { connu: false };
}

/**
 * Le plancher qui distingue un salaire « sûr » d'un salaire « incertain »
 * (GUIDELINES §3.6). Dupliqué de `scoring_weights.salaire_floor`
 * (migration `20260909040000_remuneration_par_nature_et_plafond_technos.sql`,
 * valeur semée : 40000) : l'API `api-dashboard` n'expose pas cette table,
 * donc ce nombre ne peut pas être lu en direct. **Réserve** : si ce poids
 * est un jour réglé via `UPDATE scoring_weights` (CLAUDE.md le décrit comme
 * gratuit et rétroactif), cette copie divergera silencieusement — signalé
 * dans le rapport de tâche, pas résolu ici faute d'une route qui l'expose.
 */
export const SALAIRE_FLOOR_DUPLIQUE = 40000;

export type Compensation =
  { kind: 'connu'; texte: string } | { kind: 'incertain'; texte: string } | { kind: 'absent' };

/**
 * Le cœur des trois rendus (GUIDELINES §3.6), sur les trois valeurs brutes
 * plutôt que sur une `OfferDashboardRow` entière — pour que `TwoSourcesPanel`
 * (tâche 8) puisse l'appliquer telle quelle à un `OfferScoredRow` (un
 * jugement individuel du groupe), qui porte les mêmes trois champs sous une
 * forme distincte. `formatCompensation` ci-dessous n'est plus qu'un appel à
 * celle-ci : aucun comportement ne change, l'extraction rend seulement la
 * logique réutilisable sans la dupliquer (GUIDELINES §1, « le kit s'étend »).
 */
export function formatCompensationValeurs(
  kind: CompensationKind,
  min: number | null,
  max: number | null,
): Compensation {
  const valeur = max ?? min ?? null;
  if (kind === null || valeur === null) return { kind: 'absent' };

  if (kind === 'tjm') {
    return { kind: 'connu', texte: t('matin.tjm', valeur) };
  }

  // kind === 'salaire'
  const texte = t('matin.salaire', Math.round(valeur / 1000));
  return valeur < SALAIRE_FLOOR_DUPLIQUE ? { kind: 'incertain', texte } : { kind: 'connu', texte };
}

export function formatCompensation(row: OfferDashboardRow): Compensation {
  return formatCompensationValeurs(
    row.compensation_kind,
    row.compensation_min,
    row.compensation_max,
  );
}

export type Publication = { connu: true; texte: string } | { connu: false };

/** `published_at` en jours écoulés — arrondi vers le bas, jamais négatif
 * (une horloge cliente légèrement en avance ne doit pas afficher "-1 j"). */
export function formatPublication(
  publishedAt: string | null,
  maintenant: Date = new Date(),
): Publication {
  if (publishedAt === null) return { connu: false };
  const parsed = Date.parse(publishedAt);
  if (Number.isNaN(parsed)) return { connu: false };
  const jours = Math.max(0, Math.floor((maintenant.getTime() - parsed) / 86_400_000));
  return {
    connu: true,
    texte: jours === 0 ? t('matin.ageAujourdhui') : t('matin.joursPublication', jours),
  };
}

/**
 * La décomposition en jetons signés (`Score`, GUIDELINES §3.4) : chaque
 * bonus/malus non nul de la ligne, avec un libellé qui dit CE QUI a été
 * récompensé ou pénalisé. Un bonus/malus à zéro est filtré — un jeton à
 * zéro n'explique rien (`Score` masque de toute façon un tableau vide).
 *
 * `bonus_remuneration` et `salaire non publié`/`TJM non publié` (l'absence,
 * kit `Absence`) sont deux choses distinctes : cette fonction ne rend QUE
 * les bonus/malus réglables, jamais l'absence d'un montant — l'appelant
 * compose les deux séparément (`OfferCard`), pour ne pas faire porter à
 * `Score` un chip qui n'est pas un poids réglable.
 */
export function scoreJetons(row: OfferDashboardRow): ScoreJeton[] {
  const jetons: ScoreJeton[] = [];

  if (row.bonus_remote > 0 && row.work_mode !== null) {
    jetons.push({
      cle: 'bonus_remote',
      libelle: t(`teletravail.${row.work_mode}`),
      valeur: row.bonus_remote,
    });
  }
  if (row.bonus_engagement > 0 && row.engagement !== null) {
    jetons.push({
      cle: 'bonus_engagement',
      libelle: t(`engagement.${row.engagement}`),
      valeur: row.bonus_engagement,
    });
  }
  if (row.bonus_remuneration > 0) {
    jetons.push({
      cle: 'bonus_remuneration',
      libelle: t('matin.bonusRemuneration'),
      valeur: row.bonus_remuneration,
    });
  }
  if (row.bonus_duree > 0) {
    jetons.push({ cle: 'bonus_duree', libelle: t('matin.bonusDuree'), valeur: row.bonus_duree });
  }
  if (row.bonus_agentique > 0) {
    jetons.push({
      cle: 'bonus_agentique',
      libelle: t('iaAgents.badge'),
      valeur: row.bonus_agentique,
    });
  }
  if (row.malus_technos > 0) {
    jetons.push({
      cle: 'malus_technos',
      libelle: t('matin.malusTechnos'),
      valeur: -row.malus_technos,
    });
  }
  if (row.malus_fraicheur > 0) {
    jetons.push({
      cle: 'malus_fraicheur',
      libelle: t('matin.malusFraicheur'),
      valeur: -row.malus_fraicheur,
    });
  }

  return jetons;
}

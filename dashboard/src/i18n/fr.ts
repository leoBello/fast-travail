import type { AbsenceNature } from '../ui/kit/Absence';
import type { SuiviStatus } from '../ui/kit/StatusBadge';
import type { Confiance, EngagementConnu, Issue, TeletravailConnu } from './domaine';

/**
 * Le dictionnaire français — seule langue pour l'instant (GUIDELINES §3.8).
 *
 * Chaque groupe qui correspond à un vocabulaire **fixé ailleurs** (un type
 * du kit, une contrainte SQL) porte `satisfies Record<Enum, string>` :
 * retirer une entrée, en mal orthographier une clé, ou en laisser une en
 * trop devient une erreur de compilation — pas une pastille vide à
 * l'écran. C'est la même garantie que celle demandée pour `t()` (clé
 * inexistante = erreur de compilation), appliquée un cran plus tôt, à la
 * construction du dictionnaire lui-même.
 *
 * Structure à deux niveaux partout (`groupe.cle`), jamais plus profond :
 * `i18n.ts` s'appuie sur cette forme pour dériver le type des clés de `t()`
 * sans recursion de profondeur arbitraire — un choix de simplicité, pas une
 * limite technique contournable autrement.
 *
 * Ajouter une langue : dupliquer ce fichier (`en.ts`…), le typer
 * `satisfies typeof fr` pour que le compilateur signale toute clé
 * manquante ou en trop, puis brancher un sélecteur devant `t()`. Aucune
 * étape ne touche aux appelants : ils continuent d'écrire `t('groupe.cle')`.
 */
export const fr = {
  app: {
    // Échafaudage de `App.tsx` (tâche 1) : aucun écran, mais soumis à la
    // même règle — aucune chaîne affichée en dur, même provisoire.
    echafaudage: 'fast-travail — tableau de bord (échafaudage)',
  },

  /**
   * Les sept statuts de suivi (`SuiviStatus`, `StatusBadge.tsx`), alignés
   * sur `offer_applications_status_connu`. `ecartee` n'est pas une
   * septième étape : c'est une sortie possible à tout moment.
   */
  statuts: {
    a_traiter: 'À traiter',
    retenue: 'Retenue',
    postulee: 'Postulée',
    relancee: 'Relancée',
    entretien: 'Entretien',
    terminee: 'Terminée',
    ecartee: 'Écartée',
  } satisfies Record<SuiviStatus, string>,

  /**
   * Les quatre issues d'une candidature terminée (`Issue`, `domaine.ts`),
   * alignées sur `offer_applications_outcome_connu`. Un second axe, jamais
   * une étape de plus.
   */
  issues: {
    offre_recue: 'Offre reçue',
    refus: 'Refus',
    sans_reponse: 'Sans réponse',
    desistement: 'Désistement',
  } satisfies Record<Issue, string>,

  /**
   * Les huit absences (`AbsenceNature`, `Absence.tsx`), mesurées en base
   * (GUIDELINES §3.1). `texte-coupe` et `aucune-techno` produisent la
   * **même donnée** (`stack = []`) pour deux causes opposées — leurs
   * libellés sont délibérément aussi éloignés que possible pour qu'aucune
   * lecture rapide ne les confonde : l'un dit que l'information est
   * **absente du texte reçu**, l'autre qu'elle est **absente du texte
   * complet**. Voir le rapport de tâche pour le détail de ce choix.
   */
  absences: {
    'non-publiee': 'non publié par la source',
    'non-precisee': 'non précisé',
    'texte-coupe': 'Non détectable — texte coupé',
    'aucune-techno': 'Aucune techno reconnue',
    'salaire-non-publie': 'salaire non publié',
    'unite-incertaine': 'unité incertaine',
    'hors-perimetre': 'Hors périmètre — jamais lue',
    'echec-jugement': 'Jugement en échec',
  } satisfies Record<AbsenceNature, string>,

  /**
   * Le mode de travail (`WorkMode` de `scoring-types.ts`, sans `null`) et
   * son cas nul : `nonPrecise` n'est **pas** un défaut d'affichage, c'est
   * la ligne visible et cochable que GUIDELINES §3.2 impose (863 offres
   * sur 1 269, mesuré) — jamais un silence.
   */
  teletravail: {
    full_remote: 'Full remote',
    hybride: 'Hybride',
    sur_site: 'Sur site',
    nonPrecise: 'Non précisé',
  } satisfies Record<TeletravailConnu, string> & Record<'nonPrecise', string>,

  /** Même logique que `teletravail` pour `Engagement` (`scoring-types.ts`). */
  engagement: {
    freelance: 'Freelance',
    cdi: 'CDI',
    cdd: 'CDD',
    autre: 'Autre',
    nonPrecise: 'Non précisé',
  } satisfies Record<EngagementConnu, string> & Record<'nonPrecise', string>,

  /** Le seul badge de fait booléen du kit : `agentic_ai` vrai. */
  iaAgents: {
    badge: 'IA / agents',
  },

  /**
   * Les trois niveaux de confiance (`Confidence` de `scoring-types.ts`),
   * plus l'infobulle de la confiance basse (Composants.dc.html,
   * « Infobulle ») : elle porte le *pourquoi*, jamais ce dont la décision
   * dépend (GUIDELINES §1) — donc aucun nombre, aucune date, rien qui
   * périme.
   */
  confiance: {
    haute: 'Confiance haute',
    moyenne: 'Confiance moyenne',
    basse: 'Confiance basse',
    infobulleBasseTitre: 'Confiance basse',
    infobulleBasseCorps:
      "Adzuna ne restitue que les 500 premiers caractères. Le modèle a jugé sur ce début, et avait interdiction d'en conclure un rejet.",
  } satisfies Record<Confiance, string> &
    Record<'infobulleBasseTitre' | 'infobulleBasseCorps', string>,

  /**
   * « Trois vides, trois causes » (Composants.dc.html) : chaque vide dit
   * *pourquoi* il est vide, jamais seulement *que* c'est vide (GUIDELINES
   * §3.1, §3.3). Les deux détails qui portent un compte réel
   * (`rienADeciderDetail`, `collectePasTourneeDetail`) sont des fonctions,
   * pas des chaînes : un nombre écrit en dur ici serait exactement le
   * bogue silencieux que ce fichier existe pour éviter — les comptes
   * bougent à chaque collecte (CLAUDE.md, « Consulter les offres »).
   */
  vides: {
    rienADeciderTitre: 'Rien à décider ce matin',
    rienADeciderDetail: (n: number) =>
      `${n} offre${n === 1 ? '' : 's'} du jour ${n === 1 ? 'est traitée' : 'sont traitées'}. ` +
      `C'est le résultat normal du travail fait.`,
    aucuneCandidatureTitre: 'Aucune candidature encore',
    aucuneCandidatureDetail: 'La première que vous marquerez postulée démarrera la série.',
    collectePasTourneeTitre: "La collecte de ce matin n'a pas tourné",
    // `quand` est une chaîne déjà formatée par l'appelant (ex. « hier à
    // 6 h 30 ») : la mise en forme d'une heure n'est pas du vocabulaire,
    // c'est une décision d'écran — hors périmètre de cette tâche.
    collectePasTourneeDetail: (quand: string) =>
      `Dernière réussite ${quand}. La liste ci-dessous date d'hier.`,
  },

  /**
   * Le premier matin (Etats.dc.html, « Le premier matin — rien n'a encore
   * été décidé ») : `resume` et `decidees` sont des fonctions pour la même
   * raison que `vides` ci-dessus — `n` et `seuil` sont des mesures du
   * jour, jamais des constantes de vocabulaire.
   */
  jourZero: {
    titre: 'Ce matin',
    resume: ({ n, seuil }: { n: number; seuil: number }) =>
      `${n} offre${n === 1 ? '' : 's'} à ${seuil} ou plus vous attend${n === 1 ? '' : 'ent'}. ` +
      `Aucune n'a encore été regardée.`,
    decidees: (n: number) => `${n} décidée${n === 1 ? '' : 's'}`,
    serieNonCommencee: 'série non commencée',
    ariaAucuneDecidee: 'aucune offre décidée',
    ariaAucuneSerie: 'aucune série',
    serieDemarreTitre: 'La série démarre à votre première candidature',
    serieDemarreDetail:
      "Elle compte les jours où vous avez envoyé quelque chose. Aujourd'hui elle vaut zéro, et elle le dit.",
    aucunHistoriqueTitre: 'Aucun historique de candidature',
    aucunHistoriqueDetail:
      "L'entonnoir affiche ses trois premiers nombres, comptés en base, et laisse les deux derniers à 0.",
  },
};

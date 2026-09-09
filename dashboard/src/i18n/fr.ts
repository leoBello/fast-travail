import type { AbsenceNature } from '../ui/kit/Absence';
import type { SuiviStatus } from '../ui/kit/StatusBadge';
import type {
  Confiance,
  EngagementConnu,
  Issue,
  SenioriteConnue,
  TeletravailConnu,
} from './domaine';

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
    nom: 'fast-travail',
    tagline: 'veille',
    erreurConfigTitre: 'Configuration manquante',
    erreurConfigDetail:
      'Les variables VITE_DASHBOARD_API_URL, VITE_SUPABASE_ANON_KEY et VITE_DASHBOARD_TOKEN doivent être définies (voir dashboard/.env.example).',
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

  /** La séniorité (`Seniority`, `data/types.ts`) et son cas nul — même
   * logique que `teletravail`/`engagement` (tâche 8, en-tête du détail). */
  seniorite: {
    junior: 'Junior',
    confirme: 'Confirmé',
    senior: 'Senior',
    lead: 'Lead',
    nonPrecise: 'Séniorité non précisée',
  } satisfies Record<SenioriteConnue, string> & Record<'nonPrecise', string>,

  /** Les quatre sources de collecte (`Source`, `data/types.ts`), pour
   * l'affichage sous le nom de l'employeur (`Main.dc.html`, cartes et
   * lignes de liste). */
  sources: {
    france_travail: 'France Travail',
    adzuna: 'Adzuna',
    free_work: 'Free-Work',
    collective: 'Collective.work',
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
    // `n` = décidées, `total` = taille de la bande « Ce matin » au chargement
    // (tâche 7, MorningBand) : l'infobulle/aria de la progression, pour le
    // cas NON zéro — `ariaAucuneDecidee` ci-dessous reste le libellé du cas
    // zéro, volontairement distinct plutôt qu'un « 0 sur N » générique.
    ariaDecidees: (n: number, total: number) =>
      `${n} offre${n === 1 ? '' : 's'} décidée${n === 1 ? '' : 's'} sur ${total}`,
    serieNonCommencee: 'série non commencée',
    // `n` = jours de suite avec au moins une candidature envoyée (jamais
    // lue) — le pendant non-zéro de `serieNonCommencee`.
    serieJours: (n: number) => `${n} jour${n === 1 ? '' : 's'} de suite`,
    ariaAucuneDecidee: 'aucune offre décidée',
    ariaAucuneSerie: 'aucune série',
    serieDemarreTitre: 'La série démarre à votre première candidature',
    serieDemarreDetail:
      "Elle compte les jours où vous avez envoyé quelque chose. Aujourd'hui elle vaut zéro, et elle le dit.",
    aucunHistoriqueTitre: 'Aucun historique de candidature',
    aucunHistoriqueDetail:
      "L'entonnoir affiche ses trois premiers nombres, comptés en base, et laisse les deux derniers à 0.",
  },

  /**
   * Vocabulaire propre à l'écran du matin (tâche 7, `Main.dc.html`) : la
   * bande « Ce matin », l'en-tête et les colonnes de « Toute la veille », le
   * panneau de filtres. Les libellés de faits déjà couverts ailleurs
   * (télétravail, engagement, IA/agents, confiance — voir plus haut) ne sont
   * pas dupliqués ici.
   */
  matin: {
    rang: 'rang',
    corresp: 'corresp.',
    ecarter: 'Écarter',
    garder: 'Garder',
    ouvrirAnnonce: "Ouvrir l'annonce d'origine",
    // Le résumé RÉGULIER de la bande (une ou plusieurs offres déjà
    // décidées peuvent coexister avec ce qui reste) — distinct de
    // `jourZero.resume`, qui affirme "Aucune n'a encore été regardée" et ne
    // vaut donc que le tout premier jour, jamais recopié ici.
    resume: (n: number) =>
      `${n} offre${n === 1 ? '' : 's'} au-dessus de 50 sans décision. Les autres attendent dans la liste.`,
    suivantes: 'Suivantes',
    precedentes: 'Précédentes',
    pagination: (debut: number, fin: number, total: number) => `${debut}–${fin} sur ${total}`,
    pageNumero: (n: number) => `Page ${n}`,
    ellipsePages: '…',
    parPage: (n: number) => `${n} par page — ce que la fenêtre tient`,
    toutesLaVeille: 'Toute la veille',
    offresJugeesRienMasque: (n: number) =>
      `${n} offre${n === 1 ? '' : 's'} jugée${n === 1 ? '' : 's'}, rien de masqué`,
    antiPerte: (n: number) => `${n} jamais ouverte${n === 1 ? '' : 's'} au-dessus de 50`,
    antiPerteZero: 'Rien laissé de côté au-dessus de 50',
    triRang: 'Tri : rang',
    triCorrespondance: 'Tri : correspondance',
    filtres: 'Filtres',
    fermerFiltres: 'Fermer les filtres',
    reinitialiserFiltres: 'Réinitialiser',
    colRang: 'Rang',
    colCorr: 'Corr.',
    colIntitule: 'Intitulé',
    colEmployeur: 'Employeur',
    colLieu: 'Lieu',
    colPubliee: 'Publiée',
    // La barre d'onglets de « Toute la veille » (`Main.dc.html`, bloc
    // « barre d'onglets »). Libellés DÉDIÉS, distincts de `statuts.*` :
    // `statuts.*` qualifie UNE offre (`StatusBadge` sur une ligne), un
    // onglet nomme une COLLECTION — d'où le pluriel (« Retenues », pas
    // « Retenue »). Réutiliser `statuts.*` mettrait le mauvais nombre
    // grammatical à l'écran, l'écart (c) déjà constaté sur cette maquette
    // (« Importer mon CV » là où elle écrit « Mon CV »). « À traiter »,
    // « Entretien » et « Toutes » restent au singulier/invariable : c'est
    // ce que la maquette écrit déjà pour ces trois-là.
    ongletsLabel: 'Statut de candidature',
    ongletATraiter: 'À traiter',
    ongletRetenues: 'Retenues',
    ongletPostulees: 'Postulées',
    ongletRelancees: 'Relancées',
    ongletEntretien: 'Entretien',
    ongletTerminees: 'Terminées',
    ongletEcartees: 'Écartées',
    ongletToutes: 'Toutes',
    // Le compte d'un onglet tant que `GET /statut-counts` n'a pas répondu :
    // un tiret cadratin, jamais « 0 » (GUIDELINES §3.3 — une absence se
    // nomme, elle ne se vide pas). Version courte de `compteEnAttente`
    // (« … »), pour un espace d'onglet plus étroit qu'une carte.
    compteEnAttenteCourt: '—',
    sources: (n: number) => `${n} sources`,
    // Fait distinct de l'absence `absences.texte-coupe` (celle-ci porte sur
    // `stack` vide) : ce badge dit que LE TEXTE REÇU par le modèle est
    // tronqué (`truncated_input`), quelle que soit la stack détectée.
    texteCoupe500: 'Texte coupé à 500 car.',
    filtreModeTravail: 'Mode de travail',
    filtreEngagement: 'Type de contrat',
    filtreSource: 'Source',
    filtreAgentique: 'IA / agents',
    joursPublication: (n: number) => `${n} j`,
    ageAujourdhui: "aujourd'hui",
    tjm: (v: number) => `${v} €/j`,
    salaire: (kiloeuros: number) => `${kiloeuros} k€/an`,
    uniteIncertaineBadge: 'unité incertaine',
    uniteIncertaineInfobulle:
      "Le montant existe, mais son unité (TJM ou salaire annuel) n'a pas pu être confirmée (P22).",
    bonusRemuneration: 'rémunération',
    bonusDuree: 'longue durée',
    malusTechnos: 'technos non désirées',
    malusFraicheur: 'fraîcheur',
    chargement: 'Chargement…',
    chargementDetail: 'Les données sont en cours de récupération.',
    compteEnAttente: '…',
    erreurChargement: 'Le chargement a échoué',
    erreurChargementDetail: "La connexion à l'API a échoué. Réessayez dans un instant.",
    reessayer: 'Réessayer',
    decisionEchouee: "La décision n'a pas pu être enregistrée. L'offre reste dans la bande.",
    listeVideTitre: 'Aucune offre ne correspond',
    listeVideDetail: 'Essayez de retirer un filtre — la liste complète ne masque rien par défaut.',
  },

  /**
   * Vocabulaire propre au détail d'une offre (tâche 8, `Detail.dc.html`) :
   * le rang décomposé, le bloc à deux jugements, l'extraction, le fil de
   * suivi. Les libellés déjà couverts ailleurs (badges de faits, absences,
   * confiance, statuts, issues, sources) ne sont pas dupliqués ici.
   */
  detail: {
    retour: 'Retour',
    voirAnnonce: "Voir l'annonce",
    chargement: 'Chargement…',
    chargementDetail: "Le détail de l'offre est en cours de récupération.",
    erreurChargement: 'Le chargement a échoué',
    erreurChargementDetail: "La connexion à l'API a échoué. Réessayez dans un instant.",
    reessayer: 'Réessayer',
    introuvableTitre: 'Offre introuvable',
    introuvableDetail: "Cette offre n'existe pas, ou plus, dans le corpus.",
    actionEchouee: "L'action n'a pas pu être enregistrée. Réessayez.",

    pourquoiCeRang: 'Pourquoi cette offre est à ce rang',
    rangExplication:
      'La correspondance vient du modèle et ne bouge pas. Les six autres viennent de vos ' +
      'préférences : les changer reclasse tout le corpus sans rien repayer.',

    deuxSources: 'Vue sur deux sources',
    nAnnonces: (n: number) => `${n} annonces`,
    deuxSourcesExplication:
      'La même mission a été jugée deux fois, sur deux textes de longueurs différentes. ' +
      "C'est le jugement le mieux informé qui est retenu, pas le mieux noté.",
    retenu: 'Retenu',
    masque: 'Masqué',
    texteIntegral: 'Texte intégral',
    uniteTrancheeNote:
      "Les deux annonces ne s'accordent pas sur la nature du montant (TJM ou salaire). Le " +
      'jugement retenu, mieux informé, fait foi.',

    ceQueLAnnonceDit: "Ce que l'annonce dit",
    champEngagement: 'Engagement',
    champModeTravail: 'Mode de travail',
    champSeniorite: 'Séniorité',
    champDuree: 'Durée',
    champRemuneration: 'Rémunération',
    champDomaine: 'Domaine',
    champIaAgents: 'IA / agents',
    champTechnosNonDesirees: 'Technos non désirées',
    dureeMois: (n: number) => `${n} mois`,
    aucune: 'Aucune',
    non: 'Non',
    stackDetectee: (n: number) => `Stack détectée — ${n} technologie${n === 1 ? '' : 's'}`,
    // Tâche 10, `profile_skills` : `n` = technos de la stack présentes dans
    // le CV (peu importe leur nombre, y compris 0 — aucune n'est masquée).
    stackTechnosCv: (n: number) =>
      `En vert, les ${n} technologie${n === 1 ? '' : 's'} présente${n === 1 ? '' : 's'} dans votre CV.`,

    ouJEnSuis: "Où j'en suis",
    retenirOffre: 'Retenir cette offre',
    ecarterOffre: 'Écarter cette offre',
    marquerPostulee: 'Marquer comme postulée',
    marquerRelancee: 'Marquer comme relancée',
    marquerEntretien: 'Passer en entretien',
    marquerTerminee: 'Marquer comme terminée',
    depuisLe: (date: string) => `le ${date}`,
    heriteeNote: "Cet état vient d'une autre annonce du même groupe.",
    ecarteeNote: 'Cette offre a été écartée du suivi.',
    choisirIssue: "Quelle a été l'issue ?",

    // Provenance (tâche 10, `offers_ranked.found_by_labels`/`trusted_query`).
    trouveePar: 'Trouvée par',
    requeteConfiance: 'requête de confiance',
  },

  /**
   * Le suivi des candidatures et la gamification (tâche 9, `Suivi.dc.html`) :
   * l'entonnoir, le pipeline en colonnes, la série, le compteur anti-perte,
   * le taux de réponse. Les libellés déjà couverts ailleurs (statuts, badges
   * de faits, absences) ne sont pas dupliqués ici.
   */
  suivi: {
    titre: 'Mes candidatures',
    sousTitre: 'Ce que la veille a produit, et où chaque piste en est.',
    voirLaVeille: 'Voir la veille',

    chargement: 'Chargement…',
    chargementDetail: 'Les données sont en cours de récupération.',
    erreurChargement: 'Le chargement a échoué',
    erreurChargementDetail: "La connexion à l'API a échoué. Réessayez dans un instant.",
    reessayer: 'Réessayer',

    // « Cette nuit, pendant que le PC était éteint » — l'entonnoir. Les
    // heures de cron sont celles des migrations `20260907230557` (France
    // Travail, 6 h), `20260908002651` (Adzuna, 6 h 30) et `20260909050000`
    // (scoring, 7 h) : un fait du dépôt, pas une estimation.
    entonnoirTitre: 'Cette nuit, pendant que le PC était éteint',
    entonnoirHoraire: 'collecte 6 h & 6 h 30 · jugement 7 h',
    entonnoirNote:
      'Les trois premiers nombres sont comptés en base. Les deux derniers viennent de vos ' +
      "décisions : ils valent 0 tant que vous n'avez rien retenu, et l'entonnoir le dit " +
      "plutôt que de s'effondrer.",
    etapeCollectees: 'collectées en tout',
    etapeLues: "à portée, donc lues par l'IA",
    etapeSeuil: (seuil: number) => `au-dessus de ${seuil}`,
    etapeRetenues: 'retenues',
    etapePostulees: 'postulées',

    colonneAutres: (n: number) => `+ ${n} autre${n === 1 ? '' : 's'}`,
    // Distinct de `matin.compteEnAttente` (« … », le chargement) : une
    // erreur qui se lirait comme un chargement encouragerait à attendre une
    // réponse qui ne viendra pas (revue de tâche 9).
    compteErreur: '—',
    colonneVideTitre: 'Rien pour le moment',
    colonneVideDetail: 'Aucune offre à ce statut.',

    relanceDue: 'relance due',
    envoyeeAujourdhui: "envoyée aujourd'hui",
    envoyeeIlYA: (n: number) => `envoyée il y a ${n} j`,
    relanceeAujourdhui: "relancée aujourd'hui",
    relanceeIlYA: (n: number) => `relancée il y a ${n} j`,
    entretienLe: (date: string) => `entretien le ${date}`,

    serieTitre: 'Série',
    serieNote:
      'Compte les jours avec au moins une candidature envoyée. Lire des offres ne la ' +
      "maintient pas — c'est voulu.",
    // Le libellé de chaque case du calendrier de la série — le nom du jour
    // vient d'`Intl.DateTimeFormat`, jamais écrit en dur (GUIDELINES §3.8).
    serieJourEnvoyee: (jour: string) => `${jour} : candidature envoyée`,
    serieJourVide: (jour: string) => `${jour} : aucune candidature envoyée`,

    antiPerteTitre: 'Jamais ouvertes',
    antiPerteSeuil: (seuil: number) => `au-dessus de ${seuil}`,
    antiPerteNote:
      "Une offre affichée en trop se repère d'un coup d'œil ; une offre jamais affichée est " +
      'perdue. Ce nombre descend à 0 quand vous avez tout regardé.',
    antiPerteParcourir: 'Les parcourir',

    reponseTitre: 'réponses reçues',
    reponseBrut: (reponses: number, envois: number) => `${reponses} / ${envois}`,
    reponseNoteBrut: (seuil: number) =>
      `Trop peu d'envois pour en tirer un taux. Le chiffre s'affiche brut jusqu'à ${seuil} ` +
      'candidatures.',
    reponseTaux: (pct: number) => `${pct} %`,
  },

  /**
   * L'import du CV (tâche 10, `POST /candidate-profile`) : demandé
   * nommément au brief initial (« Un bouton pour importer mon CV »).
   *
   * **Décision tranchée, à respecter à la lettre (CLAUDE.md) : l'import met
   * à jour le CV et ne rejuge RIEN.** Aucune chaîne ici ne doit laisser
   * croire à un rejugement — `enregistrementEnCours` décrit une ÉCRITURE
   * (le CV part en base), jamais un jugement ; `succesDetail` nomme
   * explicitement ce que l'import NE fait PAS.
   */
  profil: {
    importerCv: 'Importer mon CV',
    titre: 'Importer mon CV',
    sousTitre:
      'Met à jour le CV utilisé pour juger les offres. Ne rejuge rien : les jugements déjà ' +
      'payés restent valides tels quels.',
    retour: 'Retour',

    chargement: 'Chargement…',
    chargementDetail: 'La configuration est en cours de récupération.',
    erreurChargement: 'Le chargement a échoué',
    erreurChargementDetail: "La connexion à l'API a échoué. Réessayez dans un instant.",
    reessayer: 'Réessayer',

    profilActifTitre: 'Profil actif',
    aucunProfilActif: 'Aucun profil actif',
    profilVersion: (version: string) => `version ${version}`,
    staleCountLabel: 'Offres jugées sous un autre profil',
    // `n` = offres jugées sous une version DIFFÉRENTE du profil actif —
    // jamais recompté côté client, toujours ce que `GET /config` a mesuré.
    //
    // Depuis le correctif C1 (revue finale de branche, phase 3), ce nombre
    // NE bouge plus tout seul : le cron ignore les changements de CV, donc
    // ces offres restent jugées sous l'ancien profil tant que personne ne le
    // demande explicitement. Le dire ici évite l'impression fausse que ça se
    // résorbera au prochain passage du cron — c'est un geste volontaire, pas
    // une attente.
    offresProfilAnterieur: (n: number) =>
      `${n} offre${n === 1 ? '' : 's'} jugée${n === 1 ? '' : 's'} sous un profil antérieur — ` +
      `reste${n === 1 ? '' : 'nt'} ainsi tant qu'aucun rejugement volontaire n'est lancé ` +
      '(npm run score:backfill -- --rejudge-stale-profile).',
    aucuneOffreProfilAnterieur: 'Aucune offre jugée sous un profil antérieur.',

    champLabel: 'Nom du CV',
    champCvTexte: 'Texte du CV',
    champSeniorite: "Années d'expérience",
    champProfileVersion: 'Version du profil',
    profileVersionAide:
      'Doit être différente de la version active — sans quoi les jugements passés et à venir ' +
      'se mélangeraient sans rien pour les distinguer.',
    boutonImporter: 'Importer',

    // `enregistrementEnCours` décrit une ÉCRITURE en base — jamais un
    // jugement en cours, qui n'existe pas dans ce flux (voir la note ci-dessus).
    enregistrementEnCours: 'Enregistrement du CV…',
    echecImport: "L'import a échoué. Le CV actif n'a pas changé.",

    succesTitre: 'CV importé',
    // Jamais de mention de score, de jugement ou de rejugement : l'import
    // ne fait QUE ça, et l'écran doit le dire aussi explicitement que ce
    // qu'il fait réellement.
    succesDetail:
      "Le CV actif a changé. Aucune offre n'a été rejugée — les scores existants restent " +
      'ceux du profil précédent.',
  },
};

import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { EmptyState } from '../../ui/kit/EmptyState';
import { Badge } from '../../ui/kit/Badge';
import type { OfferDashboardRow, SortField, StatutCounts } from '../../data/types';
import type { DateColonne } from '../../data/format';
import { t } from '../../i18n/i18n';
import { OfferRow } from './OfferRow';
import { Pagination } from './Pagination';
import { StatusTabs } from './StatusTabs';
import { comptePourOnglet } from './statusTabsLogic';
import type { OngletId } from './statusTabsLogic';
import styles from './OfferList.module.css';

/** La dernière colonne suit l'onglet — mais seulement là où la base porte
 * réellement la date (voir `DateColonne`, format.ts). */
function colonneDatePourOnglet(onglet: OngletId): DateColonne {
  if (onglet === 'postulee') return 'envoyee';
  if (onglet === 'relancee') return 'relancee';
  if (onglet === 'entretien') return 'entretien';
  return 'publiee';
}

function libelleColonneDate(onglet: OngletId): string {
  const colonne = colonneDatePourOnglet(onglet);
  if (colonne === 'envoyee') return t('matin.colPostulee');
  if (colonne === 'relancee') return t('matin.colRelancee');
  if (colonne === 'entretien') return t('matin.colEntretien');
  return t('matin.colPubliee');
}

/** Le titre du vide d'un onglet de STATUT à zéro — un participe dédié par
 * statut (`OngletsSuivi.dc.html`, panneau B : « Aucune offre retenue pour
 * l'instant »), jamais une formule passe-partout. `switch` exhaustif SANS
 * `default`, sur `Exclude<OngletId, 'toutes'>` : un huitième statut ajouté
 * un jour est une erreur de compilation, pas un titre manquant à l'écran.
 * L'onglet « Toutes » à zéro reste un corpus vide, pas une étape — il garde
 * `matin.listeVideTitre`, géré séparément par l'appelant. */
function libelleVideOnglet(onglet: Exclude<OngletId, 'toutes'>): string {
  switch (onglet) {
    case 'a_traiter':
      return t('matin.videATraiter');
    case 'retenue':
      return t('matin.videRetenue');
    case 'postulee':
      return t('matin.videPostulee');
    case 'relancee':
      return t('matin.videRelancee');
    case 'entretien':
      return t('matin.videEntretien');
    case 'terminee':
      return t('matin.videTerminee');
    case 'ecartee':
      return t('matin.videEcartee');
  }
}

export interface OfferListProps {
  offers: OfferDashboardRow[];
  /** Sans signification tant que `chargement` est vrai — voir plus bas. */
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  sort: SortField;
  onSortChange: (sort: SortField) => void;
  /** Ouvre le détail d'une offre (tâche 8). Requis — `MatinScreen` le
   * fournit toujours, seuls les tests unitaires d'`OfferList` isolé s'en
   * passent (`OfferRow.onOuvrir`, lui, reste optionnel). */
  onOuvrirOffre: (id: string) => void;
  /** Le compteur anti-perte (`/stats.neverOpened`) : offres au-dessus de 50
   * jamais ouvertes — indépendant des filtres actifs (GUIDELINES §3.3, un
   * compteur qui se nomme à zéro plutôt qu'un silence). Sans signification
   * tant que `statsChargement` est vrai. */
  neverOpened: number;
  /** Vrai tant que `/stats` (donc `neverOpened`) n'a jamais répondu — appel
   * réseau INDÉPENDANT de celui qui charge `offers`/`total` (`chargement`
   * ci-dessous porte sur `/offers`). */
  statsChargement: boolean;
  filtresOuverts: boolean;
  onToggleFiltres: () => void;
  /** Le panneau de filtres lui-même — injecté par l'appelant (`MatinScreen`)
   * pour que `OfferList` reste sans dépendance directe sur `FilterPanel`. */
  panneauFiltres: ReactNode;
  /** Vrai tant que `/offers` n'a JAMAIS répondu — voir la note sur `total`. */
  chargement: boolean;
  erreur: boolean;
  onReessayer: () => void;
  /** Le plancher `scoring_weights.salaire_floor` (tâche 10, `GET /config`) —
   * `null` tant qu'il n'a pas été lu, voir `data/format.ts`. */
  salaireFloor: number | null;
  onglet: OngletId;
  onOngletChange: (onglet: OngletId) => void;
  /** `null` tant que `GET /statut-counts` n'a pas répondu. */
  comptesStatut: StatutCounts | null;
  /** Le total du CORPUS, tous onglets confondus — distinct de `total`, qui
   * est celui de l'onglet actif. Les deux ensemble permettent de dire ce que
   * l'onglet montre ET ce qu'il laisse aux autres, sans jamais prétendre
   * « rien de masqué » sur un onglet qui filtre. `null` tant que
   * `GET /statut-counts` n'a pas répondu (ou a échoué) — un appel réseau
   * INDÉPENDANT de celui qui charge `offers`/`total` (revue finale, I1) : la
   * ligne de compte ne doit jamais afficher « sur 0 jugées » quand ce
   * chiffre est en réalité inconnu. */
  totalCorpus: number | null;
  /** Vrai dès qu'une dimension du panneau de filtres est sélectionnée : la
   * ligne de compte le dit alors explicitement, parce que les comptes
   * d'onglets, eux, restent globaux. */
  filtresActifs: boolean;
}

/**
 * « Toute la veille » (`Main.dc.html`) : la liste complète, rien de masqué.
 *
 * **Trois états, jamais confondus** (revue de tâche 7 — même défaut que
 * `MorningBand` : afficher « 0 offre jugée, rien de masqué » et un badge
 * anti-perte à zéro PENDANT le chargement initial serait une AFFIRMATION
 * fausse, pas une zone blanche). `chargement` (rien d'affirmé) précède
 * toujours `total === 0` (le serveur a confirmé qu'il n'y a rien) dans
 * l'ordre des branches ci-dessous.
 *
 * Pagine via l'API plutôt que de virtualiser : voir `Pagination.tsx` — le
 * nombre de nœuds DOM reste borné (`pageSize`) sans qu'aucune mesure de
 * performance n'ait dû trancher la question (brief : « virtualiser si la
 * mesure le justifie, après l'avoir mesurée » — ici, elle ne se pose pas).
 */
export function OfferList({
  offers,
  total,
  page,
  pageSize,
  onPageChange,
  sort,
  onSortChange,
  onOuvrirOffre,
  neverOpened,
  statsChargement,
  filtresOuverts,
  onToggleFiltres,
  panneauFiltres,
  chargement,
  erreur,
  onReessayer,
  salaireFloor,
  onglet,
  onOngletChange,
  comptesStatut,
  totalCorpus,
  filtresActifs,
}: OfferListProps) {
  const debut = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const fin = Math.min(page * pageSize, total);

  return (
    <section className={styles.section}>
      <StatusTabs actif={onglet} onChange={onOngletChange} comptes={comptesStatut} />

      <div className={styles.entete}>
        <span className={styles.sectionTitre}>{t('matin.toutesLaVeille')}</span>
        <span className={styles.compte}>
          {chargement
            ? t('matin.chargement')
            : filtresActifs
              ? totalCorpus === null
                ? t('matin.compteEnAttente')
                : t('matin.compteOngletFiltre', total, totalCorpus)
              : onglet === 'toutes'
                ? t('matin.offresJugeesRienMasque', total)
                : totalCorpus === null
                  ? t('matin.compteEnAttente')
                  : t('matin.compteOnglet', total, totalCorpus)}
        </span>
        {statsChargement ? (
          <Badge ton="neutre" taille="compacte" discontinu>
            {t('matin.compteEnAttente')}
          </Badge>
        ) : neverOpened === 0 ? (
          <Badge ton="neutre" taille="compacte" discontinu>
            {t('matin.antiPerteZero')}
          </Badge>
        ) : (
          <Badge ton="alerte" taille="compacte" discontinu>
            {t('matin.antiPerte', neverOpened)}
          </Badge>
        )}

        <div className={styles.spacer} />

        <button
          type="button"
          className={styles.bouton}
          onClick={() => onSortChange(sort === 'final_score' ? 'fit_score' : 'final_score')}
        >
          {sort === 'final_score' ? t('matin.triRang') : t('matin.triCorrespondance')}
        </button>
        <button
          type="button"
          className={styles.bouton}
          onClick={onToggleFiltres}
          aria-expanded={filtresOuverts}
        >
          {filtresOuverts ? t('matin.fermerFiltres') : t('matin.filtres')}
        </button>
      </div>

      <div className={styles.corps}>
        {filtresOuverts ? panneauFiltres : null}

        <div className={styles.liste}>
          {erreur ? (
            <EmptyState
              titre={t('matin.erreurChargement')}
              detail={t('matin.erreurChargementDetail')}
            />
          ) : chargement ? (
            <EmptyState titre={t('matin.chargement')} detail={t('matin.chargementDetail')} />
          ) : total === 0 ? (
            onglet === 'toutes' ? (
              <EmptyState titre={t('matin.listeVideTitre')} detail={t('matin.listeVideDetail')} />
            ) : filtresActifs ? (
              // Le vide vient du FILTRE, pas de l'étape : un titre qui
              // accuserait l'onglet (« Aucune offre à traiter ») mentirait
              // sur la cause (revue finale, corollaire d'I2).
              <EmptyState titre={t('matin.videFiltreTitre')} detail={t('matin.videFiltreDetail')} />
            ) : (
              <EmptyState
                titre={libelleVideOnglet(onglet)}
                detail={t('matin.listeOngletVideDetail')}
                action={
                  // Rendu SEULEMENT si l'action mène quelque part : jamais
                  // sur l'onglet « À traiter » lui-même (le clic ne
                  // changerait rien, `statut` mémoïsé resterait identique),
                  // et jamais si son compte est à zéro — sans quoi le
                  // bouton promettrait « Voir les 0 à traiter » (revue
                  // finale, I2).
                  onglet !== 'a_traiter' &&
                  comptesStatut !== null &&
                  comptePourOnglet('a_traiter', comptesStatut) > 0 ? (
                    <button
                      type="button"
                      className={styles.bouton}
                      onClick={() => onOngletChange('a_traiter')}
                    >
                      {t('matin.videVersATraiter', comptePourOnglet('a_traiter', comptesStatut))}
                    </button>
                  ) : undefined
                }
              />
            )
          ) : (
            <>
              <div className={styles.entetesColonnes}>
                <span className={styles.colDroite}>{t('matin.colRang')}</span>
                <span className={styles.colDroite}>{t('matin.colCorr')}</span>
                <span>{t('matin.colIntitule')}</span>
                <span>{t('matin.colEmployeur')}</span>
                <span>{onglet === 'a_traiter' ? t('matin.colLieu') : t('matin.colStatut')}</span>
                <span className={styles.colDroite}>{libelleColonneDate(onglet)}</span>
              </div>
              <div className={styles.separateurLigne} />
              <motion.div layout>
                <AnimatePresence initial={false}>
                  {offers.map((offer) => (
                    <OfferRow
                      key={offer.id}
                      offer={offer}
                      onOuvrir={onOuvrirOffre}
                      salaireFloor={salaireFloor}
                      afficherStatut={onglet !== 'a_traiter'}
                      dateColonne={colonneDatePourOnglet(onglet)}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
              <Pagination
                debut={debut}
                fin={fin}
                total={total}
                onSuivant={() => onPageChange(page + 1)}
                onPrecedent={() => onPageChange(page - 1)}
                suivantDisponible={fin < total}
                precedentDisponible={page > 1}
                numerotation={{
                  page,
                  pageCount: Math.max(1, Math.ceil(total / pageSize)),
                  onPageChange,
                  pageSize,
                }}
              />
            </>
          )}
        </div>
      </div>

      {erreur ? (
        <button type="button" className={styles.bouton} onClick={onReessayer}>
          {t('matin.reessayer')}
        </button>
      ) : null}
    </section>
  );
}

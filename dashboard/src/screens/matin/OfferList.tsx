import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { EmptyState } from '../../ui/kit/EmptyState';
import { Badge } from '../../ui/kit/Badge';
import type { OfferDashboardRow, SortField } from '../../data/types';
import { t } from '../../i18n/i18n';
import { OfferRow } from './OfferRow';
import { Pagination } from './Pagination';
import styles from './OfferList.module.css';

export interface OfferListProps {
  offers: OfferDashboardRow[];
  /** Sans signification tant que `chargement` est vrai — voir plus bas. */
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  sort: SortField;
  onSortChange: (sort: SortField) => void;
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
  neverOpened,
  statsChargement,
  filtresOuverts,
  onToggleFiltres,
  panneauFiltres,
  chargement,
  erreur,
  onReessayer,
}: OfferListProps) {
  const debut = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const fin = Math.min(page * pageSize, total);

  return (
    <section className={styles.section}>
      <div className={styles.entete}>
        <span className={styles.sectionTitre}>{t('matin.toutesLaVeille')}</span>
        <span className={styles.compte}>
          {chargement ? t('matin.chargement') : t('matin.offresJugeesRienMasque', total)}
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
            <EmptyState titre={t('matin.listeVideTitre')} detail={t('matin.listeVideDetail')} />
          ) : (
            <>
              <div className={styles.entetesColonnes}>
                <span className={styles.colDroite}>{t('matin.colRang')}</span>
                <span className={styles.colDroite}>{t('matin.colCorr')}</span>
                <span>{t('matin.colIntitule')}</span>
                <span>{t('matin.colEmployeur')}</span>
                <span>{t('matin.colLieu')}</span>
                <span className={styles.colDroite}>{t('matin.colPubliee')}</span>
              </div>
              <div className={styles.separateurLigne} />
              <motion.div layout>
                <AnimatePresence initial={false}>
                  {offers.map((offer) => (
                    <OfferRow key={offer.id} offer={offer} />
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

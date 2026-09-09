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
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  sort: SortField;
  onSortChange: (sort: SortField) => void;
  /** Le compteur anti-perte (`/stats.neverOpened`) : offres au-dessus de 50
   * jamais ouvertes — indépendant des filtres actifs (GUIDELINES §3.3, un
   * compteur qui se nomme à zéro plutôt qu'un silence). */
  neverOpened: number;
  filtresOuverts: boolean;
  onToggleFiltres: () => void;
  /** Le panneau de filtres lui-même — injecté par l'appelant (`MatinScreen`)
   * pour que `OfferList` reste sans dépendance directe sur `FilterPanel`. */
  panneauFiltres: ReactNode;
  chargement: boolean;
  erreur: boolean;
  onReessayer: () => void;
}

/**
 * « Toute la veille » (`Main.dc.html`) : la liste complète, rien de masqué.
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
        <span className={styles.compte}>{t('matin.offresJugeesRienMasque', total)}</span>
        {neverOpened === 0 ? (
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
          ) : total === 0 && !chargement ? (
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

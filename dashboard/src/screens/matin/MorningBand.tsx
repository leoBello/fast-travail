import { AnimatePresence } from 'framer-motion';
import { EmptyState } from '../../ui/kit/EmptyState';
import type { OfferDashboardRow } from '../../data/types';
import { t } from '../../i18n/i18n';
import { DecidedProgress } from './DecidedProgress';
import { StreakIndicator } from './StreakIndicator';
import { OfferCard } from './OfferCard';
import { Pagination } from './Pagination';
import styles from './MorningBand.module.css';

const PAGE_SIZE = 3;

export interface MorningBandProps {
  /** Les offres de la page courante (au plus trois — la direction A du
   * plan, tranchée par `Main.dc.html`). */
  offers: OfferDashboardRow[];
  /** Le total du brief (offres au-dessus de 50 sans décision), pas la
   * longueur de `offers`. */
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  decidees: number;
  streakDays: number;
  onDecision: (offer: OfferDashboardRow, decision: 'garder' | 'ecarter') => void;
  offresEnTraitement: ReadonlySet<string>;
  chargement: boolean;
  erreur: boolean;
  onReessayer: () => void;
}

/**
 * La bande « Ce matin » (`Main.dc.html`) : les offres au-dessus de 50 sans
 * décision, en trois cartes, avec la pagination `1–3 sur N`.
 *
 * **L'état à zéro** (`total === 0`) est celui qui est vrai le jour de la
 * livraison — `EmptyState` avec `vides.rienADeciderTitre`/`Detail`, jamais
 * une zone blanche (GUIDELINES §3.3, `Etats.dc.html` « Trois vides, trois
 * causes »).
 */
export function MorningBand({
  offers,
  total,
  page,
  onPageChange,
  decidees,
  streakDays,
  onDecision,
  offresEnTraitement,
  chargement,
  erreur,
  onReessayer,
}: MorningBandProps) {
  const debut = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const fin = Math.min(page * PAGE_SIZE, total);

  return (
    <section className={styles.bande} aria-label={t('jourZero.titre')}>
      <div className={styles.entete}>
        <div>
          <h2 className={styles.titre}>{t('jourZero.titre')}</h2>
          <p className={styles.resume}>{t('matin.resume', total)}</p>
        </div>
        <div className={styles.spacer} />
        <div className={styles.indicateurs}>
          <DecidedProgress decidees={decidees} total={total + decidees} />
          <span className={styles.separateur} aria-hidden="true" />
          <StreakIndicator jours={streakDays} />
        </div>
      </div>

      {erreur ? (
        <EmptyState
          titre={t('matin.erreurChargement')}
          detail={t('matin.erreurChargementDetail')}
        />
      ) : total === 0 && !chargement ? (
        <EmptyState
          titre={t('vides.rienADeciderTitre')}
          detail={t('vides.rienADeciderDetail', decidees)}
        />
      ) : (
        <>
          <div className={styles.grille}>
            <AnimatePresence initial={false}>
              {offers.map((offer) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  enTraitement={offresEnTraitement.has(offer.id)}
                  onGarder={() => onDecision(offer, 'garder')}
                  onEcarter={() => onDecision(offer, 'ecarter')}
                />
              ))}
            </AnimatePresence>
          </div>

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

      {erreur ? (
        <button type="button" className={styles.reessayer} onClick={onReessayer}>
          {t('matin.reessayer')}
        </button>
      ) : null}
    </section>
  );
}

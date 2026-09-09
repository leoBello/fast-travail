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
   * longueur de `offers`. Sans signification tant que `chargement` est vrai
   * (voir plus bas). */
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  decidees: number;
  /** Vrai tant que `/stats` (donc `decidees`, tâche 10) n'a jamais répondu —
   * distinct de `chargement` ci-dessous, qui porte sur `/brief` (donc
   * `total`). Les deux appels réseau sont indépendants. */
  decideesChargement: boolean;
  streakDays: number;
  /** Vrai tant que `/stats` (donc `streakDays`) n'a jamais répondu — distinct
   * de `chargement` ci-dessous, qui porte sur `/brief`. Les deux appels
   * réseau sont indépendants et peuvent résoudre à des moments différents. */
  streakChargement: boolean;
  onDecision: (offer: OfferDashboardRow, decision: 'garder' | 'ecarter') => void;
  /** Ouvre le détail d'une offre (tâche 8). Requis, contrairement au
   * `onOuvrir` optionnel d'`OfferCard` : `MatinScreen` le fournit toujours,
   * seuls les tests unitaires d'`OfferCard` isolé s'en passent. */
  onOuvrirOffre: (id: string) => void;
  offresEnTraitement: ReadonlySet<string>;
  /** Vrai tant que `/brief` n'a JAMAIS répondu — voir la note sur `total`. */
  chargement: boolean;
  erreur: boolean;
  onReessayer: () => void;
  /** Le plancher `scoring_weights.salaire_floor` (tâche 10, `GET /config`) —
   * `null` tant qu'il n'a pas été lu, voir `data/format.ts`. */
  salaireFloor: number | null;
}

/**
 * La bande « Ce matin » (`Main.dc.html`) : les offres au-dessus de 50 sans
 * décision, en trois cartes, avec la pagination `1–3 sur N`.
 *
 * **Trois états, jamais confondus** (revue de tâche 7 — le défaut le plus
 * grave relevé : la version précédente affichait « 0 offre au-dessus de 50
 * sans décision » PENDANT le chargement initial, une AFFIRMATION fausse,
 * pas une zone blanche) :
 * - `chargement` (aucune donnée n'est encore arrivée) → un état neutre, qui
 *   n'affirme RIEN sur le nombre d'offres ;
 * - `!chargement && total === 0` (le serveur a confirmé qu'il n'y a rien) →
 *   `EmptyState` avec `vides.rienADeciderTitre`/`Detail`, l'état à zéro
 *   VRAI (GUIDELINES §3.3, `Etats.dc.html` « Trois vides, trois causes ») ;
 * - `!chargement && total > 0` → la grille de cartes.
 */
export function MorningBand({
  offers,
  total,
  page,
  onPageChange,
  decidees,
  decideesChargement,
  streakDays,
  streakChargement,
  onDecision,
  onOuvrirOffre,
  offresEnTraitement,
  chargement,
  erreur,
  onReessayer,
  salaireFloor,
}: MorningBandProps) {
  const debut = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const fin = Math.min(page * PAGE_SIZE, total);

  return (
    <section className={styles.bande} aria-label={t('jourZero.titre')}>
      <div className={styles.entete}>
        <div>
          <h2 className={styles.titre}>{t('jourZero.titre')}</h2>
          <p className={styles.resume}>
            {chargement ? t('matin.chargement') : t('matin.resume', total)}
          </p>
        </div>
        <div className={styles.spacer} />
        <div className={styles.indicateurs}>
          <DecidedProgress
            decidees={decidees}
            total={total + decidees}
            chargement={chargement || decideesChargement}
          />
          <span className={styles.separateur} aria-hidden="true" />
          <StreakIndicator jours={streakDays} chargement={streakChargement} />
        </div>
      </div>

      {erreur ? (
        <EmptyState
          titre={t('matin.erreurChargement')}
          detail={t('matin.erreurChargementDetail')}
        />
      ) : chargement || (total === 0 && decideesChargement) ? (
        // `decideesChargement` entre dans cette garde UNIQUEMENT quand elle
        // empêcherait le texte du zéro confirmé ci-dessous d'afficher un
        // `decidees` pas encore confirmé par `/stats` (tâche 10) — un
        // chargement qui traînerait sur `decidees` seul, `total` déjà connu
        // et non nul, n'a pas besoin de bloquer l'affichage des cartes.
        <EmptyState titre={t('matin.chargement')} detail={t('matin.chargementDetail')} />
      ) : total === 0 ? (
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
                  onOuvrir={onOuvrirOffre}
                  salaireFloor={salaireFloor}
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

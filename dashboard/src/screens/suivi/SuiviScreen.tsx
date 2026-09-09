import type { DashboardClient } from '../../data/client';
import { t } from '../../i18n/i18n';
import { useStats } from '../matin/hooks';
import { Funnel } from './Funnel';
import { PipelineColumn } from './PipelineColumn';
import { SerieCard } from './SerieCard';
import { NeverOpenedCard } from './NeverOpenedCard';
import { ResponseRateCard } from './ResponseRateCard';
import { COLONNES_PIPELINE, usePipelineColonne } from './hooks';
import styles from './SuiviScreen.module.css';

interface Props {
  client: DashboardClient;
  /** Revient à l'écran du matin (`App.tsx` superpose cet écran, comme le
   * détail — tâche 8) : le même geste sert le bouton d'en-tête « Voir la
   * veille » et « Les parcourir » de la carte anti-perte, qui renvoie vers
   * la bande où ces offres sont listées (`GET /brief`, même requête que
   * `neverOpened` — voir `NeverOpenedCard`). */
  onRetour: () => void;
  /** Ouvre le détail d'une offre (tâche 8), depuis une carte du pipeline. */
  onOuvrirOffre: (id: string) => void;
}

/**
 * « Mes candidatures » (`Suivi.dc.html`, tâche 9) : l'entonnoir de la nuit,
 * le pipeline en colonnes, la série et le compteur anti-perte.
 *
 * Cette couche est la SEULE qui appelle le réseau — cinq appels
 * INDÉPENDANTS (`/stats` pour l'entonnoir/la série/l'anti-perte/le taux de
 * réponse, plus un `GET /offers?statut=…` par colonne du pipeline), même
 * principe que `MatinScreen` (tâche 7) : chaque section garde son propre
 * état de chargement/erreur et peut donc répondre à des moments différents,
 * sans qu'un retard sur l'une bloque les autres.
 */
export function SuiviScreen({ client, onRetour, onOuvrirOffre }: Props) {
  const [statsState, recargerStats] = useStats(client);
  const colonnes = {
    retenue: usePipelineColonne(client, 'retenue'),
    postulee: usePipelineColonne(client, 'postulee'),
    relancee: usePipelineColonne(client, 'relancee'),
    entretien: usePipelineColonne(client, 'entretien'),
  };

  const statsChargement = statsState.statut === 'chargement';
  const funnel = statsState.statut === 'succes' ? statsState.donnees.funnel : null;
  const streak = statsState.statut === 'succes' ? statsState.donnees.streak : null;
  const neverOpened = statsState.statut === 'succes' ? statsState.donnees.neverOpened : null;
  const responseRate = statsState.statut === 'succes' ? statsState.donnees.responseRate : null;

  return (
    <div className={styles.ecran}>
      <div className={styles.entete}>
        <div>
          <h1 className={styles.titre}>{t('suivi.titre')}</h1>
          <p className={styles.sousTitre}>{t('suivi.sousTitre')}</p>
        </div>
        <div className={styles.spacer} />
        <button type="button" className={styles.bouton} onClick={onRetour}>
          {t('suivi.voirLaVeille')}
          <ChevronIcone />
        </button>
      </div>

      <Funnel
        funnel={funnel}
        chargement={statsChargement}
        erreur={statsState.statut === 'erreur'}
        onReessayer={recargerStats}
      />

      <div className={styles.corps}>
        <div className={styles.pipeline}>
          {COLONNES_PIPELINE.map((statut) => {
            const [state, recharger] = colonnes[statut];
            return (
              <PipelineColumn
                key={statut}
                statut={statut}
                state={state}
                onReessayer={recharger}
                onOuvrirOffre={onOuvrirOffre}
              />
            );
          })}
        </div>

        <aside className={styles.aside}>
          <SerieCard streak={streak} chargement={statsChargement} />
          <NeverOpenedCard
            neverOpened={neverOpened}
            chargement={statsChargement}
            onParcourir={onRetour}
          />
          <div className={styles.asideSpacer} />
          <ResponseRateCard responseRate={responseRate} chargement={statsChargement} />
        </aside>
      </div>
    </div>
  );
}

function ChevronIcone() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

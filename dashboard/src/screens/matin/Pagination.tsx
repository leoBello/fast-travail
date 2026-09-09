import { t } from '../../i18n/i18n';
import styles from './Pagination.module.css';

interface Props {
  debut: number;
  fin: number;
  total: number;
  onSuivant: () => void;
  onPrecedent: () => void;
  suivantDisponible: boolean;
  precedentDisponible: boolean;
}

/**
 * Le pied de page de pagination — partagé par la bande « Ce matin »
 * (`Main.dc.html`, « 1–3 sur 6 · Suivantes ») et par la liste complète.
 *
 * La liste complète pagine plutôt que de tout monter dans le DOM : le brief
 * de la tâche demande de mesurer avant de virtualiser — paginer via l'API
 * (déjà bornée à 100 lignes par page côté serveur) tient le nombre de
 * nœuds DOM sous un seuil qui ne pose jamais la question, sans rien
 * masquer : ce n'est pas un filtre, seulement le rythme d'affichage.
 */
export function Pagination({
  debut,
  fin,
  total,
  onSuivant,
  onPrecedent,
  suivantDisponible,
  precedentDisponible,
}: Props) {
  return (
    <div className={styles.pagination}>
      <span className={styles.compte}>{t('matin.pagination', debut, fin, total)}</span>
      <div className={styles.spacer} />
      {precedentDisponible ? (
        <button type="button" className={styles.bouton} onClick={onPrecedent}>
          {t('matin.precedentes')}
        </button>
      ) : null}
      <button
        type="button"
        className={styles.bouton}
        onClick={onSuivant}
        disabled={!suivantDisponible}
      >
        {t('matin.suivantes')}
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
      </button>
    </div>
  );
}

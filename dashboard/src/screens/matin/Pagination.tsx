import { t } from '../../i18n/i18n';
import { numerosDePage } from './paginationLogic';
import type { PaginationNumerotee } from './paginationLogic';
import styles from './Pagination.module.css';

// `numerosDePage` est une fonction pure : elle vit dans `paginationLogic.ts`,
// pas ici, et n'est pas réexportée (`react-refresh/only-export-components`,
// voir le commentaire de ce fichier). Seul le type traverse, ce que
// `allowConstantExport` autorise.
export type { PaginationNumerotee } from './paginationLogic';

interface Props {
  debut: number;
  fin: number;
  total: number;
  onSuivant: () => void;
  onPrecedent: () => void;
  suivantDisponible: boolean;
  precedentDisponible: boolean;
  numerotation?: PaginationNumerotee;
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
  numerotation,
}: Props) {
  const boutonPrecedent = precedentDisponible ? (
    <button type="button" className={styles.bouton} onClick={onPrecedent}>
      {t('matin.precedentes')}
    </button>
  ) : null;

  const boutonSuivant = (
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
  );

  return (
    <div className={styles.pagination}>
      <span className={styles.compte}>{t('matin.pagination', debut, fin, total)}</span>
      <div className={styles.spacer} />
      {numerotation === undefined ? (
        // Bande « Ce matin », sans numérotation : Précédentes/Suivantes
        // restent enfants directs de `.pagination`, structure et
        // espacement inchangés — voir Pagination.test.tsx.
        <>
          {boutonPrecedent}
          {boutonSuivant}
        </>
      ) : (
        // Groupe imbriqué distinct, comme dans Main.dc.html : son propre
        // `gap` (4px) porte l'espacement entre boutons de navigation,
        // séparé du `gap` du conteneur externe.
        <div className={styles.navGroup}>
          {boutonPrecedent}
          {numerosDePage(numerotation.page, numerotation.pageCount).map((entree, index) =>
            entree === 'ellipse' ? (
              <span key={`ellipse-${index}`} className={styles.ellipse} aria-hidden="true">
                {t('matin.ellipsePages')}
              </span>
            ) : (
              <button
                key={entree}
                type="button"
                className={styles.numero}
                data-actif={entree === numerotation.page ? 'oui' : undefined}
                aria-current={entree === numerotation.page ? 'page' : undefined}
                aria-label={t('matin.pageNumero', entree)}
                onClick={() => numerotation.onPageChange(entree)}
              >
                {entree}
              </button>
            ),
          )}
          {boutonSuivant}
        </div>
      )}
    </div>
  );
}

import { StatusBadge } from '../../ui/kit/StatusBadge';
import type {
  ApplicationOutcome,
  ApplicationStatus,
  OfferApplicationState,
} from '../../data/types';
import { APPLICATION_OUTCOMES } from '../../data/types';
import { formatDateLongue } from '../../data/parisDate';
import { t } from '../../i18n/i18n';
import styles from './SuiviSection.module.css';

/** Les cinq étapes qu'on TRAVERSE, dans l'ordre — `a_traiter` en est le
 * repos avant décision (aucun nœud, voir `SuiviSection` plus bas) et
 * `ecartee` une sortie, jamais une position sur le fil (GUIDELINES §3.7,
 * §1 « les six étapes du suivi et la sortie »). */
const PIPELINE = [
  'retenue',
  'postulee',
  'relancee',
  'entretien',
  'terminee',
] as const satisfies readonly ApplicationStatus[];

/** Le libellé de l'action qui fait AVANCER vers ce statut — jamais celui de
 * l'étape elle-même (`statuts.*`), qui nomme un état, pas un geste. */
const LIBELLE_ACTION: Record<(typeof PIPELINE)[number], () => string> = {
  retenue: () => t('detail.retenirOffre'),
  postulee: () => t('detail.marquerPostulee'),
  relancee: () => t('detail.marquerRelancee'),
  entretien: () => t('detail.marquerEntretien'),
  terminee: () => t('detail.marquerTerminee'),
};

interface Props {
  /** `null` : le groupe n'a encore aucune candidature nulle part. */
  application: OfferApplicationState | null;
  /** Vrai pendant l'appel réseau déclenché par un geste de cette section —
   * désactive les actions, même principe que `OfferCard.enTraitement`. */
  enTraitement: boolean;
  erreur: boolean;
  /** `appliedAt` fourni UNIQUEMENT par l'appelant (au moment de passer
   * "postulée") — cette section ne lit jamais l'horloge elle-même,
   * `DetailScreen` reste la seule couche qui touche `Date`. */
  onAvancer: (status: ApplicationStatus, appliedAt?: string) => void;
  onEcarter: () => void;
  onDefinirIssue: (outcome: ApplicationOutcome) => void;
}

/**
 * « Où j'en suis » (`Detail.dc.html`) : le fil des cinq étapes qu'on
 * traverse, l'action qui fait avancer d'un cran, et `heritee` (GUIDELINES §1)
 * quand l'état affiché vient d'une AUTRE annonce du même groupe plutôt que de
 * celle-ci — jamais une action qui laisserait croire à un geste direct.
 *
 * **Jamais deux natures confondues** : `'ecartee'` n'a pas de position sur le
 * fil (c'est une sortie, §3.7) — elle a son propre rendu, sans les cinq
 * nœuds. Une candidature `'terminee'` échange les actions d'avancement contre
 * les quatre boutons d'issue (`APPLICATION_OUTCOMES`, un second axe — jamais
 * une sixième étape).
 */
export function SuiviSection({
  application,
  enTraitement,
  erreur,
  onAvancer,
  onEcarter,
  onDefinirIssue,
}: Props) {
  const status = application?.status ?? null;
  const prochain = status === 'terminee' ? undefined : PIPELINE[indexDansPipeline(status) + 1];

  return (
    <section className={styles.section}>
      <span className={styles.titre}>{t('detail.ouJEnSuis')}</span>

      {status === 'ecartee' ? (
        <div className={styles.ecartee}>
          <StatusBadge status="ecartee" label={t('statuts.ecartee')} />
          <p className={styles.note}>{t('detail.ecarteeNote')}</p>
        </div>
      ) : (
        <>
          <Fil statutCourant={status} />

          {status === 'terminee' ? (
            <IssuePanel
              issueActuelle={application?.outcome ?? null}
              enTraitement={enTraitement}
              onChoisir={onDefinirIssue}
            />
          ) : (
            <div className={styles.actions}>
              {prochain === undefined ? null : (
                <button
                  type="button"
                  className={styles.boutonPrimaire}
                  disabled={enTraitement}
                  onClick={() =>
                    onAvancer(
                      prochain,
                      prochain === 'postulee' ? new Date().toISOString() : undefined,
                    )
                  }
                >
                  {LIBELLE_ACTION[prochain]()}
                </button>
              )}
              <button
                type="button"
                className={styles.bouton}
                disabled={enTraitement}
                onClick={onEcarter}
              >
                {t('detail.ecarterOffre')}
              </button>
              <div className={styles.spacer} />
              {application === null ? null : (
                <span className={styles.depuis}>{libelleDepuis(application)}</span>
              )}
            </div>
          )}

          {application?.heritee === true ? (
            <p className={styles.note}>{t('detail.heriteeNote')}</p>
          ) : null}
        </>
      )}

      {erreur ? (
        <p className={styles.erreur} role="alert">
          {t('detail.actionEchouee')}
        </p>
      ) : null}
    </section>
  );
}

/** « Retenue le 7 septembre » — composé à part pour n'appeler
 * `formatDateLongue` qu'une fois (elle était appelée deux fois dans le JSX
 * avant cette extraction, une fois pour la garde, une fois pour la valeur). */
function libelleDepuis(application: OfferApplicationState): string {
  const date = formatDateLongue(application.status_changed_at);
  const statutLabel = t(`statuts.${application.status}`);
  return date === null ? statutLabel : `${statutLabel} ${t('detail.depuisLe', date)}`;
}

/** Garde de type plutôt qu'un `as` : `status` porte le type large
 * `ApplicationStatus` (sept valeurs), `PIPELINE.indexOf` n'accepte que les
 * cinq qu'il contient. Un `Array.prototype.includes` suffirait à l'exécution,
 * mais ne RÉTRÉCIT pas le type pour l'appelant — c'est tout l'intérêt d'une
 * garde `is`, ici, plutôt qu'un contournement. */
function estEtapePipeline(status: ApplicationStatus): status is (typeof PIPELINE)[number] {
  return (PIPELINE as readonly ApplicationStatus[]).includes(status);
}

/** Position dans `PIPELINE` : -1 pour `null`/`a_traiter` (rien traversé
 * encore) ou pour `ecartee` (jamais sur le fil, GUIDELINES §3.7) — ce
 * dernier cas n'atteint en pratique jamais cette fonction, `SuiviSection`
 * le branchant à part, mais un résultat sûr (-1) coûte moins qu'un
 * appel qui suppose la garde tenue ailleurs. L'index réel sinon. */
function indexDansPipeline(status: ApplicationStatus | null): number {
  if (status === null || !estEtapePipeline(status)) return -1;
  return PIPELINE.indexOf(status);
}

function Fil({ statutCourant }: { statutCourant: ApplicationStatus | null }) {
  const courant = indexDansPipeline(statutCourant);
  return (
    <div className={styles.fil}>
      {PIPELINE.map((statut, i) => (
        <div key={statut} className={styles.noeudEtLigne}>
          <div className={styles.noeud}>
            <span className={styles.pastille} data-fait={i <= courant ? 'true' : 'false'}>
              {i <= courant ? <CocheIcone /> : null}
            </span>
            <span className={styles.noeudLibelle} data-fait={i <= courant ? 'true' : 'false'}>
              {t(`statuts.${statut}`)}
            </span>
          </div>
          {i < PIPELINE.length - 1 ? <div className={styles.ligne} /> : null}
        </div>
      ))}
    </div>
  );
}

function IssuePanel({
  issueActuelle,
  enTraitement,
  onChoisir,
}: {
  issueActuelle: ApplicationOutcome | null;
  enTraitement: boolean;
  onChoisir: (outcome: ApplicationOutcome) => void;
}) {
  if (issueActuelle !== null) {
    return (
      <div className={styles.actions}>
        <span className={styles.depuis}>{t(`issues.${issueActuelle}`)}</span>
      </div>
    );
  }
  return (
    <div className={styles.issuePanel}>
      <span className={styles.faitCle}>{t('detail.choisirIssue')}</span>
      <div className={styles.actions}>
        {APPLICATION_OUTCOMES.map((issue) => (
          <button
            key={issue}
            type="button"
            className={styles.bouton}
            disabled={enTraitement}
            onClick={() => onChoisir(issue)}
          >
            {t(`issues.${issue}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

function CocheIcone() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

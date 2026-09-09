import { useState } from 'react';
import type { DashboardClient } from '../../data/client';
import { DashboardApiError } from '../../data/client';
import type { ConfigResult } from '../../data/types';
import { Card, Field } from '../../ui/kit/Card';
import { EmptyState } from '../../ui/kit/EmptyState';
import { t } from '../../i18n/i18n';
import { useConfig } from '../matin/hooks';
import styles from './ProfilScreen.module.css';

interface Props {
  client: DashboardClient;
  onRetour: () => void;
}

interface FormState {
  label: string;
  cvText: string;
  seniorityYears: string;
  profileVersion: string;
}

const FORMULAIRE_VIDE: FormState = {
  label: '',
  cvText: '',
  seniorityYears: '',
  profileVersion: '',
};

/**
 * L'import du CV (`POST /candidate-profile`, tâche 10) — demandé nommément
 * au brief initial (« Un bouton pour importer mon CV »).
 *
 * **Décision tranchée, respectée à la lettre (CLAUDE.md) : l'import ne
 * rejuge RIEN.** Aucun bouton de rejugement n'existe sur cet écran, et
 * aucun libellé/état de chargement ne laisse croire que les scores ont
 * changé — `profil.enregistrementEnCours` décrit une ÉCRITURE, jamais un
 * jugement ; `profil.succesDetail` nomme explicitement ce que l'import NE
 * fait PAS.
 *
 * **Trois états, jamais confondus**, comme `DetailScreen` : `chargement`
 * (la configuration courante, `GET /config`), `erreur` (panne réseau), et
 * `succès` — le formulaire n'est monté que dans cette dernière branche,
 * donc jamais avant qu'un chiffre serveur (le compte d'offres à profil
 * antérieur) n'ait pu être lu.
 */
export function ProfilScreen({ client, onRetour }: Props) {
  const [configState, rechargerConfig] = useConfig(client);
  const [formulaire, setFormulaire] = useState<FormState>(FORMULAIRE_VIDE);
  const [enTraitement, setEnTraitement] = useState(false);
  const [erreurImport, setErreurImport] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ profileVersion: string; staleCount: number } | null>(
    null,
  );

  async function importer() {
    setErreurImport(null);
    setEnTraitement(true);
    try {
      const seniorityYears = Number(formulaire.seniorityYears);
      const reponse = await client.importCandidateProfile({
        label: formulaire.label,
        cvText: formulaire.cvText,
        seniorityYears,
        profileVersion: formulaire.profileVersion,
      });
      setResultat({
        // `reponse.profile` est NON nul par contrat (`ImportCandidateProfileResult`,
        // tâche 10) : un `201` porte toujours le profil fraîchement écrit.
        profileVersion: reponse.profile.profileVersion,
        staleCount: reponse.staleProfileOfferCount,
      });
      setFormulaire(FORMULAIRE_VIDE);
      rechargerConfig();
    } catch (cause) {
      setErreurImport(cause instanceof DashboardApiError ? cause.message : t('profil.echecImport'));
    } finally {
      setEnTraitement(false);
    }
  }

  return (
    <div className={styles.ecran}>
      <button type="button" className={styles.retour} onClick={onRetour}>
        {t('profil.retour')}
      </button>

      <h1 className={styles.titre}>{t('profil.titre')}</h1>
      <p className={styles.sousTitre}>{t('profil.sousTitre')}</p>

      {configState.statut === 'erreur' ? (
        <>
          <EmptyState
            titre={t('profil.erreurChargement')}
            detail={t('profil.erreurChargementDetail')}
          />
          <button type="button" className={styles.bouton} onClick={rechargerConfig}>
            {t('profil.reessayer')}
          </button>
        </>
      ) : configState.statut === 'chargement' ? (
        <EmptyState titre={t('profil.chargement')} detail={t('profil.chargementDetail')} />
      ) : (
        <>
          <ProfilActifCard config={configState.donnees} />

          {resultat === null ? null : (
            <div className={styles.succes} role="status">
              <p className={styles.succesTitre}>{t('profil.succesTitre')}</p>
              <p>{t('profil.succesDetail')}</p>
              <p>
                {resultat.staleCount === 0
                  ? t('profil.aucuneOffreProfilAnterieur')
                  : t('profil.offresProfilAnterieur', resultat.staleCount)}
              </p>
            </div>
          )}

          {erreurImport === null ? null : (
            <p className={styles.erreur} role="alert">
              {erreurImport}
            </p>
          )}

          <form
            className={styles.formulaire}
            onSubmit={(evenement) => {
              evenement.preventDefault();
              void importer();
            }}
          >
            <label className={styles.champ}>
              <span className={styles.champLabel}>{t('profil.champLabel')}</span>
              <input
                type="text"
                required
                value={formulaire.label}
                onChange={(e) => setFormulaire({ ...formulaire, label: e.target.value })}
              />
            </label>

            <label className={styles.champ}>
              <span className={styles.champLabel}>{t('profil.champCvTexte')}</span>
              <textarea
                required
                rows={10}
                value={formulaire.cvText}
                onChange={(e) => setFormulaire({ ...formulaire, cvText: e.target.value })}
              />
            </label>

            <label className={styles.champ}>
              <span className={styles.champLabel}>{t('profil.champSeniorite')}</span>
              <input
                type="number"
                min={0}
                required
                value={formulaire.seniorityYears}
                onChange={(e) => setFormulaire({ ...formulaire, seniorityYears: e.target.value })}
              />
            </label>

            <div className={styles.champ}>
              <label className={styles.champLabelLigne}>
                <span className={styles.champLabel}>{t('profil.champProfileVersion')}</span>
                <input
                  type="text"
                  required
                  value={formulaire.profileVersion}
                  onChange={(e) => setFormulaire({ ...formulaire, profileVersion: e.target.value })}
                />
              </label>
              <span className={styles.champAide}>{t('profil.profileVersionAide')}</span>
            </div>

            <button type="submit" className={styles.boutonPrimaire} disabled={enTraitement}>
              {enTraitement ? t('profil.enregistrementEnCours') : t('profil.boutonImporter')}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function ProfilActifCard({ config }: { config: ConfigResult }) {
  return (
    <Card titre={t('profil.profilActifTitre')}>
      {config.activeProfile === null ? (
        <Field label={t('profil.champLabel')}>{t('profil.aucunProfilActif')}</Field>
      ) : (
        <Field label={config.activeProfile.label}>
          {t('profil.profilVersion', config.activeProfile.profileVersion)}
        </Field>
      )}
      <Field label={t('profil.staleCountLabel')}>
        {config.staleProfileOfferCount === 0
          ? t('profil.aucuneOffreProfilAnterieur')
          : t('profil.offresProfilAnterieur', config.staleProfileOfferCount)}
      </Field>
    </Card>
  );
}

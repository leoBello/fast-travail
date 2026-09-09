import { useMemo, useState } from 'react';
import type { DashboardClient } from '../../data/client';
import type { OfferDashboardRow, SortField } from '../../data/types';
import { t } from '../../i18n/i18n';
import { useBrief, useConfig, useOffersList, useStats, useWorkModeCounts } from './hooks';
import type { FilterState } from './FilterPanel';
import { FilterPanel } from './FilterPanel';
import { MorningBand } from './MorningBand';
import { OfferList } from './OfferList';
import styles from './MatinScreen.module.css';

const LIST_PAGE_SIZE = 50;

interface Props {
  client: DashboardClient;
  /** Ouvre le détail d'une offre (tâche 8, `DetailScreen`) — fourni par
   * `App.tsx`, qui possède la navigation entre les deux écrans. */
  onOuvrirOffre: (id: string) => void;
  /** Ouvre le suivi des candidatures (tâche 9, `SuiviScreen`). Optionnel,
   * même principe que `OfferCard.onOuvrir` : un test qui rend `MatinScreen`
   * isolément n'a pas à le fournir, et le bouton reste alors simplement
   * absent plutôt que de planter sur un callback manquant. */
  onVoirSuivi?: () => void;
  /** Ouvre l'import du CV (tâche 10, `ProfilScreen`). Même principe
   * optionnel que `onVoirSuivi`. */
  onImporterCv?: () => void;
}

/**
 * L'écran du matin (`Main.dc.html`) : la bande « Ce matin » (trois cartes,
 * décision immédiate) au-dessus de « Toute la veille » (liste complète,
 * rien de masqué, filtrable).
 *
 * Ce composant est la SEULE couche qui appelle le réseau — `MorningBand`,
 * `OfferList`, `OfferCard`, `FilterPanel` restent des composants
 * présentés (props → rendu), testables sans client réel.
 */
export function MatinScreen({ client, onOuvrirOffre, onVoirSuivi, onImporterCv }: Props) {
  // ---- Bande « Ce matin » ----
  const [briefPage, setBriefPage] = useState(1);
  const [briefState, recargerBrief] = useBrief(client, briefPage);
  // Ids retirés OPTIMISTEMENT (avant même que le serveur ne confirme) —
  // jamais posé par un effet, seulement par un geste utilisateur
  // (`decider`) ou son échec (retrait annulé). `useMemo` ci-dessous les
  // confronte à chaque nouvelle page reçue : un id que le serveur ne rend
  // déjà plus se dissout de lui-même de `retiresConfirmes`, sans jamais
  // compter deux fois la même décision (voir le commentaire sur `total`).
  const [retiresOptimistes, setRetiresOptimistes] = useState<ReadonlySet<string>>(new Set());
  const [enTraitement, setEnTraitement] = useState<ReadonlySet<string>>(new Set());
  const [erreurDecision, setErreurDecision] = useState(false);

  const serverRows = useMemo(
    () => (briefState.statut === 'succes' ? briefState.donnees.rows : []),
    [briefState],
  );
  const serverTotal = briefState.statut === 'succes' ? briefState.donnees.total : 0;

  // Dérivé PUR à chaque rendu — pas de `setState` dans un effet (règle de
  // lint `react-hooks/set-state-in-effect`, non contournable : CLAUDE.md
  // interdit tout `eslint-disable`). Ne garde, parmi les retraits
  // optimistes, que ceux que le serveur porte ENCORE : un id déjà absent de
  // `serverRows` a été confirmé par la collecte suivante et n'a plus besoin
  // d'être masqué localement.
  const retiresConfirmes = useMemo(() => {
    const idsServeur = new Set(serverRows.map((o) => o.id));
    return new Set([...retiresOptimistes].filter((id) => idsServeur.has(id)));
  }, [serverRows, retiresOptimistes]);

  const offers = serverRows.filter((o) => !retiresConfirmes.has(o.id));
  const briefTotal = Math.max(0, serverTotal - retiresConfirmes.size);

  const [statsState, recargerStats] = useStats(client);
  const streakDays = statsState.statut === 'succes' ? statsState.donnees.streak.days : 0;
  const neverOpened = statsState.statut === 'succes' ? statsState.donnees.neverOpened : 0;
  // Vérité SERVEUR (tâche 10), comptée sur `status_changed_at` en heure de
  // Paris — remplace le `localStorage` de la tâche 7 (`decidedStorage.ts`,
  // retiré) : ce chiffre est désormais partagé entre tous les navigateurs,
  // pas un fait local à CE poste. `0` tant que `/stats` n'a pas répondu —
  // `decideesChargement` ci-dessous le distingue d'un zéro confirmé.
  const decidesAujourdhui = statsState.statut === 'succes' ? statsState.donnees.decidedToday : 0;
  const decideesChargement = statsState.statut === 'chargement';

  const [configState] = useConfig(client);
  // `null` tant que `/config` n'a pas répondu — `formatCompensation`
  // traite ce cas sans jamais affirmer « incertain » sans preuve (voir
  // `data/format.ts`).
  const salaireFloor =
    configState.statut === 'succes'
      ? (configState.donnees.scoringWeights.salaire_floor ?? null)
      : null;

  async function decider(offer: OfferDashboardRow, decision: 'garder' | 'ecarter') {
    setErreurDecision(false);
    setEnTraitement((prev) => new Set(prev).add(offer.id));
    setRetiresOptimistes((prev) => new Set(prev).add(offer.id));

    try {
      await client.openOffer(offer.id);
      await client.patchApplication(offer.id, {
        status: decision === 'garder' ? 'retenue' : 'ecartee',
      });
      // `decidesAujourdhui` est dérivé de `/stats` (tâche 10) : le recharger
      // suffit à le faire avancer, aucun état local à maintenir en plus.
      recargerBrief();
      recargerStats();
    } catch {
      // La décision a échoué : l'offre revient dans la bande plutôt que de
      // disparaître silencieusement (une absence de décision n'est pas une
      // décision — un échec réseau ne doit jamais se lire comme "écartée").
      setRetiresOptimistes((prev) => {
        const suivant = new Set(prev);
        suivant.delete(offer.id);
        return suivant;
      });
      setErreurDecision(true);
    } finally {
      setEnTraitement((prev) => {
        const suivant = new Set(prev);
        suivant.delete(offer.id);
        return suivant;
      });
    }
  }

  // ---- Liste « Toute la veille » ----
  const [sort, setSort] = useState<SortField>('final_score');
  const [listPage, setListPage] = useState(1);
  const [filtres, setFiltres] = useState<FilterState>({});
  const [filtresOuverts, setFiltresOuverts] = useState(false);

  const [listState, recargerListe] = useOffersList(client, {
    sort,
    page: listPage,
    pageSize: LIST_PAGE_SIZE,
    ...filtres,
  });
  const [countsState] = useWorkModeCounts(client);

  function changerFiltres(suivant: FilterState) {
    setFiltres(suivant);
    setListPage(1);
  }
  function changerTri(suivant: SortField) {
    setSort(suivant);
    setListPage(1);
  }

  const listeOffres = listState.statut === 'succes' ? listState.donnees.rows : [];
  const listeTotal = listState.statut === 'succes' ? listState.donnees.total : 0;

  return (
    <div className={styles.ecran}>
      <header className={styles.barre}>
        <span className={styles.nom}>{t('app.nom')}</span>
        <span className={styles.tagline}>{t('app.tagline')}</span>
        <div className={styles.spacer} />
        {onImporterCv === undefined ? null : (
          <button type="button" className={styles.suiviBouton} onClick={onImporterCv}>
            {t('profil.importerCv')}
          </button>
        )}
        {onVoirSuivi === undefined ? null : (
          <button type="button" className={styles.suiviBouton} onClick={onVoirSuivi}>
            {t('suivi.titre')}
          </button>
        )}
      </header>

      {erreurDecision ? (
        <p className={styles.bandeauErreur} role="alert">
          {t('matin.decisionEchouee')}
        </p>
      ) : null}

      <MorningBand
        offers={offers}
        total={briefTotal}
        page={briefPage}
        onPageChange={setBriefPage}
        decidees={decidesAujourdhui}
        decideesChargement={decideesChargement}
        streakDays={streakDays}
        streakChargement={statsState.statut === 'chargement'}
        onDecision={decider}
        onOuvrirOffre={onOuvrirOffre}
        offresEnTraitement={enTraitement}
        chargement={briefState.statut === 'chargement'}
        erreur={briefState.statut === 'erreur'}
        onReessayer={recargerBrief}
        salaireFloor={salaireFloor}
      />

      <OfferList
        offers={listeOffres}
        total={listeTotal}
        page={listPage}
        pageSize={LIST_PAGE_SIZE}
        onPageChange={setListPage}
        sort={sort}
        onSortChange={changerTri}
        onOuvrirOffre={onOuvrirOffre}
        neverOpened={neverOpened}
        statsChargement={statsState.statut === 'chargement'}
        filtresOuverts={filtresOuverts}
        onToggleFiltres={() => setFiltresOuverts((v) => !v)}
        panneauFiltres={
          <FilterPanel
            valeurs={filtres}
            onChange={changerFiltres}
            comptesModeTravail={countsState.statut === 'succes' ? countsState.donnees : null}
          />
        }
        chargement={listState.statut === 'chargement'}
        erreur={listState.statut === 'erreur'}
        onReessayer={recargerListe}
        salaireFloor={salaireFloor}
      />
    </div>
  );
}

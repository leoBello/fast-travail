import {
  Badge,
  Bouton,
  CarteChaleur,
  CarteKPI,
  EtatVideCompact,
  FilActivite,
  GraphiqueAnneau,
  GrilleWidgets,
  PageTableauDeBord,
  Widget,
} from '@automation-ia-dev/ui';
import type { EvenementActivite } from '@automation-ia-dev/ui';
import {
  AlarmClock,
  ArrowLeft,
  CircleDashed,
  CloudDownload,
  EyeOff,
  Flame,
  KeyRound,
  MailCheck,
  Send,
} from 'lucide-react';
import { CANDIDATURES, ENVOIS } from '../donnees-base';
import { AUJOURDHUI, COMPTES, LIBELLE_ENGAGEMENT, LIBELLE_STATUT, joursDepuis, nombre, pourcent } from '../donnees';
import { CoupleScores } from '../composants/Offre';
import type { Candidature, StatutCandidature } from '../types';

const ETAGES = [
  { nom: 'Collectées', valeur: COMPTES.collectees, detail: 'toutes sources, avant dédoublonnage' },
  { nom: 'Jugées par l’IA', valeur: COMPTES.jugementsReussis, detail: 'à portée, lues par le modèle' },
  { nom: 'Au-dessus de 50', valeur: COMPTES.auDessusDuSeuil, detail: 'une ligne par poste' },
  { nom: 'Postulées', valeur: COMPTES.postulees, detail: 'vos décisions' },
];

/**
 * L'entonnoir : chaque barre est à l'échelle du **taux de passage** depuis l'étage précédent, pas
 * du volume. À l'échelle du volume, 13 sur 18 427 ne ferait pas un pixel.
 */
function Entonnoir() {
  return (
    <ol className="ft-entonnoir">
      {ETAGES.map((e, i) => {
        const precedent = i === 0 ? null : ETAGES[i - 1];
        const taux = precedent ? (e.valeur / precedent.valeur) * 100 : 100;
        return (
          <li key={e.nom} className="ft-entonnoir__etage">
            <div className="ft-entonnoir__chiffre">
              <span className="ft-entonnoir__valeur">{nombre(e.valeur)}</span>
              <span className="ft-entonnoir__nom">{e.nom}</span>
              <span className="ft-entonnoir__detail">{e.detail}</span>
            </div>
            <div className="ft-entonnoir__piste" aria-hidden="true">
              <span className="ft-entonnoir__barre" style={{ width: `${Math.max(taux, 1.5)}%` }} />
            </div>
            <span className="ft-entonnoir__taux">{precedent ? pourcent(taux) : '—'}</span>
          </li>
        );
      })}
    </ol>
  );
}

const COLONNES: { statut: StatutCandidature; vide: string }[] = [
  { statut: 'retenue', vide: 'Garder une offre du brief la pose ici.' },
  { statut: 'postulee', vide: '' },
  { statut: 'relancee', vide: '' },
  { statut: 'entretien', vide: 'Aucun entretien planifié.' },
  { statut: 'terminee', vide: 'Une candidature terminée porte son issue : offre, refus, sans réponse.' },
];

function CartePiste({ c }: { c: Candidature }) {
  const jours = c.envoyeeLe ? joursDepuis(c.envoyeeLe) : null;
  const relanceDue = c.statut === 'postulee' && jours !== null && jours >= 7;
  return (
    <article className="ft-piste">
      <div className="ft-piste__tete">
        <h4 className="ft-piste__titre">{c.titre}</h4>
        <CoupleScores offre={c} taille="compact" />
      </div>
      <p className="ft-piste__employeur">
        {c.employeur ?? <span className="ft-absence">employeur non publié</span>}
        {c.engagement && <> · {LIBELLE_ENGAGEMENT[c.engagement]}</>}
      </p>
      <div className="ft-piste__pied">
        {jours !== null && (
          <span className="ft-mono ft-piste__date">
            {c.statut === 'relancee' ? 'relancée' : 'envoyée'} il y a {jours} j
          </span>
        )}
        {relanceDue && (
          <Badge ton="attention" point>
            Relance due
          </Badge>
        )}
        {c.statut === 'relancee' && <Badge ton="contour">Relance non datée</Badge>}
      </div>
    </article>
  );
}

function Pipeline() {
  return (
    <div className="ft-pipeline" role="list" aria-label="Candidatures par étape">
      {COLONNES.map(({ statut, vide }) => {
        const cartes = CANDIDATURES.filter((c) => c.statut === statut);
        return (
          <section key={statut} role="listitem" className="ft-pipeline__colonne" aria-label={LIBELLE_STATUT[statut]}>
            <header className="ft-pipeline__tete">
              <span className={`ft-pipeline__pastille ft-pipeline__pastille--${statut}`} aria-hidden="true" />
              <h3>{LIBELLE_STATUT[statut]}</h3>
              <span className="ft-mono ft-pipeline__compte">{cartes.length}</span>
            </header>
            <div className="ft-pipeline__cartes">
              {cartes.length === 0 ? (
                <EtatVideCompact icone={CircleDashed} titre="Rien ici">
                  {vide}
                </EtatVideCompact>
              ) : (
                cartes.map((c) => <CartePiste key={c.id} c={c} />)
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const date = (iso: string, heure = '10:00') => new Date(`${iso}T${heure}:00+02:00`);

const EVENEMENTS: EvenementActivite[] = [
  {
    id: 'collecte-19',
    date: date('2026-10-19', '06:31'),
    icone: CloudDownload,
    ton: 'neutre',
    contenu: (
      <>
        Collecte du matin : <strong>158 offres</strong> vues pour la première fois
      </>
    ),
  },
  {
    id: 'echec-19',
    date: date('2026-10-19', '14:00'),
    icone: KeyRound,
    ton: 'danger',
    nonLu: true,
    contenu: (
      <>
        Jugement en échec : <strong>clé d’API refusée</strong> (HTTP 401)
      </>
    ),
    detail: 'Même échec qu’à chaque passage depuis le 2 octobre. La tâche planifiée se dit réussie : seule la table des jugements le montre.',
  },
  {
    id: 'collecte-18',
    date: date('2026-10-18', '06:31'),
    icone: CloudDownload,
    ton: 'neutre',
    contenu: (
      <>
        Collecte du matin : <strong>144 offres</strong> vues pour la première fois
      </>
    ),
  },
  ...CANDIDATURES.filter((c) => c.envoyeeLe !== null)
    .slice(0)
    .sort((a, b) => (b.envoyeeLe ?? '').localeCompare(a.envoyeeLe ?? ''))
    .slice(0, 5)
    .map<EvenementActivite>((c, i) => ({
      id: `envoi-${c.id}`,
      date: date(c.envoyeeLe as string, `1${4 - Math.min(i, 4)}:${String(10 + i * 7).padStart(2, '0')}`),
      icone: c.statut === 'relancee' ? MailCheck : Send,
      ton: 'info',
      contenu: (
        <>
          {c.statut === 'relancee' ? 'Relancée' : 'Postulée'} : <strong>{c.titre}</strong>
          {c.employeur ? ` chez ${c.employeur}` : ''}
        </>
      ),
    })),
];

const PARTS_CONTRAT = (() => {
  const envoyees = CANDIDATURES.filter((c) => c.statut === 'postulee' || c.statut === 'relancee');
  const cdi = envoyees.filter((c) => c.engagement === 'cdi').length;
  const freelance = envoyees.filter((c) => c.engagement === 'freelance').length;
  return [
    { id: 'cdi', nom: 'CDI', couleur: 1 as const, valeur: cdi },
    { id: 'freelance', nom: 'Freelance', couleur: 2 as const, valeur: freelance },
    { id: 'autre', nom: 'Autre ou non précisé', couleur: 3 as const, valeur: envoyees.length - cdi - freelance },
  ].filter((p) => p.valeur > 0);
})();

export function PageCandidatures({ onRetour }: { onRetour: () => void }) {
  return (
    <PageTableauDeBord
      surTitre={`${COMPTES.postulees} envoyées · la dernière le ${COMPTES.derniereCandidature}`}
      titre="Mes candidatures"
      actions={
        <Bouton variante="secondaire" icone={<ArrowLeft size={16} />} onClick={onRetour}>
          Retour à la veille
        </Bouton>
      }
    >
      <GrilleWidgets>
        <Widget taille="s" nu titre="Relances dues">
          <CarteKPI
            titre="Relances dues"
            icone={AlarmClock}
            vedette
            valeur={COMPTES.relancesDues}
            comparaison="envoyées il y a 7 jours ou plus"
            definition="Une relance est due sept jours après l’envoi, tant que la candidature n’a pas bougé."
          />
        </Widget>
        <Widget taille="s" nu titre="Réponses reçues">
          <CarteKPI
            titre="Réponses reçues"
            icone={MailCheck}
            valeur={0}
            formater={() => `0 / ${COMPTES.postulees}`}
            comparaison="brut jusqu’à 20 envois"
            definition="Trop peu d’envois pour en tirer un taux : le chiffre reste brut jusqu’à 20 candidatures."
          />
        </Widget>
        <Widget taille="s" nu titre="Série">
          <CarteKPI
            titre="Série"
            icone={Flame}
            valeur={0}
            formater={(v) => `${Math.round(v)} jour`}
            comparaison={`dernière candidature le ${COMPTES.derniereCandidature}`}
            definition="Les jours consécutifs avec au moins une candidature envoyée. Lire des offres ne la maintient pas, c’est voulu."
          />
        </Widget>
        <Widget taille="s" nu titre="Jamais ouvertes">
          <CarteKPI
            titre="Jamais ouvertes"
            icone={EyeOff}
            valeur={COMPTES.jamaisOuvertes}
            comparaison="au-dessus de 50"
            definition="Une offre affichée en trop se repère d’un coup d’œil ; une offre jamais affichée est perdue. Ce nombre descend à 0 quand tout a été regardé."
          />
        </Widget>

        <Widget taille="l" titre="De la collecte à la candidature" sousTitre="Barres à l’échelle du taux de passage depuis l’étage précédent">
          <Entonnoir />
        </Widget>
        <Widget taille="m" nu titre="Jours d’envoi">
          <CarteChaleur
            titre="Jours d’envoi"
            sousTitre="candidatures envoyées par jour"
            jours={ENVOIS.map((e) => ({ date: e.j, valeur: e.n }))}
            fin="2026-10-20"
            semainesMax={9}
            formater={(v, d) =>
              `${v} envoi${v > 1 ? 's' : ''} · ${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}`
            }
            niveauTitre={2}
          />
        </Widget>
        <Widget taille="pleine" titre="Où en est chaque piste" sousTitre="Une colonne par étape · les écartées sortent du parcours">
          <Pipeline />
        </Widget>

        <Widget taille="l" titre="Activité" sousTitre="Les derniers mouvements de la veille">
          <FilActivite evenements={EVENEMENTS} maintenant={AUJOURDHUI} finHistorique niveauTitre={3} />
        </Widget>
        <Widget taille="m" nu titre="Contrats visés">
          <GraphiqueAnneau
            titre="Contrats visés"
            sousTitre={`${COMPTES.postulees} candidatures envoyées`}
            parts={PARTS_CONTRAT}
            libelleTotal="envoyées"
            niveauTitre={2}
          />
        </Widget>

      </GrilleWidgets>
    </PageTableauDeBord>
  );
}

import {
  Alerte,
  AnimatePresence,
  Badge,
  Bouton,
  Carte,
  CarteKPI,
  EffacerFiltres,
  GrilleWidgets,
  m,
  Onglets,
  PageTableauDeBord,
  Progression,
  PuceFiltre,
  TableauDonnees,
  Widget,
} from '@automation-ia-dev/ui';
import type { ColonneTableau } from '@automation-ia-dev/ui';
import { Ban, BookmarkCheck, Inbox, Send, Sunrise, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BRIEF, CANDIDATURES, COLLECTEES_PAR_JOUR, JUGEES_PAR_JOUR } from '../donnees-base';
import {
  COMPTES,
  COMPTES_STATUT,
  COMPTES_TELETRAVAIL,
  LIBELLE_SOURCE,
  LIBELLE_STATUT,
  joursDepuis,
  nombre,
} from '../donnees';
import { CoupleScores, Faits, JetonsBonus } from '../composants/Offre';
import type { Candidature, Engagement, Offre, StatutCandidature, Teletravail } from '../types';

export type Decision = 'gardee' | 'ecartee';

const SERIE_COLLECTE = COLLECTEES_PAR_JOUR.slice(-14).map((d) => d.n);
const COLLECTE_7J = COLLECTEES_PAR_JOUR.slice(-7).reduce((s, d) => s + d.n, 0);
const COLLECTE_7J_AVANT = COLLECTEES_PAR_JOUR.slice(-14, -7).reduce((s, d) => s + d.n, 0);

/** Jugements réussis par jour sur six semaines : la série tombe à zéro le 2 octobre. */
const SERIE_JUGEES = COLLECTEES_PAR_JOUR.map((d) =>
  Object.values(JUGEES_PAR_JOUR[d.j] ?? {}).reduce((s, n) => s + (n ?? 0), 0),
).slice(-28);

const TON_STATUT: Record<StatutCandidature, 'accent' | 'info' | 'attention' | 'succes' | 'neutre' | 'contour'> = {
  retenue: 'accent',
  postulee: 'info',
  relancee: 'attention',
  entretien: 'succes',
  terminee: 'neutre',
  ecartee: 'contour',
};

function BadgeStatut({ statut }: { statut: StatutCandidature }) {
  return (
    <Badge ton={TON_STATUT[statut]} point={statut !== 'ecartee'}>
      {LIBELLE_STATUT[statut]}
    </Badge>
  );
}

function CarteBrief({
  offre,
  rang,
  onOuvrir,
  onDecider,
}: {
  offre: Offre;
  rang: number;
  onOuvrir: () => void;
  onDecider: (d: Decision) => void;
}) {
  return (
    <Carte
      className="ft-brief"
      pied={
        <div className="ft-brief__actions">
          <Bouton variante="secondaire" icone={<Ban size={16} />} onClick={() => onDecider('ecartee')}>
            Écarter
          </Bouton>
          <Bouton icone={<BookmarkCheck size={16} />} onClick={() => onDecider('gardee')}>
            Garder
          </Bouton>
        </div>
      }
    >
      <div className="ft-brief__tete">
        <CoupleScores offre={offre} />
        <span className="ft-brief__rang" aria-label={`Numéro ${rang} du brief`}>
          {String(rang).padStart(2, '0')}
        </span>
      </div>
      <h3 className="ft-brief__titre">
        <button type="button" className="ft-lien-titre" onClick={onOuvrir}>
          {offre.titre}
        </button>
      </h3>
      <p className="ft-brief__employeur">
        {offre.employeur ?? <span className="ft-absence">employeur non publié</span>}
        <span aria-hidden="true"> · </span>
        {LIBELLE_SOURCE[offre.source]}
      </p>
      <Faits offre={offre} />
      <p className="ft-brief__verdict">{offre.verdict}</p>
      <JetonsBonus offre={offre} />
    </Carte>
  );
}

/** Une ligne de « Toute la veille » : une offre à décider, ou une candidature. */
interface Ligne {
  id: string;
  final: number;
  fit: number;
  titre: string;
  employeur: string | null;
  teletravail: Teletravail | null;
  engagement: Engagement | null;
  offre: Offre | null;
  candidature: Candidature | null;
}

const LIGNES_A_TRAITER: Ligne[] = BRIEF.map((o) => ({ ...o, offre: o, candidature: null }));
const LIGNES_CANDIDATURES: Ligne[] = CANDIDATURES.map((c) => ({
  ...c,
  offre: null,
  candidature: c,
}));

const ONGLETS: { valeur: 'a_traiter' | StatutCandidature | 'toutes'; libelle: string }[] = [
  { valeur: 'a_traiter', libelle: 'À traiter' },
  { valeur: 'retenue', libelle: 'Retenues' },
  { valeur: 'postulee', libelle: 'Postulées' },
  { valeur: 'relancee', libelle: 'Relancées' },
  { valeur: 'entretien', libelle: 'Entretien' },
  { valeur: 'terminee', libelle: 'Terminées' },
  { valeur: 'ecartee', libelle: 'Écartées' },
  { valeur: 'toutes', libelle: 'Toutes' },
];

function Veille({
  onOuvrir,
  decisions,
}: {
  onOuvrir: (o: Offre) => void;
  decisions: Record<string, Decision>;
}) {
  const [onglet, setOnglet] = useState<string>('a_traiter');
  const [teletravail, setTeletravail] = useState<string[]>([]);

  // Une offre décidée ce matin quitte « À traiter » et rejoint l'onglet de sa décision.
  const decidees = useMemo<Ligne[]>(
    () =>
      LIGNES_A_TRAITER.filter((l) => decisions[l.id] !== undefined).map((l) => ({
        ...l,
        candidature: {
          id: l.id,
          statut: decisions[l.id] === 'gardee' ? 'retenue' : 'ecartee',
          titre: l.titre,
          employeur: l.employeur,
          engagement: l.engagement,
          teletravail: l.teletravail,
          final: l.final,
          fit: l.fit,
          envoyeeLe: null,
        },
      })),
    [decisions],
  );
  const comptes = useMemo(() => {
    const c = { ...COMPTES_STATUT };
    for (const l of decidees) {
      c.a_traiter -= 1;
      if (l.candidature) c[l.candidature.statut] += 1;
    }
    return c;
  }, [decidees]);

  const lignes = useMemo(() => {
    const aTraiter = LIGNES_A_TRAITER.filter((l) => decisions[l.id] === undefined);
    const suivies = [...decidees, ...LIGNES_CANDIDATURES];
    const base =
      onglet === 'a_traiter'
        ? aTraiter
        : onglet === 'toutes'
          ? [...aTraiter, ...suivies].sort((a, b) => b.final - a.final)
          : suivies.filter((l) => l.candidature?.statut === onglet);
    if (teletravail.length === 0) return base;
    return base.filter((l) => teletravail.includes(l.teletravail ?? 'non_precise'));
  }, [onglet, teletravail, decisions, decidees]);

  const colonnes = useMemo<ColonneTableau<Ligne>[]>(() => {
    const communes: ColonneTableau<Ligne>[] = [
      {
        id: 'rang',
        libelle: 'Rang · corr.',
        accesseur: (l) => l.final,
        rendu: (l) => <CoupleScores offre={l} taille="compact" />,
        largeur: 140,
        masquable: false,
      },
      {
        id: 'intitule',
        libelle: 'Intitulé',
        accesseur: (l) => l.titre,
        rendu: (l) => (
          <span className="ft-cellule-titre">
            {l.offre ? (
              <button type="button" className="ft-lien-titre" onClick={() => l.offre && onOuvrir(l.offre)}>
                {l.titre}
              </button>
            ) : (
              <span className="ft-cellule-titre__texte">{l.titre}</span>
            )}
            {l.offre && <Faits offre={l.offre} />}
          </span>
        ),
      },
      {
        id: 'employeur',
        libelle: 'Employeur',
        accesseur: (l) => l.employeur ?? '',
        rendu: (l) => l.employeur ?? <span className="ft-absence">non publié</span>,
        largeur: 190,
      },
    ];
    if (onglet === 'a_traiter') {
      return [
        ...communes,
        {
          id: 'source',
          libelle: 'Source',
          accesseur: (l) => (l.offre ? LIBELLE_SOURCE[l.offre.source] : ''),
          largeur: 140,
        },
        {
          id: 'vue',
          libelle: 'Vue',
          accesseur: (l) => l.offre?.ageJours ?? 0,
          rendu: (l) => <span className="ft-mono">{l.offre?.ageJours} j</span>,
          alignement: 'fin',
          largeur: 80,
        },
      ];
    }
    return [
      ...communes,
      {
        id: 'statut',
        libelle: 'Statut',
        accesseur: (l) => l.candidature?.statut ?? 'a_traiter',
        rendu: (l) =>
          l.candidature ? <BadgeStatut statut={l.candidature.statut} /> : <Badge ton="contour">À traiter</Badge>,
        largeur: 130,
      },
      {
        id: 'envoyee',
        libelle: 'Envoyée',
        accesseur: (l) => l.candidature?.envoyeeLe ?? '',
        rendu: (l) =>
          l.candidature?.envoyeeLe ? (
            <span className="ft-mono">il y a {joursDepuis(l.candidature.envoyeeLe)} j</span>
          ) : (
            <span className="ft-absence">pas envoyée</span>
          ),
        alignement: 'fin',
        largeur: 120,
      },
    ];
  }, [onglet, onOuvrir]);

  const total = comptes[onglet as keyof typeof comptes];
  const phrase =
    onglet === 'toutes'
      ? `${nombre(comptes.toutes)} offres jugées. Rien de masqué.`
      : `${nombre(total)} dans cet onglet, sur ${nombre(COMPTES_STATUT.toutes)} jugées${teletravail.length > 0 ? ' · filtres actifs' : ''}.`;

  return (
    <div className="ft-veille">
      <Onglets
        libelle="Statut de candidature"
        value={onglet}
        onValeurChange={setOnglet}
        onglets={ONGLETS.map((o) => ({
          valeur: o.valeur,
          libelle: o.libelle,
          compteur: nombre(comptes[o.valeur]),
        }))}
      />
      <p className="ft-veille__phrase">{phrase}</p>
      <TableauDonnees<Ligne>
        key={onglet}
        libelle="Toute la veille"
        colonnes={colonnes}
        lignes={lignes}
        idLigne={(l) => l.id}
        triParDefaut={[{ colonne: 'rang', sens: 'desc' }]}
        optionsParPage={[10, 25, 50]}
        menuColonnes={false}
        carte={{
          titre: (l) => l.titre,
          statut: (l) =>
            l.candidature ? <BadgeStatut statut={l.candidature.statut} /> : <CoupleScores offre={l} taille="compact" />,
          sousTitre: (l) => l.employeur ?? 'employeur non publié',
          meta: (l) => (l.offre ? <Faits offre={l.offre} /> : null),
        }}
        recherche={{ placeholder: 'Rechercher un intitulé, un employeur…' }}
        filtres={
          <>
            <PuceFiltre
              cle="Télétravail"
              value={teletravail}
              onValeurChange={setTeletravail}
              options={[
                { valeur: 'full_remote', libelle: 'Full remote', compte: COMPTES_TELETRAVAIL.full_remote },
                { valeur: 'hybride', libelle: 'Hybride', compte: COMPTES_TELETRAVAIL.hybride },
                { valeur: 'sur_site', libelle: 'Sur site', compte: COMPTES_TELETRAVAIL.sur_site },
                {
                  valeur: 'non_precise',
                  libelle: 'Non précisé',
                  description: 'L’annonce ne le dit pas',
                  compte: COMPTES_TELETRAVAIL.non_precise,
                },
              ]}
            />
            <PuceFiltre
              cle="Contrat"
              options={[
                { valeur: 'freelance', libelle: 'Freelance' },
                { valeur: 'cdi', libelle: 'CDI' },
                { valeur: 'cdd', libelle: 'CDD' },
                { valeur: 'non_precise', libelle: 'Non précisé' },
              ]}
            />
            {teletravail.length > 0 && <EffacerFiltres onClick={() => setTeletravail([])} />}
          </>
        }
        vide={
          <div className="ft-vide-onglet">
            <Inbox size={20} aria-hidden="true" />
            <span>Aucune offre à cette étape pour l’instant.</span>
          </div>
        }
      />
    </div>
  );
}

export function PageMatin({
  decisions,
  onDecider,
  onOuvrir,
  onAllerCandidatures,
}: {
  decisions: Record<string, Decision>;
  onDecider: (o: Offre, d: Decision) => void;
  onOuvrir: (o: Offre) => void;
  onAllerCandidatures: () => void;
}) {
  const [alerteVisible, setAlerteVisible] = useState(true);
  const restantes = BRIEF.filter((o) => decisions[o.id] === undefined);
  const brief = restantes.slice(0, 3);
  const decidees = Object.keys(decisions).length;
  const aDecider = COMPTES.aDecider - decidees;

  return (
    <PageTableauDeBord
      surTitre="Mardi 20 octobre · Marseille, Aix et full remote"
      titre="Ce matin"
      actions={
        <Bouton variante="secondaire" icone={<Send size={16} />} onClick={onAllerCandidatures}>
          Mes candidatures
        </Bouton>
      }
    >
      <GrilleWidgets>
        {alerteVisible && (
          <Widget taille="pleine" nu titre="Panne du jugement">
            <Alerte
              ton="danger"
              icone={TriangleAlert}
              titre={`Le jugement IA échoue depuis le ${COMPTES.premierEchec}`}
              actions={[{ libelle: 'Voir les 2 147 échecs', onClick: () => undefined }]}
              onFermer={() => setAlerteVisible(false)}
            >
              La clé d’API est refusée (HTTP 401) à chaque passage de 7 h et de 14 h, alors que les
              tâches planifiées se disent réussies. {nombre(COMPTES.jugementsEnEchec)} offres
              collectées depuis attendent leur jugement : elles n’apparaissent dans aucune liste tant
              qu’il échoue.
            </Alerte>
          </Widget>
        )}

        <Widget taille="s" nu titre="À décider">
          <CarteKPI
            titre="À décider"
            icone={Sunrise}
            vedette
            valeur={Math.max(aDecider, 0)}
            comparaison="au-dessus de 50, sans décision"
            definition="Offres au-dessus du seuil du brief sans décision enregistrée. Vrai dès le premier jour : ce compte ne dépend d’aucun historique."
          />
        </Widget>
        <Widget taille="s" nu titre="Collectées">
          <CarteKPI
            titre="Collectées · 7 jours"
            valeur={COLLECTE_7J}
            serie={SERIE_COLLECTE}
            formeSerie="barres"
            tendance={{ valeur: Math.round(((COLLECTE_7J - COLLECTE_7J_AVANT) / COLLECTE_7J_AVANT) * 1000) / 10 }}
            comparaison="vs 7 jours précédents"
            definition="Offres vues pour la première fois, toutes sources confondues, avant dédoublonnage."
          />
        </Widget>
        <Widget taille="s" nu titre="Jugées par l’IA">
          <CarteKPI
            titre="Jugées par l’IA · 4 semaines"
            valeur={SERIE_JUGEES.reduce((s, n) => s + n, 0)}
            serie={SERIE_JUGEES}
            formeSerie="aire"
            comparaison={`dernier jugement réussi le ${COMPTES.dernierJugementReussi}`}
            definition="Jugements réussis par jour. La courbe tombe à zéro le 2 octobre : la clé d’API est refusée depuis."
          />
        </Widget>
        <Widget taille="s" nu titre="Candidatures">
          <CarteKPI
            titre="Candidatures envoyées"
            icone={Send}
            valeur={COMPTES.postulees}
            comparaison={`dont ${COMPTES.relancesDues} relances dues`}
            definition="Une relance est due sept jours après l’envoi, tant que rien n’a bougé."
          />
        </Widget>

        <Widget
          taille="pleine"
          titre="Le brief"
          sousTitre={`Les ${nombre(Math.max(aDecider, 0))} offres au-dessus de 50 sans décision, les plus hautes d’abord`}
          actions={
            <div className="ft-progres">
              <span className="ft-progres__texte">
                <span className="ft-mono">{decidees}</span> décidée{decidees > 1 ? 's' : ''} ce matin
              </span>
              <Progression forme="segments" valeur={Math.min(decidees, 10)} max={10} libelle="Offres décidées ce matin" />
            </div>
          }
        >
          <div className="ft-brief-grille">
            <AnimatePresence mode="popLayout" initial={false}>
              {brief.map((o, i) => (
                <m.div
                  key={o.id}
                  layout
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="ft-brief-case"
                >
                  <CarteBrief
                    offre={o}
                    rang={BRIEF.indexOf(o) + 1}
                    onOuvrir={() => onOuvrir(o)}
                    onDecider={(d) => onDecider(o, d)}
                  />
                </m.div>
              ))}
            </AnimatePresence>
          </div>
        </Widget>

        <Widget taille="pleine" titre="Toute la veille" sousTitre="Dix lignes par page, triées par rang">
          <Veille onOuvrir={onOuvrir} decisions={decisions} />
        </Widget>
      </GrilleWidgets>
    </PageTableauDeBord>
  );
}

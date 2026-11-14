import {
  BoutonCompte,
  BoutonEspace,
  BoutonNotifications,
  CoqueApplication,
  ControleSegmente,
  ElementMenu,
  ElementRadioMenu,
  EnteteMenu,
  EnTetePage,
  FilAriane,
  GroupeRadioMenu,
  Menu,
  PaletteCommandes,
  SeparateurMenu,
  Bouton,
  Avatar,
} from '@automation-ia-dev/ui';
import type { ElementNavigation, EvenementActivite, RenduLienNavigation } from '@automation-ia-dev/ui';
import {
  ChartColumnBig,
  CloudDownload,
  FileText,
  KeyRound,
  Moon,
  Palette,
  Radar,
  Send,
  SlidersHorizontal,
  Sun,
  Sunrise,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { BRIEF } from './donnees-base';
import { AUJOURDHUI, COMPTES, LIBELLE_SOURCE, score } from './donnees';
import { PanneauOffre } from './composants/PanneauOffre';
import { PageCandidatures } from './pages/Candidatures';
import { PageMarche } from './pages/Marche';
import type { Decision } from './pages/Matin';
import { PageMatin } from './pages/Matin';
import { PageReglagesPoids } from './pages/Reglages';
import { LIBELLE_VITRINE, useTheme } from './theme';
import type { Apparence, Vitrine } from './theme';
import type { Offre } from './types';

type Page = 'matin' | 'candidatures' | 'marche' | 'reglages';

const TITRES: Record<Page, string> = {
  matin: 'Ce matin',
  candidatures: 'Mes candidatures',
  marche: 'Le marché',
  reglages: 'Réglages',
};

const MARQUE = <Radar size={16} strokeWidth={1.75} aria-hidden="true" />;

const NOTIFICATIONS: EvenementActivite[] = [
  {
    id: 'n1',
    date: new Date('2026-10-19T14:00:00+02:00'),
    icone: KeyRound,
    ton: 'danger',
    nonLu: true,
    contenu: (
      <>
        Jugement en échec : <strong>clé d’API refusée</strong>
      </>
    ),
  },
  {
    id: 'n2',
    date: new Date('2026-10-19T06:31:00+02:00'),
    icone: CloudDownload,
    ton: 'neutre',
    contenu: (
      <>
        <strong>158 offres</strong> collectées ce matin
      </>
    ),
  },
  {
    id: 'n3',
    date: new Date('2026-09-24T09:00:00+02:00'),
    icone: Send,
    ton: 'attention',
    nonLu: true,
    contenu: (
      <>
        <strong>{COMPTES.relancesDues} relances</strong> sont dues
      </>
    ),
  },
];

function MenuApparence() {
  const { apparence, vitrine, choisirApparence, choisirVitrine } = useTheme();
  return (
    <Menu
      declencheur={
        <Bouton variante="secondaire" iconeSeule aria-label="Apparence" icone={<Palette size={16} strokeWidth={1.75} />} />
      }
      libelle="Apparence"
    >
      <GroupeRadioMenu
        libelle="Mode"
        disposition="segments"
        icone={apparence === 'clair' ? Sun : Moon}
        value={apparence}
        onValeurChange={(v) => choisirApparence(v as Apparence)}
      >
        <ElementRadioMenu valeur="clair" icone={Sun}>
          Clair
        </ElementRadioMenu>
        <ElementRadioMenu valeur="sombre" icone={Moon}>
          Sombre
        </ElementRadioMenu>
      </GroupeRadioMenu>
      <SeparateurMenu />
      <GroupeRadioMenu libelle="Thème" value={vitrine} onValeurChange={(v) => choisirVitrine(v as Vitrine)}>
        {(Object.keys(LIBELLE_VITRINE) as Vitrine[]).map((v) => (
          <ElementRadioMenu key={v} valeur={v}>
            {LIBELLE_VITRINE[v]}
          </ElementRadioMenu>
        ))}
      </GroupeRadioMenu>
    </Menu>
  );
}

function ContenuPlus({ aller }: { aller: (p: Page) => void }) {
  const { apparence, choisirApparence } = useTheme();
  return (
    <div className="ft-plus">
      <Bouton variante="fantome" pleineLargeur icone={<SlidersHorizontal size={16} />} onClick={() => aller('reglages')}>
        Poids du classement
      </Bouton>
      <ControleSegmente
        libelle="Mode"
        pleineLargeur
        value={apparence}
        onValeurChange={(v) => choisirApparence(v as Apparence)}
        options={[
          { valeur: 'clair', libelle: 'Clair' },
          { valeur: 'sombre', libelle: 'Sombre' },
        ]}
      />
    </div>
  );
}

export function App() {
  const [page, setPage] = useState<Page>('matin');
  const [offreOuverte, setOffreOuverte] = useState<Offre | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [palette, setPalette] = useState(false);

  const aller = useCallback((p: Page) => {
    setPage(p);
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const decider = useCallback((o: Offre, d: Decision) => {
    setDecisions((prec) => ({ ...prec, [o.id]: d }));
    setOffreOuverte(null);
  }, []);

  const rendreLien = useCallback<RenduLienNavigation>(
    ({ href, onClick, ...p }) => (
      <a
        href={href}
        {...p}
        onClick={(e) => {
          e.preventDefault();
          onClick?.(e);
          const cible = href.slice(1) as Page;
          if (cible in TITRES) aller(cible);
        }}
      />
    ),
    [aller],
  );

  const navigation: ElementNavigation[] = useMemo(
    () => [
      { id: 'matin', libelle: 'Ce matin', icone: Sunrise, href: '#matin', compte: COMPTES.aDecider - Object.keys(decisions).length },
      { id: 'candidatures', libelle: 'Mes candidatures', icone: Send, href: '#candidatures', compte: COMPTES.relancesDues },
      { id: 'marche', libelle: 'Le marché', icone: ChartColumnBig, href: '#marche' },
    ],
    [decisions],
  );

  const groupes = [
    {
      id: 'vues',
      titre: 'Vues enregistrées',
      elements: [
        { id: 'v-remote', libelle: 'Full remote', href: '#matin', couleur: 'serie-1' as const },
        { id: 'v-freelance', libelle: 'Freelance, TJM publié', href: '#matin', couleur: 'serie-2' as const },
        { id: 'v-ia', libelle: 'IA et agents', href: '#matin', couleur: 'serie-3' as const },
        { id: 'v-local', libelle: 'Marseille · 40 km', href: '#matin', couleur: 'serie-4' as const },
      ],
    },
  ];

  const pied: ElementNavigation[] = [
    { id: 'cv', libelle: 'Mon CV', icone: FileText, href: '#cv', desactive: true },
    { id: 'reglages', libelle: 'Poids du classement', icone: SlidersHorizontal, href: '#reglages' },
  ];

  const enTete = (
    <EnTetePage
      ariane={
        <FilAriane
          elements={[{ libelle: 'Veille', href: '#matin' }, { libelle: TITRES[page] }]}
          rendreLien={({ href, className, children }) => (
            <a
              href={href}
              className={className}
              onClick={(e) => {
                e.preventDefault();
                aller('matin');
              }}
            >
              {children}
            </a>
          )}
        />
      }
      actions={
        <>
          <BoutonNotifications evenements={NOTIFICATIONS} nonLues={2} maintenant={AUJOURDHUI} onToutMarquerLu={() => undefined} />
          <MenuApparence />
        </>
      }
    />
  );

  return (
    <>
      <CoqueApplication
        cleMemoire="fast-travail"
        barreLaterale={{
          marque: MARQUE,
          espace: (
            <Menu declencheur={<BoutonEspace nom="fast-travail" detail="Veille · Marseille & remote" />}>
              <ElementMenu icone={Radar}>Veille front-end React</ElementMenu>
            </Menu>
          ),
          onRechercher: () => setPalette(true),
          navigation,
          groupes,
          pied,
          compte: (
            <Menu largeur="large" declencheur={<BoutonCompte nom="Léo Bello" detail="Front-end · React, TypeScript" />}>
              <EnteteMenu avatar={<Avatar nom="Léo Bello" />} nom="Léo Bello" courriel="Profil v3 · 16 compétences" />
              <SeparateurMenu />
              <ElementMenu icone={FileText} desactive>
                Mon CV
              </ElementMenu>
              <ElementMenu icone={SlidersHorizontal} onSelect={() => aller('reglages')}>
                Poids du classement
              </ElementMenu>
            </Menu>
          ),
          actif: page,
          rendreLien,
        }}
        ongletsTelephone={[
          navigation[0] as ElementNavigation,
          { ...(navigation[1] as ElementNavigation), libelle: 'Candidatures' },
          { ...(navigation[2] as ElementNavigation), libelle: 'Marché' },
          { id: 'reglages', libelle: 'Réglages', icone: SlidersHorizontal, href: '#reglages' },
        ]}
        contenuPlus={<ContenuPlus aller={aller} />}
        enTete={enTete}
      >
        <div key={page} className="ft-page">
          {page === 'matin' && (
            <PageMatin
              decisions={decisions}
              onDecider={decider}
              onOuvrir={setOffreOuverte}
              onAllerCandidatures={() => aller('candidatures')}
            />
          )}
          {page === 'candidatures' && <PageCandidatures onRetour={() => aller('matin')} />}
          {page === 'marche' && <PageMarche />}
          {page === 'reglages' && <PageReglagesPoids />}
        </div>
      </CoqueApplication>

      <PanneauOffre
        key={offreOuverte?.id ?? 'aucune'}
        offre={offreOuverte}
        onFermer={() => setOffreOuverte(null)}
        onDecider={decider}
      />

      <PaletteCommandes
        ouvert={palette}
        onOuvertChange={setPalette}
        placeholder="Chercher une offre, une page…"
        groupes={[
          {
            id: 'pages',
            titre: 'Aller à',
            commandes: (Object.keys(TITRES) as Page[]).map((p) => ({
              id: `page-${p}`,
              libelle: TITRES[p],
              sousTitre: 'Page',
              icone: p === 'matin' ? Sunrise : p === 'candidatures' ? Send : p === 'marche' ? ChartColumnBig : SlidersHorizontal,
              onSelect: () => aller(p),
            })),
          },
          {
            id: 'offres',
            titre: 'Offres à décider',
            commandes: BRIEF.slice(0, 8).map((o) => ({
              id: o.id,
              libelle: o.titre,
              sousTitre: `${o.employeur ?? 'employeur non publié'} · ${LIBELLE_SOURCE[o.source]}`,
              avatar: { initiales: (o.employeur ?? '?').slice(0, 2).toUpperCase() },
              fin: <span className="ft-mono ft-palette-score">{score(o.final)}</span>,
              onSelect: () => {
                aller('matin');
                setOffreOuverte(o);
              },
            })),
          },
        ]}
      />
    </>
  );
}

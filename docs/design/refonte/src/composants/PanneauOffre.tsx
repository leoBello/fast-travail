import {
  Badge,
  Bouton,
  EtatVideCompact,
  Onglets,
  PanneauLateral,
  Proprietes,
} from '@automation-ia-dev/ui';
import {
  Ban,
  BookmarkCheck,
  Briefcase,
  CalendarClock,
  Coins,
  Copy,
  ExternalLink,
  Globe,
  Laptop,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import type { Offre } from '../types';
import {
  LIBELLE_ENGAGEMENT,
  LIBELLE_SOURCE,
  LIBELLE_TELETRAVAIL,
  montant,
  positionProfil,
  score,
  signe,
} from '../donnees';
import { bonusNonNuls, CoupleScores, Faits } from './Offre';

type Decision = 'gardee' | 'ecartee';

/** Une absence se nomme, jamais elle ne se vide (GUIDELINES §3.1). */
function Absence({ children }: { children: string }) {
  return <span className="ft-absence">{children}</span>;
}

/**
 * Le rang en cascade : la correspondance (figée, du modèle), puis chaque préférence de
 * `scoring_weights` (réglable, gratuite), puis le plafond. Chaque barre part de là où la
 * précédente s'arrête, sur une seule échelle.
 */
function Cascade({ offre }: { offre: Offre }) {
  const etapes: { nom: string; de: number; a: number; nature: 'fit' | 'plus' | 'moins' }[] = [
    { nom: 'Correspondance au CV', de: 0, a: offre.fit, nature: 'fit' },
  ];
  let cumul = offre.fit;
  for (const b of bonusNonNuls(offre)) {
    etapes.push({ nom: b.nom, de: cumul, a: cumul + b.valeur, nature: b.valeur > 0 ? 'plus' : 'moins' });
    cumul += b.valeur;
  }
  const max = Math.max(100, ...etapes.map((e) => Math.max(e.de, e.a)));
  const echelle = (v: number) => `${(v / max) * 100}%`;
  const plafonne = cumul > 100;
  return (
    <figure className="ft-cascade">
      <figcaption className="ft-surtitre">Pourquoi ce rang</figcaption>
      <ol className="ft-cascade__lignes">
        {etapes.map((e, i) => {
          const debut = Math.min(e.de, e.a);
          const largeur = Math.abs(e.a - e.de);
          return (
            <li key={i} className="ft-cascade__ligne">
              <span className="ft-cascade__nom">{e.nom}</span>
              <span className="ft-cascade__piste">
                <span className="ft-cascade__plafond" style={{ left: echelle(100) }} aria-hidden="true" />
                <span
                  className={`ft-cascade__barre ft-cascade__barre--${e.nature}`}
                  style={{ left: echelle(debut), width: echelle(largeur) }}
                />
              </span>
              <span className={`ft-cascade__valeur ft-cascade__valeur--${e.nature}`}>
                {e.nature === 'fit' ? e.a : signe(e.a - e.de)}
              </span>
            </li>
          );
        })}
        <li className="ft-cascade__ligne ft-cascade__ligne--total">
          <span className="ft-cascade__nom">Rang</span>
          <span className="ft-cascade__piste">
            <span className="ft-cascade__plafond" style={{ left: echelle(100) }} aria-hidden="true" />
            <span
              className="ft-cascade__barre ft-cascade__barre--total"
              style={{ left: 0, width: echelle(Math.min(cumul, 100)) }}
            />
          </span>
          <span className="ft-cascade__valeur">{score(offre.final)}</span>
        </li>
      </ol>
      <p className="ft-note">
        {plafonne
          ? `La somme atteint ${score(cumul)} ; le rang est plafonné à 100. `
          : ''}
        La correspondance vient du modèle et ne bouge pas. Les autres lignes viennent de vos
        préférences : les changer reclasse tout le corpus sans rien repayer.
      </p>
    </figure>
  );
}

function Stack({ offre }: { offre: Offre }) {
  if (offre.stack.length === 0) {
    return (
      <p>
        <Absence>
          {offre.tronque ? 'Non détectable — texte coupé' : 'Aucune techno reconnue'}
        </Absence>
      </p>
    );
  }
  const dansCv = offre.stack.filter((t) => positionProfil(t) === 'core').length;
  return (
    <div className="ft-stack">
      <ul className="ft-stack__liste">
        {offre.stack.map((t) => {
          const p = positionProfil(t);
          return (
            <li key={t}>
              <Badge
                ton={p === 'core' ? 'succes' : p === 'unwanted' ? 'danger' : p === 'adjacent' ? 'info' : 'neutre'}
                point={p === 'core'}
              >
                {t}
              </Badge>
            </li>
          );
        })}
      </ul>
      <p className="ft-note">
        {dansCv === 0
          ? 'Aucune de ces technologies n’est au cœur de votre CV.'
          : `Avec un point, les ${dansCv} technologie${dansCv > 1 ? 's' : ''} au cœur de votre CV.`}
      </p>
    </div>
  );
}

export function PanneauOffre({
  offre,
  onFermer,
  onDecider,
}: {
  offre: Offre | null;
  onFermer: () => void;
  onDecider: (offre: Offre, d: Decision) => void;
}) {
  const [onglet, setOnglet] = useState('rang');
  if (offre === null) return null;

  return (
    <PanneauLateral
      ouvert
      onOuvertChange={(o) => {
        if (!o) onFermer();
      }}
      taille="l"
      surTitre={`${LIBELLE_SOURCE[offre.source]} · vue il y a ${offre.ageJours} j`}
      titre={offre.titre}
      meta={
        <span className="ft-panneau-meta">
          <span>{offre.employeur ?? <Absence>employeur non publié</Absence>}</span>
          <Faits offre={offre} />
        </span>
      }
      actions={
        <Bouton variante="fantome" iconeSeule aria-label="Copier le lien" icone={<Copy size={16} />} />
      }
      onglets={
        <Onglets
          libelle="Sections de l’offre"
          value={onglet}
          onValeurChange={setOnglet}
          onglets={[
            { valeur: 'rang', libelle: 'Le rang' },
            { valeur: 'annonce', libelle: 'Ce que l’annonce dit', compteur: offre.stack.length },
            { valeur: 'suivi', libelle: 'Mon suivi' },
          ]}
        />
      }
      piedGauche={(feuille) => (
        <Bouton
          variante="fantome"
          icone={<Ban size={16} />}
          iconeSeule={feuille}
          aria-label={feuille ? 'Écarter' : undefined}
          onClick={() => onDecider(offre, 'ecartee')}
        >
          {feuille ? undefined : 'Écarter'}
        </Bouton>
      )}
      pied={
        <>
          <Bouton variante="secondaire" icone={<ExternalLink size={16} />}>
            Voir l’annonce
          </Bouton>
          <Bouton icone={<BookmarkCheck size={16} />} onClick={() => onDecider(offre, 'gardee')}>
            Garder
          </Bouton>
        </>
      }
    >
      {onglet === 'rang' && (
        <div className="ft-panneau-corps">
          <div className="ft-panneau-tete">
            <CoupleScores offre={offre} />
            <blockquote className="ft-verdict">
              <p>{offre.verdict}</p>
              <footer>
                Jugé par claude-sonnet-5 · confiance {offre.confiance}
                {offre.tronque ? ' · texte coupé à 500 caractères' : ''}
              </footer>
            </blockquote>
          </div>
          <Cascade offre={offre} />
        </div>
      )}
      {onglet === 'annonce' && (
        <div className="ft-panneau-corps">
          <Proprietes
            elements={[
              {
                icone: Briefcase,
                libelle: 'Contrat',
                valeur: offre.engagement ? LIBELLE_ENGAGEMENT[offre.engagement] : <Absence>non précisé</Absence>,
              },
              {
                icone: Laptop,
                libelle: 'Télétravail',
                valeur: offre.teletravail ? (
                  LIBELLE_TELETRAVAIL[offre.teletravail]
                ) : (
                  <Absence>non précisé</Absence>
                ),
              },
              {
                icone: Coins,
                libelle: offre.remuneration?.nature === 'tjm' ? 'TJM' : 'Rémunération',
                valeur: offre.remuneration ? (
                  <span className="ft-mono">{montant(offre.remuneration)}</span>
                ) : (
                  <Absence>{offre.engagement === 'freelance' ? 'TJM non publié' : 'salaire non publié'}</Absence>
                ),
              },
              {
                icone: MapPin,
                libelle: 'Lieu',
                valeur: offre.lieu ?? <Absence>non publié par la source</Absence>,
              },
              {
                icone: Sparkles,
                libelle: 'IA / agents',
                valeur: offre.agentique ? 'Oui' : 'Non',
              },
              {
                icone: Globe,
                libelle: 'Vue sur',
                valeur:
                  offre.exemplaires > 1
                    ? `${offre.exemplaires} annonces · ${[...new Set(offre.sources)].map((s) => LIBELLE_SOURCE[s]).join(', ')}`
                    : LIBELLE_SOURCE[offre.source],
              },
              {
                icone: CalendarClock,
                libelle: 'Vue il y a',
                valeur: <span className="ft-mono">{offre.ageJours} jours</span>,
              },
            ]}
          />
          <section className="ft-section">
            <h3 className="ft-surtitre">Stack détectée · {offre.stack.length} technologies</h3>
            <Stack offre={offre} />
          </section>
        </div>
      )}
      {onglet === 'suivi' && (
        <div className="ft-panneau-corps">
          <EtatVideCompact icone={BookmarkCheck} titre="Aucune décision pour l’instant">
            Garder l’offre l’ajoute à vos candidatures, à l’étape « Retenue ». L’écarter la sort de la
            liste « À traiter » sans la supprimer : elle reste dans l’onglet « Écartées ».
          </EtatVideCompact>
        </div>
      )}
    </PanneauLateral>
  );
}

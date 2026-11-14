import {
  Badge,
  GraphiqueAnneau,
  GraphiqueBarres,
  GraphiqueCourbe,
  GrilleWidgets,
  PageTableauDeBord,
  Widget,
} from '@automation-ia-dev/ui';
import { COLLECTEES_PAR_JOUR, JUGEES_PAR_JOUR, SCORES, SOURCES, STACK_MARCHE } from '../donnees-base';
import { COMPTES_TELETRAVAIL, LIBELLE_SOURCE, nombre, positionProfil } from '../donnees';
import type { Source } from '../types';

// Le 8 septembre est le jour de l'amorçage (3 447 offres « vues » d'un coup) : il écraserait l'échelle.
const JOURS = COLLECTEES_PAR_JOUR.filter((d) => d.j >= '2026-09-10');
const ETIQUETTES = JOURS.map((d) =>
  new Date(`${d.j}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
);
const COLLECTEES = JOURS.map((d) => d.n);
const JUGEES = JOURS.map((d) =>
  Object.values(JUGEES_PAR_JOUR[d.j] ?? {}).reduce((s, n) => s + (n ?? 0), 0),
);

const COULEUR_SOURCE: Record<Source, 1 | 2 | 3 | 4> = {
  adzuna: 1,
  france_travail: 2,
  collective: 3,
  free_work: 4,
};

const TECHNOS = STACK_MARCHE.slice(0, 10);

/** `width_bucket(final_score, 0, 100, 10)` : 1 = [0, 10[, …, 10 = [90, 100[, 11 = 100 pile. */
const TRANCHES = SCORES.map((s) => (s.b === 11 ? '100' : `${(s.b - 1) * 10}–${s.b * 10 - 1}`));

export function PageMarche() {
  return (
    <PageTableauDeBord surTitre="Six semaines de collecte · données du 20 octobre" titre="Le marché">
      <GrilleWidgets>
        <Widget taille="pleine" nu titre="Collecte et jugement">
          <GraphiqueCourbe
            titre="Collecte et jugement, par jour"
            sousTitre="La collecte continue ; le jugement s’arrête net le 2 octobre"
            etiquettes={ETIQUETTES}
            series={[
              { id: 'collectees', nom: 'Collectées', couleur: 1, valeurs: COLLECTEES },
              { id: 'jugees', nom: 'Jugées par l’IA', couleur: 2, valeurs: JUGEES },
            ]}
            formaterAxe={(v) => nombre(v)}
            hauteur={240}
            niveauTitre={2}
          />
        </Widget>

        <Widget taille="m" nu titre="Sources">
          <GraphiqueAnneau
            titre="D’où viennent les offres jugées"
            sousTitre="jugements réussis, par source"
            parts={SOURCES.map((s) => ({
              id: s.source,
              nom: LIBELLE_SOURCE[s.source as Source],
              couleur: COULEUR_SOURCE[s.source as Source],
              valeur: s.jugees,
            })).sort((a, b) => b.valeur - a.valeur)}
            libelleTotal="jugées"
            niveauTitre={2}
          />
        </Widget>
        <Widget taille="m" nu titre="Télétravail">
          <GraphiqueAnneau
            titre="Ce que les annonces disent du télétravail"
            sousTitre="« non précisé » n’est pas « sur site »"
            parts={[
              { id: 'np', nom: 'Non précisé', couleur: 5, valeur: COMPTES_TELETRAVAIL.non_precise },
              { id: 'fr', nom: 'Full remote', couleur: 1, valeur: COMPTES_TELETRAVAIL.full_remote },
              { id: 'hy', nom: 'Hybride', couleur: 2, valeur: COMPTES_TELETRAVAIL.hybride },
              { id: 'ss', nom: 'Sur site', couleur: 3, valeur: COMPTES_TELETRAVAIL.sur_site },
            ]}
            libelleTotal="offres"
            niveauTitre={2}
          />
        </Widget>
        <Widget taille="m" nu titre="Rangs">
          <GraphiqueBarres
            titre="Où tombent les rangs"
            sousTitre="offres jugées, par tranche de rang"
            etiquettes={TRANCHES}
            series={[{ id: 'offres', nom: 'Offres', couleur: 1, valeurs: SCORES.map((s) => s.n) }]}
            disposition="groupees"
            formaterAxe={(v) => nombre(v)}
            hauteur={150}
            niveauTitre={2}
          />
        </Widget>

        <Widget taille="l" nu titre="Technos demandées">
          <GraphiqueBarres
            titre="Les technos les plus demandées"
            sousTitre="offres jugées dont la stack les cite"
            etiquettes={TECHNOS.map((t) => t.t)}
            series={[{ id: 'offres', nom: 'Offres', couleur: 1, valeurs: TECHNOS.map((t) => t.n) }]}
            disposition="horizontales"
            niveauTitre={2}
          />
        </Widget>
        <Widget taille="m" titre="Face à votre profil" sousTitre="Les mêmes technos, lues dans profile_skills">
          <ul className="ft-profil">
            {TECHNOS.map((t) => {
              const p = positionProfil(t.t);
              return (
                <li key={t.t} className="ft-profil__ligne">
                  <span className="ft-profil__techno">{t.t}</span>
                  {p === 'core' && (
                    <Badge ton="succes" point>
                      Au cœur du CV
                    </Badge>
                  )}
                  {p === 'adjacent' && <Badge ton="info">Adjacente</Badge>}
                  {p === 'unwanted' && (
                    <Badge ton="danger" point>
                      Non désirée
                    </Badge>
                  )}
                  {p === null && <Badge ton="contour">Hors profil</Badge>}
                </li>
              );
            })}
          </ul>
          <p className="ft-note ft-profil__note">
            Java et Python mènent le marché et sont dans vos technos non désirées. React arrive
            neuvième : la veille trouve vos offres parce que le lexique les cherche, pas parce
            qu’elles abondent.
          </p>
        </Widget>
      </GrilleWidgets>
    </PageTableauDeBord>
  );
}

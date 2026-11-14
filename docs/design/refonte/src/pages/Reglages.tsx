import { Alerte, Bouton, Curseur, GrilleWidgets, m, PageTableauDeBord, Widget } from '@automation-ia-dev/ui';
import { ArrowDown, ArrowUp, Check, Minus, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BRIEF } from '../donnees-base';
import { POIDS, score } from '../donnees';
import type { Offre } from '../types';

type Poids = {
  freelance: number;
  cdi: number;
  remote: number;
  hybride: number;
  agentique: number;
  duree: number;
  fraicheur: number;
};

const INITIAL: Poids = {
  freelance: POIDS.freelance_bonus,
  cdi: POIDS.cdi_bonus,
  remote: POIDS.remote_full_bonus,
  hybride: POIDS.remote_hybrid_bonus,
  agentique: POIDS.agentic_bonus,
  duree: POIDS.duration_long_bonus,
  fraicheur: POIDS.freshness_decay_per_day,
};

/**
 * Le calcul de `offers_scored`, rejoué ici : la correspondance est figée, les préférences se
 * relisent. Mêmes règles que la vue (plafond 100, fraîcheur après 7 jours de grâce, plafonnée à 25).
 */
function rang(o: Offre, p: Poids): number {
  const engagement = o.engagement === 'freelance' ? p.freelance : o.engagement === 'cdi' ? p.cdi : 0;
  const remote = o.teletravail === 'full_remote' ? p.remote : o.teletravail === 'hybride' ? p.hybride : 0;
  const agentique = o.agentique ? p.agentique : 0;
  const duree = o.bonus.duree > 0 ? p.duree : 0;
  const fraicheur = Math.min(
    POIDS.freshness_malus_cap,
    Math.max(0, o.ageJours - POIDS.freshness_grace_days) * p.fraicheur,
  );
  const brut = o.fit + engagement + remote + o.bonus.remuneration + duree + agentique + o.bonus.technos - fraicheur;
  return Math.max(0, Math.min(100, brut));
}

function classer(p: Poids) {
  return BRIEF.map((o) => ({ o, r: rang(o, p) })).sort((a, b) => b.r - a.r || b.o.fit - a.o.fit);
}

const CLASSEMENT_INITIAL = classer(INITIAL).map((x) => x.o.id);

const REGLAGES: { cle: keyof Poids; libelle: string; aide: string; max: number; pas?: number }[] = [
  { cle: 'remote', libelle: 'Full remote', aide: 'Le critère le plus valorisé', max: 30 },
  { cle: 'freelance', libelle: 'Freelance', aide: 'Prioritaire sur le CDI', max: 30 },
  { cle: 'agentique', libelle: 'IA / agents', aide: 'Le différenciateur assumé du profil', max: 30 },
  { cle: 'duree', libelle: 'Mission longue', aide: 'Six mois et plus', max: 20 },
  { cle: 'hybride', libelle: 'Hybride', aide: 'Acceptable, nettement moins bien', max: 20 },
  { cle: 'cdi', libelle: 'CDI', aide: 'Acceptable, sans priorité', max: 20 },
  { cle: 'fraicheur', libelle: 'Décote de fraîcheur', aide: 'Points retirés par jour après 7 jours', max: 3, pas: 0.5 },
];

export function PageReglagesPoids() {
  const [poids, setPoids] = useState<Poids>(INITIAL);
  const classement = useMemo(() => classer(poids), [poids]);
  const modifie = REGLAGES.some((r) => poids[r.cle] !== INITIAL[r.cle]);

  return (
    <PageTableauDeBord
      surTitre="Réglages · gratuit et rétroactif"
      titre="Poids du classement"
      actions={
        <>
          <Bouton
            variante="secondaire"
            icone={<RotateCcw size={16} />}
            disabled={!modifie}
            onClick={() => setPoids(INITIAL)}
          >
            Rétablir
          </Bouton>
          <Bouton icone={<Check size={16} />} disabled={!modifie} onClick={() => setPoids(INITIAL)}>
            Enregistrer
          </Bouton>
        </>
      }
    >
      <GrilleWidgets>
        <Widget
          taille="m"
          titre="Vos préférences"
          sousTitre="En points"
        >
          <div className="ft-reglages__curseurs">
            {REGLAGES.map((r) => (
              <Curseur
                key={r.cle}
                libelle={r.libelle}
                aide={r.aide}
                min={0}
                max={r.max}
                pas={r.pas ?? 1}
                value={poids[r.cle]}
                onValeurChange={(v) => setPoids((p) => ({ ...p, [r.cle]: v }))}
                formater={(v) => (r.cle === 'fraicheur' ? `−${score(v)} / jour` : `+${score(v)}`)}
              />
            ))}
          </div>
        </Widget>
        <Widget
          taille="l"
          titre="Le brief, reclassé en direct"
          sousTitre="Les 14 premières offres à décider · rang et correspondance"
        >
          <p className="ft-note ft-reglages__intro">
            La correspondance au CV est jugée une fois par l’IA et ne bouge pas. Ces préférences
            s’y ajoutent dans la vue : les changer reclasse tout le corpus au prochain affichage,
            sans repayer un seul jugement.
          </p>
          <ol className="ft-reclasse">
            {classement.map(({ o, r }, i) => {
              const avant = CLASSEMENT_INITIAL.indexOf(o.id);
              const ecart = avant - i;
              return (
                <m.li
                  key={o.id}
                  layout
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  className="ft-reclasse__ligne"
                >
                  <span className="ft-reclasse__position ft-mono">{i + 1}</span>
                  <span className="ft-reclasse__titre">
                    <span className="ft-reclasse__intitule">{o.titre}</span>
                    <span className="ft-reclasse__employeur">{o.employeur ?? 'employeur non publié'}</span>
                  </span>
                  <span
                    className={`ft-reclasse__ecart ft-reclasse__ecart--${ecart > 0 ? 'monte' : ecart < 0 ? 'descend' : 'stable'}`}
                    aria-label={
                      ecart === 0 ? 'Même place' : ecart > 0 ? `Monte de ${ecart}` : `Descend de ${-ecart}`
                    }
                  >
                    {ecart > 0 ? <ArrowUp size={12} /> : ecart < 0 ? <ArrowDown size={12} /> : <Minus size={12} />}
                    {ecart !== 0 && Math.abs(ecart)}
                  </span>
                  <span className="ft-couple ft-couple--compact">
                    <span className="ft-couple__final">{score(r)}</span>
                    <span className="ft-couple__fit">{o.fit}</span>
                  </span>
                </m.li>
              );
            })}
          </ol>
          {classement.filter((x) => x.r >= 100).length > 2 && (
            <Alerte ton="info" ligne titre="Le plafond absorbe le réglage">
              {classement.filter((x) => x.r >= 100).length} offres sont à 100 : au-delà, monter un
              poids ne les départage plus. Jugez l’effet sur les rangs, pas sur les valeurs.
            </Alerte>
          )}
        </Widget>
      </GrilleWidgets>
    </PageTableauDeBord>
  );
}

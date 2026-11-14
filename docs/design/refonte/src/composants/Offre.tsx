import { Badge, InfoBulle } from '@automation-ia-dev/ui';
import type { Offre } from '../types';
import { LIBELLE_ENGAGEMENT, LIBELLE_TELETRAVAIL, score, signe } from '../donnees';

/**
 * Le couple de scores (GUIDELINES §3.4) : `final` et `fit` vont toujours ensemble. L'anneau dit
 * le rang ; la correspondance au CV, figée, s'écrit à côté, plus petite.
 */
export function CoupleScores({
  offre,
  taille = 'grand',
}: {
  offre: Pick<Offre, 'final' | 'fit'>;
  taille?: 'grand' | 'compact';
}) {
  if (taille === 'compact') {
    return (
      <span
        className="ft-couple ft-couple--compact"
        aria-label={`Rang ${score(offre.final)}, correspondance au CV ${offre.fit}`}
      >
        <span className="ft-couple__final">{score(offre.final)}</span>
        <span className="ft-couple__fit">{offre.fit}</span>
      </span>
    );
  }
  const r = 26;
  const c = 2 * Math.PI * r;
  const part = Math.min(offre.final, 100) / 100;
  return (
    <div
      className="ft-couple"
      role="group"
      aria-label={`Rang ${score(offre.final)} sur 100, correspondance au CV ${offre.fit}`}
    >
      <div className="ft-anneau" aria-hidden="true">
        <svg viewBox="0 0 64 64" width="64" height="64">
          <circle cx="32" cy="32" r={r} className="ft-anneau__piste" />
          <circle
            cx="32"
            cy="32"
            r={r}
            className="ft-anneau__valeur"
            strokeDasharray={`${c * part} ${c}`}
            transform="rotate(-90 32 32)"
          />
        </svg>
        <span className="ft-anneau__chiffre">{score(offre.final)}</span>
      </div>
      <div className="ft-couple__legende">
        <span className="ft-couple__libelle">rang</span>
        <span className="ft-couple__fit-grand">
          {offre.fit}
          <span className="ft-couple__libelle"> corresp.</span>
        </span>
      </div>
    </div>
  );
}

/** Les faits d'une offre, chacun par un badge qui porte un mot (GUIDELINES §1 et §3.7). */
export function Faits({ offre, avecConfiance = true }: { offre: Offre; avecConfiance?: boolean }) {
  return (
    <span className="ft-faits">
      {offre.teletravail === null ? (
        <Badge ton="contour">Télétravail non précisé</Badge>
      ) : (
        <Badge ton={offre.teletravail === 'full_remote' ? 'succes' : 'neutre'} point>
          {LIBELLE_TELETRAVAIL[offre.teletravail]}
        </Badge>
      )}
      {offre.engagement === null ? (
        <Badge ton="contour">Contrat non précisé</Badge>
      ) : (
        <Badge ton="neutre">{LIBELLE_ENGAGEMENT[offre.engagement]}</Badge>
      )}
      {offre.agentique && (
        <Badge ton="accent" point>
          IA / agents
        </Badge>
      )}
      {avecConfiance && offre.confiance === 'basse' && (
        <InfoBulle contenu="Adzuna coupe toute description à 500 caractères : le modèle a jugé sur un début de texte. Une offre en confiance basse se lit, elle ne s'écarte pas.">
          <span tabIndex={0} className="ft-faits__bulle">
            <Badge ton="attention" point>
              Texte coupé à 500 car.
            </Badge>
          </span>
        </InfoBulle>
      )}
    </span>
  );
}

const NOMS_BONUS: Record<keyof Offre['bonus'], string> = {
  engagement: 'contrat',
  teletravail: 'remote',
  remuneration: 'rémunération',
  duree: 'durée',
  agentique: 'agentique',
  technos: 'technos',
  fraicheur: 'fraîcheur',
};

export function bonusNonNuls(offre: Offre) {
  return (Object.keys(offre.bonus) as (keyof Offre['bonus'])[])
    .map((cle) => ({ cle, valeur: offre.bonus[cle], nom: NOMS_BONUS[cle] }))
    .filter((b) => b.valeur !== 0);
}

/** La décomposition du rang en jetons signés : un score opaque n'est pas corrigeable à l'œil. */
export function JetonsBonus({ offre }: { offre: Offre }) {
  return (
    <ul className="ft-jetons" aria-label="Ce qui compose le rang">
      {bonusNonNuls(offre).map((b) => (
        <li key={b.cle} className={b.valeur > 0 ? 'ft-jeton ft-jeton--plus' : 'ft-jeton ft-jeton--moins'}>
          <span className="ft-jeton__valeur">{signe(b.valeur)}</span> {b.nom}
        </li>
      ))}
      {offre.remuneration === null && (
        <li className="ft-jeton ft-jeton--absence">
          {offre.engagement === 'freelance' ? 'TJM non publié' : 'salaire non publié'}
        </li>
      )}
    </ul>
  );
}

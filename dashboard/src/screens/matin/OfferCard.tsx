import { motion } from 'framer-motion';
import { Badge } from '../../ui/kit/Badge';
import { Absence } from '../../ui/kit/Absence';
import { ScoreJetons, ScorePaire } from '../../ui/kit/Score';
import { Tooltip } from '../../ui/kit/Tooltip';
import {
  badgesDeFaits,
  badgeTexteCoupe,
  formatCompensation,
  formatEmployeur,
  scoreJetons,
} from '../../data/format';
import type { OfferDashboardRow } from '../../data/types';
import { t } from '../../i18n/i18n';
import styles from './OfferCard.module.css';

interface Props {
  offer: OfferDashboardRow;
  onGarder: () => void;
  onEcarter: () => void;
  /** Vrai pendant l'appel réseau déclenché par un clic sur cette carte —
   * désactive les deux boutons pour ne jamais envoyer deux décisions à la
   * fois sur la même offre. */
  enTraitement: boolean;
  /** Ouvre le détail de l'offre (tâche 8, `Detail.dc.html`). Optionnel,
   * même principe que `OfferRow.onOuvrir` : sans lui, le titre reste du
   * texte simple plutôt qu'un geste. Porté par le TITRE, pas par la carte
   * entière — celle-ci contient déjà des boutons et un lien (`Garder`,
   * `Écarter`, l'annonce d'origine), et un élément interactif ne peut pas en
   * envelopper un autre sans DOM invalide. */
  onOuvrir?: (id: string) => void;
  /** Le plancher `scoring_weights.salaire_floor` (tâche 10, `GET /config`) —
   * `null` tant qu'il n'a pas été lu, voir `data/format.ts`. */
  salaireFloor: number | null;
}

/**
 * Une carte de la bande « Ce matin » (`Main.dc.html`).
 *
 * Composant important au sens de GUIDELINES §2 (occupe une zone
 * structurante, affiche un chiffre sur lequel on décide) : sa forme suit la
 * maquette approuvée. `ScorePaire`/`ScoreJetons` (extension du kit, voir
 * `Score.tsx`) plutôt qu'un second rendu de score — le corps de la carte
 * (titre, badges, verdict) s'intercale entre les deux, comme la maquette le
 * dessine.
 */
export function OfferCard({
  offer,
  onGarder,
  onEcarter,
  enTraitement,
  onOuvrir,
  salaireFloor,
}: Props) {
  const employeur = formatEmployeur(offer);
  const compensation = formatCompensation(offer, salaireFloor);
  const texteCoupe = badgeTexteCoupe(offer);
  const jetons = scoreJetons(offer);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      className={styles.carte}
      data-offer-id={offer.id}
    >
      <div className={styles.entete}>
        <ScorePaire
          final={offer.final_score}
          fit={offer.fit_score}
          libelleFinal={t('matin.rang')}
          libelleFit={t('matin.corresp')}
        />
        <div className={styles.spacer} />
        {offer.confidence === 'basse' ? (
          <Tooltip
            intitule={t('confiance.infobulleBasseTitre')}
            contenu={t('confiance.infobulleBasseCorps')}
          >
            <span>
              <Badge ton="alerte" taille="compacte" point>
                {t('confiance.basse')}
              </Badge>
            </span>
          </Tooltip>
        ) : (
          <Badge ton={offer.confidence === 'haute' ? 'succes' : 'neutre'} taille="compacte" point>
            {t(`confiance.${offer.confidence}`)}
          </Badge>
        )}
      </div>

      <div>
        <div className={styles.titre}>
          {offer.title === null || offer.title.trim() === '' ? (
            <Absence nature="non-publiee">{t('absences.non-publiee')}</Absence>
          ) : onOuvrir === undefined ? (
            offer.title
          ) : (
            <button type="button" className={styles.titreLien} onClick={() => onOuvrir(offer.id)}>
              {offer.title}
            </button>
          )}
        </div>
        <div className={styles.entreprise}>
          {employeur.connu ? (
            <span>{employeur.texte}</span>
          ) : (
            <Absence nature="non-publiee">{t('absences.non-publiee')}</Absence>
          )}
          <span className={styles.source}>{t(`sources.${offer.source}`)}</span>
        </div>
      </div>

      <div className={styles.badges}>
        {badgesDeFaits(offer).map((badge) => (
          <Badge key={badge.cle} ton={badge.ton} taille="compacte" point>
            {badge.label}
          </Badge>
        ))}
        {compensation.kind === 'connu' ? (
          <Badge ton="succes" taille="compacte" point>
            {compensation.texte}
          </Badge>
        ) : null}
        {compensation.kind === 'incertain' ? (
          <Tooltip
            intitule={t('matin.uniteIncertaineBadge')}
            contenu={t('matin.uniteIncertaineInfobulle')}
          >
            <span>
              <Badge ton="alerte" taille="compacte" discontinu>
                <span className={styles.montantBarre}>{compensation.texte}</span>
              </Badge>
            </span>
          </Tooltip>
        ) : null}
        {compensation.kind === 'attente' ? (
          // Ni « connu » (succès) ni « incertain » (alerte) : le plancher
          // n'est pas encore lu (GET /config), donc rien n'affirme la
          // certitude du montant — voir data/format.ts. Ton neutre,
          // discontinu comme les autres compteurs « en attente » du kit.
          <Badge ton="neutre" taille="compacte" discontinu>
            {compensation.texte}
          </Badge>
        ) : null}
        {texteCoupe === null ? null : (
          <Badge ton={texteCoupe.ton} taille="compacte" discontinu>
            {texteCoupe.label}
          </Badge>
        )}
      </div>

      <p className={styles.verdict}>{offer.verdict}</p>

      <div className={styles.jetonsEtAbsences}>
        <ScoreJetons jetons={jetons} />
        {compensation.kind === 'absent' ? (
          <Absence nature="salaire-non-publie">{t('absences.salaire-non-publie')}</Absence>
        ) : null}
      </div>

      <div className={styles.remplissage} />

      <div className={styles.actions}>
        <button type="button" className={styles.bouton} onClick={onEcarter} disabled={enTraitement}>
          {t('matin.ecarter')}
        </button>
        <button
          type="button"
          className={styles.boutonPrimaire}
          onClick={onGarder}
          disabled={enTraitement}
        >
          {t('matin.garder')}
        </button>
        {offer.url === null ? (
          // Pas d'URL d'origine — arrive rarement mais reste possible selon
          // la source : un bouton désactivé plutôt qu'un lien mort.
          <button
            type="button"
            className={styles.boutonIcone}
            disabled
            aria-label={t('matin.ouvrirAnnonce')}
          >
            <LienIcone />
          </button>
        ) : (
          <a
            className={styles.boutonIcone}
            href={offer.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('matin.ouvrirAnnonce')}
          >
            <LienIcone />
          </a>
        )}
      </div>
    </motion.article>
  );
}

/** L'icône « sortie de l'application » — le lien vers l'annonce d'origine la
 * porte toujours (GUIDELINES §1). Un seul tracé, réutilisé sur les deux
 * rendus (lien actif, bouton désactivé sans URL). */
function LienIcone() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

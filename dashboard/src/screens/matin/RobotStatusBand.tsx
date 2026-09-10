import type { CollecteStatus, JugementStatus, RobotStatusResult } from '../../data/types';
import { formatDateLongue, formatHeureParis, joursDepuisParis } from '../../data/parisDate';
import { t } from '../../i18n/i18n';
import styles from './RobotStatusBand.module.css';

interface Props {
  /** `null` tant que `GET /robot-status` n'a pas répondu. La bande n'affiche
   * alors RIEN — ni coche, ni heure, ni zéro. Un état de robot inventé le
   * temps d'un aller-retour réseau serait une affirmation fausse
   * (GUIDELINES §3.3), et c'est précisément ce que cette bande existe pour
   * ne plus faire. */
  etat: RobotStatusResult | null;
  /** Injectable pour les tests : « hier » se calcule par rapport à un
   * instant, et un test qui dépendrait de l'horloge réelle deviendrait faux
   * une fois par jour. */
  maintenant?: Date;
}

/** « 8 h 30 » aujourd'hui, « hier 8 h 30 » la veille, « 8 septembre 2026 »
 * au-delà — jamais une heure nue qui laisserait croire à ce matin.
 *
 * `null` en entrée rend le mot « jamais » : c'est le cas d'une base qui n'a
 * encore aucune collecte réussie. Une absence se nomme (GUIDELINES §3.1). */
function quand(iso: string | null, maintenant: Date): string {
  const heure = formatHeureParis(iso);
  if (heure === null) return t('robots.jamais');
  const jours = joursDepuisParis(iso, maintenant);
  if (jours === 0) return heure;
  if (jours === 1) return `${t('robots.hier')} ${heure}`;
  return formatDateLongue(iso) ?? heure;
}

const ICONE = {
  viewBox: '0 0 24 24',
  width: 13,
  height: 13,
} as const;

function IconeReussie() {
  return (
    <svg
      {...ICONE}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconeAlerte() {
  return (
    <svg
      {...ICONE}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

function IconeAttente() {
  return (
    <svg
      {...ICONE}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function Collecte({ etat, maintenant }: { etat: CollecteStatus; maintenant: Date }) {
  if (etat.etat === 'nominal') {
    return (
      <span className={styles.bloc} data-ton="succes">
        <IconeReussie />
        {t('robots.collecte')} <span className={styles.valeur}>{quand(etat.at, maintenant)}</span>
      </span>
    );
  }
  if (etat.etat === 'partielle') {
    return (
      <span className={styles.bloc} data-ton="alerte">
        <IconeAlerte />
        <span className={styles.fort}>
          {t('robots.collecte')} <span className={styles.valeur}>{quand(etat.at, maintenant)}</span>{' '}
          {t('robots.partielle')}
        </span>
        <span className={styles.apres}>
          {t('robots.sourcesIncompletes', etat.sourcesIncompletes, etat.sourcesTotal)}
        </span>
      </span>
    );
  }
  if (etat.etat === 'en_echec') {
    return (
      <span className={styles.bloc} data-ton="danger">
        <IconeAlerte />
        <span className={styles.fort}>
          {t('robots.collecte')} <span className={styles.valeur}>{quand(etat.at, maintenant)}</span>{' '}
          {t('robots.enEchec')}
        </span>
        <span className={styles.apres}>
          {t('robots.derniereReussite')}{' '}
          <span className={styles.valeur}>{quand(etat.derniereReussite, maintenant)}</span>
        </span>
      </span>
    );
  }
  return (
    <span className={styles.bloc} data-ton="attente">
      <IconeAttente />
      <span className={styles.etiquette}>{t('robots.collecte')}</span>{' '}
      <span className={styles.absent}>{t('robots.pasEncoreAujourdhui')}</span>
      <span className={styles.apres}>
        {t('robots.derniere')}{' '}
        <span className={styles.valeur}>{quand(etat.derniere, maintenant)}</span>
      </span>
    </span>
  );
}

function Jugement({ etat, maintenant }: { etat: JugementStatus; maintenant: Date }) {
  if (etat.etat === 'fait') {
    return (
      <span className={styles.bloc} data-ton="succes">
        <IconeReussie />
        {t('robots.jugement')} <span className={styles.valeur}>{quand(etat.at, maintenant)}</span>
        <span className={styles.apres}>
          <span className={styles.valeur}>{t('robots.jugees', etat.count)}</span>
        </span>
      </span>
    );
  }
  return (
    <span className={styles.bloc} data-ton="attente">
      <span className={styles.etiquette}>{t('robots.jugement')}</span>{' '}
      <span className={styles.absent}>{t('robots.pasEncoreAujourdhui')}</span>
    </span>
  );
}

/**
 * L'état des deux robots dans la barre d'application (`Main.dc.html` pour le
 * cas nominal, `Etats.dc.html` — « L'état des deux robots, quatre cas » —
 * pour les trois autres).
 *
 * **Ce que cette bande existe pour ne pas faire** : afficher l'heure de la
 * veille comme si le robot avait tourné ce matin. Les crons partent à 8 h et
 * 8 h 30 heure de Paris, et le jugement à 9 h ; avant ces heures il n'y a
 * rien du jour, et c'est l'état le plus fréquent — mesuré, c'est celui qu'on
 * voit en ouvrant l'écran au réveil.
 *
 * La couleur ne porte jamais l'information seule (GUIDELINES §3.7) : chaque
 * état a son mot (« partielle », « en échec », « pas encore aujourd'hui ») et
 * son icône de forme distincte — coche, cercle d'alerte, horloge.
 */
export function RobotStatusBand({ etat, maintenant = new Date() }: Props) {
  if (etat === null) return null;
  return (
    <div className={styles.bande}>
      <Collecte etat={etat.collecte} maintenant={maintenant} />
      <span className={styles.separateur} aria-hidden="true" />
      <Jugement etat={etat.jugement} maintenant={maintenant} />
    </div>
  );
}

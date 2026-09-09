import type { DashboardClient } from './data/client';
import { dashboardClientFromEnv } from './data/client';
import { t } from './i18n/i18n';
import { MatinScreen } from './screens/matin/MatinScreen';
import styles from './App.module.css';

/** Construit le client, ou capture l'erreur — jamais de JSX à l'intérieur du
 * `try` lui-même (react-hooks/error-boundaries : React ne rend pas le JSX de
 * façon synchrone, un `try/catch` autour de sa construction ne protège
 * rien). Fonction pure, hors composant : facile à tester sans rendre. */
function construireClient():
  { client: DashboardClient; erreur: null } | { client: null; erreur: unknown } {
  try {
    return { client: dashboardClientFromEnv(), erreur: null };
  } catch (erreur) {
    return { client: null, erreur };
  }
}

/**
 * La racine de composition : construit le client depuis les variables
 * `VITE_*` (la SEULE lecture d'`import.meta.env` de tout `src/` — voir
 * `data/client.ts`, `dashboardClientFromEnv`) et le passe en prop à
 * `MatinScreen`, qui ne connaît que l'interface `DashboardClient`.
 *
 * Si la configuration manque (`.env.local` absent — le cas normal d'un
 * clone sans secrets, y compris cet environnement de test), un message
 * nommé remplace l'écran plutôt qu'un plantage : GUIDELINES §3.1, une
 * absence se nomme, jamais elle ne se vide.
 */
export function App() {
  const { client, erreur } = construireClient();

  if (client === null) {
    return (
      <div className={styles.erreurConfig}>
        <p className={styles.titre}>{t('app.erreurConfigTitre')}</p>
        <p className={styles.detail}>{t('app.erreurConfigDetail')}</p>
        <p className={styles.detail}>{erreur instanceof Error ? erreur.message : String(erreur)}</p>
      </div>
    );
  }

  return <MatinScreen client={client} />;
}

import { useState } from 'react';
import type { DashboardClient } from './data/client';
import { dashboardClientFromEnv } from './data/client';
import { t } from './i18n/i18n';
import { DetailScreen } from './screens/detail/DetailScreen';
import { MatinScreen } from './screens/matin/MatinScreen';
import { MotionRoot } from './screens/matin/MotionRoot';
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
 *
 * **La navigation entre l'écran du matin et le détail d'une offre** (tâche 8)
 * vit ICI, sous la forme d'un simple état — pas d'URL adressable (pas de
 * routeur, comme le dépôt a déjà choisi Vite plutôt que Next.js pour éviter
 * tout ce qu'une application mono-utilisateur servie en local n'a pas besoin
 * de porter). Conséquence assumée : un `F5` sur le détail revient à l'écran
 * du matin plutôt que de rouvrir la même offre — documenté dans le rapport
 * de tâche, pas un défaut caché.
 *
 * **`MatinScreen` reste monté en permanence** (revue de tâche 8) : le
 * détail se SUPERPOSE, il ne remplace jamais. Le rendu conditionnel
 * précédent démontait `MatinScreen` à l'ouverture d'une offre, ce qui en
 * jetait tout l'état local (filtres, tri, page de la bande, page de la
 * liste, panneau ouvert) — perdu à CHAQUE aller-retour, pas seulement au
 * `F5`. Remonter cet état au-dessus de la bascule (dans `App`) aurait exigé
 * de faire transiter par props tout ce que `MatinScreen`/`OfferList`/
 * `FilterPanel` gèrent déjà eux-mêmes, en touchant leurs interfaces déjà
 * testées — un refactor plus large et plus risqué pour le même résultat
 * pratique. Superposer coûte deux lignes et zéro risque sur le reste de
 * l'arbre : `MatinScreen` continue de vivre sous l'overlay, son état
 * survit intact au retour.
 */
export function App() {
  const { client, erreur } = construireClient();
  const [offreOuverte, setOffreOuverte] = useState<string | null>(null);

  if (client === null) {
    return (
      <div className={styles.erreurConfig}>
        <p className={styles.titre}>{t('app.erreurConfigTitre')}</p>
        <p className={styles.detail}>{t('app.erreurConfigDetail')}</p>
        <p className={styles.detail}>{erreur instanceof Error ? erreur.message : String(erreur)}</p>
      </div>
    );
  }

  return (
    <MotionRoot>
      <MatinScreen client={client} onOuvrirOffre={setOffreOuverte} />
      {offreOuverte === null ? null : (
        <div className={styles.overlay}>
          <DetailScreen
            client={client}
            offerId={offreOuverte}
            onRetour={() => setOffreOuverte(null)}
          />
        </div>
      )}
    </MotionRoot>
  );
}

// Échafaudage : aucun écran n'est encore construit (tâche 4 et suivantes).
// Ce composant existe pour que la SPA démarre et qu'un test puisse s'exécuter.
// Le texte passe par `t()` (tâche 4, GUIDELINES §3.8) comme n'importe quel
// texte affiché — l'échafaudage n'est pas une exception à la règle.
import { t } from './i18n/i18n';

export function App() {
  return <p>{t('app.echafaudage')}</p>;
}

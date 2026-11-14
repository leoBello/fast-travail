import '@automation-ia-dev/ui/polices.css';
import '@automation-ia-dev/ui/styles.css';
import './theme';
import './maquette.css';
import { FournisseurMouvement, FournisseurUI } from '@automation-ia-dev/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { FournisseurTheme } from './theme';

createRoot(document.getElementById('racine') as HTMLElement).render(
  <StrictMode>
    <FournisseurUI locale="fr-FR">
      <FournisseurMouvement>
        <FournisseurTheme>
          <App />
        </FournisseurTheme>
      </FournisseurMouvement>
    </FournisseurUI>
  </StrictMode>,
);

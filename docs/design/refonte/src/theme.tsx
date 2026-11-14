import '@fontsource-variable/syne/wght.css';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import '@fontsource-variable/unbounded/wght.css';
import '@fontsource-variable/plus-jakarta-sans/wght.css';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import nocturne from '@automation-ia-dev/ui/themes/nocturne.css?inline';
import aurore from '@automation-ia-dev/ui/themes/aurore.css?inline';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Apparence = 'clair' | 'sombre';
export type Vitrine = 'signal' | 'nocturne' | 'aurore';

const CSS_VITRINE: Record<Vitrine, string | null> = { signal: null, nocturne, aurore };

export const LIBELLE_VITRINE: Record<Vitrine, string> = {
  signal: 'Signal',
  nocturne: 'Nocturne',
  aurore: 'Aurore',
};

interface ContexteTheme {
  apparence: Apparence;
  vitrine: Vitrine;
  choisirApparence: (a: Apparence) => void;
  choisirVitrine: (v: Vitrine) => void;
}

const Contexte = createContext<ContexteTheme | null>(null);

function lire<T extends string>(cle: string, permis: readonly T[], defaut: T): T {
  try {
    const v = localStorage.getItem(cle);
    return v !== null && (permis as readonly string[]).includes(v) ? (v as T) : defaut;
  } catch {
    return defaut;
  }
}

function ecrire(cle: string, valeur: string) {
  try {
    localStorage.setItem(cle, valeur);
  } catch {
    // Stockage indisponible (navigation privée, aperçu) : le choix vaut pour la visite.
  }
}

/**
 * Sans choix mémorisé : le thème que l'hôte a posé sur `<html>` (`dark`/`light`, ou le vocabulaire
 * de la bibliothèque), sinon celui du système. Sombre en dernier recours : c'est le thème de travail.
 */
function apparenceInitiale(): Apparence {
  const pose = document.documentElement.dataset.theme;
  if (pose === 'light' || pose === 'clair') return 'clair';
  if (pose === 'dark' || pose === 'sombre') return 'sombre';
  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'clair';
  return 'sombre';
}

/**
 * Apparence (`data-theme` sur `<html>`, vocabulaire de la bibliothèque) et thème vitrine (feuille
 * de `@automation-ia-dev/ui/themes/` injectée dans `<head>` : elle redéfinit le contrat de thème
 * dans `@layer aia.theme`, donc l'emporte sur Signal sans toucher aux composants).
 */
export function FournisseurTheme({ children }: { children: ReactNode }) {
  const [apparence, setApparence] = useState<Apparence>(() =>
    lire('ft-apparence', ['clair', 'sombre'] as const, apparenceInitiale()),
  );
  const [vitrine, setVitrine] = useState<Vitrine>(() =>
    lire('ft-vitrine', ['signal', 'nocturne', 'aurore'] as const, 'signal'),
  );

  useEffect(() => {
    document.documentElement.dataset.theme = apparence;
    ecrire('ft-apparence', apparence);
  }, [apparence]);

  useEffect(() => {
    ecrire('ft-vitrine', vitrine);
    document.documentElement.dataset.vitrine = vitrine;
    const css = CSS_VITRINE[vitrine];
    if (css === null) return;
    const style = document.createElement('style');
    style.dataset.vitrine = vitrine;
    style.textContent = css;
    document.head.append(style);
    return () => style.remove();
  }, [vitrine]);

  const valeur = useMemo(
    () => ({
      apparence,
      vitrine,
      choisirApparence: setApparence,
      choisirVitrine: setVitrine,
    }),
    [apparence, vitrine],
  );
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useTheme(): ContexteTheme {
  const c = useContext(Contexte);
  if (c === null) throw new Error('useTheme hors de FournisseurTheme');
  return c;
}

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/** La hauteur d'une ligne de « Toute la veille », telle que `Main.dc.html`
 * la dessine et qu'`OfferRow.module.css` la pose. Les deux doivent bouger
 * ensemble : une ligne plus haute que cette constante ferait déborder la
 * dernière ligne de chaque page. */
export const HAUTEUR_LIGNE = 46;

/** Sous ce plancher, la liste ne montre plus assez pour valoir une page.
 * Une fenêtre plus courte fait défiler la zone de liste — le compromis est
 * assumé, plutôt que d'afficher deux lignes. */
export const PAGE_SIZE_MIN = 5;

/** Ce qu'on demande AVANT toute mesure, et ce qu'on garde si rien n'est
 * mesurable. Correspond à la maquette bande « Ce matin » dépliée. */
export const PAGE_SIZE_DEFAUT = 8;

/**
 * La taille de page **mesurée** sur la hauteur réellement disponible, plutôt
 * que fixée : c'est ce qui fait tenir la liste dans la fenêtre au lieu de
 * déplacer le défilement à l'intérieur d'une zone.
 *
 * Amorti sans minuterie : le résultat est un **entier de lignes**, donc
 * redimensionner de quelques pixels ne change rien et ne relance aucun appel
 * réseau. Seul un franchissement de palier en déclenche un.
 *
 * **Une hauteur nulle ne change rien.** `jsdom` ne calcule aucune mise en
 * page (`clientHeight` y vaut 0), et un navigateur rend 0 pendant la frame
 * de montage : diviser naïvement demanderait 5 lignes à chaque démarrage,
 * puis les redemanderait — un appel réseau de plus, pour rien.
 */
export function usePageSizeAjustee(ref: RefObject<HTMLElement | null>): number {
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAUT);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;

    function mesurer() {
      const hauteur = element === null ? 0 : element.clientHeight;
      if (hauteur <= 0) return;
      setPageSize(Math.max(PAGE_SIZE_MIN, Math.floor(hauteur / HAUTEUR_LIGNE)));
    }

    const observateur = new ResizeObserver(mesurer);
    observateur.observe(element);
    mesurer();
    return () => observateur.disconnect();
  }, [ref]);

  return pageSize;
}

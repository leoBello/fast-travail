import { Tooltip as Base } from '@base-ui/react/tooltip';
import { useId, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import styles from './Tooltip.module.css';

interface Props {
  /** Nomme la nature de l'explication. Optionnel. */
  intitule?: string;
  contenu: ReactNode;
  /** L'élément déclencheur. Base UI y pose les attributs ARIA. */
  children: ReactElement;
}

/**
 * L'infobulle.
 *
 * **Ce qu'elle porte, et ce qu'elle ne porte pas** (GUIDELINES §1). Elle
 * explique le *pourquoi* — pourquoi une confiance est basse, pourquoi un
 * montant est barré. Elle ne porte jamais une information dont la décision
 * dépend : ce qui compte reste visible sans geste.
 *
 * Base UI plutôt qu'une implémentation maison : le placement qui évite les
 * bords, le délai qui empêche le clignotement au passage de la souris et la
 * révélation au clavier sont exactement ce qu'on écrit mal quand on l'écrit
 * soi-même.
 *
 * **Le rattachement ARIA, lui, est à notre charge.** Base UI ne le pose pas :
 * la bulle sort sans `role`, et le déclencheur sans `aria-describedby`. Une
 * bulle non rattachée est visible à la souris et muette au lecteur d'écran —
 * exactement la population pour qui l'explication compte le plus. On pose
 * donc les deux ici.
 *
 * L'état d'ouverture est contrôlé pour cette seule raison : `aria-describedby`
 * ne doit désigner la bulle QUE tant qu'elle est montée. Un identifiant qui
 * pointe dans le vide est une violation à part entière, pas un détail.
 */
export function Tooltip({ intitule, contenu, children }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const idBulle = useId();

  return (
    <Base.Root open={ouvert} onOpenChange={setOuvert}>
      <Base.Trigger render={children} aria-describedby={ouvert ? idBulle : undefined} />
      <Base.Portal>
        <Base.Positioner sideOffset={8}>
          <Base.Popup id={idBulle} role="tooltip" className={styles.popup}>
            {intitule === undefined ? null : <span className={styles.intitule}>{intitule}</span>}
            {contenu}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}

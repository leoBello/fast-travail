/**
 * La logique pure de la numérotation de pages (`Pagination.tsx`) — dans un
 * fichier séparé, sans JSX, exprès : un composant `.tsx` qui exporterait
 * aussi une fonction casserait le rafraîchissement à chaud de Vite
 * (`react-refresh/only-export-components`, vérifié : `allowConstantExport`
 * couvre une réexportation de constante ou de type, jamais de fonction —
 * voir `statusTabsLogic.ts` pour le même remède appliqué à la tâche 5).
 * `Pagination.tsx` importe ce module, il ne réexporte que le type.
 */
export interface PaginationNumerotee {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}

/**
 * Les numéros à afficher : la première, la dernière, la courante et ses deux
 * voisines, le reste replié en ellipses. Rend `[]` quand il n'y a qu'une
 * page — 158 boutons ne se dessinent pas, et 1 seul ne sert à rien.
 */
export function numerosDePage(page: number, pageCount: number): (number | 'ellipse')[] {
  if (pageCount <= 1) return [];
  const retenues = new Set<number>([1, pageCount]);
  for (let n = page - 1; n <= page + 1; n += 1) {
    if (n >= 1 && n <= pageCount) retenues.add(n);
  }
  // Quatre numéros de tête quand la courante est au début, quatre de queue
  // quand elle est à la fin : sans ça, « 1 … 158 » sur la première page ne
  // laisse aucun moyen d'avancer d'un cran au clavier.
  if (page <= 3) for (let n = 2; n <= Math.min(4, pageCount); n += 1) retenues.add(n);
  if (page >= pageCount - 2) {
    for (let n = Math.max(1, pageCount - 3); n < pageCount; n += 1) retenues.add(n);
  }

  const triees = [...retenues].sort((a, b) => a - b);
  const sortie: (number | 'ellipse')[] = [];
  let precedent = 0;
  for (const n of triees) {
    if (precedent !== 0 && n - precedent > 1) sortie.push('ellipse');
    sortie.push(n);
    precedent = n;
  }
  return sortie;
}

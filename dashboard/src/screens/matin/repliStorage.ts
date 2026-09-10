/**
 * Le repli de la bande « Ce matin », mémorisé sur CE poste.
 *
 * Ce n'est pas un retour en arrière sur `decidedStorage.ts`, retiré en tâche
 * 10 : celui-là mémorisait un FAIT SUR LES DONNÉES (le nombre d'offres
 * décidées), qui appartenait au serveur et devait valoir pour tous les
 * navigateurs. Ici il s'agit d'une PRÉFÉRENCE D'AFFICHAGE, qui n'a pas de
 * vérité serveur et n'en veut pas.
 *
 * Toute lecture et toute écriture sont gardées : un navigateur en navigation
 * privée, ou réglé pour bloquer le stockage, lève à l'accès. L'écran doit
 * s'afficher quand même — déplié, comme au premier jour.
 */
const CLEF = 'fast-travail.ce-matin.replie';

export function lireRepli(): boolean {
  try {
    return localStorage.getItem(CLEF) === 'true';
  } catch {
    return false;
  }
}

export function ecrireRepli(valeur: boolean): void {
  try {
    localStorage.setItem(CLEF, String(valeur));
  } catch {
    // Rien à faire : la préférence ne survivra pas au rechargement, et c'est
    // tout ce qu'on perd.
  }
}

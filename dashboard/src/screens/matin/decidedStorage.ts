import { parisDateKey } from '../../data/parisDate';

/**
 * Persiste le compteur « décidées » dans `localStorage`, borné à la
 * journée civile en heure de Paris — pas « la session du navigateur ».
 *
 * Corrige un choix de la première version (rapport de tâche 7) : un
 * compteur de motivation qui s'efface à chaque onglet fermé n'annonce pas
 * « la boucle qui se vide », il le dément. Rien n'est pour autant inventé :
 * aucune donnée serveur n'existe pour « décidées aujourd'hui » (même défaut
 * que le compteur banni « nouvelles offres aujourd'hui », GUIDELINES §3.3),
 * donc ce compte reste strictement ce que CE navigateur a observé — jamais
 * partagé entre appareils, jamais lu depuis l'API.
 *
 * La clé de journée est celle de `parisDate.ts` — même convention que
 * `dashboard-query.ts` côté serveur (tâche 6) — pas `Date.toDateString()`
 * (heure LOCALE du poste, pas forcément Paris) ni un UTC brut : les deux
 * mentent autour de minuit heure de Paris, exactement le piège que la
 * tâche 6 a mesuré et corrigé pour la série.
 */
const PREFIXE_CLE = 'fast-travail:decidees:';

function cle(maintenant: Date): string {
  return `${PREFIXE_CLE}${parisDateKey(maintenant)}`;
}

/**
 * Le compte déjà enregistré pour AUJOURD'HUI (heure de Paris) — 0 si rien
 * n'a encore été décidé aujourd'hui, ou si le stockage est indisponible
 * (navigation privée, quota, `localStorage` absent). Ne lève jamais : un
 * stockage cassé doit dégrader vers "0 décidées", jamais planter l'écran.
 */
export function lireDecideesDuJour(maintenant: Date = new Date()): number {
  try {
    const brut = window.localStorage.getItem(cle(maintenant));
    if (brut === null) return 0;
    const n = Number(brut);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Enregistre le compte du jour. Échec de stockage avalé délibérément (voir
 * `lireDecideesDuJour`) : le compte reste vrai en mémoire pour la session
 * courante même si la persistance échoue, ce qui reste préférable à une
 * erreur bloquante pour un compteur de motivation.
 */
export function ecrireDecideesDuJour(n: number, maintenant: Date = new Date()): void {
  try {
    window.localStorage.setItem(cle(maintenant), String(n));
  } catch {
    // Volontairement silencieux — voir la doc ci-dessus.
  }
}

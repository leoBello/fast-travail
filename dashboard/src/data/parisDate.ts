/**
 * La clé de jour civil en heure de PARIS (`YYYY-MM-DD`), jamais en UTC.
 *
 * Même convention que `supabase/functions/_shared/dashboard-query.ts`
 * (`parisDateKey`, tâche 6) — redéfinie ici plutôt qu'importée (le
 * dashboard est un projet Node distinct de l'exécution Deno des Edge
 * Functions, CLAUDE.md, frontières d'architecture). La tâche 6 a mesuré
 * pourquoi une clé UTC ment dans les deux sens autour de minuit heure de
 * Paris : un envoi à 00 h 30 heure de Paris peut tomber, en UTC, sur le
 * jour de la VEILLE (avalant un jour réellement écoulé) ou sur le jour
 * SUIVANT déjà compté (ne comptant rien de neuf) selon la saison (UTC+1 ou
 * +2). `Intl.DateTimeFormat` avec `timeZone: 'Europe/Paris'` est un global
 * standard du langage, pas un accès à un espace de noms de runtime : ce
 * fichier reste un module `data/` ordinaire, sans lecture d'environnement.
 */
const formateurParis = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function parisDateKey(date: Date = new Date()): string {
  return formateurParis.format(date);
}

/**
 * « 7 septembre » — jour et mois en heure de Paris, en toutes lettres.
 *
 * `Intl.DateTimeFormat('fr-FR', …)` plutôt qu'un tableau de noms de mois
 * écrit à la main : un global standard du langage n'est pas une chaîne en
 * dur (même raisonnement que le formateur ci-dessus), et il évite de
 * réinventer — mal — l'accord des mois français.
 */
const formateurDateLongue = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'long',
});

/** `null`/date invalide → `null`, laissant l'appelant décider du rendu
 * (une date de suivi absente est un cas normal, pas une erreur à propager). */
export function formatDateLongue(iso: string | null): string | null {
  if (iso === null) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return formateurDateLongue.format(new Date(parsed));
}

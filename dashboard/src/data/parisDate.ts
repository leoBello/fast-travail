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

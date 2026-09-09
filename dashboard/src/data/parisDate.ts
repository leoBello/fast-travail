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

/** « vendredi 15 h » — jour de semaine et heure, en heure de Paris.
 * `hourCycle: 'h23'` fixe la lecture sur 24 h : sans lui, le rendu dépend du
 * réglage régional de l'environnement d'exécution plutôt que de rester
 * stable comme le reste de ce fichier. */
const formateurJourHeure = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'long',
  hour: '2-digit',
  hourCycle: 'h23',
});

/** Sert uniquement à détecter minuit PARISIEN (voir `formatJourHeure`) — pas
 * à être affiché : `formateurJourHeure` porte le rendu réel. */
const formateurHeureMinute = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * « vendredi 15 h » — jour de semaine et heure, en heure de Paris.
 *
 * `null` sur date absente/invalide, **et aussi** sur une heure à MINUIT
 * PILE (00 h 00 heure de Paris) : `interview_at` est un `timestamptz` que
 * n'importe quel appelant peut renseigner avec une date SANS heure choisie
 * (ex. la chaîne `"2026-09-11"`, que `Date.parse` interprète à minuit UTC) —
 * rien dans le schéma ne distingue « rendez-vous réellement fixé à minuit »
 * de « seule la date a été saisie ». Un entretien professionnel à minuit
 * pile est assez improbable pour que le doute penche du côté de l'absence
 * d'heure plutôt que de l'affirmer — même principe que GUIDELINES §3.6 (une
 * unité incertaine ne s'affiche jamais comme si elle était sûre) : ne
 * jamais prétendre savoir ce qu'on ignore. L'appelant retombe alors sur
 * `formatDateLongue`, qui ne prétend rien sur l'heure.
 */
export function formatJourHeure(iso: string | null): string | null {
  if (iso === null) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  const date = new Date(parsed);
  if (formateurHeureMinute.format(date) === '00:00') return null;
  return formateurJourHeure.format(date);
}

// Runtime-neutre : aucun accès à l'environnement d'exécution dans ce fichier.
// Adzuna (et les scrapers à venir) renvoient des NOMS de département, jamais de codes.
// Ce module traduit un nom en code INSEE à deux (ou trois pour l'outre-mer) caractères.

/**
 * Code INSEE -> nom canonique. 101 entrées : 96 départements métropolitains + 5 DOM.
 * Exportée (en lecture seule) pour que le test de complétude vérifie directement le
 * compte et l'absence de doublon, sans passer par une liste de noms dupliquée dans le test.
 */
export const DEPARTMENTS: Readonly<Record<string, string>> = {
  '01': 'Ain',
  '02': 'Aisne',
  '03': 'Allier',
  '04': 'Alpes-de-Haute-Provence',
  '05': 'Hautes-Alpes',
  '06': 'Alpes-Maritimes',
  '07': 'Ardèche',
  '08': 'Ardennes',
  '09': 'Ariège',
  '10': 'Aube',
  '11': 'Aude',
  '12': 'Aveyron',
  '13': 'Bouches-du-Rhône',
  '14': 'Calvados',
  '15': 'Cantal',
  '16': 'Charente',
  '17': 'Charente-Maritime',
  '18': 'Cher',
  '19': 'Corrèze',
  '2A': 'Corse-du-Sud',
  '2B': 'Haute-Corse',
  '21': "Côte-d'Or",
  '22': "Côtes-d'Armor",
  '23': 'Creuse',
  '24': 'Dordogne',
  '25': 'Doubs',
  '26': 'Drôme',
  '27': 'Eure',
  '28': 'Eure-et-Loir',
  '29': 'Finistère',
  '30': 'Gard',
  '31': 'Haute-Garonne',
  '32': 'Gers',
  '33': 'Gironde',
  '34': 'Hérault',
  '35': 'Ille-et-Vilaine',
  '36': 'Indre',
  '37': 'Indre-et-Loire',
  '38': 'Isère',
  '39': 'Jura',
  '40': 'Landes',
  '41': 'Loir-et-Cher',
  '42': 'Loire',
  '43': 'Haute-Loire',
  '44': 'Loire-Atlantique',
  '45': 'Loiret',
  '46': 'Lot',
  '47': 'Lot-et-Garonne',
  '48': 'Lozère',
  '49': 'Maine-et-Loire',
  '50': 'Manche',
  '51': 'Marne',
  '52': 'Haute-Marne',
  '53': 'Mayenne',
  '54': 'Meurthe-et-Moselle',
  '55': 'Meuse',
  '56': 'Morbihan',
  '57': 'Moselle',
  '58': 'Nièvre',
  '59': 'Nord',
  '60': 'Oise',
  '61': 'Orne',
  '62': 'Pas-de-Calais',
  '63': 'Puy-de-Dôme',
  '64': 'Pyrénées-Atlantiques',
  '65': 'Hautes-Pyrénées',
  '66': 'Pyrénées-Orientales',
  '67': 'Bas-Rhin',
  '68': 'Haut-Rhin',
  '69': 'Rhône',
  '70': 'Haute-Saône',
  '71': 'Saône-et-Loire',
  '72': 'Sarthe',
  '73': 'Savoie',
  '74': 'Haute-Savoie',
  '75': 'Paris',
  '76': 'Seine-Maritime',
  '77': 'Seine-et-Marne',
  '78': 'Yvelines',
  '79': 'Deux-Sèvres',
  '80': 'Somme',
  '81': 'Tarn',
  '82': 'Tarn-et-Garonne',
  '83': 'Var',
  '84': 'Vaucluse',
  '85': 'Vendée',
  '86': 'Vienne',
  '87': 'Haute-Vienne',
  '88': 'Vosges',
  '89': 'Yonne',
  '90': 'Territoire de Belfort',
  '91': 'Essonne',
  '92': 'Hauts-de-Seine',
  '93': 'Seine-Saint-Denis',
  '94': 'Val-de-Marne',
  '95': "Val-d'Oise",
  '971': 'Guadeloupe',
  '972': 'Martinique',
  '973': 'Guyane',
  '974': 'La Réunion',
  '976': 'Mayotte',
};

/** Normalise un nom pour comparaison : minuscules, sans accent, séparateurs ramenés à un espace. */
function normalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’\-\s]+/g, ' ')
    .trim();
}

/** Nom normalisé -> code INSEE. Construite une seule fois au chargement du module. */
const NAME_TO_CODE: Map<string, string> = new Map(
  Object.entries(DEPARTMENTS).map(([code, name]) => [normalize(name), code]),
);

/** Traduit un nom de département (tel que renvoyé par Adzuna) en code INSEE, ou null si inconnu. */
export function departmentCodeFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  return NAME_TO_CODE.get(normalize(name)) ?? null;
}

/**
 * Parcourt toutes les entrées de `area` et renvoie le premier code trouvé.
 * La hiérarchie d'Adzuna n'est pas fixe (ex. région à l'indice 1 le plus souvent, mais pas
 * toujours), donc on ne se fie à aucune position : on teste chaque entrée.
 */
export function departmentCodeFromArea(area: readonly string[] | null | undefined): string | null {
  if (!area) return null;
  for (const entry of area) {
    const code = departmentCodeFromName(entry);
    if (code) return code;
  }
  return null;
}

/**
 * Communes de la zone visée -> code de département. Volontairement limitée aux
 * départements 13, 83 et 84, les trois que retient `offers_shortlist`.
 *
 * Raison d'être : mesuré le 2026-09-08, les sources scrapées ne donnent
 * généralement PAS de code postal — les deux pages Free-Work capturées ont
 * `postalCode: null` et un `addressRegion` qui est une région
 * (« Provence-Alpes-Côte d'Azur »), et Collective ne donne qu'un libellé
 * « Aix-en-Provence, France ». Sans ce repli, toutes leurs offres locales
 * sortiraient de la sélection.
 *
 * Hors de cette table, on rend null : c'est exact, et sans conséquence, la
 * branche non locale de la vue passant par `remote_label = 'full'`. Ce n'est
 * donc PAS un référentiel de communes à compléter — c'est un filtre de zone.
 * Le vrai géocodage par code INSEE reste le problème ouvert P1.
 */
const ZONE_CITY_TO_DEPARTMENT: Readonly<Record<string, string>> = {
  // 13 — Bouches-du-Rhône
  'Marseille': '13',
  'Aix-en-Provence': '13',
  'Aubagne': '13',
  'La Ciotat': '13',
  'Vitrolles': '13',
  'Marignane': '13',
  'Martigues': '13',
  'Istres': '13',
  'Miramas': '13',
  'Salon-de-Provence': '13',
  'Arles': '13',
  'Gardanne': '13',
  'Fos-sur-Mer': '13',
  'Berre-l’Étang': '13',
  'Rognac': '13',
  'Les Pennes-Mirabeau': '13',
  'Allauch': '13',
  'Plan-de-Cuques': '13',
  'Châteauneuf-les-Martigues': '13',
  'Bouc-Bel-Air': '13',
  'Cabriès': '13',
  'Venelles': '13',
  'Meyreuil': '13',
  'Trets': '13',
  'Cassis': '13',
  'Carry-le-Rouet': '13',
  'Sausset-les-Pins': '13',
  'Port-de-Bouc': '13',
  'Saint-Victoret': '13',
  'Septèmes-les-Vallons': '13',
  // 83 — Var
  'Toulon': '83',
  'La Seyne-sur-Mer': '83',
  'Hyères': '83',
  'Fréjus': '83',
  'Saint-Raphaël': '83',
  'Draguignan': '83',
  'Six-Fours-les-Plages': '83',
  'La Garde': '83',
  'La Valette-du-Var': '83',
  'Brignoles': '83',
  'Sanary-sur-Mer': '83',
  'Ollioules': '83',
  'Le Pradet': '83',
  'Saint-Maximin-la-Sainte-Baume': '83',
  'Cuers': '83',
  'Solliès-Pont': '83',
  'Bandol': '83',
  'Roquebrune-sur-Argens': '83',
  // 84 — Vaucluse
  'Avignon': '84',
  'Carpentras': '84',
  'Orange': '84',
  'Cavaillon': '84',
  'Le Pontet': '84',
  'Sorgues': '84',
  'L’Isle-sur-la-Sorgue': '84',
  'Pertuis': '84',
  'Apt': '84',
  'Monteux': '84',
  'Vedène': '84',
  'Bollène': '84',
  'Valréas': '84',
  'Morières-lès-Avignon': '84',
};

const CITY_TO_DEPARTMENT: Map<string, string> = new Map(
  Object.entries(ZONE_CITY_TO_DEPARTMENT).map(([city, code]) => [normalize(city), code]),
);

/**
 * Traduit un NOM DE COMMUNE de la zone visée en code de département, ou null.
 * Repli des sources qui ne fournissent pas de code postal ; ne remplace jamais
 * un code postal reçu, qui reste prioritaire.
 */
export function departmentCodeFromCityName(name: string | null | undefined): string | null {
  if (!name) return null;
  return CITY_TO_DEPARTMENT.get(normalize(name)) ?? null;
}

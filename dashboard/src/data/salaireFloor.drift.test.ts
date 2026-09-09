// @vitest-environment node
//
// Ce test ne monte rien : il LIT la migration SQL source pour comparer la
// valeur qu'elle SÈME à `SALAIRE_FLOOR_DUPLIQUE`. Même raison
// d'environnement `node` que `ui/guidelines.test.ts`/`ui/theme.test.ts` :
// jsdom remplace `URL`, `fileURLToPath` refuse alors cette instance.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SALAIRE_FLOOR_DUPLIQUE } from './format';

// dashboard/src/data/ -> ../../../ = racine du dépôt.
const MIGRATION = fileURLToPath(
  new URL(
    '../../../supabase/migrations/20260909040000_remuneration_par_nature_et_plafond_technos.sql',
    import.meta.url,
  ),
);

describe('SALAIRE_FLOOR_DUPLIQUE — alarme de dérive (GUIDELINES §3.6)', () => {
  it(
    'reste synchronisé avec la valeur SEMÉE de scoring_weights.salaire_floor — ' +
      'la VRAIE source vit en base, réglable par `UPDATE scoring_weights` (CLAUDE.md : ' +
      "gratuit et rétroactif), et ce test ne peut PAS la lire (pas d'accès réseau/DB " +
      "depuis les tests du dashboard). Il ne détecte qu'une dérive du DÉFAUT SEMÉ ; un " +
      '`UPDATE` fait en base sans toucher cette migration resterait invisible ici — ' +
      'réserve consignée dans le rapport de tâche 7, corrigée proprement par une route ' +
      'qui exposerait `scoring_weights` (hors périmètre de cette tâche).',
    () => {
      const sql = readFileSync(MIGRATION, 'utf8');
      const trouve = /\('salaire_floor',\s*(\d+),/.exec(sql);
      expect(trouve).not.toBeNull();

      const valeurSemee = Number(trouve?.[1]);
      expect(SALAIRE_FLOOR_DUPLIQUE).toBe(valeurSemee);
    },
  );
});

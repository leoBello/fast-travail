// Rétro-classe les offres France Travail déjà en base sans re-collecter :
// relit la colonne `raw` de chaque offre, la repasse dans `mapFtOffer`, et met à jour
// uniquement `remote_label`, `is_remote` et `department`. Les autres colonnes — dont
// `first_seen_at`, `last_seen_at` et `seen_count` — ne sont ni lues ni écrites.
//
// La provenance de recherche (search_origin_insee, search_radius_km) n'est pas dans
// `raw` : on passe une provenance neutre au mapper et on ne met pas à jour ces colonnes.
//
// Usage :
//   deno run --config supabase/functions/deno.json \
//     --allow-read --allow-net --allow-env scripts/backfill-remap.ts [--dry-run]

import { createDbClient } from '../supabase/functions/_shared/db.ts';
import { mapFtOffer } from '../supabase/functions/collect-france-travail/mapper.ts';
import type { FtProvenance } from '../supabase/functions/collect-france-travail/mapper.ts';

const NEUTRAL_PROVENANCE: FtProvenance = { searchOriginInsee: null, searchRadiusKm: null };
const BATCH_SIZE = 100;
const PAGE_SIZE = 1000;

interface OfferRow {
  id: string;
  raw: unknown;
}

interface RemapUpdate {
  id: string;
  remote_label: string | null;
  is_remote: boolean | null;
  department: string | null;
}

async function loadEnvLocal(path: string): Promise<Record<string, string>> {
  const text = await Deno.readTextFile(path);
  const env: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

function requireEnvValue(env: Record<string, string>, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`variable manquante dans .env.local : ${name}`);
  return value;
}

/** Sépare les offres remappables de celles dont `raw` n'est plus exploitable par le mapper. */
function computeUpdates(rows: OfferRow[]): { updates: RemapUpdate[]; skipped: number } {
  const updates: RemapUpdate[] = [];
  let skipped = 0;
  for (const row of rows) {
    const mapped = mapFtOffer(row.raw, NEUTRAL_PROVENANCE);
    if (!mapped) {
      skipped++;
      continue;
    }
    updates.push({
      id: row.id,
      remote_label: mapped.remote_label,
      is_remote: mapped.is_remote,
      department: mapped.department,
    });
  }
  return { updates, skipped };
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

function reportDistribution(updates: RemapUpdate[]): void {
  const distribution = new Map<string, number>();
  for (const u of updates) {
    const key = u.remote_label ?? 'null';
    distribution.set(key, (distribution.get(key) ?? 0) + 1);
  }
  const withDepartment = updates.filter((u) => u.department !== null).length;

  console.log('\n--- Répartition remote_label ---');
  for (const [label, count] of [...distribution.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${label.padEnd(10)} ${count}`);
  }
  console.log('\n--- department ---');
  console.log(`  renseigné  ${withDepartment}`);
  console.log(`  null       ${updates.length - withDepartment}`);
}

async function main() {
  const dryRun = Deno.args.includes('--dry-run');
  console.log(
    dryRun
      ? 'Mode --dry-run : aucune écriture en base.\n'
      : 'Mode réel : les lignes seront mises à jour.\n',
  );

  const env = await loadEnvLocal('.env.local');
  const db = createDbClient({
    url: requireEnvValue(env, 'SUPABASE_URL'),
    serviceRoleKey: requireEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY'),
  });

  const rows: OfferRow[] = [];
  for (let from = 0;; from += PAGE_SIZE) {
    const { data, error } = await db
      .from('offers')
      .select('id, raw')
      .eq('source', 'france_travail')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`lecture des offres : ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as OfferRow[]));
    if (data.length < PAGE_SIZE) break;
  }
  console.log(`${rows.length} offres france_travail en base.`);

  const { updates, skipped } = computeUpdates(rows);
  if (skipped > 0) {
    console.log(`${skipped} offres ignorées : raw inexploitable par mapFtOffer.`);
  }

  const batches = chunk(updates, BATCH_SIZE);
  let done = 0;
  for (const batch of batches) {
    if (!dryRun) {
      const results = await Promise.all(
        batch.map((u) =>
          db
            .from('offers')
            .update({
              remote_label: u.remote_label,
              is_remote: u.is_remote,
              department: u.department,
            })
            .eq('id', u.id)
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        throw new Error(`mise à jour en échec dans un lot : ${failed.error.message}`);
      }
    }
    done += batch.length;
    console.log(`${done}/${updates.length} offres traitées${dryRun ? ' (dry-run)' : ''}.`);
  }

  reportDistribution(updates);
  console.log(
    dryRun
      ? '\nDry-run terminé, aucune écriture effectuée. Relancer sans --dry-run pour appliquer.'
      : '\nBackfill terminé.',
  );
}

if (import.meta.main) {
  await main();
}

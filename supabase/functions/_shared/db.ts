import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Configuration injectée : ce fichier ne lit JAMAIS l'environnement lui-même. */
export interface DbConfig {
  url: string;
  serviceRoleKey: string;
}

export type DbClient = SupabaseClient;

export function createDbClient(cfg: DbConfig): DbClient {
  if (!cfg.url) throw new Error('DbConfig.url manquant');
  if (!cfg.serviceRoleKey) throw new Error('DbConfig.serviceRoleKey manquant');

  return createClient(cfg.url, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/// <reference types="vite/client" />

// Les trois variables lues par `data/client.ts` (`dashboardClientFromEnv`).
// Déclarées ici pour que `import.meta.env.VITE_…` soit typé sans `as any` —
// aucune valeur n'est fixée, seules les clés le sont (CLAUDE.md, « Secrets » :
// aucun secret n'est écrit dans le dépôt, voir `.env.example`).
interface ImportMetaEnv {
  readonly VITE_DASHBOARD_API_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_DASHBOARD_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

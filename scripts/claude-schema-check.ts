import { callClaudeStructured } from '../supabase/functions/_shared/claude.ts';
import { JUDGEMENT_SCHEMA } from '../supabase/functions/_shared/scoring-prompt.ts';

const result = await callClaudeStructured<Record<string, unknown>>(
  {
    apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '',
    workspaceId: Deno.env.get('ANTHROPIC_WORKSPACE_ID') ?? '',
    model: 'claude-sonnet-5',
  },
  {
    systemBlocks: [{ type: 'text', text: 'Tu reponds en JSON strict.' }],
    userText: 'Offre bidon pour test de schema : developpeur React freelance, ' +
      'full remote, 500 EUR/jour, 6 mois. Reponds avec des valeurs plausibles.',
    schema: JUDGEMENT_SCHEMA,
    maxTokens: 512,
  },
);

console.log(JSON.stringify(result));

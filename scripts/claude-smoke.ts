import { callClaudeStructured } from '../supabase/functions/_shared/claude.ts';

const result = await callClaudeStructured<{ ok: boolean; note: number }>(
  {
    apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? '',
    workspaceId: Deno.env.get('ANTHROPIC_WORKSPACE_ID') ?? '',
    model: 'claude-sonnet-5',
  },
  {
    systemBlocks: [{ type: 'text', text: 'Tu reponds en JSON strict.' }],
    userText: 'Reponds ok=true et note=7.',
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' }, note: { type: 'integer' } },
      required: ['ok', 'note'],
      additionalProperties: false,
    },
    maxTokens: 256,
  },
);

console.log(JSON.stringify(result));

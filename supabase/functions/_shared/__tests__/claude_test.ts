import { assertEquals, assertRejects } from '@std/assert';
import { callClaudeStructured, ClaudeApiError } from '../claude.ts';

const cfg = {
  apiKey: 'cle-de-test',
  workspaceId: 'ws-de-test',
  model: 'claude-sonnet-5',
};

const call = {
  systemBlocks: [{ type: 'text' as const, text: 'Tu notes des offres.' }],
  userText: 'Une offre React.',
  schema: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'] },
  maxTokens: 512,
};

function okResponse(payload: unknown, usage: Record<string, number> = {}): Response {
  return new Response(
    JSON.stringify({
      content: [{ type: 'text', text: JSON.stringify(payload) }],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        ...usage,
      },
    }),
    { status: 200 },
  );
}

Deno.test('parse la sortie structuree et remonte l usage', async () => {
  let seen: Request | undefined;
  const fetchImpl = (input: string | URL | Request, init?: RequestInit) => {
    seen = new Request(input, init);
    return Promise.resolve(okResponse({ n: 42 }, { cache_read_input_tokens: 7 }));
  };

  const result = await callClaudeStructured<{ n: number }>(
    { ...cfg, fetchImpl },
    call,
  );

  assertEquals(result.value.n, 42);
  assertEquals(result.usage.inputTokens, 10);
  assertEquals(result.usage.cacheReadInputTokens, 7);
  assertEquals(seen?.headers.get('anthropic-workspace-id'), 'ws-de-test');
  assertEquals(seen?.headers.get('x-api-key'), 'cle-de-test');
  assertEquals(seen?.headers.get('anthropic-version'), '2023-06-01');
});

Deno.test('envoie le schema dans output_config.format', async () => {
  let body: Record<string, unknown> = {};
  const fetchImpl = (_i: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return Promise.resolve(okResponse({ n: 1 }));
  };

  await callClaudeStructured<{ n: number }>({ ...cfg, fetchImpl }, call);

  const outputConfig = body.output_config as { format: { type: string; schema: unknown } };
  assertEquals(outputConfig.format.type, 'json_schema');
  assertEquals(outputConfig.format.schema, call.schema);
  assertEquals(body.model, 'claude-sonnet-5');
});

Deno.test('leve ClaudeApiError avec le statut sur une erreur HTTP', async () => {
  const fetchImpl = () =>
    Promise.resolve(new Response('{"error":{"message":"pas de workspace"}}', { status: 400 }));

  const error = await assertRejects(
    () => callClaudeStructured({ ...cfg, fetchImpl }, call),
    ClaudeApiError,
  );
  assertEquals(error.status, 400);
});

Deno.test('leve si la reponse ne porte aucun bloc de texte', async () => {
  const fetchImpl = () =>
    Promise.resolve(new Response(JSON.stringify({ content: [], usage: {} }), { status: 200 }));

  await assertRejects(() => callClaudeStructured({ ...cfg, fetchImpl }, call), ClaudeApiError);
});

Deno.test('leve ClaudeApiError si le corps de la reponse HTTP 200 n est pas du JSON', async () => {
  const fetchImpl = () => Promise.resolve(new Response('not json at all', { status: 200 }));

  const error = await assertRejects(
    () => callClaudeStructured({ ...cfg, fetchImpl }, call),
    ClaudeApiError,
  );
  assertEquals(error.status, 200);
});

Deno.test('leve ClaudeApiError si content[0].text n est pas du JSON valide', async () => {
  const fetchImpl = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({ content: [{ type: 'text', text: 'pas du json' }], usage: {} }),
        { status: 200 },
      ),
    );

  await assertRejects(() => callClaudeStructured({ ...cfg, fetchImpl }, call), ClaudeApiError);
});

Deno.test('leve ClaudeApiError si le bloc de texte est present mais vide', async () => {
  const fetchImpl = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({ content: [{ type: 'text', text: '' }], usage: {} }),
        { status: 200 },
      ),
    );

  await assertRejects(() => callClaudeStructured({ ...cfg, fetchImpl }, call), ClaudeApiError);
});

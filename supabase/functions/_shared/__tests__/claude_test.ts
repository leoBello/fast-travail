import { assertEquals, assertRejects } from '@std/assert';
import { callClaudeStructured, ClaudeApiError, isRetryableFailure } from '../claude.ts';

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

Deno.test('signale la troncature quand stop_reason vaut max_tokens et le JSON est coupe', async () => {
  const fetchImpl = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          stop_reason: 'max_tokens',
          content: [{ type: 'text', text: '{"fit_score": 80, "verdict": "bon profil' }],
          usage: {},
        }),
        { status: 200 },
      ),
    );

  const error = await assertRejects(
    () => callClaudeStructured({ ...cfg, fetchImpl }, call),
    ClaudeApiError,
  );
  assertEquals(error.message.includes('tronqu'), true);
  assertEquals(error.message.includes('max_tokens'), true);
});

Deno.test(
  'signale la troncature (pas « sans bloc de texte ») quand stop_reason vaut max_tokens sans aucun texte',
  async () => {
    const fetchImpl = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ stop_reason: 'max_tokens', content: [], usage: {} }),
          { status: 200 },
        ),
      );

    const error = await assertRejects(
      () => callClaudeStructured({ ...cfg, fetchImpl }, call),
      ClaudeApiError,
    );
    assertEquals(error.message.includes('tronqu'), true);
    assertEquals(error.message.includes('sans bloc de texte'), false);
  },
);

Deno.test(
  'garde l erreur de serialisation existante quand stop_reason vaut end_turn et le JSON est malforme',
  async () => {
    const fetchImpl = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'pas du json' }],
            usage: {},
          }),
          { status: 200 },
        ),
      );

    const error = await assertRejects(
      () => callClaudeStructured({ ...cfg, fetchImpl }, call),
      ClaudeApiError,
    );
    assertEquals(error.message.includes('sortie structuree illisible'), true);
  },
);

Deno.test('isRetryableFailure : 429 et 5xx sont rejouables, un 4xx ne l est pas', () => {
  assertEquals(isRetryableFailure(new ClaudeApiError('quota', 429)), true);
  assertEquals(isRetryableFailure(new ClaudeApiError('surcharge', 529)), true);
  assertEquals(isRetryableFailure(new ClaudeApiError('panne', 500)), true);
  assertEquals(isRetryableFailure(new ClaudeApiError('schema refuse', 400)), false);
  assertEquals(isRetryableFailure(new ClaudeApiError('clef revoquee', 401)), false);
});

Deno.test('isRetryableFailure : un echec sans echange HTTP est rejouable', () => {
  // Statut 0 : configuration absente, aucun appel n'est parti. Condamner
  // l'offre pour ça la sortirait de la file sur un probleme qui n'est pas le
  // sien.
  assertEquals(isRetryableFailure(new ClaudeApiError('apiKey manquant', 0)), true);
  // Coupure reseau : `fetch` leve un TypeError, pas une ClaudeApiError.
  assertEquals(isRetryableFailure(new TypeError('error sending request')), true);
  assertEquals(isRetryableFailure('une chaine'), true);
});

Deno.test('isRetryableFailure : un HTTP 200 illisible est REJOUABLE', () => {
  // RENVERSE PAR LA MESURE du 2026-09-10. Cette regle disait l'inverse : un
  // 200 illisible etait repute imputable a l'offre, donc permanent. Puis les
  // 18 offres perdues en deux jours ont ete remises dans la file telles
  // quelles, sans qu'un octet de leur texte ne change, et les 18 ont ete
  // jugees SANS ERREUR au premier essai. Un echec qui ne se reproduit pas sur
  // une entree identique n'est pas attribuable a cette entree.
  //
  // L'arbitrage que le fichier enonce deja tranche alors tout seul : se
  // tromper vers « permanent » perd l'offre pour toujours, se tromper vers
  // « rejouable » coute un centime et un tour de plus.
  assertEquals(isRetryableFailure(new ClaudeApiError('sortie illisible', 200)), true);
  assertEquals(isRetryableFailure(new ClaudeApiError('reponse tronquee', 200)), true);
});

// --- Diagnostic des echecs sur HTTP 200 (P31) -------------------------------
//
// Mesure du 2026-09-10 : 19 offres perdues en deux jours sur des reponses
// HTTP 200 illisibles, sans que rien ne dise POURQUOI. Le message d'erreur ne
// retenait que l'exception de `JSON.parse`, et `stop_reason` — la seule
// information qui distingue une troncature d'un refus — etait jete. Ces tests
// figent la regle : tout echec sur un 200 porte desormais son `stop_reason`.

Deno.test('un refus est nomme comme tel, avec sa categorie et son explication', async () => {
  const fetchImpl = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          stop_reason: 'refusal',
          stop_details: { type: 'refusal', category: 'cyber', explanation: 'exemple' },
          content: [],
          usage: {},
        }),
        { status: 200 },
      ),
    );

  const error = await assertRejects(
    () => callClaudeStructured({ ...cfg, fetchImpl }, call),
    ClaudeApiError,
  );
  assertEquals(error.message.includes('refus'), true);
  assertEquals(error.message.includes('cyber'), true);
  assertEquals(error.message.includes('exemple'), true);
  // Le refus se diagnostique AVANT la recherche d'un bloc de texte : sans ça
  // un refus avant sortie (content vide) se deguiserait en « sans bloc de
  // texte », ce qui est exactement ce qui a masque la cause pendant deux jours.
  assertEquals(error.message.includes('sans bloc de texte'), false);
});

Deno.test('un refus en cours de generation ne passe pas pour un JSON malforme', async () => {
  // La forme mesuree le 2026-09-10 : un texte coupe en plein milieu, donc un
  // `JSON.parse` qui echoue sur « Unterminated string ». Sans le test de
  // `stop_reason` en amont, la cause reelle restait invisible.
  const fetchImpl = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          stop_reason: 'refusal',
          stop_details: { type: 'refusal', category: null, explanation: 'coupe' },
          content: [{ type: 'text', text: '{"fit_score": 40, "verdict": "un debut' }],
          usage: {},
        }),
        { status: 200 },
      ),
    );

  const error = await assertRejects(
    () => callClaudeStructured({ ...cfg, fetchImpl }, call),
    ClaudeApiError,
  );
  assertEquals(error.message.includes('refus'), true);
  assertEquals(error.message.includes('sortie structuree illisible'), false);
});

Deno.test('tout echec sur un HTTP 200 porte son stop_reason', async () => {
  // Le cas qu'on ne sait PAS expliquer doit rester diagnosticable : c'est la
  // lecon de P31. `end_turn` avec un JSON malforme n'a pas d'explication
  // connue — raison de plus pour que la ligne d'erreur le dise.
  const fetchImpl = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'pas du json' }],
          usage: {},
        }),
        { status: 200 },
      ),
    );

  const error = await assertRejects(
    () => callClaudeStructured({ ...cfg, fetchImpl }, call),
    ClaudeApiError,
  );
  assertEquals(error.message.includes('sortie structuree illisible'), true);
  assertEquals(error.message.includes('stop_reason=end_turn'), true);
});

Deno.test('un stop_reason absent se dit, plutot que de disparaitre', async () => {
  const fetchImpl = () =>
    Promise.resolve(
      new Response(JSON.stringify({ content: [], usage: {} }), { status: 200 }),
    );

  const error = await assertRejects(
    () => callClaudeStructured({ ...cfg, fetchImpl }, call),
    ClaudeApiError,
  );
  assertEquals(error.message.includes('sans bloc de texte'), true);
  assertEquals(error.message.includes('stop_reason=(absent)'), true);
});

Deno.test('isRetryableFailure : seul un refus reste PERMANENT sur un 200', () => {
  // Le refus est la SEULE exception a la regle ci-dessus, et il ne peut pas se
  // reconnaitre au statut : un refus et une troncature portent tous deux 200.
  // D'ou le drapeau explicite, plutot qu'un test sur le texte du message —
  // qui ferait dependre une decision de facturation d'une chaine de
  // caracteres.
  assertEquals(isRetryableFailure(new ClaudeApiError('refus du modele', 200, true)), false);
  // Un refus est deterministe : rejouer le MEME texte d'offre se ferait
  // refuser pareil, donc remettre l'offre dans la file ne ferait que repayer
  // sans jamais converger.
  assertEquals(isRetryableFailure(new ClaudeApiError('sortie illisible', 200, false)), true);
});

Deno.test('un refus est leve avec le drapeau permanent', async () => {
  // Le lien entre les deux moities : `callClaudeStructured` doit POSER le
  // drapeau, sans quoi `isRetryableFailure` ne peut pas le lire et un refus
  // repasserait indefiniment dans la file.
  const fetchImpl = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({ stop_reason: 'refusal', content: [], usage: {} }),
        { status: 200 },
      ),
    );

  const error = await assertRejects(
    () => callClaudeStructured({ ...cfg, fetchImpl }, call),
    ClaudeApiError,
  );
  assertEquals(error.permanent, true);
  assertEquals(isRetryableFailure(error), false);
});

Deno.test('une troncature inexpliquee est levee SANS le drapeau permanent', async () => {
  const fetchImpl = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: '{"fit_score": 40, "verdict": "coup' }],
          usage: {},
        }),
        { status: 200 },
      ),
    );

  const error = await assertRejects(
    () => callClaudeStructured({ ...cfg, fetchImpl }, call),
    ClaudeApiError,
  );
  assertEquals(error.permanent, false);
  assertEquals(isRetryableFailure(error), true);
});

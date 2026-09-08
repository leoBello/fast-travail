import { assertEquals, assertRejects } from '@std/assert';
import { PoliteFetcher } from '../http.ts';

/** Fabrique un fetch factice qui rend les réponses données, dans l'ordre. */
function fakeFetch(responses: Array<{ status: number; body: string }>) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const impl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    calls.push({ url: String(input), headers });
    const next = responses.shift();
    if (!next) throw new Error('fetch appelé plus de fois que prévu');
    return Promise.resolve(new Response(next.body, { status: next.status }));
  };
  return { impl, calls };
}

Deno.test("envoie l'agent utilisateur configuré", async () => {
  const { impl, calls } = fakeFetch([{ status: 200, body: 'ok' }]);
  const fetcher = new PoliteFetcher({
    userAgent: 'fast-travail/0.1 (veille personnelle)',
    minDelayMs: 3000,
    fetchImpl: impl,
    sleep: () => Promise.resolve(),
  });

  const page = await fetcher.get('https://example.test/a');

  assertEquals(page.status, 200);
  assertEquals(page.body, 'ok');
  assertEquals(calls[0].headers['user-agent'], 'fast-travail/0.1 (veille personnelle)');
});

Deno.test("n'attend pas avant la première requête, attend avant la seconde", async () => {
  const { impl } = fakeFetch([
    { status: 200, body: 'a' },
    { status: 200, body: 'b' },
  ]);
  const slept: number[] = [];
  let clock = 1_000;
  const fetcher = new PoliteFetcher({
    userAgent: 'ua',
    minDelayMs: 3000,
    fetchImpl: impl,
    sleep: (ms: number) => {
      slept.push(ms);
      clock += ms;
      return Promise.resolve();
    },
    now: () => clock,
  });

  await fetcher.get('https://example.test/a');
  clock += 500; // 500 ms se sont écoulées entre les deux appels
  await fetcher.get('https://example.test/b');

  assertEquals(slept, [2500]);
  assertEquals(fetcher.requestCount, 2);
});

Deno.test('réessaie sur 429 puis rend la réponse suivante', async () => {
  const { impl, calls } = fakeFetch([
    { status: 429, body: '' },
    { status: 200, body: 'enfin' },
  ]);
  const fetcher = new PoliteFetcher({
    userAgent: 'ua',
    minDelayMs: 0,
    fetchImpl: impl,
    sleep: () => Promise.resolve(),
  });

  const page = await fetcher.get('https://example.test/a');

  assertEquals(page.body, 'enfin');
  assertEquals(calls.length, 2);
});

Deno.test("ne réessaie pas sur 404 et remonte l'erreur", async () => {
  const { impl, calls } = fakeFetch([{ status: 404, body: '' }]);
  const fetcher = new PoliteFetcher({
    userAgent: 'ua',
    minDelayMs: 0,
    fetchImpl: impl,
    sleep: () => Promise.resolve(),
  });

  await assertRejects(
    () => fetcher.get('https://example.test/absente'),
    Error,
    '404',
  );
  assertEquals(calls.length, 1);
});

Deno.test('abandonne après le nombre de tentatives configuré', async () => {
  const { impl, calls } = fakeFetch([
    { status: 503, body: '' },
    { status: 503, body: '' },
  ]);
  const fetcher = new PoliteFetcher({
    userAgent: 'ua',
    minDelayMs: 0,
    maxRetries: 1,
    fetchImpl: impl,
    sleep: () => Promise.resolve(),
  });

  await assertRejects(() => fetcher.get('https://example.test/a'), Error, '503');
  assertEquals(calls.length, 2);
});

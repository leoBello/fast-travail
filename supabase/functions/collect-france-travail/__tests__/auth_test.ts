import { assertEquals, assertRejects } from '@std/assert';
import { getAccessToken, resetTokenCache } from '../auth.ts';

const cfg = { clientId: 'id-test', clientSecret: 'secret-test' };

function fakeFetch(
  token: string,
  expiresIn: number,
  calls: { count: number; lastBody?: string; lastUrl?: string },
): typeof fetch {
  return ((url: string | URL, init?: RequestInit) => {
    calls.count += 1;
    calls.lastUrl = String(url);
    calls.lastBody = String(init?.body ?? '');
    return Promise.resolve(
      new Response(
        JSON.stringify({ access_token: token, expires_in: expiresIn, token_type: 'Bearer' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
  }) as unknown as typeof fetch;
}

Deno.test('getAccessToken demande un token en client_credentials avec le bon scope', async () => {
  resetTokenCache();
  const calls = { count: 0 };
  const token = await getAccessToken(cfg, fakeFetch('tok-1', 1500, calls));

  assertEquals(token, 'tok-1');
  assertEquals(calls.count, 1);

  const body = new URLSearchParams((calls as { lastBody?: string }).lastBody);
  assertEquals(body.get('grant_type'), 'client_credentials');
  assertEquals(body.get('client_id'), 'id-test');
  assertEquals(body.get('client_secret'), 'secret-test');
  assertEquals(body.get('scope'), 'api_offresdemploiv2 o2dsoffre');

  // Le realm partenaire est obligatoire et passe par la query string.
  const url = (calls as { lastUrl?: string }).lastUrl ?? '';
  assertEquals(url.includes('realm=%2Fpartenaire'), true);
});

Deno.test('getAccessToken réutilise le token tant qu\'il est valide', async () => {
  resetTokenCache();
  const calls = { count: 0 };
  const f = fakeFetch('tok-2', 1500, calls);

  await getAccessToken(cfg, f);
  await getAccessToken(cfg, f);
  await getAccessToken(cfg, f);

  assertEquals(calls.count, 1);
});

Deno.test('getAccessToken redemande un token dont l\'expiration est imminente', async () => {
  resetTokenCache();
  const calls = { count: 0 };
  // 30 s d'expiration, sous la marge de sécurité de 60 s : jamais mis en cache.
  const f = fakeFetch('tok-3', 30, calls);

  await getAccessToken(cfg, f);
  await getAccessToken(cfg, f);

  assertEquals(calls.count, 2);
});

Deno.test('getAccessToken remonte une erreur explicite sur réponse non-2xx', async () => {
  resetTokenCache();
  const failing = (() =>
    Promise.resolve(new Response('accès refusé', { status: 401 }))) as unknown as typeof fetch;

  await assertRejects(
    () => getAccessToken(cfg, failing),
    Error,
    'token France Travail refusé (401)',
  );
});

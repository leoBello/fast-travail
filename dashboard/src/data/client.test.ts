import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDashboardClient,
  DashboardApiError,
  countByWorkMode,
  dashboardClientFromEnv,
} from './client';
import type { DashboardClient } from './client';

const CONFIG = {
  baseUrl: 'https://exemple.supabase.co/functions/v1/api-dashboard',
  anonKey: 'anon-de-test',
  dashboardToken: 'secret-de-test',
};

function fakeFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init)),
  ) as unknown as typeof fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createDashboardClient', () => {
  it('pose les deux en-têtes exigés par la fonction déployée (Authorization + x-dashboard-token)', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = fakeFetch((_url, init) => {
      capturedInit = init;
      return jsonResponse(200, { funnel: {}, byStatus: {}, streak: {}, neverOpened: 0 });
    });
    const client = createDashboardClient({ ...CONFIG, fetchImpl });

    await client.getStats();

    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer anon-de-test');
    expect(headers['x-dashboard-token']).toBe('secret-de-test');
  });

  it("n'omet aucun filtre par défaut : listOffers() sans argument ne pose aucun paramètre de requête", async () => {
    let capturedUrl = '';
    const fetchImpl = fakeFetch((url) => {
      capturedUrl = url;
      return jsonResponse(200, { rows: [], total: 0, page: 1, pageSize: 20 });
    });
    const client = createDashboardClient({ ...CONFIG, fetchImpl });

    await client.listOffers();

    expect(capturedUrl).toBe('https://exemple.supabase.co/functions/v1/api-dashboard/offers');
  });

  it('encode chaque filtre fourni dans la requête, et seulement ceux-là', async () => {
    let capturedUrl = '';
    const fetchImpl = fakeFetch((url) => {
      capturedUrl = url;
      return jsonResponse(200, { rows: [], total: 0, page: 1, pageSize: 20 });
    });
    const client = createDashboardClient({ ...CONFIG, fetchImpl });

    await client.listOffers({ workMode: ['non_precise'], sort: 'fit_score', page: 2 });

    const url = new URL(capturedUrl);
    expect(url.searchParams.get('workMode')).toBe('non_precise');
    expect(url.searchParams.get('sort')).toBe('fit_score');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.has('engagement')).toBe(false);
    expect(url.searchParams.has('source')).toBe(false);
  });

  it('lève une DashboardApiError avec le statut et le message du corps JSON sur une erreur', async () => {
    const fetchImpl = fakeFetch(() =>
      jsonResponse(400, { error: 'paramètre "sort" invalide : "bogus"' }),
    );
    const client = createDashboardClient({ ...CONFIG, fetchImpl });

    await expect(client.listOffers({ sort: 'bogus' as never })).rejects.toMatchObject({
      status: 400,
      message: 'paramètre "sort" invalide : "bogus"',
    });
  });

  it('reconnaît un 404 sur getOfferDetail et rend null plutôt que de propager l’erreur', async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(404, { error: 'offre introuvable : x' }));
    const client = createDashboardClient({ ...CONFIG, fetchImpl });

    await expect(client.getOfferDetail('x')).resolves.toBeNull();
  });

  it('propage une DashboardApiError non-404 sur getOfferDetail (une panne réelle ne doit pas se lire comme "absente")', async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(500, { error: 'panne' }));
    const client = createDashboardClient({ ...CONFIG, fetchImpl });

    await expect(client.getOfferDetail('x')).rejects.toBeInstanceOf(DashboardApiError);
  });

  it('POST /offers/:id/open sans corps, PATCH .../application avec le corps JSON du patch', async () => {
    const appels: { url: string; method: string | undefined; body: string | undefined }[] = [];
    const fetchImpl = fakeFetch((url, init) => {
      appels.push({ url, method: init?.method, body: init?.body as string | undefined });
      return jsonResponse(200, { offer_id: 'x', status: 'a_traiter' });
    });
    const client = createDashboardClient({ ...CONFIG, fetchImpl });

    await client.openOffer('x');
    await client.patchApplication('x', { status: 'ecartee' });

    expect(appels[0]?.url).toContain('/offers/x/open');
    expect(appels[0]?.method).toBe('POST');
    expect(appels[1]?.url).toContain('/offers/x/application');
    expect(appels[1]?.method).toBe('PATCH');
    expect(appels[1]?.body).toBe(JSON.stringify({ status: 'ecartee' }));
  });
});

describe('countByWorkMode', () => {
  it("lit `total`, ne rend aucune ligne : le panneau de filtres n'a besoin que du chiffre", async () => {
    const listOffers = vi.fn().mockResolvedValue({ rows: [], total: 863, page: 1, pageSize: 1 });
    const client = { listOffers } as unknown as DashboardClient;

    const total = await countByWorkMode(client, 'non_precise');

    expect(total).toBe(863);
    expect(listOffers).toHaveBeenCalledWith({ workMode: ['non_precise'], pageSize: 1 });
  });
});

describe('buildQuery — filtres multi-valeurs (tâche 10)', () => {
  it('un tableau pose la MÊME clé plusieurs fois, dans l’ordre', async () => {
    let capturedUrl = '';
    const fetchImpl = fakeFetch((url) => {
      capturedUrl = url;
      return jsonResponse(200, { rows: [], total: 0, page: 1, pageSize: 20 });
    });
    const client = createDashboardClient({ ...CONFIG, fetchImpl });

    await client.listOffers({ workMode: ['full_remote', 'non_precise'] });

    const url = new URL(capturedUrl);
    expect(url.searchParams.getAll('workMode')).toEqual(['full_remote', 'non_precise']);
  });

  it('un tableau vide ne pose aucun paramètre — comme absent', async () => {
    let capturedUrl = '';
    const fetchImpl = fakeFetch((url) => {
      capturedUrl = url;
      return jsonResponse(200, { rows: [], total: 0, page: 1, pageSize: 20 });
    });
    const client = createDashboardClient({ ...CONFIG, fetchImpl });

    await client.listOffers({ statut: [] });

    expect(new URL(capturedUrl).searchParams.has('statut')).toBe(false);
  });
});

describe('getConfig / importCandidateProfile (tâche 10)', () => {
  it('getConfig appelle GET /config', async () => {
    let capturedUrl = '';
    const fetchImpl = fakeFetch((url) => {
      capturedUrl = url;
      return jsonResponse(200, {
        scoringWeights: { salaire_floor: 40000 },
        activeProfile: null,
        cvSkills: [],
        staleProfileOfferCount: 0,
      });
    });
    const client = createDashboardClient({ ...CONFIG, fetchImpl });

    const config = await client.getConfig();

    expect(capturedUrl).toContain('/config');
    expect(config.scoringWeights.salaire_floor).toBe(40000);
  });

  it('importCandidateProfile POST /candidate-profile avec le corps JSON de l’import', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = fakeFetch((_url, init) => {
      capturedInit = init;
      return jsonResponse(201, {
        profile: {
          id: 2,
          label: 'CV v2',
          profileVersion: 'cv-2026-09-09',
          seniorityYears: 7,
          createdAt: '2026-09-09T10:00:00Z',
        },
        staleProfileOfferCount: 1269,
      });
    });
    const client = createDashboardClient({ ...CONFIG, fetchImpl });

    const result = await client.importCandidateProfile({
      label: 'CV v2',
      cvText: 'texte',
      seniorityYears: 7,
      profileVersion: 'cv-2026-09-09',
    });

    expect(capturedInit?.method).toBe('POST');
    expect(result.staleProfileOfferCount).toBe(1269);
  });
});

describe('dashboardClientFromEnv — la lecture des trois variables VITE_*', () => {
  // `vi.stubEnv` agit sur `import.meta.env` comme sur `process.env` (Vitest
  // 5) : ces tests SIMULENT explicitement chaque cas plutôt que de compter
  // sur ce que porte `dashboard/.env` (gitignoré) sur la machine qui les
  // exécute — revue de tâche 10, le même défaut qu'`App.test.tsx` corrige à
  // côté. `unstubAllEnvs` après CHAQUE test, qu'il ait réussi ou non.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('les trois variables présentes : construit un client sans lever', () => {
    vi.stubEnv('VITE_DASHBOARD_API_URL', 'https://exemple.supabase.co/functions/v1/api-dashboard');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-de-test');
    vi.stubEnv('VITE_DASHBOARD_TOKEN', 'secret-de-test');

    expect(() => dashboardClientFromEnv()).not.toThrow();
  });

  it('une variable absente (chaîne vide) : lève une erreur qui la NOMME', () => {
    vi.stubEnv('VITE_DASHBOARD_API_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-de-test');
    vi.stubEnv('VITE_DASHBOARD_TOKEN', 'secret-de-test');

    expect(() => dashboardClientFromEnv()).toThrow(/VITE_DASHBOARD_API_URL/);
  });

  it('les trois absentes : l’erreur les nomme toutes les trois', () => {
    vi.stubEnv('VITE_DASHBOARD_API_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.stubEnv('VITE_DASHBOARD_TOKEN', '');

    try {
      dashboardClientFromEnv();
      expect.fail('devait lever');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      expect(message).toContain('VITE_DASHBOARD_API_URL');
      expect(message).toContain('VITE_SUPABASE_ANON_KEY');
      expect(message).toContain('VITE_DASHBOARD_TOKEN');
    }
  });
});

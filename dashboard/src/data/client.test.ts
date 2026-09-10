import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDashboardClient, DashboardApiError, dashboardClientFromEnv } from './client';

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

  it('getStatutCounts appelle GET /statut-counts', async () => {
    let url = '';
    const client = createDashboardClient({
      ...CONFIG,
      fetchImpl: fakeFetch((u) => {
        url = u;
        return jsonResponse(200, {
          aucune: 1258,
          a_traiter: 0,
          retenue: 0,
          postulee: 6,
          relancee: 1,
          entretien: 0,
          terminee: 0,
          ecartee: 7,
        });
      }),
    });
    const counts = await client.getStatutCounts();
    expect(url.endsWith('/statut-counts')).toBe(true);
    expect(counts.aucune).toBe(1258);
    expect(counts.postulee).toBe(6);
  });

  it('listOffers pose statut une fois par valeur (?statut=aucune&statut=a_traiter)', async () => {
    let url = '';
    const client = createDashboardClient({
      ...CONFIG,
      fetchImpl: fakeFetch((u) => {
        url = u;
        return jsonResponse(200, { rows: [], total: 0, page: 1, pageSize: 8 });
      }),
    });
    await client.listOffers({ statut: ['aucune', 'a_traiter'] });
    expect(url).toContain('statut=aucune');
    expect(url).toContain('statut=a_traiter');
  });
});

describe('partage des lectures en vol', () => {
  /** Un `fetch` que le test fait retomber quand il veut : c'est la seule
   * façon d'observer la fenêtre « en vol », qui se referme dès la réponse. */
  function fetchRetenu() {
    const appels: string[] = [];
    const resolveurs: ((r: Response) => void)[] = [];
    const fetchImpl = vi.fn((input: string | URL | Request) => {
      appels.push(String(input));
      return new Promise<Response>((resolve) => resolveurs.push(resolve));
    }) as unknown as typeof fetch;
    return { appels, resolveurs, fetchImpl };
  }

  it('deux lectures identiques lancées en parallèle ne font QU’UN aller-retour', async () => {
    const { appels, resolveurs, fetchImpl } = fetchRetenu();
    const client = createDashboardClient({ ...CONFIG, fetchImpl });

    const a = client.getStats();
    const b = client.getStats();
    expect(appels).toHaveLength(1);

    resolveurs[0](jsonResponse(200, { neverOpened: 7 }));
    expect(await a).toEqual({ neverOpened: 7 });
    expect(await b).toEqual({ neverOpened: 7 });
  });

  it('deux lectures DIFFÉRENTES restent deux requêtes', async () => {
    const { appels, resolveurs, fetchImpl } = fetchRetenu();
    const client = createDashboardClient({ ...CONFIG, fetchImpl });

    void client.listOffers({ statut: ['retenue'] });
    void client.listOffers({ statut: ['postulee'] });

    expect(appels).toHaveLength(2);
    resolveurs.forEach((r) => r(jsonResponse(200, { rows: [], total: 0 })));
  });

  it("ce n'est pas un cache : une lecture retombée ne sert plus personne", async () => {
    const { appels, resolveurs, fetchImpl } = fetchRetenu();
    const client = createDashboardClient({ ...CONFIG, fetchImpl });

    const premiere = client.getStats();
    resolveurs[0](jsonResponse(200, { neverOpened: 1 }));
    await premiere;

    void client.getStats();
    expect(appels).toHaveLength(2);
  });

  it('une lecture en échec ne reste pas collée : la suivante repart', async () => {
    const { appels, resolveurs, fetchImpl } = fetchRetenu();
    const client = createDashboardClient({ ...CONFIG, fetchImpl });

    const premiere = client.getStats();
    resolveurs[0](jsonResponse(500, { error: 'panne' }));
    await expect(premiere).rejects.toBeInstanceOf(DashboardApiError);

    void client.getStats();
    expect(appels).toHaveLength(2);
  });

  it('une ÉCRITURE périme les lectures en vol : le rechargement qui suit ne les rejoint pas', async () => {
    const { appels, resolveurs, fetchImpl } = fetchRetenu();
    const client = createDashboardClient({ ...CONFIG, fetchImpl });

    // Une lecture partie AVANT l'écriture — elle ne peut pas voir ce que
    // l'écriture va poser.
    void client.listBrief();
    expect(appels).toHaveLength(1);

    void client.patchApplication('x', { status: 'retenue' });
    expect(appels).toHaveLength(2);

    // Le rechargement d'après-écriture doit être un VRAI aller-retour, pas un
    // greffage sur la lecture périmée.
    void client.listBrief();
    expect(appels).toHaveLength(3);

    resolveurs.forEach((r) => r(jsonResponse(200, { rows: [], total: 0 })));
  });
});

describe('getWorkModeCounts', () => {
  it('chiffre les quatre modes en UN appel, là où le panneau en faisait quatre', async () => {
    let capturedUrl = '';
    const fetchImpl = fakeFetch((url) => {
      capturedUrl = url;
      return jsonResponse(200, { full_remote: 173, hybride: 150, sur_site: 88, non_precise: 861 });
    });
    const client = createDashboardClient({ ...CONFIG, fetchImpl });

    const counts = await client.getWorkModeCounts();

    expect(capturedUrl).toBe(
      'https://exemple.supabase.co/functions/v1/api-dashboard/work-mode-counts',
    );
    expect(counts).toEqual({ full_remote: 173, hybride: 150, sur_site: 88, non_precise: 861 });
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

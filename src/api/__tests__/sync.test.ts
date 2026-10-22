import { checkSync, downloadModel, getModelInfo, isSyncAvailable } from '../sync';

const BASE = 'https://clavicule.exemple.workers.dev';

type Seen = { url: string; headers: Record<string, string> };
let seen: Seen[] = [];

function mockFetch(handler: (url: string, headers: Record<string, string>) => Response) {
  seen = [];
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    seen.push({ url: String(input), headers });
    return handler(String(input), headers);
  }) as typeof fetch;
}

afterEach(() => jest.restoreAllMocks());

describe('client Clavicule Sync', () => {
  it('se désactive sans adresse de service', async () => {
    expect(isSyncAvailable('')).toBe(false);
    expect(isSyncAvailable(BASE)).toBe(true);
    mockFetch(() => Response.json({}));
    await expect(getModelInfo(42, '')).resolves.toBeNull();
    await expect(downloadModel(42, null, '')).resolves.toEqual({ status: 'missing' });
    expect(seen).toHaveLength(0);
  });

  it('lit les infos d’un modèle sans aucune clé', async () => {
    mockFetch(() =>
      Response.json({ characterId: 42, name: 'Six Clavicule', world: 'Moogle', appearanceHash: 'a', size: 12, updatedAt: '2026-10-22T00:00:00Z' }),
    );
    await expect(getModelInfo(42, BASE)).resolves.toMatchObject({ name: 'Six Clavicule' });
    expect(seen[0].url).toBe(`${BASE}/v1/characters/42/model/info`);
    expect(seen[0].headers.Authorization).toBeUndefined();
  });

  it('renvoie null pour un personnage sans modèle', async () => {
    mockFetch(() => Response.json({ error: 'absent' }, { status: 404 }));
    await expect(getModelInfo(42, BASE)).resolves.toBeNull();
  });

  it('télécharge le modèle, puis s’appuie sur l’ETag', async () => {
    const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]);
    mockFetch((_, headers) =>
      headers['If-None-Match'] === '"v1"' ? new Response(null, { status: 304 }) : new Response(glb, { headers: { ETag: '"v1"' } }),
    );
    const first = await downloadModel(7, null, BASE);
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') return;
    expect(new Uint8Array(first.data)).toEqual(glb);
    expect(first.etag).toBe('"v1"');
    await expect(downloadModel(7, first.etag, BASE)).resolves.toEqual({ status: 'not-modified' });
  });

  it('signale un modèle supprimé', async () => {
    mockFetch(() => Response.json({ error: 'absent' }, { status: 404 }));
    await expect(downloadModel(7, null, BASE)).resolves.toEqual({ status: 'missing' });
  });

  it('vérifie que le service répond', async () => {
    mockFetch(() => Response.json({ ok: true }));
    await expect(checkSync(BASE)).resolves.toBe(true);
    expect(seen[0].url).toBe(`${BASE}/health`);
  });
});

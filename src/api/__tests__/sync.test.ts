import { downloadModel, getModelInfo, isSyncConfigured, listModels, normalizeSyncUrl } from '../sync';

const settings = { url: 'clavicule.exemple.workers.dev/', readKey: ' lecture ' };

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

const info = (id: number, updatedAt: string) => ({
  characterId: id,
  name: `Perso ${id}`,
  world: 'Moogle',
  appearanceHash: 'abc',
  uploadedBy: 'anton',
  size: 12,
  updatedAt,
});

afterEach(() => jest.restoreAllMocks());

describe('réglages de synchro', () => {
  it('complète et nettoie l’adresse', () => {
    expect(normalizeSyncUrl(' clavicule.exemple.workers.dev/ ')).toBe('https://clavicule.exemple.workers.dev');
    expect(normalizeSyncUrl('http://localhost:8787')).toBe('http://localhost:8787');
    expect(normalizeSyncUrl('  ')).toBe('');
  });

  it('exige une adresse et une clé', () => {
    expect(isSyncConfigured(settings)).toBe(true);
    expect(isSyncConfigured({ url: 'x', readKey: '' })).toBe(false);
    expect(isSyncConfigured({ url: '', readKey: 'k' })).toBe(false);
  });
});

describe('client Clavicule Sync', () => {
  it('liste les modèles, du plus récent au plus ancien, avec la clé', async () => {
    mockFetch(() => Response.json({ characters: [info(1, '2026-10-01T00:00:00Z'), info(2, '2026-10-20T00:00:00Z')] }));
    const list = await listModels(settings);
    expect(list.map((m) => m.characterId)).toEqual([2, 1]);
    expect(seen[0].url).toBe('https://clavicule.exemple.workers.dev/v1/characters');
    expect(seen[0].headers.Authorization).toBe('Bearer lecture');
  });

  it('explique une clé refusée', async () => {
    mockFetch(() => Response.json({ error: 'non' }, { status: 401 }));
    await expect(listModels(settings)).rejects.toThrow('Clé de lecture refusée');
  });

  it('renvoie null pour un personnage sans modèle', async () => {
    mockFetch(() => Response.json({ error: 'absent' }, { status: 404 }));
    await expect(getModelInfo(settings, 42)).resolves.toBeNull();
    expect(seen[0].url).toBe('https://clavicule.exemple.workers.dev/v1/characters/42/model/info');
  });

  it('télécharge le modèle, puis s’appuie sur l’ETag', async () => {
    const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]);
    mockFetch((_, headers) =>
      headers['If-None-Match'] === '"v1"' ? new Response(null, { status: 304 }) : new Response(glb, { headers: { ETag: '"v1"' } }),
    );
    const first = await downloadModel(settings, 7);
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') return;
    expect(new Uint8Array(first.data)).toEqual(glb);
    expect(first.etag).toBe('"v1"');
    await expect(downloadModel(settings, 7, first.etag)).resolves.toEqual({ status: 'not-modified' });
  });

  it('signale un modèle supprimé', async () => {
    mockFetch(() => Response.json({ error: 'absent' }, { status: 404 }));
    await expect(downloadModel(settings, 7)).resolves.toEqual({ status: 'missing' });
  });

  it('refuse de partir sans configuration', async () => {
    await expect(listModels({ url: '', readKey: '' })).rejects.toThrow('Synchro 3D non configurée');
  });
});
